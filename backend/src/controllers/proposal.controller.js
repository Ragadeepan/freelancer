import {
  createProposalRecord,
  getAdminJobView,
  listFreelancerProposals,
  listProposalsForJobWithRanking
} from "../services/proposal.service.js";

export async function createProposal(req, res, next) {
  try {
    const result = await createProposalRecord({
      actorUid: req.user.uid,
      actorRole: req.user.role,
      payload: req.body || {}
    });
    res.status(201).json({
      ok: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function getJobProposals(req, res, next) {
  try {
    const jobId = String(req.params.jobId || "").trim();
    const payload = await listProposalsForJobWithRanking({
      actorUid: req.user.uid,
      actorRole: req.user.role,
      jobId,
      page: req.query.page,
      limit: req.query.limit
    });
    res.status(200).json({
      ok: true,
      ...payload
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyProposals(req, res, next) {
  try {
    const payload = await listFreelancerProposals({
      actorUid: req.user.uid,
      actorRole: req.user.role,
      page: req.query.page,
      limit: req.query.limit
    });
    res.status(200).json({
      ok: true,
      ...payload
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminJobProposalsView(req, res, next) {
  try {
    const jobId = String(req.params.jobId || "").trim();
    const payload = await getAdminJobView({
      actorUid: req.user.uid,
      actorRole: req.user.role,
      jobId,
      page: req.query.page,
      limit: req.query.limit
    });
    res.status(200).json({
      ok: true,
      ...payload
    });
  } catch (error) {
    next(error);
  }
}
