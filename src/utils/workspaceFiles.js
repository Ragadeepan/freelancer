const asText = (value) => String(value || "").trim();

export const WORKSPACE_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export const WORKSPACE_ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "zip",
  "png",
  "jpg",
  "jpeg"
]);

export const WORKSPACE_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "application/x-zip-compressed",
  "image/png",
  "image/jpg",
  "image/jpeg",
  "image/pjpeg"
]);

export const getFileExtension = (fileName) => {
  const raw = asText(fileName);
  if (!raw.includes(".")) return "";
  return raw.split(".").pop()?.toLowerCase() || "";
};

export const getWorkspaceFileTypeLabel = (fileName, mimeType = "") => {
  const ext = getFileExtension(fileName);
  if (ext) return ext.toUpperCase();
  const cleanType = asText(mimeType).toUpperCase();
  return cleanType || "FILE";
};

export const isWorkspaceFileAllowed = (file) => {
  const size = Number(file?.size || 0);
  if (!file || size <= 0) {
    return {
      ok: false,
      message: "Select a valid file."
    };
  }
  if (size > WORKSPACE_MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      message: "File must be 20MB or smaller."
    };
  }

  const ext = getFileExtension(file.name);
  const mimeType = asText(file.type).toLowerCase();
  const extensionAllowed = WORKSPACE_ALLOWED_EXTENSIONS.has(ext);
  const mimeAllowed = mimeType ? WORKSPACE_ALLOWED_MIME_TYPES.has(mimeType) : false;

  if (!extensionAllowed && !mimeAllowed) {
    return {
      ok: false,
      message: "Allowed file types: PDF, DOC, DOCX, ZIP, PNG, JPG."
    };
  }

  return {
    ok: true,
    message: ""
  };
};

export const isPreviewableWorkspaceFile = (fileName, mimeType = "") => {
  const ext = getFileExtension(fileName);
  if (["pdf", "png", "jpg", "jpeg"].includes(ext)) return true;
  const cleanType = asText(mimeType).toLowerCase();
  return cleanType.startsWith("image/") || cleanType === "application/pdf";
};

export const normalizeWorkspaceUploadCategory = (value) => {
  const raw = asText(value).toLowerCase();
  if (!raw) return "reference";
  if (["requirement", "requirements"].includes(raw)) return "requirements";
  if (["image", "images", "design", "reference", "references"].includes(raw)) {
    return raw.endsWith("s") ? raw : `${raw}s`;
  }
  if (["freelancer", "deliverable", "deliverables", "project"].includes(raw)) {
    return "freelancer";
  }
  return "reference";
};

