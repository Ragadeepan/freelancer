import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { db } from "../firebase/firebase.js";
import { logActivity } from "./activityLogsService.js";
import {
  createNotificationsBulk,
  listActiveAdminIds
} from "./notificationsService.js";

export async function createDispute({ projectId, raisedBy, reason }) {
  const projectSnap = await getDoc(doc(db, "projects", projectId));
  const project = projectSnap.exists() ? projectSnap.data() : null;
  const docRef = await addDoc(collection(db, "disputes"), {
    projectId,
    raisedBy,
    reason,
    status: "open",
    createdAt: serverTimestamp()
  });
  await logActivity({
    actor: raisedBy,
    action: "dispute_opened",
    targetId: docRef.id
  });
  const adminIds = await listActiveAdminIds().catch(() => []);
  const participantRecipients = [
    project?.clientId || null,
    project?.freelancerId || null
  ].filter((id) => id && id !== raisedBy);
  await createNotificationsBulk([
    ...adminIds.map((adminId) => ({
      recipientId: adminId,
      type: "dispute_opened",
      title: "New dispute opened",
      message: `A dispute was raised on ${project?.jobTitle || "project"}.`,
      actorId: raisedBy,
      projectId
    })),
    ...participantRecipients.map((recipientId) => ({
      recipientId,
      type: "dispute_opened",
      title: "Dispute raised on project",
      message: `A dispute was raised on ${project?.jobTitle || "project"}.`,
      actorId: raisedBy,
      projectId
    }))
  ]).catch(() => null);
  return docRef;
}

export async function resolveDispute(disputeId, adminId) {
  const disputeRef = doc(db, "disputes", disputeId);
  const disputeSnap = await getDoc(disputeRef);
  if (!disputeSnap.exists()) {
    throw new Error("Dispute not found.");
  }
  const dispute = disputeSnap.data();
  const projectSnap = await getDoc(doc(db, "projects", dispute.projectId));
  const project = projectSnap.exists() ? projectSnap.data() : null;
  await updateDoc(disputeRef, { status: "resolved" });
  await logActivity({
    actor: adminId,
    action: "dispute_resolved",
    targetId: disputeId
  });
  await createNotificationsBulk(
    [dispute.raisedBy, project?.clientId, project?.freelancerId]
      .filter(Boolean)
      .map((recipientId) => ({
        recipientId,
        type: "dispute_resolved",
        title: "Dispute resolved",
        message: `Admin resolved the dispute on ${project?.jobTitle || "project"}.`,
        actorId: adminId,
        projectId: dispute.projectId
      }))
  ).catch(() => null);
}

export async function listOpenDisputes() {
  const snapshot = await getDocs(
    query(collection(db, "disputes"), where("status", "==", "open"))
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function listAllDisputes() {
  const snapshot = await getDocs(collection(db, "disputes"));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}
