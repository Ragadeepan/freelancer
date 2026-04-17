import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";
import {
  selectFreelancer,
  getProjectWorkspaceAccess
} from "../controllers/project.controller.js";
import { connectClientAndFreelancer } from "../controllers/adminConnect.controller.js";

const router = Router();

router.post("/select-freelancer", requireAuth, selectFreelancer);
router.post("/:projectId/connect", requireAuth, requireAdmin, connectClientAndFreelancer);
router.get("/:projectId/access", requireAuth, getProjectWorkspaceAccess);

export default router;
