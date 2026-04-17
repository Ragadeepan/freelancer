import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { db } from "../firebase/firebase.js";
import {
  canClientPostJob,
  canFreelancerApplyJob
} from "../utils/accountStatus.js";
import { CONTRACT_STATUS, PAYMENT_STATUS } from "../utils/contracts.js";

const resolveApiBaseUrl = () => {
  const configured = String(import.meta.env.VITE_API_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (typeof window === "undefined") return "http://localhost:4000";
  const host = String(window.location.hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" ? "http://localhost:4000" : "";
};

const API_BASE_URL = resolveApiBaseUrl();

const normalizeText = (value) => String(value || "").trim();
const normalizeLower = (value) => normalizeText(value).toLowerCase();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const toIso = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
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

const toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const clean = String(value || "")
    .replace(/[, ]+/g, "")
    .replace(/[^\d.]/g, "");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveContractAmount = (job, proposal) => {
  const bid = toNumber(proposal?.price ?? proposal?.bidAmount);
  if (Number.isFinite(bid) && bid > 0) return bid;
  const fixedBudget = toNumber(job?.budget ?? job?.budgetMax ?? job?.budgetMin);
  if (Number.isFinite(fixedBudget) && fixedBudget > 0) return fixedBudget;
  const hourlyMax = toNumber(job?.hourlyMax);
  if (Number.isFinite(hourlyMax) && hourlyMax > 0) return hourlyMax;
  return 0;
};

const toDeliveryDays = (value) => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  const text = normalizeLower(value);
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

const parsePagination = ({ page, limit }) => {
  const p = Number(page);
  const l = Number(limit);
  return {
    page: Number.isFinite(p) ? clamp(Math.round(p), 1, 100000) : 1,
    limit: Number.isFinite(l) ? clamp(Math.round(l), 1, 50) : 20
  };
};

const paginateList = (items, { page, limit }) => {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  return {
    page: safePage,
    limit,
    total,
    totalPages,
    items: items.slice(start, start + limit)
  };
};

const getRange = (values) => {
  const clean = values.filter((entry) => Number.isFinite(entry));
  if (clean.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...clean), max: Math.max(...clean) };
};

const normalizeInverse = (value, range) => {
  if (!Number.isFinite(value)) return 0;
  const spread = range.max - range.min;
  if (spread <= 0) return 1;
  return clamp((range.max - value) / spread, 0, 1);
};

const getRating = (proposal) => {
  const candidates = [proposal?.freelancerRating, proposal?.rating];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return Number(clamp(numeric, 0, 5).toFixed(2));
    }
  }
  return 0;
};

const getCompletedProjects = (proposal) => {
  const candidates = [
    proposal?.freelancerCompletedProjects,
    proposal?.completedProjects
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric >= 0) return Math.round(numeric);
  }
  return 0;
};

const rankProposals = (proposals) => {
  const safe = Array.isArray(proposals) ? proposals : [];
  const bidRange = getRange(safe.map((entry) => toNumber(entry?.price ?? entry?.bidAmount)));
  const deliveryRange = getRange(
    safe.map((entry) => toDeliveryDays(entry?.deliveryDays ?? entry?.deliveryTime))
  );

  const scored = safe.map((proposal) => {
    const rating = getRating(proposal);
    const completedProjects = getCompletedProjects(proposal);
    const bid = toNumber(proposal?.price ?? proposal?.bidAmount);
    const deliveryDays = toDeliveryDays(proposal?.deliveryDays ?? proposal?.deliveryTime);

    const score = Number(
      (
        (rating / 5) * 50 +
        (clamp(completedProjects, 0, 100) / 100) * 20 +
        normalizeInverse(bid, bidRange) * 15 +
        normalizeInverse(deliveryDays, deliveryRange) * 15
      ).toFixed(2)
    );

    return {
      ...proposal,
      score,
      rating,
      completedProjects,
      freelancerRating: proposal.freelancerRating ?? rating,
      freelancerCompletedProjects:
        proposal.freelancerCompletedProjects ?? completedProjects,
      price: bid ?? proposal?.price ?? null,
      bidAmount: toNumber(proposal?.bidAmount) ?? bid ?? null,
      deliveryDays: deliveryDays ?? proposal?.deliveryDays ?? null
    };
  });

  scored.sort((left, right) => {
    const ratingDiff = getRating(right) - getRating(left);
    if (ratingDiff !== 0) return ratingDiff;

    const completedDiff = getCompletedProjects(right) - getCompletedProjects(left);
    if (completedDiff !== 0) return completedDiff;

    const leftBid = toNumber(left.price ?? left.bidAmount) ?? Number.POSITIVE_INFINITY;
    const rightBid = toNumber(right.price ?? right.bidAmount) ?? Number.POSITIVE_INFINITY;
    if (leftBid !== rightBid) return leftBid - rightBid;

    const leftDelivery = toDeliveryDays(left.deliveryDays ?? left.deliveryTime) ?? Number.POSITIVE_INFINITY;
    const rightDelivery = toDeliveryDays(right.deliveryDays ?? right.deliveryTime) ?? Number.POSITIVE_INFINITY;
    if (leftDelivery !== rightDelivery) return leftDelivery - rightDelivery;

    const leftTime = toMillis(left.createdAt);
    const rightTime = toMillis(right.createdAt);
    if (leftTime !== rightTime) return leftTime - rightTime;

    return String(left.id || "").localeCompare(String(right.id || ""));
  });

  return scored.map((proposal, index) => ({
    ...proposal,
    rank: index + 1,
    topRank: index < 3 ? index + 1 : null,
    isTop: index < 3
  }));
};

async function getActorProfile(user) {
  if (!user?.uid) throw new Error("Authentication required.");
  const profileSnap = await getDoc(doc(db, "users", user.uid));
  if (!profileSnap.exists()) throw new Error("User profile not found.");
  return { id: profileSnap.id, ...profileSnap.data(), role: normalizeLower(profileSnap.data()?.role) };
}

async function getJobById(jobId) {
  const jobSnap = await getDoc(doc(db, "jobs", jobId));
  if (!jobSnap.exists()) throw new Error("Job not found.");
  return { id: jobSnap.id, ...jobSnap.data() };
}

async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    return text ? { message: text } : {};
  }
  return response.json();
}

async function request(path, user, options = {}, retry = true) {
  if (!user) throw new Error("Authentication required.");

  const token = await user.getIdToken(!retry);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  if (response.status === 401 && retry) {
    return request(path, user, options, false);
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(payload?.message || "Request failed.");
  }
  if (!contentType.includes("application/json")) {
    throw new Error(
      "Marketplace API is unavailable. Configure VITE_API_BASE_URL or deploy the API."
    );
  }
  return payload;
}

const shouldUseFirestoreFallback = (error) => {
  const message = normalizeLower(error?.message);
  return (
    message.includes("marketplace api is unavailable") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed") ||
    message.includes("unexpected token <")
  );
};

async function createActorNotification(payload) {
  const recipientId = normalizeText(payload?.recipientId);
  if (!recipientId) return null;
  return addDoc(collection(db, "notifications"), {
    recipientId,
    type: payload?.type || "info",
    title: payload?.title || "Notification",
    message: payload?.message || "",
    actorId: payload?.actorId || null,
    jobId: payload?.jobId || null,
    proposalId: payload?.proposalId || null,
    projectId: payload?.projectId || null,
    contractId: payload?.contractId || null,
    read: false,
    createdAt: serverTimestamp()
  });
}

async function loadRankedJobProposals({ actorUid, actorRole, jobId, page, limit }) {
  const job = await getJobById(jobId);
  if (actorRole === "client" && job.clientId !== actorUid) {
    throw new Error("You can access proposals only for your own jobs.");
  }
  if (actorRole === "freelancer") {
    const isApproved = normalizeLower(job.status) === "approved";
    const isSelectedFreelancer = normalizeText(job.selectedFreelancerId) === actorUid;
    if (!isApproved && !isSelectedFreelancer) {
      throw new Error("Job is not available for proposal review.");
    }
  }
  if (actorRole !== "admin" && actorRole !== "client" && actorRole !== "freelancer") {
    throw new Error("Marketplace role is required.");
  }

  const pagination = parsePagination({ page, limit });
  const proposalsSnap = await getDocs(
    query(collection(db, "proposals"), where("jobId", "==", jobId))
  );
  const proposals = proposalsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  const ranked = rankProposals(proposals);
  const visible = actorRole === "freelancer"
    ? ranked.filter((entry) => entry.freelancerId === actorUid)
    : ranked;
  const pageData = paginateList(visible, pagination);

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
      cached: false,
      topProposalIds: ranked.filter((entry) => entry.isTop).slice(0, 3).map((entry) => entry.id),
      selectedProposalId: job.selectedProposalId || null
    }
  };
}

async function submitProposalFirestore(user, payload = {}) {
  const actor = await getActorProfile(user);
  if (actor.role !== "freelancer") throw new Error("Only freelancers can submit proposals.");
  if (!canFreelancerApplyJob({ ...actor, role: "freelancer" })) {
    throw new Error(
      "Freelancer account must be approved and profile completion must be 100% before applying."
    );
  }

  const jobId = normalizeText(payload?.jobId);
  if (!jobId) throw new Error("jobId is required.");
  const job = await getJobById(jobId);
  if (normalizeLower(job.status) !== "approved") {
    throw new Error("Only approved jobs can accept proposals.");
  }
  if (!job.clientId) throw new Error("Job is missing client assignment.");

  const duplicateSnap = await getDocs(
    query(collection(db, "proposals"), where("jobId", "==", jobId), where("freelancerId", "==", actor.id))
  );
  if (!duplicateSnap.empty) throw new Error("You already submitted a proposal for this job.");

  const priceType = normalizeLower(payload?.priceType || payload?.bidType);
  if (priceType !== "fixed" && priceType !== "hourly") {
    throw new Error("priceType must be fixed or hourly.");
  }

  const price = toNumber(payload?.price ?? payload?.bidAmount);
  if (!Number.isFinite(price) || price <= 0) throw new Error("price must be a positive number.");
  if (price > 1_000_000_000) throw new Error("price is too high.");

  const deliveryDays = toDeliveryDays(payload?.deliveryDays ?? payload?.deliveryTime);
  if (!Number.isFinite(deliveryDays) || deliveryDays < 1 || deliveryDays > 3650) {
    throw new Error("deliveryDays must be between 1 and 3650 days.");
  }

  const proposalText = normalizeText(payload?.proposalText || payload?.message || payload?.coverLetter);
  if (proposalText.length < 10 || proposalText.length > 5000) {
    throw new Error("proposalText must be between 10 and 5000 characters.");
  }

  const rating = Number(clamp(Number(actor.freelancerRating ?? actor.profileRating ?? actor.rating ?? 0), 0, 5).toFixed(1));
  const completedProjects = Math.max(0, Math.round(Number(actor.freelancerCompletedProjects ?? actor.completedProjects ?? 0)));
  const verified = Boolean(actor.verified ?? actor.freelancerVerified ?? actor.identityVerified ?? false);
  const nowIso = new Date().toISOString();

  const proposalData = {
    jobId,
    jobTitle: normalizeText(payload?.jobTitle || job.title).slice(0, 200) || null,
    clientId: job.clientId,
    clientName: normalizeText(job.clientName || job.clientPublicName).slice(0, 120) || null,
    freelancerId: actor.id,
    freelancerName: normalizeText(payload?.freelancerName || actor.name || actor.displayName || "Freelancer").slice(0, 120),
    freelancerPhotoURL: actor.photoURL || actor.profileImage || null,
    freelancerRating: rating,
    freelancerCompletedProjects: completedProjects,
    freelancerVerified: verified,
    freelancerExperienceLevel: normalizeText(actor.experienceLevel || payload?.experienceLevel).slice(0, 80) || null,
    rating,
    completedProjects,
    verified,
    priceType,
    price: Number(price.toFixed(2)),
    deliveryDays,
    skills: Array.isArray(payload?.skills) && payload.skills.length > 0 ? payload.skills : Array.isArray(job?.skills) ? job.skills : [],
    proposalText,
    bidType: priceType,
    bidAmount: Number(price.toFixed(2)),
    deliveryTime: `${deliveryDays} days`,
    message: proposalText,
    coverLetter: proposalText,
    proposalTitle: normalizeText(payload?.proposalTitle).slice(0, 200) || null,
    currency: normalizeText(payload?.currency || job.currency || "INR").toUpperCase(),
    availability: normalizeText(payload?.availability).slice(0, 120) || null,
    milestones: normalizeText(payload?.milestones).slice(0, 5000) || null,
    links: normalizeText(payload?.links).slice(0, 1000) || null,
    attachment: normalizeText(payload?.attachment || payload?.attachmentUrl).slice(0, 1000) || null,
    questions: normalizeText(payload?.questions).slice(0, 1000) || null,
    screeningAnswers: payload?.screeningAnswers && typeof payload.screeningAnswers === "object" ? payload.screeningAnswers : {},
    status: "pending",
    isTop: false,
    topRank: null,
    rank: null,
    score: 0,
    selectedAt: null,
    submittedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const proposalRef = await addDoc(collection(db, "proposals"), proposalData);
  await updateDoc(doc(db, "jobs", jobId), {
    proposalCount: increment(1),
    lastProposalAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await Promise.allSettled([
    createActorNotification({
      actorId: actor.id,
      recipientId: job.clientId,
      type: "proposal_received",
      title: "New proposal received",
      message: `You received a new proposal for "${job.title || "your job"}".`,
      jobId,
      proposalId: proposalRef.id
    })
  ]);

  return {
    ok: true,
    proposalId: proposalRef.id,
    proposal: serialize({
      id: proposalRef.id,
      ...proposalData,
      createdAt: nowIso,
      updatedAt: nowIso,
      submittedAt: nowIso
    })
  };
}

async function fetchJobProposalsFirestore(user, jobId, options) {
  const actor = await getActorProfile(user);
  return loadRankedJobProposals({
    actorUid: actor.id,
    actorRole: actor.role,
    jobId,
    page: options?.page,
    limit: options?.limit
  });
}

async function fetchMyProposalsFirestore(user, options) {
  const actor = await getActorProfile(user);
  if (actor.role !== "freelancer") throw new Error("Only freelancers can access this endpoint.");
  const pagination = parsePagination(options || {});
  const proposalsSnap = await getDocs(
    query(collection(db, "proposals"), where("freelancerId", "==", actor.id))
  );
  const proposals = proposalsSnap.docs
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

async function fetchAdminJobViewFirestore(user, jobId, options) {
  const actor = await getActorProfile(user);
  if (actor.role !== "admin") throw new Error("Admin permission required.");

  const payload = await loadRankedJobProposals({
    actorUid: actor.id,
    actorRole: "admin",
    jobId,
    page: options?.page,
    limit: options?.limit
  });

  let selectedProposal = null;
  if (payload?.job?.selectedProposalId) {
    const selectedSnap = await getDoc(doc(db, "proposals", payload.job.selectedProposalId));
    if (selectedSnap.exists()) {
      selectedProposal = serialize({ id: selectedSnap.id, ...selectedSnap.data() });
    }
  }

  let project = null;
  if (payload?.job?.projectId) {
    const projectSnap = await getDoc(doc(db, "projects", payload.job.projectId));
    if (projectSnap.exists()) {
      project = serialize({ id: projectSnap.id, ...projectSnap.data() });
    }
  }

  return {
    ...payload,
    selectedProposal,
    project
  };
}

async function selectFreelancerForJobFirestore(user, payload) {
  const actor = await getActorProfile(user);
  if (actor.role !== "client") throw new Error("Only clients can select freelancers.");
  if (!canClientPostJob({ ...actor, role: "client" })) {
    throw new Error(
      "Client account must be approved and profile completion must be 100%."
    );
  }

  const jobId = normalizeText(payload?.jobId);
  const proposalId = normalizeText(payload?.proposalId);
  if (!jobId) throw new Error("jobId is required.");
  if (!proposalId) throw new Error("proposalId is required.");

  const jobRef = doc(db, "jobs", jobId);
  const proposalRef = doc(db, "proposals", proposalId);
  const projectRef = doc(collection(db, "projects"));
  const contractRef = doc(collection(db, "contracts"));
  const contractActivityRef = doc(collection(db, "contractActivity"));

  const [jobSnap, proposalSnap] = await Promise.all([getDoc(jobRef), getDoc(proposalRef)]);
  if (!jobSnap.exists()) throw new Error("Job not found.");
  if (!proposalSnap.exists()) throw new Error("Proposal not found.");

  const job = { id: jobSnap.id, ...jobSnap.data() };
  const proposal = { id: proposalSnap.id, ...proposalSnap.data() };
  if (job.clientId !== actor.id) throw new Error("You can select freelancers only for your jobs.");
  if (normalizeLower(job.status) !== "approved") throw new Error("Job must be approved before selecting freelancer.");
  if (job.selectedProposalId) throw new Error("Freelancer is already selected for this job.");
  if (proposal.jobId !== jobId) throw new Error("Selected proposal does not belong to the job.");
  if (!proposal.freelancerId) throw new Error("Proposal is missing freelancer mapping.");
  if (["rejected", "not_selected"].includes(normalizeLower(proposal.status))) {
    throw new Error("This proposal cannot be selected.");
  }

  const allProposalsSnap = await getDocs(query(collection(db, "proposals"), where("jobId", "==", jobId)));
  const allProposals = allProposalsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  const freelancerName = proposal.freelancerName || proposal.bidder || proposal.freelancerId || null;

  const batch = writeBatch(db);
  const contractAmount = resolveContractAmount(job, proposal);
  if (!contractAmount) {
    throw new Error("Contract amount could not be resolved.");
  }
  batch.set(projectRef, {
    jobId,
    clientId: actor.id,
    freelancerId: proposal.freelancerId,
    freelancerName,
    clientName: actor.name || actor.displayName || actor.email || null,
    clientPhotoURL: actor.photoURL || actor.profileImage || null,
    freelancerPhotoURL: proposal.freelancerPhotoURL || proposal.freelancerProfileImage || null,
    jobTitle: proposal.jobTitle || job.title || null,
    proposalId,
    status: "assigned",
    contractId: contractRef.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    connectedAt: null,
    connectedBy: null
  });
  batch.update(jobRef, {
    status: "assigned",
    selectedProposalId: proposalId,
    selectedFreelancerId: proposal.freelancerId,
    selectedFreelancerName: freelancerName,
    projectId: projectRef.id,
    contractId: contractRef.id,
    assignedAt: serverTimestamp(),
    hiredAt: serverTimestamp(),
    closedAt: serverTimestamp(),
    isClosed: true,
    visibleToFreelancers: false,
    updatedAt: serverTimestamp()
  });
  batch.update(proposalRef, {
    status: "selected",
    selectedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  batch.set(contractRef, {
    jobId,
    projectId: projectRef.id,
    proposalId,
    clientId: actor.id,
    freelancerId: proposal.freelancerId,
    clientName: actor.name || actor.displayName || actor.email || null,
    freelancerName,
    title: job.title || proposal.jobTitle || "Contract",
    jobTitle: job.title || proposal.jobTitle || "Project",
    amount: contractAmount,
    budget: contractAmount,
    currency: normalizeText(job.currency || "INR").toUpperCase(),
    category: job.category || null,
    subcategory: job.subcategory || null,
    scope: job.scope || null,
    experienceLevel: job.experienceLevel || null,
    location: job.location || null,
    hires: job.hires || null,
    startDate: job.startDate || null,
    deadline: job.deadline || null,
    duration: job.duration || job.timeline || null,
    timeline: job.timeline || null,
    weeklyHours: job.weeklyHours || null,
    priority: job.priority || null,
    communication: job.communication || null,
    ndaRequired: Boolean(job.ndaRequired),
    milestoneCount: job.milestoneCount || null,
    escrowAmount: job.escrowAmount || null,
    contractStatus: CONTRACT_STATUS.AWAITING_PAYMENT,
    paymentStatus: PAYMENT_STATUS.AWAITING_PAYMENT,
    paymentId: null,
    requirementDeadline: null,
    createdBy: actor.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  batch.set(contractActivityRef, {
    contractId: contractRef.id,
    actorId: actor.id,
    actorRole: "client",
    action: "contract_created",
    message: "Freelancer selected. Contract created and moved to workspace.",
    createdAt: serverTimestamp()
  });

  let notSelectedCount = 0;
  allProposals.forEach((entry) => {
    if (entry.id === proposalId) return;
    if (["rejected", "not_selected"].includes(normalizeLower(entry.status))) return;
    notSelectedCount += 1;
    batch.update(doc(db, "proposals", entry.id), {
      status: "not_selected",
      notSelectedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });

  await batch.commit();

  await Promise.allSettled([
    createActorNotification({
      actorId: actor.id,
      recipientId: proposal.freelancerId,
      type: "job_assigned",
      title: "You were selected",
      message: `You were selected for "${job.title || "a job"}".`,
      jobId,
      proposalId,
      projectId: projectRef.id,
      contractId: contractRef.id
    }),
    createActorNotification({
      actorId: actor.id,
      recipientId: actor.id,
      type: "job_assigned_confirmed",
      title: "Freelancer selected",
      message: `You selected ${freelancerName || "a freelancer"} for "${job.title || "your job"}".`,
      jobId,
      proposalId,
      projectId: projectRef.id,
      contractId: contractRef.id
    })
  ]);

  return {
    ok: true,
    projectId: projectRef.id,
    contractId: contractRef.id,
    jobId,
    proposalId,
    freelancerId: proposal.freelancerId,
    freelancerName,
    status: "assigned",
    notSelectedCount
  };
}

async function connectProjectMembersFirestore(user, projectId) {
  const actor = await getActorProfile(user);
  if (actor.role !== "admin") throw new Error("Admin permission required.");
  if (!projectId) throw new Error("projectId is required.");

  const projectRef = doc(db, "projects", projectId);
  const projectSnap = await getDoc(projectRef);
  if (!projectSnap.exists()) throw new Error("Project not found.");
  const project = { id: projectSnap.id, ...projectSnap.data() };

  const status = normalizeLower(project.status);
  if (status === "connected") {
    return { ok: true, projectId, connected: true, alreadyConnected: true, project: serialize(project) };
  }
  if (status !== "assigned" && status !== "in_progress") {
    throw new Error(`Project in "${project.status || "unknown"}" status cannot be connected.`);
  }

  const batch = writeBatch(db);
  batch.update(projectRef, {
    status: "connected",
    connectedAt: serverTimestamp(),
    connectedBy: actor.id,
    updatedAt: serverTimestamp()
  });

  if (project.jobId) {
    const jobRef = doc(db, "jobs", project.jobId);
    const jobSnap = await getDoc(jobRef);
    if (jobSnap.exists()) {
      const jobStatus = normalizeLower(jobSnap.data()?.status);
      if (["assigned", "approved"].includes(jobStatus)) {
        batch.update(jobRef, {
          status: "connected",
          connectedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }
  }

  await batch.commit();
  return {
    ok: true,
    projectId,
    connected: true,
    alreadyConnected: false,
    project: serialize({ ...project, status: "connected" })
  };
}

async function checkProjectWorkspaceAccessFirestore(user, projectId) {
  const actor = await getActorProfile(user);
  if (!projectId) throw new Error("projectId is required.");

  const projectSnap = await getDoc(doc(db, "projects", projectId));
  if (!projectSnap.exists()) throw new Error("Project not found.");
  const project = { id: projectSnap.id, ...projectSnap.data() };

  let canAccess = false;
  let reason = "";
  if (actor.role === "admin") {
    canAccess = true;
  } else if (project.clientId !== actor.id && project.freelancerId !== actor.id) {
    reason = "You are not a member of this project.";
  } else if (project.contractId) {
    canAccess = true;
  } else if (normalizeLower(project.status) !== "connected") {
    reason = "Admin connection is pending. Workspace unlocks after admin connects both members.";
  } else {
    canAccess = true;
  }

  return {
    ok: canAccess,
    canAccess,
    reason: canAccess ? null : reason,
    project: serialize(project)
  };
}

export async function submitProposal(user, payload) {
  try {
    return await request("/api/proposals", user, {
      method: "POST",
      body: JSON.stringify(payload || {})
    });
  } catch (error) {
    if (!shouldUseFirestoreFallback(error)) throw error;
    return submitProposalFirestore(user, payload || {});
  }
}

export async function fetchJobProposals(user, jobId, { page = 1, limit = 20 } = {}) {
  const safeJobId = normalizeText(jobId);
  if (!safeJobId) throw new Error("jobId is required.");
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  try {
    return await request(`/api/proposals/jobs/${safeJobId}?${params.toString()}`, user);
  } catch (error) {
    if (!shouldUseFirestoreFallback(error)) throw error;
    return fetchJobProposalsFirestore(user, safeJobId, { page, limit });
  }
}

export async function fetchMyProposals(user, { page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  try {
    return await request(`/api/proposals/mine?${params.toString()}`, user);
  } catch (error) {
    if (!shouldUseFirestoreFallback(error)) throw error;
    return fetchMyProposalsFirestore(user, { page, limit });
  }
}

export async function fetchAdminJobView(user, jobId, { page = 1, limit = 20 } = {}) {
  const safeJobId = normalizeText(jobId);
  if (!safeJobId) throw new Error("jobId is required.");
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  try {
    return await request(`/api/proposals/admin/jobs/${safeJobId}?${params.toString()}`, user);
  } catch (error) {
    if (!shouldUseFirestoreFallback(error)) throw error;
    return fetchAdminJobViewFirestore(user, safeJobId, { page, limit });
  }
}

export async function selectFreelancerForJob(user, { jobId, proposalId }) {
  const payload = { jobId: normalizeText(jobId), proposalId: normalizeText(proposalId) };
  try {
    return await request("/api/projects/select-freelancer", user, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (!shouldUseFirestoreFallback(error)) throw error;
    return selectFreelancerForJobFirestore(user, payload);
  }
}

export async function connectProjectMembers(user, projectId) {
  const safeProjectId = normalizeText(projectId);
  if (!safeProjectId) throw new Error("projectId is required.");
  try {
    return await request(`/api/projects/${safeProjectId}/connect`, user, {
      method: "POST"
    });
  } catch (error) {
    if (!shouldUseFirestoreFallback(error)) throw error;
    return connectProjectMembersFirestore(user, safeProjectId);
  }
}

export async function checkProjectWorkspaceAccess(user, projectId) {
  const safeProjectId = normalizeText(projectId);
  if (!safeProjectId) throw new Error("projectId is required.");
  try {
    return await request(`/api/projects/${safeProjectId}/access`, user);
  } catch (error) {
    if (!shouldUseFirestoreFallback(error)) throw error;
    return checkProjectWorkspaceAccessFirestore(user, safeProjectId);
  }
}
