import { arrayRemove, arrayUnion, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/firebase.js";

export async function toggleSavedJob({ userId, jobId, save }) {
  const safeUserId = String(userId || "").trim();
  const safeJobId = String(jobId || "").trim();
  if (!safeUserId || !safeJobId) {
    throw new Error("userId and jobId are required.");
  }
  await updateDoc(doc(db, "users", safeUserId), {
    savedJobIds: save ? arrayUnion(safeJobId) : arrayRemove(safeJobId)
  });
}
