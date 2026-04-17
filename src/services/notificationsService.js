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

const normalizeType = (value) => String(value || "").trim().toLowerCase();

const getPreferenceKey = (role, type) => {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const normalizedType = normalizeType(type);

  if (!normalizedType) return null;
  if (normalizedRole === "admin") return null;

  if (normalizedType.startsWith("job_")) {
    if (normalizedType === "job_live") return "jobAlerts";
    return normalizedRole === "client" ? "jobReviewAlerts" : "jobAlerts";
  }
  if (normalizedType.startsWith("proposal_")) return "proposalAlerts";
  if (
    normalizedType.startsWith("project_update_") ||
    normalizedType.startsWith("dispute_")
  ) {
    return "projectUpdateAlerts";
  }
  if (normalizedType.startsWith("payment_")) return "paymentAlerts";
  if (normalizedType.startsWith("user_")) return "accountReviewAlerts";
  if (normalizedType.startsWith("message_")) {
    return normalizedRole === "freelancer" ? "clientMessages" : "emailNotifications";
  }
  return normalizedRole === "client" ? "emailNotifications" : null;
};

const shouldDeliverToProfile = (profile, type) => {
  if (!profile) return true;
  const role = String(profile.role || "").trim().toLowerCase();
  if (role === "admin") return true;
  const preferenceKey = getPreferenceKey(role, type);
  if (!preferenceKey) return true;
  return profile[preferenceKey] !== false;
};

const getProfileFromCacheOrDb = async (recipientId, cache) => {
  if (!recipientId || recipientId === "admins") return null;
  if (cache.has(recipientId)) {
    return cache.get(recipientId);
  }
  const snapshot = await getDoc(doc(db, "users", recipientId)).catch(() => null);
  const profile = snapshot?.exists() ? snapshot.data() : null;
  cache.set(recipientId, profile);
  return profile;
};

export async function createNotification({
  recipientId,
  type,
  title,
  message,
  actorId,
  jobId,
  proposalId,
  projectId
}) {
  if (!recipientId) return null;
  if (recipientId !== "admins") {
    const profile = await getDoc(doc(db, "users", recipientId))
      .then((snapshot) => (snapshot.exists() ? snapshot.data() : null))
      .catch(() => null);
    if (!shouldDeliverToProfile(profile, type)) {
      return null;
    }
  }
  return addDoc(collection(db, "notifications"), {
    recipientId,
    type: type || "info",
    title: title || "Notification",
    message: message || "",
    actorId: actorId || null,
    jobId: jobId || null,
    proposalId: proposalId || null,
    projectId: projectId || null,
    read: false,
    createdAt: serverTimestamp()
  });
}

export async function markNotificationRead(notificationId) {
  if (!notificationId) return;
  await updateDoc(doc(db, "notifications", notificationId), {
    read: true
  });
}

export async function markNotificationsRead(notificationIds = []) {
  if (!Array.isArray(notificationIds) || notificationIds.length === 0) return;
  const batch = writeBatch(db);
  notificationIds.forEach((id) => {
    if (!id) return;
    batch.update(doc(db, "notifications", id), { read: true });
  });
  await batch.commit();
}

export async function listActiveUserIdsByRole(role) {
  if (!role) return [];
  const snapshot = await getDocs(
    query(collection(db, "users"), where("role", "==", role))
  );
  if (snapshot.empty) return [];
  return snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter(
      (entry) => entry.status !== "blocked" && entry.status !== "rejected"
    )
    .map((entry) => entry.id);
}

export async function listActiveAdminIds() {
  try {
    const ids = await listActiveUserIdsByRole("admin");
    return ids.length > 0 ? ids : ["admins"];
  } catch {
    return ["admins"];
  }
}

export async function listFreelancerIdsForJobAlerts() {
  const snapshot = await getDocs(
    query(collection(db, "users"), where("role", "==", "freelancer"))
  );
  if (snapshot.empty) return [];
  return snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter(
      (entry) =>
        entry.status === "approved" &&
        entry.jobAlerts !== false &&
        entry.role === "freelancer"
    )
    .map((entry) => entry.id);
}

export async function createNotificationsBulk(payloads = []) {
  if (!Array.isArray(payloads) || payloads.length === 0) return [];
  const sanitized = payloads.filter((entry) => entry?.recipientId);
  if (sanitized.length === 0) return [];

  const cache = new Map();
  const deliverable = [];
  for (const payload of sanitized) {
    if (payload.recipientId === "admins") {
      deliverable.push(payload);
      continue;
    }
    const profile = await getProfileFromCacheOrDb(payload.recipientId, cache);
    if (shouldDeliverToProfile(profile, payload.type)) {
      deliverable.push(payload);
    }
  }

  if (deliverable.length === 0) return [];

  const results = await Promise.allSettled(
    deliverable.map((payload) =>
      addDoc(collection(db, "notifications"), {
        recipientId: payload.recipientId,
        type: payload.type || "info",
        title: payload.title || "Notification",
        message: payload.message || "",
        actorId: payload.actorId || null,
        jobId: payload.jobId || null,
        proposalId: payload.proposalId || null,
        projectId: payload.projectId || null,
        read: payload.read ?? false,
        createdAt: serverTimestamp()
      })
    )
  );
  return results;
}
