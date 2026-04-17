import { adminDb, FieldValue } from "../config/firebaseAdmin.js";
import { HttpError } from "../utils/httpError.js";

const normalizeText = (value) => String(value || "").trim();
const normalizeLower = (value) => normalizeText(value).toLowerCase();

const toIso = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const serialize = (value) => {
  if (Array.isArray(value)) return value.map((item) => serialize(item));
  if (value && typeof value === "object") {
    if (typeof value.toDate === "function") return toIso(value);
    const output = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (entry === undefined) return;
      output[key] = serialize(entry);
    });
    return output;
  }
  return value;
};

async function ensureAdmin(uid, fallbackRole = null) {
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) {
    throw new HttpError(404, "Admin profile not found.");
  }
  const role = normalizeLower(snap.data()?.role || fallbackRole || "");
  if (role !== "admin") {
    throw new HttpError(403, "Admin permission required.");
  }
}

export async function connectClientAndFreelancer(req, res, next) {
  try {
    const actorUid = req.user.uid;
    await ensureAdmin(actorUid, req.user.role);

    const projectId = normalizeText(req.params.projectId || req.body?.projectId);
    if (!projectId) {
      throw new HttpError(400, "projectId is required.");
    }

    const projectRef = adminDb.collection("projects").doc(projectId);

    const transactionResult = await adminDb.runTransaction(async (transaction) => {
      const projectSnap = await transaction.get(projectRef);
      if (!projectSnap.exists) {
        throw new HttpError(404, "Project not found.");
      }

      const project = projectSnap.data() || {};
      const currentStatus = normalizeLower(project.status);

      if (currentStatus === "connected") {
        return {
          alreadyConnected: true,
          project: { id: projectSnap.id, ...project }
        };
      }
      if (currentStatus !== "assigned" && currentStatus !== "in_progress") {
        throw new HttpError(
          409,
          `Project in "${project.status || "unknown"}" status cannot be connected.`
        );
      }

      transaction.update(projectRef, {
        status: "connected",
        connectedAt: FieldValue.serverTimestamp(),
        connectedBy: actorUid,
        updatedAt: FieldValue.serverTimestamp()
      });

      if (project.jobId) {
        const jobRef = adminDb.collection("jobs").doc(project.jobId);
        const jobSnap = await transaction.get(jobRef);
        if (jobSnap.exists) {
          const jobStatus = normalizeLower(jobSnap.data()?.status || "");
          if (
            jobStatus === "assigned" ||
            jobStatus === "approved" ||
            jobStatus === "hired"
          ) {
            transaction.update(jobRef, {
              status: "connected",
              connectedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp()
            });
          }
        }
      }

      return {
        alreadyConnected: false,
        project: { id: projectSnap.id, ...project, status: "connected" }
      };
    });

    res.status(200).json({
      ok: true,
      projectId,
      connected: true,
      alreadyConnected: transactionResult.alreadyConnected,
      project: serialize(transactionResult.project)
    });
  } catch (error) {
    next(error);
  }
}
