import { adminDb, FieldValue } from "../config/firebaseAdmin.js";
import { HttpError } from "../utils/httpError.js";
import { rankProposalsForJob } from "./scoreCalculator.js";

const RANKING_CACHE_TTL_MS = 60 * 1000;
const rankingCache = new Map();

const normalizeText = (value) => String(value || "").trim();
const normalizeLower = (value) => normalizeText(value).toLowerCase();

const toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const clean = String(value || "")
    .replace(/[, ]+/g, "")
    .replace(/[^\d.]/g, "");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const parsePagination = ({ page, limit }) => {
  const parsedPage = Number(page);
  const parsedLimit = Number(limit);
  return {
    page: Number.isFinite(parsedPage) ? clamp(Math.round(parsedPage), 1, 100000) : 1,
    limit: Number.isFinite(parsedLimit) ? clamp(Math.round(parsedLimit), 1, 50) : 20
  };
};

const parseDeliveryDays = (value) => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  const match = text.match(/\d+(\.\d+)?/);
  if (!match) return null;
  const base = Number(match[0]);
  if (!Number.isFinite(base) || base <= 0) return null;
  if (text.includes("week")) return Math.round(base * 7);
  if (text.includes("month")) return Math.round(base * 30);
  if (text.includes("year")) return Math.round(base * 365);
  return Math.round(base);
};

const sanitizeSkills = (value) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const output = [];
  value.forEach((item) => {
    const skill = normalizeText(item).slice(0, 64);
    const key = normalizeLower(skill);
    if (!skill || seen.has(key)) return;
    seen.add(key);
    output.push(skill);
  });
  return output.slice(0, 20);
};

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const toIso = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const serialize = (value) => {
  if (Array.isArray(value)) return value.map((item) => serialize(item));
  if (value && typeof value === "object") {
    if (typeof value.toDate === "function") return toIso(value);
    if (value instanceof Date) return value.toISOString();
    const output = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (entry === undefined) return;
      output[key] = serialize(entry);
    });
    return output;
  }
  return value;
};

const getRoleFromProfile = (profile, fallbackRole = null) => {
  const role = normalizeLower(profile?.role || fallbackRole || "");
  if (role === "admin" || role === "client" || role === "freelancer") return role;
  return "";
};

async function getUserProfile(uid, fallbackRole = null) {
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) {
    throw new HttpError(404, "User profile not found.");
  }
  const data = snap.data() || {};
  return {
    id: snap.id,
    ...data,
    role: getRoleFromProfile(data, fallbackRole)
  };
}

async function getJobById(jobId) {
  const snap = await adminDb.collection("jobs").doc(jobId).get();
  if (!snap.exists) {
    throw new HttpError(404, "Job not found.");
  }
  return {
    id: snap.id,
    ...snap.data()
  };
}

function buildRankingSignature(job, proposals) {
  const jobSkills = sanitizeSkills(job?.skills || []).join("|");
  const jobToken = `${job.id}|${normalizeText(job.status)}|${jobSkills}`;
  const proposalToken = proposals
    .map((proposal) => {
      const skills = sanitizeSkills(proposal.skills || []).join("|");
      const price = toNumber(proposal.price ?? proposal.bidAmount) ?? "na";
      const delivery = parseDeliveryDays(
        proposal.deliveryDays ?? proposal.deliveryTime
      ) ?? "na";
      const rating = toNumber(proposal.freelancerRating ?? proposal.rating) ?? "na";
      const completedProjects =
        toNumber(
          proposal.freelancerCompletedProjects ?? proposal.completedProjects
        ) ?? "na";
      const updatedAt = toMillis(proposal.updatedAt || proposal.createdAt);
      return `${proposal.id}:${normalizeText(proposal.status)}:${price}:${delivery}:${rating}:${completedProjects}:${skills}:${updatedAt}`;
    })
    .sort()
    .join(";");
  return `${jobToken}::${proposalToken}`;
}

function cacheKey(jobId) {
  return `job:${jobId}`;
}

function getRankedFromCacheOrCompute({ job, proposals }) {
  const key = cacheKey(job.id);
  const signature = buildRankingSignature(job, proposals);
  const now = Date.now();
  const cached = rankingCache.get(key);

  if (
    cached &&
    cached.signature === signature &&
    now - cached.cachedAt <= RANKING_CACHE_TTL_MS
  ) {
    return {
      proposals: cached.rankedProposals,
      cached: true
    };
  }

  const rankedProposals = rankProposalsForJob({ proposals, job }).map((proposal) => ({
    ...proposal,
    score: Number(proposal.score || 0),
    isTop: Boolean(proposal.isTop),
    topRank: proposal.topRank || null
  }));

  rankingCache.set(key, {
    signature,
    cachedAt: now,
    rankedProposals
  });

  return {
    proposals: rankedProposals,
    cached: false
  };
}

export function invalidateRankingCache(jobId) {
  if (!jobId) return;
  rankingCache.delete(cacheKey(jobId));
}

function ensureClientAccessToJob(actorUid, actorRole, job) {
  if (actorRole === "admin") return;
  if (actorRole === "client") {
    if (job.clientId !== actorUid) {
      throw new HttpError(403, "You can access proposals only for your own jobs.");
    }
    return;
  }
  if (actorRole === "freelancer") {
    return;
  }
  throw new HttpError(403, "Marketplace role is required.");
}

function filterProposalsByRole(actorUid, actorRole, proposals) {
  if (actorRole === "freelancer") {
    return proposals.filter((proposal) => proposal.freelancerId === actorUid);
  }
  return proposals;
}

function paginateList(list, { page, limit }) {
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  const end = start + limit;

  return {
    page: safePage,
    limit,
    total,
    totalPages,
    items: list.slice(start, end)
  };
}

async function fetchJobProposals(jobId) {
  const snapshot = await adminDb
    .collection("proposals")
    .where("jobId", "==", jobId)
    .get();

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
}

function parsePriceType(value) {
  const priceType = normalizeLower(value);
  if (priceType === "fixed" || priceType === "hourly") return priceType;
  return "";
}

export async function createProposalRecord({
  actorUid,
  actorRole,
  payload
}) {
  const user = await getUserProfile(actorUid, actorRole);
  if (user.role !== "freelancer") {
    throw new HttpError(403, "Only freelancers can submit proposals.");
  }
  const profileCompletion = Number(user.profileCompletion || 0);
  if (normalizeLower(user.status) !== "approved" || profileCompletion < 100) {
    throw new HttpError(
      403,
      "Freelancer account must be approved and profile completion must be 100% before applying."
    );
  }

  const jobId = normalizeText(payload?.jobId);
  if (!jobId) {
    throw new HttpError(400, "jobId is required.");
  }
  const job = await getJobById(jobId);
  if (normalizeLower(job.status) !== "approved") {
    throw new HttpError(409, "Only approved jobs can accept proposals.");
  }
  if (!job.clientId) {
    throw new HttpError(409, "Job is missing client assignment.");
  }

  const existingSnap = await adminDb
    .collection("proposals")
    .where("jobId", "==", jobId)
    .where("freelancerId", "==", actorUid)
    .limit(1)
    .get();
  if (!existingSnap.empty) {
    throw new HttpError(409, "You already submitted a proposal for this job.");
  }

  const priceType = parsePriceType(payload?.priceType || payload?.bidType);
  if (!priceType) {
    throw new HttpError(400, "priceType must be fixed or hourly.");
  }

  const price = toNumber(payload?.price ?? payload?.bidAmount);
  if (!Number.isFinite(price) || price <= 0) {
    throw new HttpError(400, "price must be a positive number.");
  }
  if (price > 1_000_000_000) {
    throw new HttpError(400, "price is too high.");
  }

  const deliveryDays = parseDeliveryDays(payload?.deliveryDays ?? payload?.deliveryTime);
  if (!Number.isFinite(deliveryDays) || deliveryDays < 1 || deliveryDays > 3650) {
    throw new HttpError(
      400,
      "deliveryDays must be between 1 and 3650 days."
    );
  }

  const proposalText = normalizeText(payload?.proposalText || payload?.message);
  if (proposalText.length < 10 || proposalText.length > 5000) {
    throw new HttpError(
      400,
      "proposalText must be between 10 and 5000 characters."
    );
  }

  const skillsFromPayload = sanitizeSkills(payload?.skills || []);
  const profileSkills = sanitizeSkills(user.primarySkills || []);
  const skills = (skillsFromPayload.length > 0 ? skillsFromPayload : profileSkills).slice(
    0,
    20
  );

  const freelancerName = normalizeText(
    payload?.freelancerName || user.name || user.displayName || "Freelancer"
  ).slice(0, 120);
  const ratingCandidate = [
    user.freelancerRating,
    user.profileRating,
    user.rating
  ]
    .map((entry) => Number(entry))
    .find((entry) => Number.isFinite(entry) && entry >= 0);
  const freelancerRating = Number.isFinite(ratingCandidate)
    ? Number(Math.min(5, Math.max(0, ratingCandidate)).toFixed(1))
    : 0;
  const completedProjectsCandidate = [
    user.freelancerCompletedProjects,
    user.completedProjects
  ]
    .map((entry) => Number(entry))
    .find((entry) => Number.isFinite(entry) && entry >= 0);
  const freelancerCompletedProjects = Number.isFinite(completedProjectsCandidate)
    ? Math.round(completedProjectsCandidate)
    : 0;
  const freelancerVerified = Boolean(
    user.verified ??
      user.freelancerVerified ??
      user.identityVerified ??
      false
  );
  const freelancerExperienceLevel =
    normalizeText(
      user.experienceLevel || payload?.experienceLevel || ""
    ).slice(0, 80) || null;

  const proposalData = {
    jobId,
    jobTitle: normalizeText(payload?.jobTitle || job.title || "").slice(0, 200) || null,
    clientId: job.clientId,
    clientName:
      normalizeText(job.clientName || job.clientPublicName || "").slice(0, 120) ||
      null,
    freelancerId: actorUid,
    freelancerName,
    freelancerRating,
    freelancerCompletedProjects,
    freelancerVerified,
    freelancerExperienceLevel,
    rating: freelancerRating,
    completedProjects: freelancerCompletedProjects,
    verified: freelancerVerified,
    priceType,
    price: Number(price.toFixed(2)),
    deliveryDays,
    skills,
    proposalText,

    bidType: priceType,
    bidAmount: Number(price.toFixed(2)),
    deliveryTime: `${deliveryDays} days`,
    message: proposalText,
    coverLetter: proposalText,
    proposalTitle: normalizeText(payload?.proposalTitle || "").slice(0, 200) || null,
    currency: normalizeText(payload?.currency || job.currency || "INR").toUpperCase(),
    availability: normalizeText(payload?.availability || "").slice(0, 120) || null,
    milestones: normalizeText(payload?.milestones || "").slice(0, 5000) || null,
    links: normalizeText(payload?.links || "").slice(0, 1000) || null,
    attachment:
      normalizeText(payload?.attachment || payload?.attachmentUrl || "").slice(
        0,
        1000
      ) || null,
    questions: normalizeText(payload?.questions || "").slice(0, 1000) || null,
    screeningAnswers:
      payload?.screeningAnswers && typeof payload.screeningAnswers === "object"
        ? payload.screeningAnswers
        : {},

    status: "pending",
    isTop: false,
    topRank: null,
    rank: null,
    score: 0,
    selectedAt: null,
    submittedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };

  const docRef = await adminDb.collection("proposals").add(proposalData);
  await adminDb.collection("jobs").doc(jobId).set(
    {
      proposalCount: FieldValue.increment(1),
      lastProposalAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  invalidateRankingCache(jobId);

  return {
    proposalId: docRef.id,
    proposal: serialize({
      id: docRef.id,
      ...proposalData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
  };
}

export async function listProposalsForJobWithRanking({
  actorUid,
  actorRole,
  jobId,
  page,
  limit
}) {
  const pagination = parsePagination({ page, limit });
  const user = await getUserProfile(actorUid, actorRole);
  const job = await getJobById(jobId);
  ensureClientAccessToJob(actorUid, user.role, job);

  const rawProposals = await fetchJobProposals(jobId);
  const { proposals: rankedProposals, cached } = getRankedFromCacheOrCompute({
    job,
    proposals: rawProposals
  });
  const visibleProposals = filterProposalsByRole(
    actorUid,
    user.role,
    rankedProposals
  );
  const pageData = paginateList(visibleProposals, pagination);

  const topProposalIds = rankedProposals
    .filter((proposal) => proposal.isTop)
    .slice(0, 3)
    .map((proposal) => proposal.id);

  return {
    job: serialize(job),
    proposals: serialize(pageData.items),
    pagination: {
      page: pageData.page,
      limit: pageData.limit,
      total: pageData.total,
      totalPages: pageData.totalPages
    },
    ranking: {
      cached,
      topProposalIds,
      selectedProposalId: job.selectedProposalId || null
    }
  };
}

export async function listFreelancerProposals({
  actorUid,
  actorRole,
  page,
  limit
}) {
  const user = await getUserProfile(actorUid, actorRole);
  if (user.role !== "freelancer") {
    throw new HttpError(403, "Only freelancers can access this endpoint.");
  }

  const pagination = parsePagination({ page, limit });
  const snapshot = await adminDb
    .collection("proposals")
    .where("freelancerId", "==", actorUid)
    .get();

  const proposals = snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt));

  const pageData = paginateList(proposals, pagination);
  return {
    proposals: serialize(pageData.items),
    pagination: {
      page: pageData.page,
      limit: pageData.limit,
      total: pageData.total,
      totalPages: pageData.totalPages
    }
  };
}

export async function getAdminJobView({
  actorUid,
  actorRole,
  jobId,
  page,
  limit
}) {
  const user = await getUserProfile(actorUid, actorRole);
  if (user.role !== "admin") {
    throw new HttpError(403, "Admin permission required.");
  }

  const proposalsPayload = await listProposalsForJobWithRanking({
    actorUid,
    actorRole: "admin",
    jobId,
    page,
    limit
  });

  const job = proposalsPayload.job;
  let selectedProposal = null;
  if (job.selectedProposalId) {
    const selectedProposalSnap = await adminDb
      .collection("proposals")
      .doc(job.selectedProposalId)
      .get();
    if (selectedProposalSnap.exists) {
      selectedProposal = serialize({
        id: selectedProposalSnap.id,
        ...selectedProposalSnap.data()
      });
    }
  }

  let project = null;
  if (job.projectId) {
    const projectSnap = await adminDb.collection("projects").doc(job.projectId).get();
    if (projectSnap.exists) {
      project = serialize({ id: projectSnap.id, ...projectSnap.data() });
    }
  }

  return {
    job,
    proposals: proposalsPayload.proposals,
    pagination: proposalsPayload.pagination,
    ranking: proposalsPayload.ranking,
    selectedProposal,
    project
  };
}
