import { HttpError } from "../utils/httpError.js";

export function notFoundHandler(req, _res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(error, _req, res, _next) {
  const isMulterError = error?.name === "MulterError";
  const statusCode =
    error instanceof HttpError ? error.statusCode : isMulterError ? 400 : 500;
  const multerMessage =
    isMulterError && String(error?.code || "").trim() === "LIMIT_FILE_SIZE"
      ? "File is too large. Maximum allowed size is 20MB."
      : null;
  const message =
    statusCode >= 500
      ? "Internal server error."
      : multerMessage || error.message || "Request failed.";

  const response = {
    ok: false,
    message
  };

  if (error instanceof HttpError && error.details) {
    response.details = error.details;
  }

  if (process.env.NODE_ENV !== "production" && statusCode >= 500) {
    response.debug = error?.message || String(error);
    // Keep full server-side error trail in terminal logs for debugging.
    console.error(error);
  }

  res.status(statusCode).json(response);
}
