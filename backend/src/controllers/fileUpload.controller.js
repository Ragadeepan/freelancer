import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { adminApp, adminStorage } from "../config/firebaseAdmin.js";
import { HttpError } from "../utils/httpError.js";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const RESUME_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);
const GOV_ID_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpg",
  "image/pjpeg",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/heic",
  "image/heif"
]);
const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpg",
  "image/pjpeg",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/heic",
  "image/heif"
]);
const IMAGE_MIME_TYPES = new Set([
  "image/jpg",
  "image/pjpeg",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/heic",
  "image/heif"
]);

const RESUME_EXTENSIONS = new Set([".pdf", ".doc", ".docx"]);
const GOV_ID_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".jfif",
  ".png",
  ".webp",
  ".avif",
  ".bmp",
  ".heic",
  ".heif"
]);
const DOCUMENT_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".jpg",
  ".jpeg",
  ".jfif",
  ".png",
  ".webp",
  ".avif",
  ".bmp",
  ".heic",
  ".heif"
]);
const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".jfif",
  ".png",
  ".webp",
  ".avif",
  ".bmp",
  ".heic",
  ".heif"
]);
const ENABLE_LOCAL_UPLOAD_FALLBACK =
  String(
    process.env.ENABLE_LOCAL_UPLOAD_FALLBACK ??
      (String(process.env.NODE_ENV || "").trim().toLowerCase() === "production"
        ? "false"
        : "true")
  )
    .trim()
    .toLowerCase() !== "false";
const CONTROLLER_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT_DIR = path.resolve(CONTROLLER_DIR, "..", "..");
const LOCAL_UPLOADS_DIR = path.join(BACKEND_ROOT_DIR, "uploads");

const sanitizeFileName = (value) => {
  const cleaned = String(value || "file")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[\\/#?[\]*:%<>|"]/g, "_")
    .replace(/[^\w.\-()]/g, "_");
  return cleaned || "file";
};

const normalizeBucketName = (value) => {
  const clean = String(value || "").trim().replace(/^gs:\/\//i, "");
  if (!clean) return "";
  const slashIndex = clean.indexOf("/");
  return slashIndex >= 0 ? clean.slice(0, slashIndex) : clean;
};

const isLoopbackHost = (value) => {
  const host = String(value || "").trim().toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
};

const getBucketCandidates = () => {
  const configured = normalizeBucketName(
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.VITE_FIREBASE_STORAGE_BUCKET ||
    adminApp.options.storageBucket
  );
  const projectId = String(
    adminApp.options.projectId ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    ""
  ).trim();

  const buckets = [];
  const seen = new Set();

  const add = (value) => {
    const bucket = normalizeBucketName(value);
    if (!bucket || seen.has(bucket)) return;
    seen.add(bucket);
    buckets.push(bucket);
  };

  add(configured);

  if (configured.endsWith(".firebasestorage.app")) {
    add(configured.replace(/\.firebasestorage\.app$/, ".appspot.com"));
  }
  if (configured.endsWith(".appspot.com")) {
    add(configured.replace(/\.appspot\.com$/, ".firebasestorage.app"));
  }

  if (projectId) {
    add(`${projectId}.appspot.com`);
    add(`${projectId}.firebasestorage.app`);
  }

  return buckets;
};

const buildDownloadUrl = ({ bucketName, objectPath, token }) => {
  const encodedPath = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;
};

const getBackendPublicBaseUrl = (req) => {
  const configured = String(process.env.BACKEND_PUBLIC_URL || "").trim();
  if (configured) {
    try {
      const configuredUrl = new URL(configured);
      if (req && isLoopbackHost(configuredUrl.hostname)) {
        const forwardedHost = String(req.headers?.["x-forwarded-host"] || "")
          .split(",")[0]
          .trim();
        const reqHost = forwardedHost || String(req.get("host") || "").trim();
        const reqHostName = String(reqHost).split(":")[0].trim().toLowerCase();
        if (reqHost && reqHostName && !isLoopbackHost(reqHostName)) {
          const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "")
            .split(",")[0]
            .trim();
          const protocol = forwardedProto || req.protocol || configuredUrl.protocol;
          configuredUrl.protocol = String(protocol).endsWith(":") ? protocol : `${protocol}:`;
          configuredUrl.host = reqHost;
          return configuredUrl.toString().replace(/\/+$/, "");
        }
      }
    } catch (_err) {
      // Use raw configured value when URL parsing fails.
    }
    return configured.replace(/\/+$/, "");
  }
  if (req) {
    const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim();
    const proto = forwardedProto || req.protocol || "http";
    const forwardedHost = String(req.headers?.["x-forwarded-host"] || "")
      .split(",")[0]
      .trim();
    const host = forwardedHost || String(req.get("host") || "").trim();
    if (host) {
      return `${proto}://${host}`;
    }
  }
  const port = Number(process.env.PORT) || 4000;
  return `http://localhost:${port}`;
};

const saveFileLocally = async ({ req, localFolder, uid, safeName, fileBuffer }) => {
  const relativePath = path.posix.join(localFolder, uid, `${Date.now()}-${safeName}`);
  const absolutePath = path.join(LOCAL_UPLOADS_DIR, ...relativePath.split("/"));
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, fileBuffer);

  return {
    bucket: "local-dev",
    path: relativePath,
    url: `${getBackendPublicBaseUrl(req)}/uploads/${relativePath}`
  };
};

const mapUploadFailure = (err, bucketCandidates, documentLabel = "File") => {
  const message = String(err?.message || "").trim();
  const messageLower = message.toLowerCase();
  const code = Number(err?.code || 0);

  if (messageLower.includes("the specified bucket does not exist")) {
    return new HttpError(
      400,
      "Storage bucket not found. Enable Firebase Storage and set FIREBASE_STORAGE_BUCKET correctly.",
      { code: code || null, reason: message, bucketsTried: bucketCandidates }
    );
  }

  if (
    messageLower.includes("billing account") &&
    (messageLower.includes("disabled") || messageLower.includes("absent"))
  ) {
    return new HttpError(
      400,
      "Storage billing is disabled. Enable billing for the project and create a Storage bucket.",
      { code: code || null, reason: message, bucketsTried: bucketCandidates }
    );
  }

  if (code === 403 || messageLower.includes("permission")) {
    return new HttpError(
      403,
      "Storage permission denied for service account. Check IAM roles for Cloud Storage.",
      { code: code || null, reason: message }
    );
  }

  if (code === 401) {
    return new HttpError(401, "Service account authentication failed for Storage.", {
      code: code || null,
      reason: message
    });
  }

  return new HttpError(
    500,
    process.env.NODE_ENV === "production"
      ? `${documentLabel} upload failed.`
      : `${documentLabel} upload failed: ${message || "unknown error"}`,
    { code: code || null, reason: message || "unknown error", bucketsTried: bucketCandidates }
  );
};

async function uploadToBucket({ bucketName, objectPath, file }) {
  const bucket = adminStorage.bucket(bucketName);
  const object = bucket.file(objectPath);
  const token = crypto.randomUUID();

  await object.save(file.buffer, {
    resumable: false,
    validation: "md5",
    metadata: {
      contentType: file.mimetype || "application/octet-stream",
      cacheControl: "private,max-age=0",
      metadata: {
        firebaseStorageDownloadTokens: token
      }
    }
  });

  return {
    bucket: bucket.name,
    path: objectPath,
    url: buildDownloadUrl({
      bucketName: bucket.name,
      objectPath,
      token
    })
  };
}

function validateFile({
  file,
  mimeTypes,
  extensions,
  missingMessage,
  sizeMessage,
  formatMessage
}) {
  if (!file) {
    throw new HttpError(400, missingMessage);
  }
  if (Number(file.size || 0) > MAX_FILE_SIZE) {
    throw new HttpError(400, sizeMessage);
  }

  const ext = String(path.extname(file.originalname || "") || "").toLowerCase();
  const mime = String(file.mimetype || "").toLowerCase();
  const mimeValid = mimeTypes.has(mime);
  const extValid = extensions.has(ext);

  if (!mimeValid && !extValid) {
    throw new HttpError(400, formatMessage);
  }
}

async function uploadDocument({
  req,
  res,
  folder,
  localFolder,
  documentLabel,
  validation
}) {
  const uid = String(req.user?.uid || "").trim();
  if (!uid) {
    throw new HttpError(401, "Authentication required.");
  }

  validateFile({ file: req.file, ...validation });

  const safeName = sanitizeFileName(req.file.originalname);
  const objectPath = `${folder}/${uid}/${Date.now()}-${safeName}`;
  const bucketCandidates = getBucketCandidates();

  if (bucketCandidates.length === 0) {
    throw new HttpError(400, "Storage bucket is not configured on backend.");
  }

  let lastError = null;
  for (const bucketName of bucketCandidates) {
    try {
      const result = await uploadToBucket({
        bucketName,
        objectPath,
        file: req.file
      });
      res.status(201).json({
        ok: true,
        name: req.file.originalname,
        ...result
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  if (ENABLE_LOCAL_UPLOAD_FALLBACK) {
    try {
      const localResult = await saveFileLocally({
        req,
        localFolder,
        uid,
        safeName,
        fileBuffer: req.file.buffer
      });
      res.status(201).json({
        ok: true,
        name: req.file.originalname,
        ...localResult
      });
      return;
    } catch (localError) {
      throw new HttpError(
        500,
        process.env.NODE_ENV === "production"
          ? `${documentLabel} upload failed.`
          : `${documentLabel} upload failed (cloud + local fallback): ${localError?.message || "unknown error"}`,
        {
          cloudReason: String(lastError?.message || "unknown cloud error"),
          localReason: String(localError?.message || "unknown local error"),
          bucketsTried: bucketCandidates
        }
      );
    }
  }

  throw mapUploadFailure(lastError, bucketCandidates, documentLabel);
}

export async function uploadResume(req, res, next) {
  try {
    await uploadDocument({
      req,
      res,
      folder: "userResumes",
      localFolder: "userResumes",
      documentLabel: "Resume",
      validation: {
        mimeTypes: RESUME_MIME_TYPES,
        extensions: RESUME_EXTENSIONS,
        missingMessage: "Select a resume file to upload.",
        sizeMessage: "Resume must be 20MB or smaller.",
        formatMessage: "Upload PDF, DOC, or DOCX format."
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadGovId(req, res, next) {
  try {
    await uploadDocument({
      req,
      res,
      folder: "userGovIds",
      localFolder: "userGovIds",
      documentLabel: "Government ID",
      validation: {
        mimeTypes: GOV_ID_MIME_TYPES,
        extensions: GOV_ID_EXTENSIONS,
        missingMessage: "Select a Government ID file to upload.",
        sizeMessage: "Government ID file must be 20MB or smaller.",
        formatMessage: "Upload PDF, JPG, JFIF, PNG, WEBP, AVIF, BMP, HEIC, or HEIF format."
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadClientGovId(req, res, next) {
  try {
    await uploadDocument({
      req,
      res,
      folder: "userClientGovIds",
      localFolder: "userClientGovIds",
      documentLabel: "Client Government ID",
      validation: {
        mimeTypes: GOV_ID_MIME_TYPES,
        extensions: GOV_ID_EXTENSIONS,
        missingMessage: "Select a client Government ID file to upload.",
        sizeMessage: "Client Government ID file must be 20MB or smaller.",
        formatMessage: "Upload PDF, JPG, JFIF, PNG, WEBP, AVIF, BMP, HEIC, or HEIF format."
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadClientDocument(req, res, next) {
  try {
    await uploadDocument({
      req,
      res,
      folder: "userClientDocuments",
      localFolder: "userClientDocuments",
      documentLabel: "Client document",
      validation: {
        mimeTypes: DOCUMENT_MIME_TYPES,
        extensions: DOCUMENT_EXTENSIONS,
        missingMessage: "Select a client document to upload.",
        sizeMessage: "Client document must be 20MB or smaller.",
        formatMessage: "Upload PDF, DOC, DOCX, JPG, JFIF, PNG, WEBP, AVIF, BMP, HEIC, or HEIF format."
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadProfilePicture(req, res, next) {
  try {
    await uploadDocument({
      req,
      res,
      folder: "profilePictures",
      localFolder: "profilePictures",
      documentLabel: "Profile picture",
      validation: {
        mimeTypes: IMAGE_MIME_TYPES,
        extensions: IMAGE_EXTENSIONS,
        missingMessage: "Select a profile picture to upload.",
        sizeMessage: "Profile picture must be 20MB or smaller.",
        formatMessage: "Upload JPG, JFIF, PNG, WEBP, AVIF, BMP, HEIC, or HEIF format."
      }
    });
  } catch (error) {
    next(error);
  }
}
