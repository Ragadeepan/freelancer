import { adminDb, FieldValue } from "../config/firebaseAdmin.js";
import { HttpError } from "../utils/httpError.js";
import { normalizeCurrency } from "../utils/currency.js";

const PROJECT_FUNDABLE_STATUSES = new Set(["created", "pending", "funded", "in_progress"]);
const PROJECT_COMPLETABLE_STATUSES = new Set(["funded", "in_progress", "completed"]);

export function roundMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round(parsed * 100) / 100;
}

export function normalizeInstallment(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const clamped = Math.floor(parsed);
  return Math.min(Math.max(clamped, 1), 3);
}

export function serializeForJson(value) {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((entry) => serializeForJson(entry));
  }
  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serializeForJson(entry)])
    );
  }
  return value;
}

export function mapDoc(docSnap) {
  return {
    id: docSnap.id,
    ...docSnap.data()
  };
}

export async function getProjectOrThrow(projectId) {
  const cleanProjectId = String(projectId || "").trim();
  if (!cleanProjectId) {
    throw new HttpError(400, "projectId is required.");
  }
  const projectRef = adminDb.collection("projects").doc(cleanProjectId);
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) {
    throw new HttpError(404, "Project not found.");
  }
  return { projectRef, project: mapDoc(projectSnap) };
}

export async function getPaymentRefOrThrow(paymentId) {
  const cleanPaymentId = String(paymentId || "").trim();
  if (!cleanPaymentId) {
    throw new HttpError(400, "paymentId is required.");
  }
  const paymentRef = adminDb.collection("payments").doc(cleanPaymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) {
    throw new HttpError(404, "Payment not found.");
  }
  return { paymentRef, payment: mapDoc(paymentSnap) };
}

export async function getEscrowRefOrThrow(escrowId) {
  const cleanEscrowId = String(escrowId || "").trim();
  if (!cleanEscrowId) {
    throw new HttpError(400, "escrowId is required.");
  }
  const escrowRef = adminDb.collection("escrow").doc(cleanEscrowId);
  const escrowSnap = await escrowRef.get();
  if (!escrowSnap.exists) {
    throw new HttpError(404, "Escrow record not found.");
  }
  return { escrowRef, escrow: mapDoc(escrowSnap) };
}

export async function getUserById(userId) {
  if (!userId) return null;
  const userSnap = await adminDb.collection("users").doc(String(userId)).get();
  if (!userSnap.exists) return null;
  return mapDoc(userSnap);
}

export async function getCommissionRate() {
  const defaultRate = roundMoney(process.env.DEFAULT_COMMISSION_PERCENT || 10);
  const settingsSnap = await adminDb.collection("settings").doc("global").get();
  const fromSettings = settingsSnap.exists
    ? roundMoney(settingsSnap.data()?.commissionPercentage)
    : defaultRate;
  if (fromSettings < 0) return 0;
  return fromSettings || defaultRate || 10;
}

export function calculateCommission(amount, commissionRate) {
  const totalAmount = roundMoney(amount);
  const rate = Math.max(0, roundMoney(commissionRate));
  const platformCommission = roundMoney((totalAmount * rate) / 100);
  const freelancerAmount = roundMoney(Math.max(0, totalAmount - platformCommission));
  return { totalAmount, rate, platformCommission, freelancerAmount };
}

export async function ensureEscrowForPayment({
  paymentId,
  paymentData,
  status = "held",
  extraFields = {}
}) {
  const escrowFields = {
    projectId: paymentData.projectId,
    paymentId,
    clientId: paymentData.clientId || paymentData.payerId || null,
    freelancerId: paymentData.freelancerId || null,
    totalAmount: roundMoney(paymentData.amount),
    platformCommission: roundMoney(paymentData.platformCommission || paymentData.commission),
    freelancerAmount: roundMoney(paymentData.freelancerAmount || paymentData.netAmount),
    gateway: paymentData.gateway || null,
    currency: normalizeCurrency(paymentData.currency || "INR"),
    installmentNumber: normalizeInstallment(paymentData.installmentNumber, 1),
    status,
    paidAt: status === "held" || status === "paid" ? FieldValue.serverTimestamp() : null,
    releasedAt: status === "released" ? FieldValue.serverTimestamp() : null,
    updatedAt: FieldValue.serverTimestamp(),
    ...extraFields
  };

  const existingSnap = await adminDb
    .collection("escrow")
    .where("paymentId", "==", paymentId)
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    const existingRef = existingSnap.docs[0].ref;
    await existingRef.set(escrowFields, { merge: true });
    const latest = await existingRef.get();
    return serializeForJson(mapDoc(latest));
  }

  const createPayload = {
    ...escrowFields,
    createdAt: FieldValue.serverTimestamp()
  };
  const escrowRef = await adminDb.collection("escrow").add(createPayload);
  const created = await escrowRef.get();
  return serializeForJson(mapDoc(created));
}

export async function markProjectFunded(projectId) {
  const { projectRef, project } = await getProjectOrThrow(projectId);
  if (!PROJECT_FUNDABLE_STATUSES.has(project.status || "created")) {
    return serializeForJson(project);
  }
  if (project.status === "funded" || project.status === "in_progress") {
    return serializeForJson(project);
  }
  await projectRef.set(
    {
      status: "funded",
      fundedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  const updated = await projectRef.get();
  return serializeForJson(mapDoc(updated));
}

export async function markProjectCompletedState(projectId) {
  const { projectRef, project } = await getProjectOrThrow(projectId);
  const status = project.status || "created";
  if (!PROJECT_COMPLETABLE_STATUSES.has(status)) {
    throw new HttpError(
      409,
      `Project in ${status} state cannot be marked as completed.`
    );
  }
  if (status === "completed") {
    return serializeForJson(project);
  }
  await projectRef.set(
    {
      status: "completed",
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  const updated = await projectRef.get();
  return serializeForJson(mapDoc(updated));
}

export async function markProjectReleasedIfEligible(projectId) {
  const openEscrowSnap = await adminDb
    .collection("escrow")
    .where("projectId", "==", projectId)
    .where("status", "in", ["pending", "paid", "held", "disputed"])
    .limit(1)
    .get();

  if (!openEscrowSnap.empty) {
    return null;
  }

  const { projectRef, project } = await getProjectOrThrow(projectId);
  if ((project.status || "") === "released") {
    return serializeForJson(project);
  }
  if ((project.status || "") !== "completed") {
    return serializeForJson(project);
  }

  await projectRef.set(
    {
      status: "released",
      releasedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  const updated = await projectRef.get();
  return serializeForJson(mapDoc(updated));
}

export async function getEscrowForProjectAction(projectId, escrowId = "") {
  if (escrowId) {
    const { escrow } = await getEscrowRefOrThrow(escrowId);
    if (escrow.projectId !== projectId) {
      throw new HttpError(400, "Escrow does not belong to this project.");
    }
    return escrow;
  }

  const heldSnap = await adminDb
    .collection("escrow")
    .where("projectId", "==", projectId)
    .where("status", "==", "held")
    .limit(1)
    .get();
  if (!heldSnap.empty) {
    return mapDoc(heldSnap.docs[0]);
  }

  throw new HttpError(404, "No held escrow record found for this project.");
}
