import { adminDb, FieldValue } from "../config/firebaseAdmin.js";

const toAmount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.round(parsed * 100) / 100;
};

export async function logTransaction({
  event,
  actorId = null,
  projectId = null,
  paymentId = null,
  escrowId = null,
  payoutId = null,
  gateway = null,
  amount = 0,
  currency = "INR",
  metadata = {}
}) {
  const docRef = await adminDb.collection("transactions").add({
    event: String(event || "unknown"),
    actorId: actorId || null,
    projectId: projectId || null,
    paymentId: paymentId || null,
    escrowId: escrowId || null,
    payoutId: payoutId || null,
    gateway: gateway || null,
    amount: toAmount(amount),
    currency: String(currency || "INR").toUpperCase(),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    createdAt: FieldValue.serverTimestamp()
  });
  return docRef.id;
}
