import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { db } from "../firebase/firebase.js";
import { logActivity } from "./activityLogsService.js";
import {
  createNotificationsBulk,
  listActiveAdminIds
} from "./notificationsService.js";

export async function createProjectUpdate({
  projectId,
  requestedBy,
  requestedStatus,
  message
}) {
  const projectSnap = await getDoc(doc(db, "projects", projectId));
  const project = projectSnap.exists() ? projectSnap.data() : null;
  const docRef = await addDoc(collection(db, "projectUpdates"), {
    projectId,
    requestedBy,
    requestedStatus,
    message: message || "",
    status: "pending",
    createdAt: serverTimestamp(),
    adminApprovedBy: null
  });
  await logActivity({
    actor: requestedBy,
    action: "project_update_requested",
    targetId: docRef.id
  });
  const adminIds = await listActiveAdminIds().catch(() => []);
  const participantRecipients = [
    project?.clientId || null,
    project?.freelancerId || null
  ].filter((id) => id && id !== requestedBy);
  await createNotificationsBulk([
    ...adminIds.map((adminId) => ({
      recipientId: adminId,
      type: "project_update_requested",
      title: "Project update request pending",
      message: `Project ${project?.jobTitle || projectId} has a new "${requestedStatus}" request.`,
      actorId: requestedBy,
      projectId
    })),
    ...participantRecipients.map((recipientId) => ({
      recipientId,
      type: "project_update_requested",
      title: "Project update requested",
      message: `A "${requestedStatus}" update was requested on ${project?.jobTitle || "project"}.`,
      actorId: requestedBy,
      projectId
    }))
  ]).catch(() => null);
  return docRef;
}

export async function listPendingProjectUpdates() {
  const snapshot = await getDocs(
    query(collection(db, "projectUpdates"), where("status", "==", "pending"))
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function listProjectUpdatesForProject(projectId) {
  const snapshot = await getDocs(
    query(
      collection(db, "projectUpdates"),
      where("projectId", "==", projectId)
    )
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function approveProjectUpdate(updateId, adminId) {
  const updateRef = doc(db, "projectUpdates", updateId);
  const snapshot = await getDoc(updateRef);
  if (!snapshot.exists()) {
    throw new Error("Update request not found");
  }
  const updateData = snapshot.data();
  const projectRef = doc(db, "projects", updateData.projectId);
  const projectSnap = await getDoc(projectRef);
  const project = projectSnap.exists() ? projectSnap.data() : null;
  const batch = writeBatch(db);
  batch.update(updateRef, {
    status: "approved",
    adminApprovedBy: adminId,
    approvedAt: serverTimestamp()
  });
  batch.update(projectRef, {
    status: updateData.requestedStatus
  });
  await batch.commit();
  await logActivity({
    actor: adminId,
    action: "project_update_approved",
    targetId: updateId
  });
  await logActivity({
    actor: adminId,
    action: "project_status_changed",
    targetId: updateData.projectId
  });
  await createNotificationsBulk(
    [project?.clientId, project?.freelancerId, updateData.requestedBy]
      .filter(Boolean)
      .map((recipientId) => ({
        recipientId,
        type: "project_update_approved",
        title: "Project update approved",
        message: `Admin approved "${updateData.requestedStatus}" on ${project?.jobTitle || "project"}.`,
        actorId: adminId,
        projectId: updateData.projectId
      }))
  ).catch(() => null);
}

export async function rejectProjectUpdate(updateId, adminId) {
  const updateRef = doc(db, "projectUpdates", updateId);
  const snapshot = await getDoc(updateRef);
  if (!snapshot.exists()) {
    throw new Error("Update request not found");
  }
  const updateData = snapshot.data();
  const projectSnap = await getDoc(doc(db, "projects", updateData.projectId));
  const project = projectSnap.exists() ? projectSnap.data() : null;
  await updateDoc(updateRef, {
    status: "rejected",
    adminApprovedBy: adminId
  });
  await logActivity({
    actor: adminId,
    action: "project_update_rejected",
    targetId: updateId
  });
  await createNotificationsBulk(
    [project?.clientId, project?.freelancerId, updateData.requestedBy]
      .filter(Boolean)
      .map((recipientId) => ({
        recipientId,
        type: "project_update_rejected",
        title: "Project update rejected",
        message: `Admin rejected "${updateData.requestedStatus}" on ${project?.jobTitle || "project"}.`,
        actorId: adminId,
        projectId: updateData.projectId
      }))
  ).catch(() => null);
}
