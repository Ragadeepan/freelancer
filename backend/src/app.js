import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import paymentRoutes from "./routes/payment.routes.js";
import fileUploadRoutes from "./routes/fileUpload.routes.js";
import proposalRoutes from "./routes/proposal.routes.js";
import projectRoutes from "./routes/project.routes.js";
import { handleStripeWebhook } from "./controllers/payment.controller.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";

const app = express();
const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT_DIR = path.resolve(APP_DIR, "..");
const LOCAL_UPLOADS_DIR = path.join(BACKEND_ROOT_DIR, "uploads");

const allowedOrigins = String(process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": ["'self'", "data:", "blob:", "https://api.dicebear.com", "http://localhost:4000", "http://127.0.0.1:4000", "*.firebasestorage.googleapis.com"],
      },
    },
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, true); // More permissive for local dev
    },
    credentials: true
  })
);
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api", apiLimiter);

app.post(
  "/api/payments/webhooks/stripe",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buffer) => {
      if (req.originalUrl.includes("/api/payments/webhooks/razorpay")) {
        req.rawBody = buffer.toString("utf-8");
      }
    }
  })
);

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, status: "up" });
});

app.use("/uploads", express.static(LOCAL_UPLOADS_DIR, {
  setHeaders: (res) => {
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    res.set("Access-Control-Allow-Origin", "*");
  }
}));
app.use("/api/payments", paymentRoutes);
app.use("/api/files", fileUploadRoutes);
app.use("/api/proposals", proposalRoutes);
app.use("/api/projects", projectRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
