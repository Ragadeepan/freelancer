import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { db } from "../firebase/firebase.js";
import { logActivity } from "./activityLogsService.js";
import {
  createNotificationsBulk,
  listActiveAdminIds
} from "./notificationsService.js";
import {
  ACCOUNT_STATUS,
  normalizeAccountStatus,
  canRequestAdminApproval,
  getRoleProfileCompletion
} from "../utils/accountStatus.js";

const normalizeRole = (value) => String(value || "").trim().toLowerCase();
const asText = (value) => String(value || "").trim();

const withSyncedPhotoFields = (payload = {}) => {
  const next = { ...(payload || {}) };
  const photoURL = asText(next.photoURL);
  const profileImage = asText(next.profileImage);

  if (photoURL && !profileImage) {
    next.profileImage = photoURL;
  } else if (profileImage && !photoURL) {
    next.photoURL = profileImage;
  }

  return next;
};

const getProfileCompletionForRole = (role, profile) => {
  const normalizedRole = normalizeRole(role || profile?.role);
  const resolved = getRoleProfileCompletion({
    ...(profile || {}),
    role: normalizedRole || profile?.role
  });
  const numeric = Number(resolved);
  if (Number.isFinite(numeric)) return Math.max(0, Math.min(100, Math.round(numeric)));
  return 100;
};

const resolveWritableStatus = ({ role, status, profileCompletion }) => {
  const normalized = normalizeAccountStatus(status);
  if (role !== "client" && role !== "freelancer") {
    return normalized || ACCOUNT_STATUS.APPROVED;
  }
  if (normalized === ACCOUNT_STATUS.REJECTED) return ACCOUNT_STATUS.REJECTED;
  if (Number(profileCompletion) < 100) return ACCOUNT_STATUS.INCOMPLETE;
  if (normalized === ACCOUNT_STATUS.APPROVED) return ACCOUNT_STATUS.APPROVED;
  if (
    normalized === ACCOUNT_STATUS.PENDING_APPROVAL
  ) {
    return ACCOUNT_STATUS.PENDING_APPROVAL;
  }
  return ACCOUNT_STATUS.INCOMPLETE;
};

export async function getUserProfile(uid) {
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function createUserProfile(uid, data) {
  const normalizedData = withSyncedPhotoFields(data || {});
  const role = normalizeRole(normalizedData?.role);
  const profileCompletion = getProfileCompletionForRole(role, normalizedData);
  const status =
    role === "admin"
      ? ACCOUNT_STATUS.APPROVED
      : resolveWritableStatus({
          role,
          status: normalizedData?.status || ACCOUNT_STATUS.INCOMPLETE,
          profileCompletion
        });
  await setDoc(
    doc(db, "users", uid),
    {
      id: uid,
      ...normalizedData,
      status,
      profileCompletion,
      clientProfileCompletion:
        role === "client"
          ? profileCompletion
          : normalizedData?.clientProfileCompletion ?? null,
      clientProfileComplete:
        role === "client"
          ? profileCompletion === 100
          : normalizedData?.clientProfileComplete ?? null,
      freelancerProfileCompleted:
        role === "freelancer"
          ? profileCompletion === 100
          : normalizedData?.freelancerProfileCompleted ?? null,
      freelancerProfileCompletion:
        role === "freelancer"
          ? profileCompletion
          : normalizedData?.freelancerProfileCompletion ?? null,
      phone: String(normalizedData?.phone || "").trim(),
      rating: Number.isFinite(Number(normalizedData?.rating))
        ? Number(normalizedData.rating)
        : 0,
      verified: Boolean(normalizedData?.verified ?? false),
      completedProjects: Number.isFinite(Number(normalizedData?.completedProjects))
        ? Number(normalizedData.completedProjects)
        : 0,
      createdAt: serverTimestamp()
    },
    { merge: true }
  );
  return true;
}

export async function updateUserStatus(uid, status, adminApprovedBy) {
  const existingProfile = await getUserProfile(uid).catch(() => null);
  if (!existingProfile) {
    throw new Error("Profile not found.");
  }
  const roleText = normalizeRole(existingProfile?.role);
  const normalizedStatus = normalizeAccountStatus(status);
  const completionPercent = getProfileCompletionForRole(roleText, existingProfile || {});
  if (normalizedStatus === ACCOUNT_STATUS.APPROVED) {
    if (completionPercent < 100) {
      throw new Error("Profile completion must be 100% before approval.");
    }
  }

  const completionPayload = {
    profileCompletion: completionPercent
  };
  if (roleText === "client") {
    completionPayload.clientProfileCompletion = completionPercent;
    completionPayload.clientProfileComplete = completionPercent === 100;
  } else if (roleText === "freelancer") {
    completionPayload.freelancerProfileCompletion = completionPercent;
    completionPayload.freelancerProfileCompleted = completionPercent === 100;
  }

  await updateDoc(doc(db, "users", uid), {
    id: uid,
    status: normalizedStatus,
    ...completionPayload,
    adminApprovedBy:
      normalizedStatus === ACCOUNT_STATUS.APPROVED ? adminApprovedBy || null : null,
    updatedAt: serverTimestamp()
  });
  await logActivity({
    actor: adminApprovedBy,
    action: `user_${normalizedStatus}`,
    targetId: uid
  }).catch(() => null);
  const statusText = normalizedStatus;
  const roleLabel =
    roleText === "freelancer"
      ? "Freelancer profile"
      : roleText === "client"
        ? "Client profile"
        : "Profile";
  const titleMap = {
    approved: `${roleLabel} approved`,
    rejected: `${roleLabel} rejected`,
    pending_approval: `${roleLabel} pending review`,
    incomplete: `${roleLabel} incomplete`
  };
  const messageMap = {
    approved:
      roleText === "freelancer"
        ? "Your freelancer account was approved by admin. You can now apply for jobs."
        : roleText === "client"
          ? "Your client account was approved by admin. You can now post jobs."
          : "Your account was approved by admin. Full workspace actions are now available.",
    rejected: "Your account was rejected by admin. Contact support for next steps.",
    pending_approval: "Your account status is now pending admin review.",
    incomplete: "Complete required profile details and request admin approval."
  };
  const shouldNotify = existingProfile?.accountReviewAlerts !== false;
  await createNotificationsBulk(
    shouldNotify
      ? [
          {
            recipientId: uid,
            type: `user_${statusText || "status_updated"}`,
            title: titleMap[statusText] || "Profile status updated",
            message:
              messageMap[statusText] ||
              `Your account status changed to ${statusText || "updated"}.`,
            actorId: adminApprovedBy || null
          }
        ]
      : []
  ).catch(() => null);
}

export async function listPendingUsers() {
  const snapshot = await getDocs(
    query(collection(db, "users"), where("status", "==", "pending_approval"))
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function listUsersByRole(role) {
  const snapshot = await getDocs(
    query(collection(db, "users"), where("role", "==", role))
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function listAllUsers() {
  const snapshot = await getDocs(collection(db, "users"));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function updateUserProfile(uid, payload) {
  const normalizedPayload = withSyncedPhotoFields(payload || {});
  const previousProfile = await getUserProfile(uid).catch(() => null);
  const role = normalizeRole(normalizedPayload?.role || previousProfile?.role);
  const mergedProfile = {
    ...(previousProfile || {}),
    ...normalizedPayload,
    role
  };
  const profileCompletion = getProfileCompletionForRole(role, mergedProfile);
  const status = resolveWritableStatus({
    role,
    status: normalizedPayload?.status ?? previousProfile?.status,
    profileCompletion
  });
  await updateDoc(doc(db, "users", uid), {
    id: uid,
    ...normalizedPayload,
    status,
    profileCompletion,
    clientProfileCompletion:
      role === "client"
        ? profileCompletion
        : normalizedPayload?.clientProfileCompletion ??
          previousProfile?.clientProfileCompletion ??
          null,
    clientProfileComplete:
      role === "client"
        ? profileCompletion === 100
        : normalizedPayload?.clientProfileComplete ??
          previousProfile?.clientProfileComplete ??
          null,
    freelancerProfileCompleted:
      role === "freelancer"
        ? profileCompletion === 100
        : normalizedPayload?.freelancerProfileCompleted ??
          previousProfile?.freelancerProfileCompleted ??
          null,
    freelancerProfileCompletion:
      role === "freelancer"
        ? profileCompletion
        : normalizedPayload?.freelancerProfileCompletion ??
          previousProfile?.freelancerProfileCompletion ??
          null,
    updatedAt: serverTimestamp()
  });
  await logActivity({
    actor: uid,
    action: "profile_updated",
    targetId: uid
  });
}

export async function requestAdminApproval(uid) {
  const profile = await getUserProfile(uid);
  if (!profile) {
    throw new Error("Profile not found.");
  }
  const role = normalizeRole(profile.role);
  if (role !== "client" && role !== "freelancer") {
    throw new Error("Only client and freelancer accounts can request approval.");
  }
  const updatedProfile = { ...profile, role };
  if (!canRequestAdminApproval(updatedProfile)) {
    throw new Error("Complete 100% profile details before requesting admin approval.");
  }

  const profileCompletion = getProfileCompletionForRole(role, updatedProfile);
  await updateDoc(doc(db, "users", uid), {
    id: uid,
    status: ACCOUNT_STATUS.PENDING_APPROVAL,
    profileCompletion,
    clientProfileCompletion:
      role === "client" ? profileCompletion : profile.clientProfileCompletion ?? null,
    clientProfileComplete:
      role === "client" ? profileCompletion === 100 : profile.clientProfileComplete ?? null,
    freelancerProfileCompleted:
      role === "freelancer"
        ? profileCompletion === 100
        : profile.freelancerProfileCompleted ?? null,
    freelancerProfileCompletion:
      role === "freelancer"
        ? profileCompletion
        : profile.freelancerProfileCompletion ?? null,
    requestedApprovalAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await logActivity({
    actor: uid,
    action: "user_request_approval",
    targetId: uid
  });

  const adminIds = await listActiveAdminIds().catch(() => []);
  await createNotificationsBulk(
    adminIds.map((adminId) => ({
      recipientId: adminId,
      type: "user_approval_requested",
      title:
        role === "client"
          ? "Client approval request"
          : "Freelancer approval request",
      message: `${profile.name || profile.displayName || profile.email || uid} requested admin approval.`,
      actorId: uid
    }))
  ).catch(() => null);
}
