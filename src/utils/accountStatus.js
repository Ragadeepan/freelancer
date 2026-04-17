import { getClientProfileCompletion } from "./clientProfile.js";
import { getFreelancerProfileCompletion } from "./freelancerOnboarding.js";

export const ACCOUNT_STATUS = {
  INCOMPLETE: "incomplete",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  REJECTED: "rejected"
};

const LEGACY_STATUS_MAP = {
  pending: ACCOUNT_STATUS.PENDING_APPROVAL,
  blocked: ACCOUNT_STATUS.REJECTED
};

const toText = (value) => String(value || "").trim().toLowerCase();

const toPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const maxPercent = (...values) => {
  const normalized = values
    .map((value) => toPercent(value))
    .filter((value) => value != null);
  if (normalized.length === 0) return null;
  return Math.max(...normalized);
};

const toRole = (value) => {
  const role = toText(value);
  if (role === "client" || role === "freelancer" || role === "admin") return role;
  return "";
};

export const normalizeAccountStatus = (status) => {
  const normalized = toText(status);
  if (!normalized) return ACCOUNT_STATUS.INCOMPLETE;
  return LEGACY_STATUS_MAP[normalized] || normalized;
};

export const isAccountApproved = (status) =>
  normalizeAccountStatus(status) === ACCOUNT_STATUS.APPROVED;

export const isAccountRejected = (status) =>
  normalizeAccountStatus(status) === ACCOUNT_STATUS.REJECTED;

export const isAccountPendingApproval = (status) =>
  normalizeAccountStatus(status) === ACCOUNT_STATUS.PENDING_APPROVAL;

export const getRoleProfileCompletion = (profile) => {
  const role = toRole(profile?.role);
  if (role === "client") {
    const computed = getClientProfileCompletion(profile || {}).percent;
    const stored = maxPercent(profile?.clientProfileCompletion, profile?.profileCompletion);
    if (stored == null) return computed;
    return Math.max(stored, computed);
  }
  if (role === "freelancer") {
    const computed = getFreelancerProfileCompletion(profile || {}).percent;
    const stored = maxPercent(
      profile?.freelancerProfileCompletion,
      profile?.profileCompletion
    );
    if (stored == null) return computed;
    return Math.max(stored, computed);
  }
  const numeric = maxPercent(
    profile?.profileCompletion,
    profile?.clientProfileCompletion,
    profile?.freelancerProfileCompletion
  );
  if (numeric != null) return numeric;
  return 100;
};

export const isRoleProfileComplete = (profile) => getRoleProfileCompletion(profile) === 100;

export const canClientPostJob = (profile) =>
  toRole(profile?.role) === "client" &&
  isAccountApproved(profile?.status) &&
  isRoleProfileComplete(profile);

export const canFreelancerApplyJob = (profile) =>
  toRole(profile?.role) === "freelancer" &&
  isAccountApproved(profile?.status) &&
  isRoleProfileComplete(profile);

export const canRequestAdminApproval = (profile) => {
  const role = toRole(profile?.role);
  if (role !== "client" && role !== "freelancer") return false;
  if (!isRoleProfileComplete(profile)) return false;
  const status = normalizeAccountStatus(profile?.status);
  return status === ACCOUNT_STATUS.INCOMPLETE || status === ACCOUNT_STATUS.REJECTED;
};

export const getClientPostJobBlockedMessage = (profile) => {
  if (!isRoleProfileComplete(profile)) {
    return "⚠️ Complete 100% profile details to request admin approval and post a job.";
  }
  const status = normalizeAccountStatus(profile?.status);
  if (status === ACCOUNT_STATUS.PENDING_APPROVAL) {
    return "🚫 Admin approval required before posting jobs.";
  }
  if (status === ACCOUNT_STATUS.REJECTED) {
    return "Your approval request was rejected. Update profile and request admin approval again.";
  }
  if (status !== ACCOUNT_STATUS.APPROVED) {
    return "Request Admin Approval to unlock posting jobs.";
  }
  return "";
};

export const getFreelancerApplyBlockedMessage = (profile) => {
  if (!isRoleProfileComplete(profile)) {
    return "⚠️ Complete 100% profile details to request admin approval and apply for jobs.";
  }
  const status = normalizeAccountStatus(profile?.status);
  if (status === ACCOUNT_STATUS.PENDING_APPROVAL) {
    return "🚫 Admin approval required before applying to jobs.";
  }
  if (status === ACCOUNT_STATUS.REJECTED) {
    return "Your approval request was rejected. Update profile and request admin approval again.";
  }
  if (status !== ACCOUNT_STATUS.APPROVED) {
    return "Request Admin Approval to unlock applying to jobs.";
  }
  return "";
};

export const getWorkspaceActionBlockedMessage = (profile) => {
  const role = toRole(profile?.role);
  if (role === "client") {
    return getClientPostJobBlockedMessage(profile);
  }
  if (role === "freelancer") {
    return getFreelancerApplyBlockedMessage(profile);
  }
  return "";
};

const getClientNavLockState = (profile, item) => {
  const requiresProfile = Boolean(item?.requiresClientProfileComplete);
  const requiresApproval = Boolean(item?.requiresClientApproval);
  if (!requiresProfile && !requiresApproval) {
    return { locked: false, message: "", redirectTo: "" };
  }

  const completion = getRoleProfileCompletion({
    ...(profile || {}),
    role: "client"
  });
  const profileComplete = completion === 100;
  const approved = isAccountApproved(profile?.status);
  const locked =
    (requiresProfile && !profileComplete) || (requiresApproval && !approved);
  if (!locked) return { locked: false, message: "", redirectTo: "" };

  const status = normalizeAccountStatus(profile?.status);
  let message = "";
  if (String(item?.to || "").startsWith("/client/post-job")) {
    message = getClientPostJobBlockedMessage(profile);
  } else if (!profileComplete) {
    message = `Complete client profile to 100% before opening ${item?.label || "this section"}. Current: ${completion}%.`;
  } else if (status === ACCOUNT_STATUS.PENDING_APPROVAL) {
    message = "🚫 Admin approval required before posting jobs.";
  } else if (status === ACCOUNT_STATUS.REJECTED) {
    message =
      "Your approval request was rejected. Update profile and request admin approval again.";
  } else {
    message = "Request Admin Approval to unlock this section.";
  }

  return {
    locked: true,
    message,
    redirectTo: "/client/company-profile"
  };
};

const getFreelancerNavLockState = (profile, item) => {
  const requiresProfile = Boolean(item?.requiresFreelancerProfileComplete);
  const requiresApproval = Boolean(item?.requiresFreelancerApproval);
  if (!requiresProfile && !requiresApproval) {
    return { locked: false, message: "", redirectTo: "" };
  }

  const completion = getRoleProfileCompletion({
    ...(profile || {}),
    role: "freelancer"
  });
  const profileComplete = completion === 100;
  const approved = isAccountApproved(profile?.status);
  const locked =
    (requiresProfile && !profileComplete) || (requiresApproval && !approved);
  if (!locked) return { locked: false, message: "", redirectTo: "" };

  const status = normalizeAccountStatus(profile?.status);
  const target = String(item?.to || "");
  let message = "";
  if (target.startsWith("/freelancer/jobs")) {
    message = getFreelancerApplyBlockedMessage(profile);
  } else if (!profileComplete) {
    message = `Complete freelancer profile to 100% before opening ${item?.label || "this section"}. Current: ${completion}%.`;
  } else if (status === ACCOUNT_STATUS.PENDING_APPROVAL) {
    message = "🚫 Admin approval required before applying to jobs.";
  } else if (status === ACCOUNT_STATUS.REJECTED) {
    message =
      "Your approval request was rejected. Update profile and request admin approval again.";
  } else {
    message = "Request Admin Approval to unlock this section.";
  }

  return {
    locked: true,
    message,
    redirectTo: "/freelancer/profile"
  };
};

export const getWorkspaceNavLockState = (profile, item) => {
  const role = toRole(profile?.role);
  if (role === "client") return getClientNavLockState(profile, item);
  if (role === "freelancer") return getFreelancerNavLockState(profile, item);
  return { locked: false, message: "", redirectTo: "" };
};

export const getNormalizedStatusBadgeValue = (status) => {
  const normalized = normalizeAccountStatus(status);
  if (normalized === ACCOUNT_STATUS.INCOMPLETE) return ACCOUNT_STATUS.INCOMPLETE;
  if (normalized === ACCOUNT_STATUS.PENDING_APPROVAL) return ACCOUNT_STATUS.PENDING_APPROVAL;
  if (normalized === ACCOUNT_STATUS.REJECTED) return ACCOUNT_STATUS.REJECTED;
  return ACCOUNT_STATUS.APPROVED;
};
