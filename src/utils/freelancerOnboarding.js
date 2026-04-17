import { resolveFileUrl, resolveUserPhotoUrl } from "./fileUrl.js";

const asText = (value) => String(value || "").trim();

export const FREELANCER_REQUIRED_FIELD_LABELS = {
  fullName: "Full Name",
  phone: "Phone",
  profileImage: "Profile Image",
  primarySkills: "Skills (minimum 3)",
  experience: "Experience level",
  portfolioLinks: "Portfolio Link",
  hourlyRate: "Hourly Rate",
  bio: "About",
  resume: "Resume upload"
};

export const MIN_REQUIRED_SKILLS = 3;

const getFreelancerName = (profile) =>
  asText(profile?.name) || asText(profile?.displayName) || asText(profile?.fullName);

const getFreelancerPhone = (profile) =>
  asText(profile?.phone) || asText(profile?.contactPhone) || asText(profile?.mobile);

const getFreelancerPhoto = (profile) => resolveUserPhotoUrl(profile);

export function getFreelancerPortfolioLinks(profile) {
  return normalizePortfolioLinks(
    profile?.portfolioLinks || profile?.portfolioLink || profile?.portfolio
  );
}

const getFreelancerHourlyRate = (profile) => asText(profile?.hourlyRate);

export function getFreelancerMissingRequiredFields(profile) {
  const missing = [];
  if (!getFreelancerName(profile)) missing.push("fullName");
  if (!getFreelancerPhone(profile)) missing.push("phone");
  if (!getFreelancerPhoto(profile)) missing.push("profileImage");
  if (getFreelancerSkills(profile).length < MIN_REQUIRED_SKILLS) {
    missing.push("primarySkills");
  }
  if (!asText(profile?.experience)) missing.push("experience");
  if (getFreelancerPortfolioLinks(profile).length === 0) {
    missing.push("portfolioLinks");
  }
  if (!getFreelancerHourlyRate(profile)) missing.push("hourlyRate");
  if (!asText(profile?.bio) && !asText(profile?.about)) missing.push("bio");
  if (!getFreelancerResume(profile)) missing.push("resume");
  return missing;
}

export function getFreelancerProfileCompletion(profile) {
  const missingFields = getFreelancerMissingRequiredFields(profile);
  const total = Object.keys(FREELANCER_REQUIRED_FIELD_LABELS).length;
  const completedCount = Math.max(0, total - missingFields.length);
  const percent = total ? Math.round((completedCount / total) * 100) : 0;

  return {
    total,
    completedCount,
    percent,
    missingFields
  };
}

export function isFreelancerProfileComplete(profile) {
  return getFreelancerMissingRequiredFields(profile).length === 0;
}

export function isFreelancerReviewReady(profile) {
  if (!profile || profile.role !== "freelancer") return true;
  return isFreelancerProfileComplete(profile);
}

export function getFreelancerCompletionLabels() {
  return FREELANCER_REQUIRED_FIELD_LABELS;
}

export function getFreelancerCompletionSummary(profile) {
  const completion = getFreelancerProfileCompletion(profile);
  return {
    ...completion,
    labels: FREELANCER_REQUIRED_FIELD_LABELS
  };
}

export function getFreelancerGovId(profile) {
  if (profile?.govIdProof && asText(profile.govIdProof.url)) {
    return {
      name: asText(profile.govIdProof.name) || "Government ID",
      url: resolveFileUrl(asText(profile.govIdProof.url))
    };
  }
  const legacyGovIdUrl = resolveFileUrl(
    asText(profile?.govIdProofUrl) || asText(profile?.governmentIdUrl)
  );
  if (!legacyGovIdUrl) return null;
  return { name: "Government ID", url: legacyGovIdUrl };
}

export function getFreelancerGovIdType(profile) {
  return asText(profile?.govIdType);
}

export function getFreelancerOptionalLinks(profile) {
  return {
    github: asText(profile?.github),
    linkedin: asText(profile?.linkedin),
    website: asText(profile?.website)
  };
}

export function getFreelancerRequiredMinSkills() {
  return MIN_REQUIRED_SKILLS;
}

// Legacy exports kept for compatibility with existing pages.
export const LEGACY_FREELANCER_REQUIRED_FIELD_LABELS = {
  headline: "Professional title",
  primarySkills: "Skills",
  portfolioLinks: "Portfolio links",
  github: "GitHub link",
  linkedin: "LinkedIn link"
};

export function normalizePortfolioLinks(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => asText(entry)).filter(Boolean);
  }
  const text = asText(value);
  if (!text) return [];
  return text
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function formatPortfolioLinksForTextarea(value) {
  return normalizePortfolioLinks(value).join("\n");
}

export function getFreelancerSkills(profile) {
  if (Array.isArray(profile?.primarySkills) && profile.primarySkills.length > 0) {
    return profile.primarySkills.map((skill) => asText(skill)).filter(Boolean);
  }
  const fallback = asText(profile?.skill);
  return fallback ? [fallback] : [];
}

export function getFreelancerResume(profile) {
  if (profile?.resume && asText(profile.resume.url)) {
    return {
      name: asText(profile.resume.name) || "Resume",
      url: resolveFileUrl(asText(profile.resume.url))
    };
  }
  const legacyResumeUrl = resolveFileUrl(
    asText(profile?.resumeUrl) ||
    asText(profile?.cvUrl) ||
    asText(profile?.resumeLink)
  );
  if (!legacyResumeUrl) return null;
  return { name: "Resume", url: legacyResumeUrl };
}
