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

export async function createProject({
  jobId,
  clientId,
  freelancerId,
  status = "in_progress",
  jobTitle,
  clientName,
  freelancerName
}) {
  const docRef = await addDoc(collection(db, "projects"), {
    jobId,
    clientId,
    freelancerId,
    jobTitle: jobTitle || null,
    clientName: clientName || null,
    freelancerName: freelancerName || null,
    status,
    createdAt: serverTimestamp()
  });
  await logActivity({
    actor: clientId,
    action: "project_created",
    targetId: docRef.id
  });
  return docRef;
}

export async function updateProjectStatus(projectId, status, actorId) {
  await updateDoc(doc(db, "projects", projectId), { status });
  if (actorId) {
    await logActivity({
      actor: actorId,
      action: "project_status_changed",
      targetId: projectId
    });
  }
}

export async function listClientProjects(clientId) {
  const snapshot = await getDocs(
    query(collection(db, "projects"), where("clientId", "==", clientId))
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function listFreelancerProjects(freelancerId) {
  const snapshot = await getDocs(
    query(collection(db, "projects"), where("freelancerId", "==", freelancerId))
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function listAllProjects() {
  const snapshot = await getDocs(collection(db, "projects"));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function getProject(projectId) {
  const snapshot = await getDoc(doc(db, "projects", projectId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}
