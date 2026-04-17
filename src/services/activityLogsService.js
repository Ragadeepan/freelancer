import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase/firebase.js";

export async function logActivity({ actor, action, targetId }) {
  if (!actor || !action || !targetId) return;
  return addDoc(collection(db, "activityLogs"), {
    actor,
    action,
    targetId,
    timestamp: serverTimestamp()
  });
}

export async function listActivityLogs(limitCount = 10) {
  const snapshot = await getDocs(
    query(
      collection(db, "activityLogs"),
      orderBy("timestamp", "desc"),
      limit(limitCount)
    )
  );
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
}
