import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";
import {
  cancelPayment,
  createPaymentOrder,
  getAdminPaymentHistory,
  getAdminPaymentSummary,
  handleRazorpayWebhook,
  storeTransaction,
  verifyPayment
} from "../controllers/payment.controller.js";
import {
  createEscrowRecord,
  getEscrowStatusList,
  markProjectCompleted,
  markProjectFunded,
  refundClient,
  releasePaymentToFreelancer
} from "../controllers/escrow.controller.js";

const router = Router();

router.post("/orders", requireAuth, createPaymentOrder);
router.post("/verify", requireAuth, verifyPayment);
router.post("/transactions", requireAuth, requireAdmin, storeTransaction);
router.post("/:paymentId/cancel", requireAuth, cancelPayment);

router.post("/escrow", requireAuth, requireAdmin, createEscrowRecord);
router.post("/projects/:projectId/funded", requireAuth, markProjectFunded);
router.post("/projects/:projectId/completed", requireAuth, requireAdmin, markProjectCompleted);
router.post(
  "/projects/:projectId/release",
  requireAuth,
  requireAdmin,
  releasePaymentToFreelancer
);
router.post("/projects/:projectId/refund", requireAuth, requireAdmin, refundClient);

router.get("/admin/summary", requireAuth, requireAdmin, getAdminPaymentSummary);
router.get("/admin/history", requireAuth, requireAdmin, getAdminPaymentHistory);
router.get("/admin/escrow", requireAuth, requireAdmin, getEscrowStatusList);

router.post("/webhooks/razorpay", handleRazorpayWebhook);

export default router;
