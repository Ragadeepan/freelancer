import { adminDb, FieldValue } from "../config/firebaseAdmin.js";
import { HttpError } from "../utils/httpError.js";
import { logTransaction } from "../utils/transactionLogger.js";
import { createRazorpayRefund } from "../services/razorpay.service.js";
import { createStripeRefund } from "../services/stripe.service.js";
import { sendPayoutToFreelancer } from "../services/payout.service.js";
import {
  ensureEscrowForPayment,
  getEscrowForProjectAction,
  getPaymentRefOrThrow,
  getProjectOrThrow,
  getUserById,
  markProjectCompletedState,
  markProjectFunded as markProjectFundedState,
  markProjectReleasedIfEligible,
  roundMoney,
  serializeForJson
} from "../services/paymentData.service.js";

function resolveFreelancerPayoutAccount(userRecord, gateway) {
  if (!userRecord) return "";
  if (gateway === "stripe") {
    return (
      userRecord?.payoutAccounts?.stripeConnectAccountId ||
      userRecord?.stripeConnectAccountId ||
      ""
    );
  }
  if (gateway === "razorpay") {
    return (
      userRecord?.payoutAccounts?.razorpayFundAccountId ||
      userRecord?.razorpayFundAccountId ||
      ""
    );
  }
  return "";
}

export async function createEscrowRecord(req, res, next) {
  try {
    const {
      paymentId,
      projectId,
      clientId,
      freelancerId,
      totalAmount,
      platformCommission = 0,
      freelancerAmount,
      gateway,
      currency = "INR",
      installmentNumber = 1,
      status = "pending"
    } = req.body || {};

    if (!projectId || !paymentId) {
      throw new HttpError(400, "projectId and paymentId are required.");
    }
    if (!gateway) {
      throw new HttpError(400, "gateway is required.");
    }

    const escrowPayload = {
      projectId,
      paymentId,
      clientId: clientId || null,
      freelancerId: freelancerId || null,
      amount: roundMoney(totalAmount),
      platformCommission: roundMoney(platformCommission),
      freelancerAmount: roundMoney(
        freelancerAmount != null
          ? freelancerAmount
          : roundMoney(totalAmount) - roundMoney(platformCommission)
      ),
      gateway,
      currency: String(currency || "INR").toUpperCase(),
      installmentNumber: Number(installmentNumber) || 1
    };

    const escrow = await ensureEscrowForPayment({
      paymentId,
      paymentData: escrowPayload,
      status
    });

    res.status(201).json({
      ok: true,
      escrow
    });
  } catch (error) {
    next(error);
  }
}

export async function markProjectFunded(req, res, next) {
  try {
    const projectId = req.params?.projectId || req.body?.projectId;
    const { project } = await getProjectOrThrow(projectId);

    const actorId = req.user?.uid;
    const isAdmin = req.user?.role === "admin" || req.user?.claims?.admin === true;
    if (!isAdmin && project.clientId !== actorId) {
      throw new HttpError(403, "Only the project client or admin can mark funding.");
    }

    const updatedProject = await markProjectFundedState(projectId);
    await logTransaction({
      event: "project_marked_funded",
      actorId,
      projectId,
      metadata: {
        previousStatus: project.status || null
      }
    });

    res.status(200).json({
      ok: true,
      project: updatedProject
    });
  } catch (error) {
    next(error);
  }
}

export async function markProjectCompleted(req, res, next) {
  try {
    const projectId = req.params?.projectId || req.body?.projectId;
    const updatedProject = await markProjectCompletedState(projectId);

    await logTransaction({
      event: "project_marked_completed",
      actorId: req.user?.uid || null,
      projectId
    });

    res.status(200).json({
      ok: true,
      project: updatedProject
    });
  } catch (error) {
    next(error);
  }
}

export async function releasePaymentToFreelancer(req, res, next) {
  try {
    const projectId = req.params?.projectId || req.body?.projectId;
    const escrowId = req.body?.escrowId || "";
    const adminId = req.user?.uid || null;

    const { project } = await getProjectOrThrow(projectId);
    if ((project.status || "") !== "completed") {
      throw new HttpError(
        409,
        "Project status must be completed before releasing freelancer payment."
      );
    }

    const escrow = await getEscrowForProjectAction(projectId, escrowId);
    if (escrow.status === "released") {
      return res.status(200).json({
        ok: true,
        idempotent: true,
        escrow: serializeForJson(escrow)
      });
    }
    if (escrow.status !== "held") {
      throw new HttpError(
        409,
        `Escrow must be in held state to release. Current state: ${escrow.status}`
      );
    }

    const { paymentRef, payment } = await getPaymentRefOrThrow(escrow.paymentId);
    payment.id = escrow.paymentId;

    const freelancerRecord = await getUserById(escrow.freelancerId || project.freelancerId);
    const destinationAccountId = resolveFreelancerPayoutAccount(
      freelancerRecord,
      escrow.gateway
    );
    if (!destinationAccountId) {
      throw new HttpError(
        400,
        `Freelancer payout account is missing for ${escrow.gateway}.`
      );
    }

    const totalAmount = roundMoney(escrow.totalAmount || payment.amount);
    const platformCommission = roundMoney(
      escrow.platformCommission || payment.platformCommission
    );
    const payoutAmount = roundMoney(
      escrow.freelancerAmount || payment.freelancerAmount || totalAmount - platformCommission
    );

    const payout = await sendPayoutToFreelancer({
      gateway: escrow.gateway,
      amount: payoutAmount,
      currency: escrow.currency || payment.currency || "INR",
      destinationAccountId,
      referenceId: `project_${projectId}_escrow_${escrow.id}`,
      metadata: {
        projectId,
        paymentId: payment.id,
        escrowId: escrow.id,
        freelancerId: escrow.freelancerId || project.freelancerId
      }
    });

    const payoutRef = await adminDb.collection("payouts").add({
      projectId,
      paymentId: payment.id,
      escrowId: escrow.id,
      freelancerId: escrow.freelancerId || project.freelancerId,
      amount: payoutAmount,
      currency: escrow.currency || payment.currency || "INR",
      gateway: escrow.gateway,
      payoutId: payout.payoutId,
      status: payout.status,
      createdAt: FieldValue.serverTimestamp(),
      releasedAt: FieldValue.serverTimestamp(),
      releasedBy: adminId
    });

    await adminDb
      .collection("escrow")
      .doc(escrow.id)
      .set(
        {
          status: "released",
          platformCommission,
          freelancerAmount: payoutAmount,
          payoutId: payout.payoutId,
          payoutStatus: payout.status,
          releasedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          releasedBy: adminId
        },
        { merge: true }
      );

    await paymentRef.set(
      {
        status: "released",
        receiverType: "admin",
        platformCommission,
        freelancerAmount: payoutAmount,
        payoutId: payout.payoutId,
        payoutDocId: payoutRef.id,
        releasedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        releasedBy: adminId
      },
      { merge: true }
    );

    const projectUpdate = await markProjectReleasedIfEligible(projectId);

    await logTransaction({
      event: "payment_released_to_freelancer",
      actorId: adminId,
      projectId,
      paymentId: payment.id,
      escrowId: escrow.id,
      payoutId: payoutRef.id,
      gateway: escrow.gateway,
      amount: payoutAmount,
      currency: escrow.currency || payment.currency || "INR",
      metadata: {
        externalPayoutId: payout.payoutId,
        payoutStatus: payout.status,
        platformCommission
      }
    });

    const updatedEscrowSnap = await adminDb.collection("escrow").doc(escrow.id).get();
    const updatedPaymentSnap = await paymentRef.get();

    res.status(200).json({
      ok: true,
      escrow: serializeForJson({ id: updatedEscrowSnap.id, ...updatedEscrowSnap.data() }),
      payment: serializeForJson({ id: updatedPaymentSnap.id, ...updatedPaymentSnap.data() }),
      payout: serializeForJson({
        id: payoutRef.id,
        payoutId: payout.payoutId,
        status: payout.status
      }),
      project: projectUpdate
    });
  } catch (error) {
    next(error);
  }
}

export async function refundClient(req, res, next) {
  try {
    const projectId = req.params?.projectId || req.body?.projectId;
    const escrowId = req.body?.escrowId || "";
    const reason = String(req.body?.reason || "requested_by_customer");
    const adminId = req.user?.uid || null;

    const { project } = await getProjectOrThrow(projectId);
    const escrow = await getEscrowForProjectAction(projectId, escrowId);
    if (escrow.status === "refunded") {
      return res.status(200).json({
        ok: true,
        idempotent: true,
        escrow: serializeForJson(escrow)
      });
    }
    if (escrow.status === "released") {
      throw new HttpError(409, "Released escrow cannot be refunded.");
    }

    const { paymentRef, payment } = await getPaymentRefOrThrow(escrow.paymentId);
    payment.id = escrow.paymentId;
    const refundAmount = roundMoney(req.body?.amount || escrow.totalAmount || payment.amount);
    if (refundAmount <= 0) {
      throw new HttpError(400, "Refund amount must be greater than zero.");
    }

    let refundResponse = null;
    if (payment.gateway === "razorpay") {
      if (!payment.gatewayPaymentId && !payment.transactionId) {
        throw new HttpError(400, "Missing Razorpay payment id for refund.");
      }
      refundResponse = await createRazorpayRefund({
        paymentId: payment.gatewayPaymentId || payment.transactionId,
        amount: refundAmount,
        currency: payment.currency,
        notes: {
          reason,
          projectId
        }
      });
    } else if (payment.gateway === "stripe") {
      if (!payment.transactionId && !payment.gatewayOrderId) {
        throw new HttpError(400, "Missing Stripe payment id for refund.");
      }
      refundResponse = await createStripeRefund({
        paymentIntentId: payment.transactionId || payment.gatewayOrderId,
        amount: refundAmount,
        currency: payment.currency,
        reason: "requested_by_customer",
        metadata: {
          reason,
          projectId
        }
      });
    } else {
      throw new HttpError(400, "Unsupported gateway for refund.");
    }

    await adminDb
      .collection("escrow")
      .doc(escrow.id)
      .set(
        {
          status: "refunded",
          refundedAt: FieldValue.serverTimestamp(),
          refundId: refundResponse?.id || null,
          refundReason: reason,
          refundedBy: adminId,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

    await paymentRef.set(
      {
        status: "refunded",
        refundedAt: FieldValue.serverTimestamp(),
        refundId: refundResponse?.id || null,
        refundReason: reason,
        refundedBy: adminId,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    await logTransaction({
      event: "payment_refunded_to_client",
      actorId: adminId,
      projectId,
      paymentId: payment.id,
      escrowId: escrow.id,
      gateway: payment.gateway,
      amount: refundAmount,
      currency: payment.currency || escrow.currency || "INR",
      metadata: {
        refundId: refundResponse?.id || null,
        reason,
        projectStatus: project.status || null
      }
    });

    const updatedEscrowSnap = await adminDb.collection("escrow").doc(escrow.id).get();
    const updatedPaymentSnap = await paymentRef.get();

    res.status(200).json({
      ok: true,
      escrow: serializeForJson({ id: updatedEscrowSnap.id, ...updatedEscrowSnap.data() }),
      payment: serializeForJson({ id: updatedPaymentSnap.id, ...updatedPaymentSnap.data() }),
      refund: serializeForJson(refundResponse || {})
    });
  } catch (error) {
    next(error);
  }
}

export async function getEscrowStatusList(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const escrowSnap = await adminDb
      .collection("escrow")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const escrow = escrowSnap.docs.map((docSnap) =>
      serializeForJson({
        id: docSnap.id,
        ...docSnap.data()
      })
    );

    res.status(200).json({
      ok: true,
      escrow
    });
  } catch (error) {
    next(error);
  }
}
