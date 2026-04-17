import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { db } from "../firebase/firebase.js";
import { logActivity } from "./activityLogsService.js";
import { canFreelancerApplyJob } from "../utils/accountStatus.js";
import {
  createNotification,
  createNotificationsBulk,
  listActiveAdminIds
} from "./notificationsService.js";

const asText = (value) => {
  if (typeof value !== "string") return "";
  const clean = value.trim();
  return clean;
};

const pickFirstText = (...values) => {
  for (const value of values) {
    const clean = asText(value);
    if (clean) return clean;
  }
  return "";
};

const normalizeText = (value) => asText(value).toLowerCase();

async function findUserByEmail(email) {
  const rawEmail = asText(email);
  const cleanEmail = normalizeText(email);
  if (!cleanEmail) return null;
  const exactSnapshot = await getDocs(
    query(collection(db, "users"), where("email", "==", cleanEmail))
  );
  if (!exactSnapshot.empty) {
    const docSnap = exactSnapshot.docs[0];
    return { id: docSnap.id, ...docSnap.data() };
  }

  if (rawEmail && rawEmail !== cleanEmail) {
    const rawSnapshot = await getDocs(
      query(collection(db, "users"), where("email", "==", rawEmail))
    );
    if (!rawSnapshot.empty) {
      const docSnap = rawSnapshot.docs[0];
      return { id: docSnap.id, ...docSnap.data() };
    }
  }

  return null;
}

async function findUserByRoleAndName(role, name) {
  const cleanName = normalizeText(name);
  if (!cleanName) return null;
  const snapshot = await getDocs(
    query(collection(db, "users"), where("role", "==", role))
  );
  if (snapshot.empty) return null;

  const users = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  const exact = users.find((entry) => {
    return (
      normalizeText(entry.name) === cleanName ||
      normalizeText(entry.displayName) === cleanName
    );
  });
  if (exact) return exact;

  const partial = users.find((entry) => {
    return (
      normalizeText(entry.name).includes(cleanName) ||
      normalizeText(entry.displayName).includes(cleanName)
    );
  });
  return partial || null;
}

async function resolveFreelancerIdentity(proposal) {
  const resolvedId = pickFirstText(
    proposal.freelancerId,
    proposal.freelancerUid,
    proposal.bidderId,
    proposal.userId,
    proposal.createdBy
  );
  const resolvedName = pickFirstText(
    proposal.freelancerName,
    proposal.bidderName,
    proposal.bidder
  );

  if (resolvedId) {
    return { id: resolvedId, name: resolvedName || null };
  }

  const emailCandidate = pickFirstText(proposal.freelancerEmail, proposal.email);
  if (emailCandidate) {
    const matched = await findUserByEmail(emailCandidate);
    if (matched) {
      return {
        id: matched.id,
        name: matched.name || matched.displayName || resolvedName || null
      };
    }
  }

  if (resolvedName) {
    const matched = await findUserByRoleAndName("freelancer", resolvedName);
    if (matched) {
      return {
        id: matched.id,
        name: matched.name || matched.displayName || resolvedName || null
      };
    }
  }

  return { id: "", name: resolvedName || null };
}

async function resolveClientIdentity(selectedProposal, job) {
  const resolvedId = pickFirstText(
    selectedProposal.clientId,
    selectedProposal.clientUid,
    job.clientId,
    job.clientUid,
    job.ownerId,
    job.createdBy
  );
  const resolvedName = pickFirstText(
    selectedProposal.clientName,
    job.clientName,
    job.companyName
  );

  if (resolvedId) {
    return { id: resolvedId, name: resolvedName || null };
  }

  const emailCandidate = pickFirstText(
    selectedProposal.clientEmail,
    job.clientEmail,
    job.email
  );
  if (emailCandidate) {
    const matched = await findUserByEmail(emailCandidate);
    if (matched) {
      return {
        id: matched.id,
        name: matched.name || matched.displayName || resolvedName || null
      };
    }
  }

  if (resolvedName) {
    const matched = await findUserByRoleAndName("client", resolvedName);
    if (matched) {
      return {
        id: matched.id,
        name: matched.name || matched.displayName || resolvedName || null
      };
    }
  }

  return { id: "", name: resolvedName || null };
}

function extractFreelancerIdForNotification(proposal) {
  return pickFirstText(
    proposal.freelancerId,
    proposal.freelancerUid,
    proposal.bidderId,
    proposal.userId,
    proposal.createdBy
  );
}

export async function createProposal({
  jobId,
  freelancerId,
  bidAmount,
  message,
  jobTitle,
  clientId,
  freelancerName,
  ...details
}) {
  const freelancerSnap = await getDoc(doc(db, "users", freelancerId));
  if (!freelancerSnap.exists()) {
    throw new Error("Freelancer profile not found.");
  }
  const freelancerProfile = freelancerSnap.data();
  if (!canFreelancerApplyJob({ ...freelancerProfile, role: "freelancer" })) {
    throw new Error(
      "Freelancer account must be approved and profile completion must be 100% before applying."
    );
  }

  const existingProposalSnap = await getDocs(
    query(
      collection(db, "proposals"),
      where("jobId", "==", jobId),
      where("freelancerId", "==", freelancerId)
    )
  );
  if (!existingProposalSnap.empty) {
    throw new Error("You have already applied for this job.");
  }

  const docRef = await addDoc(collection(db, "proposals"), {
    jobId,
    jobTitle: jobTitle || null,
    clientId: clientId || null,
    clientName: details.clientName || details.companyName || null,
    freelancerId,
    freelancerName: freelancerName || freelancerProfile.name || freelancerProfile.displayName || null,
    freelancerPhotoURL: freelancerProfile.photoURL || freelancerProfile.profileImage || null,
    bidAmount,
    message,
    ...details,
    status: "pending",
    createdAt: serverTimestamp(),
    adminApprovedBy: null
  });
  await logActivity({
    actor: freelancerId,
    action: "proposal_submitted",
    targetId: docRef.id
  });
  const adminIds = await listActiveAdminIds().catch(() => []);
  await createNotificationsBulk([
    ...adminIds.map((adminId) => ({
      recipientId: adminId,
      type: "proposal_submitted",
      title: "New proposal submitted",
      message: `A freelancer submitted a proposal for "${jobTitle || "a job"}".`,
      actorId: freelancerId,
      jobId,
      proposalId: docRef.id
    })),
    {
      recipientId: clientId || null,
      type: "proposal_received",
      title: "New proposal received",
      message: `You received a new proposal for "${jobTitle || "your job"}".`,
      actorId: freelancerId,
      jobId,
      proposalId: docRef.id
    }
  ]).catch(() => null);
  return docRef;
}

export async function approveProposal(proposalId, adminId) {
  const proposalRef = doc(db, "proposals", proposalId);
  const proposalSnap = await getDoc(proposalRef);
  if (!proposalSnap.exists()) {
    throw new Error("Proposal not found.");
  }
  const proposal = proposalSnap.data();
  await updateDoc(proposalRef, {
    status: "approved",
    adminApprovedBy: adminId,
    reviewedAt: serverTimestamp()
  });
  await logActivity({
    actor: adminId,
    action: "proposal_approved",
    targetId: proposalId
  });
  await createNotificationsBulk([
    {
      recipientId: proposal.freelancerId,
      type: "proposal_approved",
      title: "Proposal approved",
      message: `Your proposal for "${proposal.jobTitle || "job"}" is approved by admin.`,
      actorId: adminId,
      jobId: proposal.jobId || null,
      proposalId
    },
    {
      recipientId: proposal.clientId,
      type: "proposal_approved_for_job",
      title: "Proposal approved for your job",
      message: `A proposal for "${proposal.jobTitle || "your job"}" was approved by admin.`,
      actorId: adminId,
      jobId: proposal.jobId || null,
      proposalId
    }
  ]).catch(() => null);
}

export async function rejectProposal(proposalId, adminId) {
  const proposalRef = doc(db, "proposals", proposalId);
  const proposalSnap = await getDoc(proposalRef);
  if (!proposalSnap.exists()) {
    throw new Error("Proposal not found.");
  }
  const proposal = proposalSnap.data();
  await updateDoc(proposalRef, {
    status: "rejected",
    adminApprovedBy: adminId,
    reviewedAt: serverTimestamp()
  });
  await logActivity({
    actor: adminId,
    action: "proposal_rejected",
    targetId: proposalId
  });
  await createNotification({
    recipientId: proposal.freelancerId,
    type: "proposal_rejected",
    title: "Proposal rejected",
    message: `Your proposal for "${proposal.jobTitle || "job"}" was rejected by admin.`,
    actorId: adminId,
    jobId: proposal.jobId || null,
    proposalId
  }).catch(() => null);
}

export async function selectProposalForJob({ proposalId, adminId }) {
  if (!proposalId) {
    throw new Error("Proposal id is required.");
  }
  if (!adminId) {
    throw new Error("Admin id is required.");
  }

  const selectedRef = doc(db, "proposals", proposalId);
  const selectedSnap = await getDoc(selectedRef);
  if (!selectedSnap.exists()) {
    throw new Error("Selected proposal not found.");
  }

  const selectedProposal = selectedSnap.data();
  const jobId = selectedProposal.jobId;
  if (!jobId) {
    throw new Error("Proposal is missing job reference.");
  }
  if (selectedProposal.status === "rejected") {
    throw new Error("Rejected proposal cannot be selected.");
  }
  if (selectedProposal.status !== "approved") {
    throw new Error("Only approved proposals can be selected for assignment.");
  }

  const jobRef = doc(db, "jobs", jobId);
  const jobSnap = await getDoc(jobRef);
  if (!jobSnap.exists()) {
    throw new Error("Related job not found.");
  }
  const job = jobSnap.data();
  const selectedFreelancer = await resolveFreelancerIdentity(selectedProposal);
  const selectedFreelancerId = pickFirstText(selectedFreelancer.id);
  const selectedFreelancerName =
    selectedFreelancer.name ||
    pickFirstText(selectedProposal.freelancerName, selectedProposal.bidderName, selectedProposal.bidder) ||
    null;
  const clientIdentity = await resolveClientIdentity(selectedProposal, job);
  const resolvedClientId = pickFirstText(clientIdentity.id);
  const resolvedClientName = clientIdentity.name || null;

  if (!selectedFreelancerId) {
    throw new Error(
      "Selected proposal is missing freelancer account link. Update proposal with freelancerId and retry."
    );
  }
  if (!resolvedClientId) {
    throw new Error(
      "Job is missing client account link. Update job/client id and retry selection."
    );
  }

  if (job.status !== "approved" && job.status !== "in_progress") {
    throw new Error("Job must be approved before selecting a freelancer.");
  }
  if (job.selectedProposalId === proposalId && job.projectId) {
    throw new Error("This freelancer is already selected for the job.");
  }
  if (job.selectedProposalId && job.selectedProposalId !== proposalId) {
    throw new Error("A freelancer is already selected for this job.");
  }

  const proposalsSnap = await getDocs(
    query(collection(db, "proposals"), where("jobId", "==", jobId))
  );
  const jobProposals = proposalsSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
  if (jobProposals.length === 0) {
    throw new Error("No proposals found for this job.");
  }

  const batch = writeBatch(db);
  const projectRef = job.projectId
    ? doc(db, "projects", job.projectId)
    : doc(collection(db, "projects"));
  const existingProjectSnap = job.projectId ? await getDoc(projectRef) : null;
  const shouldCreateProject = !job.projectId || !existingProjectSnap?.exists();

  batch.update(selectedRef, {
    status: "selected",
    adminApprovedBy: adminId,
    freelancerId: selectedFreelancerId,
    freelancerName: selectedFreelancerName,
    selectedAt: serverTimestamp(),
    reviewedAt: serverTimestamp()
  });

  const rejectedProposals = [];
  jobProposals.forEach((proposal) => {
    if (proposal.id === proposalId) return;
    if (proposal.status === "rejected") return;
    rejectedProposals.push(proposal);
    batch.update(doc(db, "proposals", proposal.id), {
      status: "rejected",
      adminApprovedBy: adminId,
      rejectedAt: serverTimestamp(),
      reviewedAt: serverTimestamp(),
      rejectedReason: "Another freelancer was selected for this job."
    });
  });

  if (shouldCreateProject) {
    batch.set(projectRef, {
      jobId,
      proposalId,
      clientId: resolvedClientId,
      freelancerId: selectedFreelancerId,
      jobTitle: selectedProposal.jobTitle || job.title || null,
      clientName: resolvedClientName || job.clientName || null,
      clientPhotoURL: job.clientPhotoURL || null,
      freelancerName: selectedFreelancerName || null,
      freelancerPhotoURL: selectedProposal.freelancerPhotoURL || null,
      status: "in_progress",
      createdAt: serverTimestamp(),
      createdByAdmin: adminId
    });
  } else {
    batch.update(projectRef, {
      freelancerId: selectedFreelancerId,
      freelancerName: selectedFreelancerName || null,
      freelancerPhotoURL: selectedProposal.freelancerPhotoURL || null,
      proposalId,
      status: "in_progress",
      updatedAt: serverTimestamp()
    });
  }

  batch.update(jobRef, {
    status: "in_progress",
    selectedProposalId: proposalId,
    selectedFreelancerId: selectedFreelancerId,
    selectedFreelancerName: selectedFreelancerName || null,
    adminAssignedBy: adminId,
    selectedAt: serverTimestamp(),
    projectId: projectRef.id
  });

  const notificationPayloads = [];
  notificationPayloads.push({
    recipientId: selectedFreelancerId,
    type: "proposal_selected",
    title: "Proposal accepted",
    message: `Your proposal for "${selectedProposal.jobTitle || "job"}" was selected by admin.`,
    actorId: adminId,
    jobId,
    proposalId,
    projectId: projectRef.id,
    read: false,
    createdAt: serverTimestamp()
  });

  notificationPayloads.push({
    recipientId: resolvedClientId,
    type: "freelancer_selected",
    title: "Freelancer selected",
    message: `Admin selected ${selectedFreelancerName || "a freelancer"} for "${selectedProposal.jobTitle || "your job"}".`,
    actorId: adminId,
    jobId,
    proposalId,
    projectId: projectRef.id,
    read: false,
    createdAt: serverTimestamp()
  });

  const notifiedRejectedRecipients = new Set();
  rejectedProposals.forEach((proposal) => {
    const rejectedRecipientId = extractFreelancerIdForNotification(proposal);
    if (!rejectedRecipientId) return;
    if (rejectedRecipientId === selectedFreelancerId) return;
    if (notifiedRejectedRecipients.has(rejectedRecipientId)) return;
    notifiedRejectedRecipients.add(rejectedRecipientId);

    notificationPayloads.push({
      recipientId: rejectedRecipientId,
      type: "proposal_rejected",
      title: "Proposal not selected",
      message: `Your proposal for "${proposal.jobTitle || "job"}" was not selected.`,
      actorId: adminId,
      jobId,
      proposalId: proposal.id,
      projectId: projectRef.id,
      read: false,
      createdAt: serverTimestamp()
    });
  });

  await batch.commit();

  const notificationResults = await Promise.allSettled(
    notificationPayloads.map((payload) =>
      addDoc(collection(db, "notifications"), payload)
    )
  );
  const failedNotifications = notificationResults.filter(
    (entry) => entry.status === "rejected"
  ).length;

  await Promise.allSettled([
    logActivity({
      actor: adminId,
      action: "proposal_selected",
      targetId: proposalId
    }),
    logActivity({
      actor: adminId,
      action: "job_assigned",
      targetId: jobId
    }),
    logActivity({
      actor: adminId,
      action: "project_created",
      targetId: projectRef.id
    })
  ]);

  return {
    projectId: projectRef.id,
    selectedFreelancerId: selectedFreelancerId,
    rejectedCount: rejectedProposals.length,
    notificationsDelivered: failedNotifications === 0,
    failedNotifications
  };
}

export async function listProposalsForJob(jobId) {
  const snapshot = await getDocs(
    query(collection(db, "proposals"), where("jobId", "==", jobId))
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function listFreelancerProposals(freelancerId) {
  const snapshot = await getDocs(
    query(collection(db, "proposals"), where("freelancerId", "==", freelancerId))
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function listApprovedProposalsForJob(jobId) {
  const snapshot = await getDocs(
    query(
      collection(db, "proposals"),
      where("jobId", "==", jobId),
      where("status", "==", "approved")
    )
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function listPendingProposals() {
  const snapshot = await getDocs(
    query(collection(db, "proposals"), where("status", "==", "pending"))
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function listAllProposals() {
  const snapshot = await getDocs(collection(db, "proposals"));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}
