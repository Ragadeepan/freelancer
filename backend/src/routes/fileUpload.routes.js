import { Router } from "express";
import multer from "multer";
import {
  uploadClientDocument,
  uploadClientGovId,
  uploadGovId,
  uploadProfilePicture,
  uploadResume
} from "../controllers/fileUpload.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();
const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES
  }
});

router.post("/resume", requireAuth, upload.single("file"), uploadResume);
router.post("/gov-id", requireAuth, upload.single("file"), uploadGovId);
router.post("/client-gov-id", requireAuth, upload.single("file"), uploadClientGovId);
router.post("/client-document", requireAuth, upload.single("file"), uploadClientDocument);
router.post("/profile-picture", requireAuth, upload.single("file"), uploadProfilePicture);

export default router;
