import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where
} from "firebase/firestore";
import { db } from "../firebase/firebase.js";
import { createNotification } from "./notificationsService.js";

export async function sendMessage({
  projectId,
  senderId,
  senderName,
  recipientId,
  body
}) {
  const docRef = await addDoc(collection(db, "messages"), {
    projectId,
    senderId,
    senderName: senderName || null,
    recipientId,
    body,
    createdAt: serverTimestamp()
  });
  await createNotification({
    recipientId,
    type: "message_received",
    title: `New message from ${senderName || "team member"}`,
    message: String(body || "").trim().slice(0, 120) || "You received a new message.",
    actorId: senderId || null,
    projectId: projectId || null
  }).catch(() => null);
  return docRef;
}

export async function listMessagesForProject(projectId) {
  const snapshot = await getDocs(
    query(
      collection(db, "messages"),
      where("projectId", "==", projectId),
      orderBy("createdAt", "asc")
    )
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}
