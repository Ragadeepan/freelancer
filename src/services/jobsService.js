import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { db } from "../firebase/firebase.js";
import { logActivity } from "./activityLogsService.js";
import {
  createNotificationsBulk,
  listActiveAdminIds,
  listFreelancerIdsForJobAlerts
} from "./notificationsService.js";
import { canClientPostJob } from "../utils/accountStatus.js";

const toPublicClientSnapshot = (clientData = {}) => {
  if (!clientData || typeof clientData !== "object") {
    return {};
  }

  const name = String(
    clientData.displayName ||
    clientData.companyName ||
    clientData.name ||
    "Verified client"
  ).trim();
  const ratingCandidates = [
    clientData.profileRating,
    clientData.clientRating,
    clientData.rating
  ];
  let clientProfileRating = null;
  ratingCandidates.some((entry) => {
    const numeric = Number(entry);
    if (!Number.isFinite(numeric) || numeric <= 0) return false;
    clientProfileRating = Number(Math.min(5, Math.max(0, numeric)).toFixed(1));
    return true;
  });
  const clientVerified = Boolean(
    clientData.verified ??
      clientData.clientVerified ??
      clientData.identityVerified ??
      false
  );

  return {
    clientPublicName: name || "Verified client",
    clientName: name || "Verified client",
    clientDisplayName: String(clientData.displayName || "").trim() || null,
    clientCompanyName: String(clientData.companyName || "").trim() || null,
    clientMemberSince:
      clientData.createdAt || clientData.joinedAt || clientData.memberSince || null,
    clientProfileRating,
    clientRating: clientProfileRating,
    clientVerified,
    clientPaymentReview:
      String(
        clientData.paymentReviewSummary ||
        clientData.clientPaymentSummary ||
        clientData.clientReviewSummary ||
        ""
      ).trim() || null,
    clientTotalSpent: clientData.totalSpent || clientData.clientTotalSpent || null,
    clientTotalHires: clientData.totalHires || clientData.clientTotalHires || null,
    clientPhotoURL: clientData.photoURL || clientData.profileImage || null
  };
};

export async function createJob(payload) {
  const { clientId, title, description, budget, skills, timeline, ...details } =
    payload;
  if (!clientId) {
    throw new Error("Client id is required.");
  }
  const clientSnap = await getDoc(doc(db, "users", clientId));
  if (!clientSnap.exists()) {
    throw new Error("Client profile not found.");
  }
  const clientProfile = { ...clientSnap.data(), role: "client" };
  if (!canClientPostJob(clientProfile)) {
    throw new Error(
      "Client account must be approved and profile completion must be 100% before posting jobs."
    );
  }
  const docRef = await addDoc(collection(db, "jobs"), {
    clientId,
    title,
    description,
    budget,
    skills: skills || [],
    timeline: timeline || "",
    ...details,
    status: "pending",
    visibleToFreelancers: false,
    createdAt: serverTimestamp(),
    proposalCount: 0,
    lastProposalAt: null,
    adminApprovedBy: null,
    selectedProposalId: null,
    selectedFreelancerId: null,
    selectedFreelancerName: null,
    projectId: null
  });
  await logActivity({
    actor: clientId,
    action: "job_submitted",
    targetId: docRef.id
  });
  const adminIds = await listActiveAdminIds().catch(() => []);
  await createNotificationsBulk(
    adminIds.map((adminId) => ({
      recipientId: adminId,
      type: "job_submitted",
      title: "New job submitted",
      message: `Client submitted "${title || "a job"}" for approval.`,
      actorId: clientId,
      jobId: docRef.id
    }))
  ).catch(() => null);
  return docRef;
}

export async function approveJob(jobId, adminId) {
  const jobRef = doc(db, "jobs", jobId);
  const jobSnap = await getDoc(jobRef);
  const job = jobSnap.exists() ? jobSnap.data() : {};

  const clientProfile = job.clientId
    ? await getDoc(doc(db, "users", job.clientId)).catch(() => null)
    : null;
  const clientData = clientProfile?.exists ? clientProfile.data() : null;
  const publicClientSnapshot = toPublicClientSnapshot(clientData || {});
  await updateDoc(jobRef, {
    status: "approved",
    adminApprovedBy: adminId,
    visibleToFreelancers: true,
    ...publicClientSnapshot
  });
  await logActivity({
    actor: adminId,
    action: "job_approved",
    targetId: jobId
  });
  const shouldNotifyClient =
    Boolean(job.clientId) &&
    clientData?.jobReviewAlerts !== false &&
    clientData?.emailNotifications !== false;

  const freelancerIds = await listFreelancerIdsForJobAlerts().catch(() => []);
  const notificationPayloads = [];

  if (shouldNotifyClient) {
    notificationPayloads.push({
      recipientId: job.clientId,
      type: "job_approved",
      title: "Job approved",
      message: `Your job "${job.title || "Untitled job"}" is approved and now visible to freelancers.`,
      actorId: adminId,
      jobId
    });
  }

  const budgetText =
    String(job.budget || "").trim() ||
    (job.projectType === "hourly"
      ? `${job.currency || "INR"} ${job.hourlyMin || "0"}-${job.hourlyMax || ""} / hr`
      : `${job.currency || "INR"} ${job.budgetMin || "0"}-${job.budgetMax || ""}`);
  const durationText = String(job.duration || job.timeline || "").trim();
  const summaryParts = [
    job.category ? `Category: ${job.category}` : null,
    job.subcategory ? `Type: ${job.subcategory}` : null,
    budgetText ? `Budget: ${budgetText}` : null,
    durationText ? `Duration: ${durationText}` : null
  ].filter(Boolean);
  const summaryText = summaryParts.length > 0 ? ` (${summaryParts.join(" · ")})` : "";

  freelancerIds.forEach((freelancerId) => {
    notificationPayloads.push({
      recipientId: freelancerId,
      type: "job_live",
      title: "New job available",
      message: `New approved job: "${job.title || "Untitled job"}"${summaryText}.`,
      actorId: adminId,
      jobId
    });
  });

  const results = await createNotificationsBulk(notificationPayloads).catch(() => []);
  const failedNotifications = Array.isArray(results)
    ? results.filter((entry) => entry.status === "rejected").length
    : notificationPayloads.length;

  return {
    clientNotificationSent: shouldNotifyClient,
    freelancerNotifications: freelancerIds.length,
    failedNotifications,
    notificationsDelivered: failedNotifications === 0
  };
}

export async function rejectJob(jobId, adminId) {
  const jobRef = doc(db, "jobs", jobId);
  const jobSnap = await getDoc(jobRef);
  const job = jobSnap.exists() ? jobSnap.data() : {};
  await updateDoc(jobRef, {
    status: "rejected",
    adminApprovedBy: adminId,
    visibleToFreelancers: false
  });
  await logActivity({
    actor: adminId,
    action: "job_rejected",
    targetId: jobId
  });
  const clientProfile = job.clientId
    ? await getDoc(doc(db, "users", job.clientId)).catch(() => null)
    : null;
  const clientData = clientProfile?.exists ? clientProfile.data() : null;
  const shouldNotifyClient =
    Boolean(job.clientId) &&
    clientData?.jobReviewAlerts !== false &&
    clientData?.emailNotifications !== false;
  const results = await createNotificationsBulk(
    shouldNotifyClient
      ? [
        {
          recipientId: job.clientId,
          type: "job_rejected",
          title: "Job rejected",
          message: `Your job "${job.title || "Untitled job"}" was rejected by admin.`,
          actorId: adminId,
          jobId
        }
      ]
      : []
  ).catch(() => []);
  const failedNotifications = Array.isArray(results)
    ? results.filter((entry) => entry.status === "rejected").length
    : shouldNotifyClient
      ? 1
      : 0;
  return {
    clientNotificationSent: shouldNotifyClient,
    failedNotifications,
    notificationsDelivered: failedNotifications === 0
  };
}

export async function closeJob(jobId, actorId) {
  const jobRef = doc(db, "jobs", jobId);
  const jobSnap = await getDoc(jobRef);
  const job = jobSnap.exists() ? jobSnap.data() : {};
  await updateDoc(jobRef, { status: "closed" });
  if (actorId) {
    await logActivity({
      actor: actorId,
      action: "job_closed",
      targetId: jobId
    });
  }
  await createNotificationsBulk([
    {
      recipientId: job.clientId,
      type: "job_closed",
      title: "Job closed",
      message: `Job "${job.title || "Untitled job"}" has been closed.`,
      actorId,
      jobId
    },
    {
      recipientId: job.selectedFreelancerId,
      type: "job_closed",
      title: "Job closed",
      message: `Job "${job.title || "Untitled job"}" has been closed.`,
      actorId,
      jobId,
      projectId: job.projectId || null
    }
  ]).catch(() => null);
}

export async function listClientJobs(clientId) {
  const snapshot = await getDocs(
    query(collection(db, "jobs"), where("clientId", "==", clientId))
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function listApprovedJobs() {
  const snapshot = await getDocs(
    query(collection(db, "jobs"), where("status", "==", "approved"))
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function listPendingJobs() {
  const snapshot = await getDocs(
    query(collection(db, "jobs"), where("status", "==", "pending"))
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function listAllJobs() {
  const snapshot = await getDocs(collection(db, "jobs"));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}
