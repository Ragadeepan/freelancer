import crypto from "node:crypto";
import { adminDb, FieldValue } from "../config/firebaseAdmin.js";
import { HttpError } from "../utils/httpError.js";
import { selectGateway } from "../utils/gatewaySelector.js";
import { logTransaction } from "../utils/transactionLogger.js";
import {
  createRazorpayOrder,
  fetchRazorpayPayment,
  verifyRazorpaySignature
} from "../services/razorpay.service.js";
import {
  createStripePaymentIntent,
  retrieveStripePaymentIntent,
  verifyStripeWebhookEvent
} from "../services/stripe.service.js";
import {
  calculateCommission,
  ensureEscrowForPayment,
  getCommissionRate,
  getPaymentRefOrThrow,
  getProjectOrThrow,
  markProjectFunded,
  normalizeInstallment,
  roundMoney,
  serializeForJson
} from "../services/paymentData.service.js";

const ACTIVE_PAYMENT_STATUSES = ["pending", "paid", "held", "released"];

function isAdminUser(req) {
  return req.user?.role === "admin" || req.user?.claims?.admin === true;
}

function buildReceipt(projectId, installmentNumber) {
  return `p_${String(projectId).slice(0, 14)}_i${installmentNumber}_${Date.now()}`.slice(
    0,
    40
  );
}

async function findPaymentByGatewayOrder(gateway, gatewayOrderId) {
  const snap = await adminDb
    .collection("payments")
    .where("gateway", "==", gateway)
    .where("gatewayOrderId", "==", gatewayOrderId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return {
    paymentRef: docSnap.ref,
    payment: { id: docSnap.id, ...docSnap.data() }
  };
}

async function finalizePaymentAsHeld({
  paymentRef,
  payment,
  gatewayPaymentId,
  actorId,
  source
}) {
  if (payment.status === "held" || payment.status === "released") {
    const escrowSnap = await adminDb
      .collection("escrow")
      .where("paymentId", "==", payment.id)
      .limit(1)
      .get();
    const existingEscrow = escrowSnap.empty
      ? null
      : {
          id: escrowSnap.docs[0].id,
          ...escrowSnap.docs[0].data()
        };
    return {
      payment: serializeForJson(payment),
      escrow: serializeForJson(existingEscrow)
    };
  }

  if (payment.status === "cancelled") {
    throw new HttpError(409, "Cancelled payment cannot be verified.");
  }

  if (payment.status === "refunded") {
    throw new HttpError(409, "Refunded payment cannot be verified.");
  }

  const duplicateSnap = await adminDb
    .collection("payments")
    .where("gatewayPaymentId", "==", gatewayPaymentId)
    .where("status", "in", ["held", "released"])
    .limit(2)
    .get();
  const duplicateExists = duplicateSnap.docs.some((docSnap) => docSnap.id !== payment.id);
  if (duplicateExists) {
    throw new HttpError(409, "Duplicate payment detected.");
  }

  const updatePayload = {
    status: "held",
    transactionId: gatewayPaymentId,
    gatewayPaymentId,
    paidAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    failureReason: null
  };
  await paymentRef.set(updatePayload, { merge: true });
  const mergedPayment = { ...payment, ...updatePayload };

  const escrow = await ensureEscrowForPayment({
    paymentId: payment.id,
    paymentData: mergedPayment,
    status: "held"
  });

  await markProjectFunded(payment.projectId);

  await logTransaction({
    event: source === "webhook" ? "payment_held_webhook" : "payment_held_verified",
    actorId: actorId || null,
    projectId: payment.projectId,
    paymentId: payment.id,
    escrowId: escrow?.id || null,
    gateway: payment.gateway,
    amount: payment.amount,
    currency: payment.currency,
    metadata: {
      gatewayPaymentId,
      source
    }
  });

  return {
    payment: serializeForJson(mergedPayment),
    escrow
  };
}

async function markPaymentFailed(paymentRef, payment, reason, actorId = null) {
  const payload = {
    status: "failed",
    failureReason: String(reason || "Payment failed"),
    updatedAt: FieldValue.serverTimestamp()
  };
  await paymentRef.set(payload, { merge: true });
  await logTransaction({
    event: "payment_failed",
    actorId,
    projectId: payment.projectId,
    paymentId: payment.id,
    gateway: payment.gateway,
    amount: payment.amount,
    currency: payment.currency,
    metadata: {
      reason: String(reason || "")
    }
  });
}

export async function createPaymentOrder(req, res, next) {
  try {
    const payerId = req.user?.uid;
    if (!payerId) {
      throw new HttpError(401, "Authentication required.");
    }

    const {
      projectId,
      amount,
      currency,
      country,
      installmentNumber = 1,
      idempotencyKey = "",
      metadata = {}
    } = req.body || {};

    const totalAmount = roundMoney(amount);
    if (totalAmount <= 0) {
      throw new HttpError(400, "amount must be greater than zero.");
    }
    const installment = normalizeInstallment(installmentNumber, 1);
    const { project } = await getProjectOrThrow(projectId);

    if (project.clientId !== payerId) {
      throw new HttpError(403, "Only the project client can create payment orders.");
    }
    if (["completed", "released", "cancelled"].includes(project.status)) {
      throw new HttpError(409, `Project in ${project.status} state cannot be funded.`);
    }

    const gateway = selectGateway(country || project.country || req.headers["x-country"]);
    const normalizedCurrency = gateway === "razorpay"
      ? "INR"
      : String(currency || project.currency || "USD").toUpperCase();

    const cleanIdempotencyKey = String(idempotencyKey || "").trim();
    if (cleanIdempotencyKey) {
      const idempotentSnap = await adminDb
        .collection("payments")
        .where("payerId", "==", payerId)
        .where("idempotencyKey", "==", cleanIdempotencyKey)
        .limit(1)
        .get();
      if (!idempotentSnap.empty) {
        const existingDoc = idempotentSnap.docs[0];
        return res.status(200).json({
          ok: true,
          idempotent: true,
          payment: serializeForJson({ id: existingDoc.id, ...existingDoc.data() })
        });
      }
    }

    const duplicateInstallmentSnap = await adminDb
      .collection("payments")
      .where("projectId", "==", projectId)
      .where("installmentNumber", "==", installment)
      .where("status", "in", ACTIVE_PAYMENT_STATUSES)
      .limit(1)
      .get();
    if (!duplicateInstallmentSnap.empty) {
      throw new HttpError(
        409,
        `Installment ${installment} already has an active payment record.`
      );
    }

    const commissionRate = await getCommissionRate();
    const { platformCommission, freelancerAmount } = calculateCommission(
      totalAmount,
      commissionRate
    );

    let gatewayOrderId = "";
    let orderPayload = {};

    if (gateway === "razorpay") {
      const order = await createRazorpayOrder({
        amount: totalAmount,
        currency: normalizedCurrency,
        receipt: buildReceipt(projectId, installment),
        notes: {
          projectId,
          installment: String(installment),
          payerId
        }
      });
      gatewayOrderId = order.id;
      orderPayload = {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID
      };
    } else {
      const intent = await createStripePaymentIntent({
        amount: totalAmount,
        currency: normalizedCurrency,
        metadata: {
          projectId,
          payerId,
          installmentNumber: installment
        },
        idempotencyKey: cleanIdempotencyKey || undefined
      });
      gatewayOrderId = intent.id;
      orderPayload = {
        id: intent.id,
        clientSecret: intent.client_secret,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ""
      };
    }

    const paymentRef = await adminDb.collection("payments").add({
      projectId,
      jobId: project.jobId || null,
      payerId,
      clientId: project.clientId || payerId,
      freelancerId: project.freelancerId || null,
      receiverType: "admin",
      amount: totalAmount,
      currency: normalizedCurrency,
      gateway,
      transactionId: gatewayOrderId,
      gatewayOrderId,
      gatewayPaymentId: null,
      installmentNumber: installment,
      platformCommission,
      freelancerAmount,
      commissionRate,
      idempotencyKey: cleanIdempotencyKey || null,
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      paidAt: null,
      releasedAt: null,
      refundedAt: null,
      failureReason: null
    });

    await logTransaction({
      event: "payment_order_created",
      actorId: payerId,
      projectId,
      paymentId: paymentRef.id,
      gateway,
      amount: totalAmount,
      currency: normalizedCurrency,
      metadata: {
        installment,
        idempotencyKey: cleanIdempotencyKey || null
      }
    });

    res.status(201).json({
      ok: true,
      paymentId: paymentRef.id,
      gateway,
      order: orderPayload
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyPayment(req, res, next) {
  try {
    const { paymentId } = req.body || {};
    const { paymentRef, payment } = await getPaymentRefOrThrow(paymentId);
    payment.id = paymentId;

    if (!isAdminUser(req) && payment.payerId !== req.user?.uid) {
      throw new HttpError(403, "Only the payer can verify this payment.");
    }

    let gatewayPaymentId = "";
    if (payment.gateway === "razorpay") {
      const orderId = req.body?.razorpay_order_id || payment.gatewayOrderId;
      const remotePaymentId = req.body?.razorpay_payment_id;
      const signature = req.body?.razorpay_signature;
      if (!orderId || !remotePaymentId || !signature) {
        throw new HttpError(400, "Missing Razorpay verification payload.");
      }
      const valid = verifyRazorpaySignature({
        orderId,
        paymentId: remotePaymentId,
        signature
      });
      if (!valid) {
        throw new HttpError(400, "Invalid Razorpay signature.");
      }
      const remote = await fetchRazorpayPayment(remotePaymentId);
      if (!["authorized", "captured"].includes(remote.status)) {
        await markPaymentFailed(
          paymentRef,
          payment,
          `Razorpay status ${remote.status}`,
          req.user?.uid || null
        );
        throw new HttpError(409, `Payment not captured. Current state: ${remote.status}`);
      }
      gatewayPaymentId = remotePaymentId;
    } else if (payment.gateway === "stripe") {
      const paymentIntentId = req.body?.paymentIntentId || payment.gatewayOrderId;
      if (!paymentIntentId) {
        throw new HttpError(400, "Missing Stripe paymentIntentId.");
      }
      const intent = await retrieveStripePaymentIntent(paymentIntentId);
      if (intent.status !== "succeeded") {
        const pendingMessage = `Stripe payment is ${intent.status}. Waiting for webhook confirmation.`;
        await paymentRef.set(
          {
            status: "pending",
            failureReason: pendingMessage,
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
        return res.status(202).json({
          ok: true,
          status: "pending",
          message: pendingMessage
        });
      }
      gatewayPaymentId = intent.id;
    } else {
      throw new HttpError(400, "Unsupported gateway.");
    }

    const result = await finalizePaymentAsHeld({
      paymentRef,
      payment,
      gatewayPaymentId,
      actorId: req.user?.uid || null,
      source: "verify"
    });

    res.status(200).json({
      ok: true,
      payment: result.payment,
      escrow: result.escrow
    });
  } catch (error) {
    next(error);
  }
}

export async function storeTransaction(req, res, next) {
  try {
    const {
      event,
      projectId,
      paymentId,
      escrowId,
      payoutId,
      gateway,
      amount,
      currency,
      metadata
    } = req.body || {};
    if (!event) {
      throw new HttpError(400, "event is required.");
    }
    const transactionId = await logTransaction({
      event,
      actorId: req.user?.uid || null,
      projectId: projectId || null,
      paymentId: paymentId || null,
      escrowId: escrowId || null,
      payoutId: payoutId || null,
      gateway: gateway || null,
      amount: roundMoney(amount),
      currency: currency || "INR",
      metadata: metadata && typeof metadata === "object" ? metadata : {}
    });

    res.status(201).json({
      ok: true,
      transactionId
    });
  } catch (error) {
    next(error);
  }
}

export async function cancelPayment(req, res, next) {
  try {
    const { paymentId } = req.params || {};
    const { paymentRef, payment } = await getPaymentRefOrThrow(paymentId);
    payment.id = paymentId;

    if (!isAdminUser(req) && payment.payerId !== req.user?.uid) {
      throw new HttpError(403, "Only the payer can cancel this payment.");
    }
    if (["held", "released", "refunded"].includes(payment.status)) {
      throw new HttpError(409, `Payment in ${payment.status} state cannot be cancelled.`);
    }
    if (payment.status === "cancelled") {
      return res.status(200).json({ ok: true, payment: serializeForJson(payment) });
    }

    await paymentRef.set(
      {
        status: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    await logTransaction({
      event: "payment_cancelled",
      actorId: req.user?.uid || null,
      projectId: payment.projectId,
      paymentId,
      gateway: payment.gateway,
      amount: payment.amount,
      currency: payment.currency
    });

    const updated = await paymentRef.get();
    res.status(200).json({
      ok: true,
      payment: serializeForJson({ id: updated.id, ...updated.data() })
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminPaymentSummary(req, res, next) {
  try {
    const [paymentsSnap, escrowSnap] = await Promise.all([
      adminDb.collection("payments").get(),
      adminDb.collection("escrow").get()
    ]);

    const payments = paymentsSnap.docs.map((docSnap) => docSnap.data());
    const escrow = escrowSnap.docs.map((docSnap) => docSnap.data());

    const summary = payments.reduce(
      (acc, payment) => {
        const amount = roundMoney(payment.amount);
        const commission = roundMoney(payment.platformCommission || 0);
        if (["pending", "paid", "held"].includes(payment.status)) {
          acc.pendingPayments += 1;
        }
        if (payment.status === "held") {
          acc.totalFundsHeld += amount;
        }
        if (payment.status === "released") {
          acc.totalReleased += amount;
          acc.commissionEarned += commission;
        }
        return acc;
      },
      {
        totalFundsHeld: 0,
        totalReleased: 0,
        pendingPayments: 0,
        commissionEarned: 0
      }
    );

    const escrowTotals = escrow.reduce(
      (acc, record) => {
        if (record.status === "held") {
          acc.held += roundMoney(record.totalAmount);
        }
        if (record.status === "released") {
          acc.released += roundMoney(record.totalAmount);
        }
        return acc;
      },
      { held: 0, released: 0 }
    );

    res.status(200).json({
      ok: true,
      summary: serializeForJson({
        ...summary,
        totalFundsHeld: roundMoney(Math.max(summary.totalFundsHeld, escrowTotals.held)),
        totalReleased: roundMoney(Math.max(summary.totalReleased, escrowTotals.released))
      })
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminPaymentHistory(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const historySnap = await adminDb
      .collection("payments")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const history = historySnap.docs.map((docSnap) =>
      serializeForJson({
        id: docSnap.id,
        ...docSnap.data()
      })
    );

    res.status(200).json({
      ok: true,
      history
    });
  } catch (error) {
    next(error);
  }
}

export async function handleRazorpayWebhook(req, res, next) {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      throw new HttpError(500, "Razorpay webhook secret is not configured.");
    }
    if (!signature) {
      throw new HttpError(400, "Missing Razorpay webhook signature.");
    }

    const rawBody = req.rawBody || JSON.stringify(req.body || {});
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (expected !== signature) {
      throw new HttpError(400, "Invalid Razorpay webhook signature.");
    }

    const event = req.body?.event;
    const entity = req.body?.payload?.payment?.entity || {};
    if (event === "payment.captured" && entity.order_id && entity.id) {
      const matched = await findPaymentByGatewayOrder("razorpay", entity.order_id);
      if (matched) {
        await finalizePaymentAsHeld({
          paymentRef: matched.paymentRef,
          payment: matched.payment,
          gatewayPaymentId: entity.id,
          actorId: null,
          source: "webhook"
        });
      }
    }

    if (event === "payment.failed" && entity.order_id) {
      const matched = await findPaymentByGatewayOrder("razorpay", entity.order_id);
      if (matched) {
        await markPaymentFailed(
          matched.paymentRef,
          matched.payment,
          entity.error_description || "Razorpay payment failed"
        );
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function handleStripeWebhook(req, res, next) {
  try {
    const signature = req.headers["stripe-signature"];
    const event = verifyStripeWebhookEvent(req.body, signature);

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;
      const matched = await findPaymentByGatewayOrder("stripe", paymentIntent.id);
      if (matched) {
        await finalizePaymentAsHeld({
          paymentRef: matched.paymentRef,
          payment: matched.payment,
          gatewayPaymentId: paymentIntent.id,
          actorId: null,
          source: "webhook"
        });
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object;
      const matched = await findPaymentByGatewayOrder("stripe", paymentIntent.id);
      if (matched) {
        await markPaymentFailed(
          matched.paymentRef,
          matched.payment,
          paymentIntent.last_payment_error?.message || "Stripe payment failed"
        );
      }
    }

    if (event.type === "payment_intent.canceled") {
      const paymentIntent = event.data.object;
      const matched = await findPaymentByGatewayOrder("stripe", paymentIntent.id);
      if (matched) {
        await matched.paymentRef.set(
          {
            status: "cancelled",
            cancelledAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            failureReason: paymentIntent.cancellation_reason || "cancelled"
          },
          { merge: true }
        );
        await logTransaction({
          event: "payment_cancelled_webhook",
          projectId: matched.payment.projectId,
          paymentId: matched.payment.id,
          gateway: "stripe",
          amount: matched.payment.amount,
          currency: matched.payment.currency
        });
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
}
