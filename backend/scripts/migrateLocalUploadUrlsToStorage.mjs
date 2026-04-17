import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { adminDb, adminStorage } from "../src/config/firebaseAdmin.js";

const USERS_COLLECTION = "users";
const CONTROLLER_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT_DIR = path.resolve(CONTROLLER_DIR, "..");
const LOCAL_UPLOADS_DIR = path.join(BACKEND_ROOT_DIR, "uploads");

const MIME_BY_EXTENSION = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".heic": "image/heic",
  ".heif": "image/heif"
};

const asText = (value) => String(value || "").trim();

const normalizeBucketName = (value) => asText(value).replace(/^gs:\/\//i, "");

const buildBucketCandidates = () => {
  const configuredBucket = normalizeBucketName(
    process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET
  );
  const projectId = asText(process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID);
  const candidates = [];
  const seen = new Set();

  const add = (value) => {
    const bucket = normalizeBucketName(value);
    if (!bucket || seen.has(bucket)) return;
    seen.add(bucket);
    candidates.push(bucket);
  };

  add(configuredBucket);
  if (configuredBucket.endsWith(".appspot.com")) {
    add(configuredBucket.replace(/\.appspot\.com$/, ".firebasestorage.app"));
  }
  if (configuredBucket.endsWith(".firebasestorage.app")) {
    add(configuredBucket.replace(/\.firebasestorage\.app$/, ".appspot.com"));
  }
  if (projectId) {
    add(`${projectId}.firebasestorage.app`);
    add(`${projectId}.appspot.com`);
  }

  return candidates;
};

async function resolveExistingBucket() {
  for (const candidate of buildBucketCandidates()) {
    try {
      const bucket = adminStorage.bucket(candidate);
      const [exists] = await bucket.exists();
      if (exists) return bucket;
    } catch (_err) {
      // Try next candidate.
    }
  }
  return null;
}

const isLoopbackOrPrivateHost = (host) => {
  const normalized = String(host || "").trim().toLowerCase();
  if (!normalized) return false;
  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized === "[::1]"
  ) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  const match172 = normalized.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (match172) {
    const second = Number(match172[1]);
    return second >= 16 && second <= 31;
  }
  return false;
};

const normalizeRelativeUploadPath = (rawPathname) => {
  const normalized = String(rawPathname || "").replace(/\\/g, "/");
  const marker = "/uploads/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) return "";
  const relative = decodeURIComponent(normalized.slice(markerIndex + marker.length))
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
  return relative;
};

const extractLocalUploadPath = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (raw.startsWith("/uploads/")) {
    return normalizeRelativeUploadPath(raw);
  }

  try {
    const parsed = new URL(raw);
    if (!isLoopbackOrPrivateHost(parsed.hostname)) return "";
    return normalizeRelativeUploadPath(parsed.pathname);
  } catch (_err) {
    return "";
  }
};

const buildDownloadUrl = ({ bucketName, objectPath, token }) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;

const toContentType = (relativePath) => {
  const ext = path.extname(relativePath).toLowerCase();
  return MIME_BY_EXTENSION[ext] || "application/octet-stream";
};

const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === "[object Object]" &&
  (value.constructor === Object || value.constructor == null);

const readFirstToken = (metadata) => {
  const raw = String(metadata?.metadata?.firebaseStorageDownloadTokens || "").trim();
  if (!raw) return "";
  return raw.split(",").map((token) => token.trim()).filter(Boolean)[0] || "";
};

async function ensureStorageUrl(bucket, relativePath, cache) {
  if (!relativePath) return "";
  if (cache.has(relativePath)) return cache.get(relativePath);

  const objectPath = relativePath.replace(/\\/g, "/");
  const file = bucket.file(objectPath);
  const [exists] = await file.exists();

  let token = "";
  if (exists) {
    const [metadata] = await file.getMetadata();
    token = readFirstToken(metadata);
    if (!token) {
      token = crypto.randomUUID();
      await file.setMetadata({
        metadata: {
          ...(metadata?.metadata || {}),
          firebaseStorageDownloadTokens: token
        }
      });
    }
    const existingUrl = buildDownloadUrl({ bucketName: bucket.name, objectPath, token });
    cache.set(relativePath, existingUrl);
    return existingUrl;
  }

  const absolutePath = path.join(LOCAL_UPLOADS_DIR, ...relativePath.split("/"));
  try {
    await fs.access(absolutePath);
  } catch (_err) {
    cache.set(relativePath, "");
    return "";
  }

  const fileBuffer = await fs.readFile(absolutePath);
  token = crypto.randomUUID();
  await file.save(fileBuffer, {
    resumable: false,
    metadata: {
      contentType: toContentType(relativePath),
      cacheControl: "private,max-age=0",
      metadata: {
        firebaseStorageDownloadTokens: token
      }
    }
  });

  const uploadedUrl = buildDownloadUrl({ bucketName: bucket.name, objectPath, token });
  cache.set(relativePath, uploadedUrl);
  return uploadedUrl;
}

async function rewriteNode(node, context) {
  if (typeof node === "string") {
    const relativePath = extractLocalUploadPath(node);
    if (!relativePath) {
      return { changed: false, value: node };
    }
    const storageUrl = await ensureStorageUrl(context.bucket, relativePath, context.urlCache);
    if (!storageUrl) {
      context.missingLocalFiles.add(relativePath);
      return { changed: false, value: node };
    }
    context.migratedPaths.add(relativePath);
    return { changed: storageUrl !== node, value: storageUrl };
  }

  if (Array.isArray(node)) {
    let changed = false;
    const next = [];
    for (const item of node) {
      const rewritten = await rewriteNode(item, context);
      changed = changed || rewritten.changed;
      next.push(rewritten.value);
    }
    return { changed, value: next };
  }

  if (!isPlainObject(node)) {
    return { changed: false, value: node };
  }

  let changed = false;
  const next = {};
  for (const [key, value] of Object.entries(node)) {
    const rewritten = await rewriteNode(value, context);
    changed = changed || rewritten.changed;
    next[key] = rewritten.value;
  }
  return { changed, value: next };
}

async function run() {
  const bucket = await resolveExistingBucket();
  if (!bucket?.name) {
    throw new Error("No existing Firebase Storage bucket found from configured candidates.");
  }

  const snap = await adminDb.collection(USERS_COLLECTION).get();
  if (snap.empty) {
    console.log("No users found. Nothing to migrate.");
    return;
  }

  const urlCache = new Map();
  const missingLocalFiles = new Set();
  const migratedPaths = new Set();
  let changedUsers = 0;

  for (const docSnap of snap.docs) {
    const context = {
      bucket,
      urlCache,
      missingLocalFiles,
      migratedPaths
    };
    const original = docSnap.data() || {};
    const rewritten = await rewriteNode(original, context);
    if (!rewritten.changed) continue;
    await docSnap.ref.set(rewritten.value, { merge: false });
    changedUsers += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        bucket: bucket.name,
        usersScanned: snap.size,
        usersUpdated: changedUsers,
        uniquePathsMigrated: migratedPaths.size,
        missingLocalFiles: [...missingLocalFiles]
      },
      null,
      2
    )
  );
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
