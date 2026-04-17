import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/firebase.js";

const asText = (value) => String(value || "").trim();

export async function recordContractActivity({
  contractId,
  actorId,
  actorRole,
  action,
  message,
  metadata
}) {
  const safeContractId = asText(contractId);
  const safeActorId = asText(actorId);
  const safeRole = asText(actorRole).toLowerCase();
  const safeAction = asText(action).toLowerCase();
  const safeMessage = asText(message);

  if (!safeContractId || !safeActorId || !safeRole || !safeAction) return null;

  return addDoc(collection(db, "contractActivity"), {
    contractId: safeContractId,
    actorId: safeActorId,
    actorRole: safeRole,
    action: safeAction,
    message: safeMessage || null,
    metadata: metadata && typeof metadata === "object" ? metadata : null,
    createdAt: serverTimestamp()
  });
}

