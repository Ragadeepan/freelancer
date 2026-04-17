import { adminAuth, adminDb } from "../config/firebaseAdmin.js";
import { HttpError } from "../utils/httpError.js";

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return "";
  }
  return authHeader.slice(7).trim();
}

export async function requireAuth(req, _res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      throw new HttpError(401, "Missing authorization token.");
    }
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      role: decoded.role || null,
      claims: decoded
    };
    next();
  } catch (error) {
    const code = String(error?.code || "").trim();
    const raw = String(error?.message || "").trim();

    let message = "Invalid or expired token.";
    if (code === "auth/id-token-expired") {
      message = "ID token expired. Please sign in again.";
    } else if (code === "auth/invalid-id-token") {
      message = "Invalid sign-in token. Please sign in again.";
    } else if (/incorrect "aud"|audience|project/i.test(raw)) {
      message = "Token project mismatch. Backend Firebase credentials do not match frontend project.";
    }

    const details =
      process.env.NODE_ENV !== "production"
        ? { code: code || null, reason: raw || String(error) }
        : null;

    next(new HttpError(401, message, details));
  }
}

export async function requireAdmin(req, _res, next) {
  try {
    if (!req.user?.uid) {
      throw new HttpError(401, "Authentication required.");
    }
    if (req.user.role === "admin" || req.user.claims?.admin === true) {
      return next();
    }
    const userSnap = await adminDb.collection("users").doc(req.user.uid).get();
    if (!userSnap.exists || userSnap.data()?.role !== "admin") {
      throw new HttpError(403, "Admin permission required.");
    }
    req.user.role = "admin";
    next();
  } catch (error) {
    next(error);
  }
}
