import { adminDb, FieldValue } from "../config/firebaseAdmin.js";
import { HttpError } from "../utils/httpError.js";
import { invalidateRankingCache } from "../services/proposal.service.js";

const normalizeText = (value) => String(value || "").trim();
const normalizeLower = (value) => normalizeText(value).toLowerCase();
const toNumber = (value) => {
  const raw = String(value || "").replace(/[, ]+/g, "").replace(/[^\d.]/g, "");
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};
const resolveContractAmount = (job, proposal) => {
  const bid = toNumber(proposal?.price ?? proposal?.bidAmount);
  if (bid > 0) return bid;
  const fixedBudget = toNumber(job?.budget ?? job?.budgetMax ?? job?.budgetMin);
  if (fixedBudget > 0) return fixedBudget;
  const hourlyMax = toNumber(job?.hourlyMax);
  if (hourlyMax > 0) return hourlyMax;
  return 0;
};

const toIso = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const serialize = (value) => {
  if (Array.isArray(value)) return value.map((item) => serialize(item));
  if (value && typeof value === "object") {
    if (typeof value.toDate === "function") return toIso(value);
    const output = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (entry === undefined) return;
      output[key] = serialize(entry);
    });
    return output;
  }
  return value;
};

async function getUserProfile(uid, fallbackRole = null) {
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) {
    throw new HttpError(404, "User profile not found.");
  }
  const profile = snap.data() || {};
  const role = normalizeLower(profile.role || fallbackRole || "");
  return {
    id: snap.id,
    ...profile,
    role
  };
}

export async function selectFreelancer(req, res, next) {
  try {
    const actorUid = req.user.uid;
    const actor = await getUserProfile(actorUid, req.user.role);
    if (actor.role !== "client") {
      throw new HttpError(403, "Only clients can select freelancers.");
    }
    const profileCompletion = Number(actor.profileCompletion || 0);
    if (normalizeLower(actor.status) !== "approved" || profileCompletion < 100) {
      throw new HttpError(
        403,
        "Client account must be approved and profile completion must be 100%."
      );
    }

    const jobId = normalizeText(req.body?.jobId);
    const proposalId = normalizeText(req.body?.proposalId);

    if (!jobId) throw new HttpError(400, "jobId is required.");
    if (!proposalId) throw new HttpError(400, "proposalId is required.");

    const projectRef = adminDb.collection("projects").doc();
    const contractRef = adminDb.collection("contracts").doc();
    const jobRef = adminDb.collection("jobs").doc(jobId);
    const proposalRef = adminDb.collection("proposals").doc(proposalId);

    const txResult = await adminDb.runTransaction(async (transaction) => {
      const [jobSnap, proposalSnap] = await Promise.all([
        transaction.get(jobRef),
        transaction.get(proposalRef)
      ]);

      if (!jobSnap.exists) throw new HttpError(404, "Job not found.");
      if (!proposalSnap.exists) throw new HttpError(404, "Proposal not found.");

      const job = jobSnap.data() || {};
      const proposal = proposalSnap.data() || {};

      if (job.clientId !== actorUid) {
        throw new HttpError(403, "You can select freelancers only for your jobs.");
      }
      if (normalizeLower(job.status) !== "approved") {
        throw new HttpError(409, "Job must be approved before selecting freelancer.");
      }
      if (job.selectedProposalId) {
        throw new HttpError(409, "Freelancer is already selected for this job.");
      }
      if (proposal.jobId !== jobId) {
        throw new HttpError(409, "Selected proposal does not belong to the job.");
      }
      if (!proposal.freelancerId) {
        throw new HttpError(409, "Proposal is missing freelancer mapping.");
      }
      const proposalStatus = normalizeLower(proposal.status);
      if (proposalStatus === "rejected" || proposalStatus === "not_selected") {
        throw new HttpError(409, "This proposal cannot be selected.");
      }

      const contractAmount = resolveContractAmount(job, proposal);
      if (!contractAmount) {
        throw new HttpError(409, "Contract amount could not be resolved.");
      }

      transaction.set(projectRef, {
        jobId,
        clientId: actorUid,
        freelancerId: proposal.freelancerId,
        freelancerName: proposal.freelancerName || null,
        clientName: actor.name || actor.displayName || null,
        jobTitle: job.title || null,
        proposalId,
        status: "assigned",
        contractId: contractRef.id,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        connectedAt: null,
        connectedBy: null
      });

      transaction.update(jobRef, {
        status: "assigned",
        selectedProposalId: proposalId,
        selectedFreelancerId: proposal.freelancerId,
        selectedFreelancerName: proposal.freelancerName || null,
        projectId: projectRef.id,
        contractId: contractRef.id,
        assignedAt: FieldValue.serverTimestamp(),
        hiredAt: FieldValue.serverTimestamp(),
        closedAt: FieldValue.serverTimestamp(),
        isClosed: true,
        visibleToFreelancers: false,
        updatedAt: FieldValue.serverTimestamp()
      });

      transaction.update(proposalRef, {
        status: "selected",
        selectedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      transaction.set(contractRef, {
        jobId,
        projectId: projectRef.id,
        proposalId,
        clientId: actorUid,
        freelancerId: proposal.freelancerId,
        clientName: actor.name || actor.displayName || actor.email || null,
        freelancerName: proposal.freelancerName || null,
        title: job.title || proposal.jobTitle || "Contract",
        jobTitle: job.title || proposal.jobTitle || "Project",
        amount: contractAmount,
        budget: contractAmount,
        currency: normalizeText(job.currency || "INR").toUpperCase(),
        contractStatus: "awaiting_payment",
        paymentStatus: "awaiting_payment",
        paymentId: null,
        requirementDeadline: null,
        createdBy: actorUid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      transaction.set(adminDb.collection("contractActivity").doc(), {
        contractId: contractRef.id,
        actorId: actorUid,
        actorRole: "client",
        action: "contract_created",
        message: "Freelancer selected. Contract created and moved to workspace.",
        createdAt: FieldValue.serverTimestamp()
      });

      return {
        job,
        proposal
      };
    });

    const allProposalsSnap = await adminDb
      .collection("proposals")
      .where("jobId", "==", jobId)
      .get();
    const batch = adminDb.batch();
    let notSelectedCount = 0;
    allProposalsSnap.docs.forEach((docSnap) => {
      if (docSnap.id === proposalId) return;
      const status = normalizeLower(docSnap.data()?.status || "");
      if (status === "rejected" || status === "not_selected") return;
      notSelectedCount += 1;
      batch.update(docSnap.ref, {
        status: "not_selected",
        updatedAt: FieldValue.serverTimestamp()
      });
    });
    if (notSelectedCount > 0) {
      await batch.commit();
    }

    invalidateRankingCache(jobId);

    await Promise.allSettled([
      adminDb.collection("notifications").add({
        recipientId: txResult.proposal.freelancerId,
        type: "job_assigned",
        title: "You were selected",
        message: `You were selected for "${txResult.job?.title || "a job"}".`,
        actorId: actorUid,
        jobId,
        proposalId,
        projectId: projectRef.id,
        contractId: contractRef.id,
        read: false,
        createdAt: FieldValue.serverTimestamp()
      }),
      adminDb.collection("notifications").add({
        recipientId: actorUid,
        type: "job_assigned_confirmed",
        title: "Freelancer selected",
        message: `You selected ${txResult.proposal?.freelancerName || "a freelancer"} for "${txResult.job?.title || "your job"}".`,
        actorId: actorUid,
        jobId,
        proposalId,
        projectId: projectRef.id,
        contractId: contractRef.id,
        read: false,
        createdAt: FieldValue.serverTimestamp()
      })
    ]);

    res.status(201).json({
      ok: true,
      projectId: projectRef.id,
      contractId: contractRef.id,
      jobId,
      proposalId,
      freelancerId: txResult.proposal.freelancerId,
      freelancerName: txResult.proposal.freelancerName || null,
      status: "assigned",
      notSelectedCount
    });
  } catch (error) {
    next(error);
  }
}

export async function getProjectWorkspaceAccess(req, res, next) {
  try {
    const projectId = normalizeText(req.params.projectId);
    if (!projectId) {
      throw new HttpError(400, "projectId is required.");
    }

    const actor = await getUserProfile(req.user.uid, req.user.role);
    const projectSnap = await adminDb.collection("projects").doc(projectId).get();
    if (!projectSnap.exists) {
      throw new HttpError(404, "Project not found.");
    }
    const project = {
      id: projectSnap.id,
      ...projectSnap.data()
    };

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

    res.status(canAccess ? 200 : 403).json({
      ok: canAccess,
      canAccess,
      reason: canAccess ? null : reason,
      project: serialize(project)
    });
  } catch (error) {
    next(error);
  }
}
