import { createNotificationsBulk, listActiveAdminIds } from "./notificationsService.js";
import { logActivity } from "./activityLogsService.js";

export async function reportJobIssue({ jobId, jobTitle, reporterId, reason }) {
  const safeJobId = String(jobId || "").trim();
  const safeReporterId = String(reporterId || "").trim();
  if (!safeJobId || !safeReporterId) {
    throw new Error("jobId and reporterId are required.");
  }

  const messageReason = String(reason || "").trim() || "No reason provided.";
  const adminIds = await listActiveAdminIds().catch(() => []);
  if (adminIds.length > 0) {
    await createNotificationsBulk(
      adminIds.map((adminId) => ({
        recipientId: adminId,
        type: "job_reported",
        title: "Job reported by freelancer",
        message: `Job "${jobTitle || safeJobId}" was reported. Reason: ${messageReason}`,
        actorId: safeReporterId,
        jobId: safeJobId
      }))
    );
  }

  await logActivity({
    actor: safeReporterId,
    action: "job_reported",
    targetId: safeJobId
  }).catch(() => null);
}
