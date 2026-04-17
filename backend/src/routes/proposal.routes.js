import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";
import {
  createProposal,
  getAdminJobProposalsView,
  getJobProposals,
  getMyProposals
} from "../controllers/proposal.controller.js";

const router = Router();

router.post("/", requireAuth, createProposal);
router.get("/mine", requireAuth, getMyProposals);
router.get("/jobs/:jobId", requireAuth, getJobProposals);
router.get("/admin/jobs/:jobId", requireAuth, requireAdmin, getAdminJobProposalsView);

export default router;
