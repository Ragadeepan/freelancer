import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase/firebase.js";

const settingsRef = doc(db, "settings", "global");

export async function getSettings() {
  const snapshot = await getDoc(settingsRef);
  if (!snapshot.exists()) {
    return { commissionPercentage: 10 };
  }
  return snapshot.data();
}

export async function updateSettings(payload) {
  return setDoc(
    settingsRef,
    {
      ...payload,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}
