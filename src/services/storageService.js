import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
  uploadBytesResumable
} from "firebase/storage";
import { app, auth, storage } from "../firebase/firebase.js";
import { isLoopbackHost, resolveFileUrl } from "../utils/fileUrl.js";

const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;
const SIMPLE_UPLOAD_MAX_BYTES = MAX_UPLOAD_SIZE_BYTES;
const MAX_STORAGE_TARGETS = 2;
const STALL_TIMEOUT_MS = 12000;
const PROGRESS_STALL_TIMEOUT_MS = 20000;
const RESUMABLE_FINALIZE_TIMEOUT_MS = 15000;
const BACKEND_UPLOAD_TIMEOUT_MS = 90000;
const SIMPLE_UPLOAD_TIMEOUT_MS = 180000;
const BACKEND_RESPONSE_WAIT_MS = 15000;
const BACKEND_RETRY_DELAY_MS = 250;
const UPLOAD_STRATEGY = String(import.meta.env.VITE_UPLOAD_STRATEGY || "client-first")
  .trim()
  .toLowerCase();
const RAW_API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").trim();
const DEV_FRONTEND_PORTS = new Set(["5173", "4173", "3000"]);
const RETRYABLE_UPLOAD_CODES = new Set([
  "storage/unknown",
  "storage/retry-limit-exceeded",
  "storage/invalid-default-bucket",
  "storage/no-default-bucket",
  "storage/upload-stalled"
]);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

const isFirebaseHostingHost = (value) => {
  const host = String(value || "").trim().toLowerCase();
  return host.endsWith(".web.app") || host.endsWith(".firebaseapp.com");
};

const getCurrentAuthUser = async (timeoutMs = 8000) => {
  if (auth.currentUser) return auth.currentUser;
  const startedAt = Date.now();
  while (!auth.currentUser && Date.now() - startedAt < timeoutMs) {
    await delay(100);
  }
  return auth.currentUser;
};

const getApiBaseUrl = () => {
  if (typeof window === "undefined") {
    return RAW_API_BASE_URL ? normalizeBaseUrl(RAW_API_BASE_URL) : "";
  }

  if (RAW_API_BASE_URL) {
    try {
      const parsed = new URL(RAW_API_BASE_URL, window.location.origin);
      const currentHost = String(window.location?.hostname || "").trim().toLowerCase();
      if (isLoopbackHost(parsed.hostname) && !isLoopbackHost(currentHost)) {
        parsed.hostname = currentHost;
      }
      return normalizeBaseUrl(parsed.toString());
    } catch (_err) {
      return normalizeBaseUrl(RAW_API_BASE_URL);
    }
  }

  const currentHost = String(window.location?.hostname || "").trim().toLowerCase();
  const currentPort = String(window.location?.port || "").trim();
  const currentProtocol = String(window.location?.protocol || "http:").trim();
  const currentOrigin = normalizeBaseUrl(window.location?.origin || "");

  if (isLoopbackHost(currentHost)) return "http://localhost:4000";
  if (DEV_FRONTEND_PORTS.has(currentPort)) {
    return `${currentProtocol}//${currentHost}:4000`;
  }
  return currentOrigin;
};

const shouldUseBackendUpload = (apiBaseUrl) => {
  const normalizedBase = String(apiBaseUrl || "").trim();
  if (!normalizedBase) return false;
  if (typeof window === "undefined") return true;

  try {
    const backendHost = new URL(normalizedBase, window.location.origin).hostname.toLowerCase();
    const backendOrigin = new URL(normalizedBase, window.location.origin).origin;
    const frontendOrigin = String(window.location?.origin || "").trim();
    const frontendHost = String(window.location?.hostname || "").trim().toLowerCase();
    if (isLoopbackHost(backendHost) && !isLoopbackHost(frontendHost)) {
      return false;
    }
    if (
      !RAW_API_BASE_URL &&
      backendOrigin === frontendOrigin &&
      !isLoopbackHost(frontendHost)
    ) {
      return false;
    }
    if (
      !RAW_API_BASE_URL &&
      backendOrigin === frontendOrigin &&
      isFirebaseHostingHost(frontendHost)
    ) {
      return false;
    }
    return true;
  } catch (_err) {
    return false;
  }
};

const shouldPreferClientUpload = () => UPLOAD_STRATEGY !== "backend-first";

const EXTENSION_TO_MIME = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  zip: "application/zip",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif"
};

const sanitizeFileName = (value) => {
  const cleaned = String(value || "file")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[\\/#?[\]*:%<>|"]/g, "_")
    .replace(/[^\w.\-()]/g, "_");
  return cleaned || "file";
};

const inferContentType = (file) => {
  const typed = String(file?.type || "").trim();
  if (typed) return typed;
  const ext = String(file?.name || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  return EXTENSION_TO_MIME[ext] || "application/octet-stream";
};

const buildUploadMetadata = (file) => ({
  contentType: inferContentType(file),
  cacheControl: "private,max-age=0"
});

const buildUploadPath = (basePath, ownerId, fileName) => {
  const id = String(ownerId || "").trim();
  const safeName = sanitizeFileName(fileName);
  return `${basePath}/${id}/${Date.now()}-${safeName}`;
};

const buildContractWorkspacePath = (contractId, section, fileName) => {
  const safeContractId = sanitizeFileName(contractId || "contract");
  const safeSection = sanitizeFileName(section || "files");
  const safeName = sanitizeFileName(fileName);
  return `contracts/${safeContractId}/${safeSection}/${Date.now()}-${safeName}`;
};

const ensureUploadInputs = ({ ownerId, file, ownerLabel }) => {
  if (!ownerId) {
    throw new Error(`Missing ${ownerLabel} id. Sign in again and retry.`);
  }
  if (!file) {
    throw new Error("Select a file to upload.");
  }
  if (Number(file.size || 0) > MAX_UPLOAD_SIZE_BYTES) {
    throw createStorageError(
      "storage/file-too-large",
      "File is too large. Maximum allowed size is 20MB."
    );
  }
};

const buildBucketCandidates = () => {
  const configuredBucket = String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "").trim();
  const projectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim();
  const buckets = [];

  const add = (value) => {
    const bucket = String(value || "").trim();
    if (!bucket || buckets.includes(bucket)) return;
    buckets.push(bucket);
  };

  add(configuredBucket);

  if (configuredBucket.endsWith(".firebasestorage.app")) {
    add(configuredBucket.replace(/\.firebasestorage\.app$/, ".appspot.com"));
  }
  if (configuredBucket.endsWith(".appspot.com")) {
    add(configuredBucket.replace(/\.appspot\.com$/, ".firebasestorage.app"));
  }

  if (projectId && buckets.length === 0) {
    add(`${projectId}.firebasestorage.app`);
    add(`${projectId}.appspot.com`);
  }

  return buckets.slice(0, MAX_STORAGE_TARGETS);
};

const createStorageTargets = () => {
  const targets = [];
  const seen = new Set();
  const defaultBucket = String(app?.options?.storageBucket || "").trim();

  const addTarget = (instance, bucketLabel) => {
    const key = String(bucketLabel || "__default__").trim() || "__default__";
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({ instance, bucketLabel: key });
  };

  addTarget(storage, defaultBucket || "__default__");

  for (const bucket of buildBucketCandidates()) {
    if (targets.length >= MAX_STORAGE_TARGETS) break;
    if (!bucket || bucket === defaultBucket) continue;
    try {
      addTarget(getStorage(app, `gs://${bucket}`), bucket);
    } catch (_err) {
      // Ignore invalid fallback bucket strings and continue with available targets.
    }
  }

  return targets;
};

const STORAGE_TARGETS = createStorageTargets();
let preferredStorageTargetKey = STORAGE_TARGETS[0]?.bucketLabel || "__default__";

const getOrderedStorageTargets = () => {
  if (!preferredStorageTargetKey) return STORAGE_TARGETS;
  const preferred = STORAGE_TARGETS.find(
    (target) => target.bucketLabel === preferredStorageTargetKey
  );
  if (!preferred) return STORAGE_TARGETS;
  const rest = STORAGE_TARGETS.filter(
    (target) => target.bucketLabel !== preferredStorageTargetKey
  );
  return [preferred, ...rest];
};

const toUploadPercent = (snapshot) => {
  const total = Number(snapshot?.totalBytes || 0);
  if (!total) return 0;
  const transferred = Number(snapshot?.bytesTransferred || 0);
  return Math.min(100, Math.round((transferred / total) * 100));
};

const createStorageError = (code, message) => {
  const err = new Error(message);
  err.code = code;
  return err;
};

const withTimeout = async ({ promise, timeoutMs, timeoutError }) => {
  let timeoutId = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(timeoutError), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
    }
  }
};

const getBackendAuthToken = async (forceRefresh = false) => {
  const user = await getCurrentAuthUser();
  if (!user) {
    throw createStorageError("storage/unauthenticated", "Sign in again and retry upload.");
  }

  try {
    return await user.getIdToken(forceRefresh);
  } catch (err) {
    const code = String(err?.code || "").trim();
    const cachedAccessToken = String(user.accessToken || "").trim();
    if (!forceRefresh && code === "auth/network-request-failed" && cachedAccessToken) {
      return cachedAccessToken;
    }
    if (code) throw err;
    throw createStorageError(
      "auth/network-request-failed",
      "Network issue while validating sign-in."
    );
  }
};

const parseJsonSafely = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch (_err) {
    return null;
  }
};

const sendBackendUploadRequest = ({ apiBaseUrl, endpoint, file, onProgress, token }) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let responseWaitTimer = null;

    const clearResponseWait = () => {
      if (responseWaitTimer != null) {
        clearTimeout(responseWaitTimer);
        responseWaitTimer = null;
      }
    };

    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      clearResponseWait();
      resolve(value);
    };

    const finishReject = (err) => {
      if (settled) return;
      settled = true;
      clearResponseWait();
      reject(err);
    };

    xhr.open("POST", `${apiBaseUrl}${endpoint}`);
    xhr.timeout = BACKEND_UPLOAD_TIMEOUT_MS;
    xhr.responseType = "json";
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    if (typeof onProgress === "function") {
      onProgress(0);
    }

    xhr.upload.onprogress = (event) => {
      if (typeof onProgress !== "function") return;
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onProgress(percent);
        if (percent >= 100 && responseWaitTimer == null) {
          responseWaitTimer = setTimeout(() => {
            try {
              xhr.abort();
            } catch (_err) {
              // no-op
            }
            finishReject(
              createStorageError(
                "upload/backend-timeout",
                "Upload reached server but API did not finish response. Check backend deployment and retry."
              )
            );
          }, BACKEND_RESPONSE_WAIT_MS);
        }
      }
    };

    xhr.onload = () => {
      const payload = parseJsonSafely(xhr.response) || parseJsonSafely(xhr.responseText);
      const contentType = String(xhr.getResponseHeader("content-type") || "").toLowerCase();
      if (xhr.status >= 200 && xhr.status < 300 && payload?.ok !== false && payload?.url) {
        if (typeof onProgress === "function") {
          onProgress(100);
        }
        finishResolve(resolveFileUrl(payload.url, { apiBaseUrl }));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300 && !payload?.url && contentType.includes("text/html")) {
        const err = createStorageError(
          "upload/backend-disabled",
          "Upload API route is not configured for this domain."
        );
        err.status = xhr.status;
        finishReject(err);
        return;
      }

      const message =
        payload?.details?.reason ||
        payload?.debug ||
        payload?.message ||
        payload?.error ||
        `Upload API request failed with status ${xhr.status}.`;
      const status = Number(xhr.status || 0);
      const code =
        status === 401 || status === 403
          ? "upload/backend-unauthorized"
          : "upload/backend-failed";
      const err = createStorageError(code, message);
      err.status = xhr.status;
      finishReject(err);
    };

    xhr.onerror = () => {
      finishReject(
        createStorageError(
          "upload/backend-network",
          "Cannot reach upload API. Check backend server and network."
        )
      );
    };

    xhr.ontimeout = () => {
      finishReject(
        createStorageError(
          "upload/backend-timeout",
          "Upload API timed out. Please retry."
        )
      );
    };

    xhr.onabort = () => {
      if (settled) return;
      finishReject(
        createStorageError(
          "upload/backend-timeout",
          "Upload API request was aborted before completion."
        )
      );
    };

    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });

const uploadViaBackend = async ({ endpoint, file, onProgress }) => {
  const apiBaseUrl = getApiBaseUrl();
  if (!shouldUseBackendUpload(apiBaseUrl)) {
    throw createStorageError(
      "upload/backend-disabled",
      "Backend upload is not configured for this environment."
    );
  }

  const token = await getBackendAuthToken(false);
  try {
    return await sendBackendUploadRequest({
      apiBaseUrl,
      endpoint,
      file,
      onProgress,
      token
    });
  } catch (err) {
    const code = String(err?.code || "").trim();
    const status = Number(err?.status || 0);
    const shouldRetry =
      code === "upload/backend-network" ||
      code === "upload/backend-timeout" ||
      (code === "upload/backend-failed" && (status === 429 || status >= 500));

    if (shouldRetry) {
      await delay(BACKEND_RETRY_DELAY_MS);
      return sendBackendUploadRequest({
        apiBaseUrl,
        endpoint,
        file,
        onProgress,
        token
      });
    }

    if (code !== "upload/backend-unauthorized") {
      throw err;
    }
  }

  const refreshedToken = await getBackendAuthToken(true);
  return sendBackendUploadRequest({
    apiBaseUrl,
    endpoint,
    file,
    onProgress,
    token: refreshedToken
  });
};

const shouldFallbackToClientUpload = (err) => {
  const code = String(err?.code || "").trim();
  const status = Number(err?.status || 0);
  return (
    code === "upload/backend-disabled" ||
    code === "auth/network-request-failed" ||
    code === "upload/backend-network" ||
    code === "upload/backend-timeout" ||
    code === "upload/backend-unauthorized" ||
    (code === "upload/backend-failed" &&
      (status === 0 || status === 200 || status === 404 || status === 405 || status >= 500))
  );
};

const shouldFallbackToBackendUpload = (err) => {
  const code = String(err?.code || "").trim();
  if (!code) return true;
  if (code.startsWith("upload/backend-")) return false;
  if (
    code === "storage/file-too-large" ||
    code === "storage/canceled" ||
    code === "storage/unauthenticated"
  ) {
    return false;
  }
  return true;
};

const isRetryableUploadError = (err) => {
  const code = String(err?.code || "").trim();
  if (RETRYABLE_UPLOAD_CODES.has(code)) return true;
  const raw = String(err?.message || "").toLowerCase();
  if (!raw) return false;
  return /cors|network|xmlhttprequest|xhr|bucket|default-bucket|object-not-found/.test(raw);
};

const uploadWithTarget = ({ storageInstance, path, file, onProgress }) => {
  const fileRef = ref(storageInstance, path);
  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(fileRef, file, buildUploadMetadata(file));
    const startedAt = Date.now();
    let bytesUploaded = 0;
    let lastProgressAt = Date.now();
    let settled = false;
    let finalizeTimer = null;

    const clearFinalizeTimer = () => {
      if (finalizeTimer == null) return;
      clearTimeout(finalizeTimer);
      finalizeTimer = null;
    };

    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      clearInterval(stallTimer);
      clearFinalizeTimer();
      handler(value);
    };

    if (typeof onProgress === "function") {
      onProgress(0);
    }

    const armFinalizeTimer = () => {
      if (finalizeTimer != null || settled) return;
      finalizeTimer = setTimeout(() => {
        try {
          uploadTask.cancel();
        } catch (_err) {
          // no-op
        }
        finish(
          reject,
          createStorageError(
            "storage/upload-stalled",
            "Upload reached 100% but finalization timed out. Retry upload."
          )
        );
      }, RESUMABLE_FINALIZE_TIMEOUT_MS);
    };

    const stallTimer = setInterval(() => {
      if (settled) return;
      const elapsed = Date.now() - startedAt;
      if (bytesUploaded <= 0) {
        if (elapsed < STALL_TIMEOUT_MS) return;
        uploadTask.cancel();
        finish(
          reject,
          createStorageError(
            "storage/upload-stalled",
            "Upload did not start in time. Check internet or storage bucket configuration."
          )
        );
        return;
      }
      if (finalizeTimer != null) return;
      if (Date.now() - lastProgressAt < PROGRESS_STALL_TIMEOUT_MS) return;
      uploadTask.cancel();
      finish(
        reject,
        createStorageError(
          "storage/upload-stalled",
          "Upload stalled before completion. Retry upload."
        )
      );
    }, 1000);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        bytesUploaded = Math.max(bytesUploaded, Number(snapshot?.bytesTransferred || 0));
        lastProgressAt = Date.now();
        const percent = toUploadPercent(snapshot);
        if (typeof onProgress === "function") {
          onProgress(percent);
        }
        if (percent >= 100) {
          armFinalizeTimer();
        }
      },
      (err) => {
        finish(reject, err);
      },
      async () => {
        try {
          if (typeof onProgress === "function") {
            onProgress(100);
          }
          const url = await withTimeout({
            promise: getDownloadURL(uploadTask.snapshot.ref),
            timeoutMs: RESUMABLE_FINALIZE_TIMEOUT_MS,
            timeoutError: createStorageError(
              "storage/retry-limit-exceeded",
              "Uploaded file URL retrieval timed out. Please retry."
            )
          });
          finish(resolve, url);
        } catch (err) {
          finish(reject, err);
        }
      }
    );
  });
};

const uploadSimpleWithTarget = async ({ storageInstance, path, file, onProgress }) => {
  const fileRef = ref(storageInstance, path);
  if (typeof onProgress === "function") {
    onProgress(5);
  }
  await withTimeout({
    promise: uploadBytes(fileRef, file, buildUploadMetadata(file)),
    timeoutMs: SIMPLE_UPLOAD_TIMEOUT_MS,
    timeoutError: createStorageError(
      "storage/upload-stalled",
      "Upload did not finish in time. Check internet or storage bucket configuration."
    )
  });
  if (typeof onProgress === "function") {
    onProgress(95);
  }
  const url = await withTimeout({
    promise: getDownloadURL(fileRef),
    timeoutMs: SIMPLE_UPLOAD_TIMEOUT_MS,
    timeoutError: createStorageError(
      "storage/retry-limit-exceeded",
      "Uploaded file URL retrieval timed out. Please retry."
    )
  });
  if (typeof onProgress === "function") {
    onProgress(100);
  }
  return url;
};

const uploadAtPath = async ({ path, file, onProgress }) => {
  let lastError = null;
  const targets = getOrderedStorageTargets();
  const fileSize = Number(file?.size || 0);
  const preferSimpleUpload = fileSize > 0 && fileSize <= SIMPLE_UPLOAD_MAX_BYTES;

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    try {
      if (preferSimpleUpload) {
        const url = await uploadSimpleWithTarget({
          storageInstance: target.instance,
          path,
          file,
          onProgress
        });
        preferredStorageTargetKey = target.bucketLabel;
        return url;
      }

      try {
        const url = await uploadWithTarget({
          storageInstance: target.instance,
          path,
          file,
          onProgress
        });
        preferredStorageTargetKey = target.bucketLabel;
        return url;
      } catch (resumableError) {
        if (!isRetryableUploadError(resumableError)) {
          throw resumableError;
        }
        const url = await uploadSimpleWithTarget({
          storageInstance: target.instance,
          path,
          file,
          onProgress
        });
        preferredStorageTargetKey = target.bucketLabel;
        return url;
      }
    } catch (err) {
      lastError = err;
      const hasFallback = index < targets.length - 1;
      if (!hasFallback || !isRetryableUploadError(err)) {
        throw err;
      }
    }
  }

  throw lastError || new Error("Failed to upload file.");
};

export function getStorageUploadErrorMessage(
  err,
  fallback = "Failed to upload file."
) {
  const code = String(err?.code || "").trim();
  const raw = String(err?.message || "").trim();
  const rawLower = raw.toLowerCase();

  if (code === "storage/unauthenticated") {
    return "Sign in again and retry upload.";
  }
  if (code === "auth/network-request-failed") {
    return "Network issue while validating sign-in. Check internet/VPN and retry.";
  }
  if (code === "auth/user-token-expired") {
    return "Session expired. Please log in again and retry upload.";
  }
  if (code === "upload/backend-network") {
    return "Upload API is unreachable. Start backend and retry.";
  }
  if (code === "upload/backend-disabled") {
    return "Upload API route is not configured for this domain. Falling back to Firebase Storage upload.";
  }
  if (code === "upload/backend-timeout") {
    return "Upload API timed out. Retry upload.";
  }
  if (code === "upload/backend-unauthorized") {
    return "Backend rejected sign-in token. Check backend Firebase credentials and retry.";
  }
  if (code === "upload/backend-failed") {
    return raw || "Upload API rejected the file.";
  }
  if (code === "storage/unauthorized") {
    return "Upload blocked. You do not have permission for this file.";
  }
  if (code === "storage/canceled") {
    return "Upload was canceled.";
  }
  if (code === "storage/quota-exceeded") {
    return "Storage quota exceeded. Contact support.";
  }
  if (code === "storage/retry-limit-exceeded") {
    return "Upload timed out. Check your internet and try again.";
  }
  if (code === "storage/upload-stalled") {
    return "Upload is taking too long. Check internet and Firebase storage bucket config, then retry.";
  }
  if (code === "storage/invalid-checksum") {
    return "Upload failed due to file mismatch. Please retry.";
  }
  if (
    code === "storage/no-default-bucket" ||
    code === "storage/invalid-default-bucket"
  ) {
    return "Storage bucket is not configured. Check VITE_FIREBASE_STORAGE_BUCKET.";
  }
  if (/billing account .*disabled|accountdisabled|upgrade to the blaze|blaze plan/i.test(rawLower)) {
    return "Firebase Storage requires an active billing account for this project. Enable billing (Blaze) and retry.";
  }
  if (/storage has not been set up|bucket .*does not exist|no such bucket/.test(rawLower)) {
    return "Firebase Storage is not enabled for this project. Enable it in Firebase Console and retry.";
  }
  if (/Missing or insufficient permissions/i.test(raw)) {
    return "Upload blocked by storage rules for this account.";
  }
  if (/file too large|limit_file_size/i.test(rawLower)) {
    return "File is too large. Maximum allowed size is 20MB.";
  }
  if (code === "storage/file-too-large") {
    return "File is too large. Maximum allowed size is 20MB.";
  }
  if (/cors|xmlhttprequest|network request failed|failed to fetch/.test(rawLower)) {
    return "Network or bucket/CORS issue during upload. Verify VITE_FIREBASE_STORAGE_BUCKET and retry.";
  }
  if (raw) {
    return raw;
  }
  return fallback;
}

const uploadViaBackendEndpoints = async ({ endpoints, file, onProgress }) => {
  const uniqueEndpoints = [...new Set((endpoints || []).map((value) => String(value || "").trim()))]
    .filter(Boolean);
  if (uniqueEndpoints.length === 0) {
    throw createStorageError("upload/backend-disabled", "No backend upload endpoint configured.");
  }

  let lastError = null;
  for (let index = 0; index < uniqueEndpoints.length; index += 1) {
    const endpoint = uniqueEndpoints[index];
    const hasNext = index < uniqueEndpoints.length - 1;
    try {
      return await uploadViaBackend({
        endpoint,
        file,
        onProgress
      });
    } catch (err) {
      lastError = err;
      const code = String(err?.code || "").trim();
      const status = Number(err?.status || 0);
      if (hasNext && code === "upload/backend-failed" && status === 404) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || createStorageError("upload/backend-failed", "Backend upload failed.");
};

const uploadWithStrategy = async ({
  path,
  file,
  onProgress,
  backendEndpoints = []
}) => {
  const preferClient = shouldPreferClientUpload();
  const hasBackendOption = backendEndpoints.length > 0;

  if (preferClient) {
    try {
      return await uploadAtPath({ path, file, onProgress });
    } catch (clientErr) {
      if (!hasBackendOption || !shouldFallbackToBackendUpload(clientErr)) {
        throw clientErr;
      }

      try {
        return await uploadViaBackendEndpoints({
          endpoints: backendEndpoints,
          file,
          onProgress
        });
      } catch (backendErr) {
        const backendCode = String(backendErr?.code || "").trim();
        if (backendCode === "upload/backend-disabled") {
          throw clientErr;
        }
        throw backendErr;
      }
    }
  }

  if (hasBackendOption) {
    try {
      return await uploadViaBackendEndpoints({
        endpoints: backendEndpoints,
        file,
        onProgress
      });
    } catch (backendErr) {
      if (!shouldFallbackToClientUpload(backendErr)) {
        throw backendErr;
      }
    }
  }

  return uploadAtPath({ path, file, onProgress });
};

export async function uploadProjectFile({ projectId, file, onProgress }) {
  ensureUploadInputs({ ownerId: projectId, file, ownerLabel: "project" });
  const path = buildUploadPath("projectFiles", projectId, file.name);
  return uploadAtPath({ path, file, onProgress });
}

export async function uploadUserCertificate({ uid, file, onProgress }) {
  ensureUploadInputs({ ownerId: uid, file, ownerLabel: "user" });
  const path = buildUploadPath("userCertificates", uid, file.name);
  return uploadAtPath({ path, file, onProgress });
}

export async function uploadFreelancerResume({ uid, file, onProgress }) {
  ensureUploadInputs({ ownerId: uid, file, ownerLabel: "user" });
  const path = buildUploadPath("userResumes", uid, file.name);
  return uploadWithStrategy({
    path,
    file,
    onProgress,
    backendEndpoints: ["/api/files/resume"]
  });
}

export async function uploadFreelancerGovId({ uid, file, onProgress }) {
  ensureUploadInputs({ ownerId: uid, file, ownerLabel: "user" });
  const path = buildUploadPath("userGovIds", uid, file.name);
  return uploadWithStrategy({
    path,
    file,
    onProgress,
    backendEndpoints: ["/api/files/gov-id"]
  });
}

export async function uploadClientGovId({ uid, file, onProgress }) {
  ensureUploadInputs({ ownerId: uid, file, ownerLabel: "user" });
  const path = buildUploadPath("userClientGovIds", uid, file.name);
  return uploadWithStrategy({
    path,
    file,
    onProgress,
    backendEndpoints: ["/api/files/client-gov-id", "/api/files/gov-id"]
  });
}

export async function uploadClientDocument({ uid, file, onProgress }) {
  ensureUploadInputs({ ownerId: uid, file, ownerLabel: "user" });
  const path = buildUploadPath("userClientDocuments", uid, file.name);
  return uploadWithStrategy({
    path,
    file,
    onProgress,
    backendEndpoints: ["/api/files/client-document"]
  });
}

export async function uploadProfilePicture({ uid, file, onProgress }) {
  ensureUploadInputs({ ownerId: uid, file, ownerLabel: "user" });
  const path = buildUploadPath("profilePictures", uid, file.name);
  return uploadWithStrategy({
    path,
    file,
    onProgress,
    backendEndpoints: ["/api/files/profile-picture"]
  });
}

export async function uploadContractRequirement({ contractId, file, onProgress }) {
  ensureUploadInputs({ ownerId: contractId, file, ownerLabel: "contract" });
  const path = buildUploadPath("contractRequirements", contractId, file.name);
  return uploadWithStrategy({
    path,
    file,
    onProgress,
    backendEndpoints: []
  });
}

export async function uploadContractFlowDoc({ contractId, file, onProgress }) {
  ensureUploadInputs({ ownerId: contractId, file, ownerLabel: "contract" });
  const path = buildUploadPath("contractFlows", contractId, file.name);
  return uploadWithStrategy({
    path,
    file,
    onProgress,
    backendEndpoints: []
  });
}

export async function uploadContractFeedback({ contractId, file, onProgress }) {
  ensureUploadInputs({ ownerId: contractId, file, ownerLabel: "contract" });
  const path = buildUploadPath("contractFeedback", contractId, file.name);
  return uploadWithStrategy({
    path,
    file,
    onProgress,
    backendEndpoints: []
  });
}

export async function uploadContractFinalAsset({ contractId, file, type, onProgress }) {
  const safeType = String(type || "asset").trim().toLowerCase();
  ensureUploadInputs({ ownerId: contractId, file, ownerLabel: "contract" });
  const path = buildUploadPath(`contractFinal/${safeType}`, contractId, file.name);
  return uploadWithStrategy({
    path,
    file,
    onProgress,
    backendEndpoints: []
  });
}

export async function uploadWorkspaceRequirementFile({
  contractId,
  file,
  onProgress
}) {
  ensureUploadInputs({ ownerId: contractId, file, ownerLabel: "contract" });
  const path = buildContractWorkspacePath(contractId, "requirements", file.name);
  return uploadWithStrategy({
    path,
    file,
    onProgress,
    backendEndpoints: []
  });
}

export async function uploadWorkspaceClientFile({
  contractId,
  file,
  onProgress
}) {
  ensureUploadInputs({ ownerId: contractId, file, ownerLabel: "contract" });
  const path = buildContractWorkspacePath(contractId, "client", file.name);
  return uploadWithStrategy({
    path,
    file,
    onProgress,
    backendEndpoints: []
  });
}

export async function uploadWorkspaceFreelancerFile({
  contractId,
  file,
  onProgress
}) {
  ensureUploadInputs({ ownerId: contractId, file, ownerLabel: "contract" });
  const path = buildContractWorkspacePath(contractId, "freelancer", file.name);
  return uploadWithStrategy({
    path,
    file,
    onProgress,
    backendEndpoints: []
  });
}
