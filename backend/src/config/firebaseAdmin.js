import "dotenv/config";
import fs from "fs";
import admin from "firebase-admin";
import { HttpError } from "../utils/httpError.js";

function readServiceAccountFromEnv() {
  const filePath = String(process.env.FIREBASE_SERVICE_ACCOUNT_FILE || "").trim();
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const stripBom = (value) => String(value || "").replace(/^\uFEFF/, "");

  if (filePath) {
    try {
      const rawFile = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(stripBom(rawFile));
    } catch (error) {
      throw new HttpError(500, "Invalid FIREBASE_SERVICE_ACCOUNT_FILE value.");
    }
  }

  if (base64) {
    try {
      const decoded = Buffer.from(base64, "base64").toString("utf-8");
      return JSON.parse(stripBom(decoded));
    } catch (error) {
      throw new HttpError(500, "Invalid FIREBASE_SERVICE_ACCOUNT_BASE64 value.");
    }
  }

  if (rawJson) {
    try {
      return JSON.parse(stripBom(rawJson));
    } catch (error) {
      throw new HttpError(500, "Invalid FIREBASE_SERVICE_ACCOUNT_JSON value.");
    }
  }

  return null;
}

if (!admin.apps.length) {
  const serviceAccount = readServiceAccountFromEnv();
  const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
  const storageBucket = String(process.env.FIREBASE_STORAGE_BUCKET || "")
    .trim()
    .replace(/^gs:\/\//i, "");

  const options = {
    credential: serviceAccount
      ? admin.credential.cert(serviceAccount)
      : admin.credential.applicationDefault()
  };

  if (projectId) {
    options.projectId = projectId;
  }
  if (storageBucket) {
    options.storageBucket = storageBucket;
  }

  admin.initializeApp(options);
}

export const adminApp = admin.app();
export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const adminStorage = admin.storage();
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;
