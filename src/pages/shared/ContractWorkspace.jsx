import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, doc, query, where } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Button from "../../components/Button.jsx";
import UserProfileLink from "../../components/UserProfileLink.jsx";
import { adminNav, clientNav, freelancerNav } from "../../data/nav.js";
import { db } from "../../firebase/firebase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import useFirestoreDoc from "../../hooks/useFirestoreDoc.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import {
  CONTRACT_FLOW,
  CONTRACT_STATUS,
  CONTRACT_STATUS_LABELS,
  PAYMENT_STATUS,
  normalizePaymentStatus,
  normalizeContractStatus
} from "../../utils/contracts.js";
import {
  getWorkspaceFileTypeLabel,
  isPreviewableWorkspaceFile,
  normalizeWorkspaceUploadCategory
} from "../../utils/workspaceFiles.js";
import {
  getStorageUploadErrorMessage,
  uploadContractFeedback,
  uploadContractFinalAsset,
  uploadContractFlowDoc
} from "../../services/storageService.js";
import {
  uploadClientWorkspaceFile,
  uploadFreelancerWorkspaceFile
} from "../../services/contractWorkspaceService.js";
import {
  approveFinalSubmission,
  approveFlow,
  markContractPaid,
  requestFlowRevision,
  requestRequirementCancellation,
  scheduleDemo,
  startDevelopment,
  submitFinalProject,
  submitFlowDoc,
  uploadFeedback
} from "../../services/contractsService.js";
import { resolveFileUrl } from "../../utils/fileUrl.js";

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
  const date = toDate(value);
  if (!date) return "N/A";
  return date.toLocaleDateString();
};

const formatLabel = (value, fallback = "N/A") => {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const toDashboardRoute = (role) => {
  if (role === "client") return "/client/dashboard";
  if (role === "freelancer") return "/freelancer/dashboard";
  return "/secure-admin/dashboard";
};

const normalizeRole = (value) => String(value || "").trim().toLowerCase();

export default function ContractWorkspace() {
  const { contractId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, profile, loading: authLoading } = useAuth();
  const role = normalizeRole(profile?.role);
  const [clientUploadCategory, setClientUploadCategory] = useState("requirements");
  const [uploadingClientFile, setUploadingClientFile] = useState(false);
  const [uploadingFreelancerFile, setUploadingFreelancerFile] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [demoDraft, setDemoDraft] = useState({
    demoDate: "",
    demoTime: "",
    meetingLink: ""
  });
  const [finalFiles, setFinalFiles] = useState({
    source: null,
    setup: null,
    docs: null
  });

  const sidebar = useMemo(() => {
    if (role === "client") {
      return { title: "Client Suite", subtitle: "Client", items: clientNav };
    }
    if (role === "freelancer") {
      return { title: "Growlanzer", subtitle: "Freelancer", items: freelancerNav };
    }
    return { title: "Admin HQ", subtitle: "Admin", items: adminNav };
  }, [role]);

  const { data: contract, loading: contractLoading } = useFirestoreDoc(
    () => (contractId ? doc(db, "contracts", contractId) : null),
    [contractId],
    null
  );
  const { data: linkedJob } = useFirestoreDoc(
    () => (contract?.jobId ? doc(db, "jobs", contract.jobId) : null),
    [contract?.jobId],
    null
  );
  const { data: settings } = useFirestoreDoc(() => doc(db, "settings", "global"), [], null);

  const { data: files = [] } = useFirestoreQuery(
    () =>
      contractId
        ? query(collection(db, "contractFiles"), where("contractId", "==", contractId))
        : null,
    [contractId]
  );

  const { data: timeline = [] } = useFirestoreQuery(
    () =>
      contractId
        ? query(collection(db, "contractActivity"), where("contractId", "==", contractId))
        : null,
    [contractId]
  );

  const status = useMemo(
    () => normalizeContractStatus(contract?.contractStatus || contract?.status),
    [contract?.contractStatus, contract?.status]
  );
  const paymentStatus = useMemo(
    () => normalizePaymentStatus(contract?.paymentStatus),
    [contract?.paymentStatus]
  );

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      const aTime = toDate(a.uploadedAt)?.getTime() || 0;
      const bTime = toDate(b.uploadedAt)?.getTime() || 0;
      return bTime - aTime;
    });
  }, [files]);

  const requirementFiles = useMemo(() => {
    return sortedFiles.filter((file) => {
      const category = normalizeWorkspaceUploadCategory(file.category);
      return file.role === "client" && category === "requirements";
    });
  }, [sortedFiles]);

  const sortedTimeline = useMemo(() => {
    return [...timeline].sort((a, b) => {
      const aTime = toDate(a.createdAt)?.getTime() || 0;
      const bTime = toDate(b.createdAt)?.getTime() || 0;
      return bTime - aTime;
    });
  }, [timeline]);

  const requirementDueAt = toDate(contract?.requirementDeadline || contract?.requirementDueAt);
  const requirementDeadlineMissed = Boolean(
    requirementDueAt && Date.now() > requirementDueAt.getTime()
  );
  const commissionRate = Number(settings?.commissionPercentage || 0);
  const contractAmount = Number(contract?.amount ?? contract?.budget ?? 0);
  const workspaceJobMeta = linkedJob || contract || null;

  const canClientUploadAny = role === "client" && status !== CONTRACT_STATUS.AWAITING_PAYMENT;
  const canClientUploadRequirements =
    role === "client" &&
    [CONTRACT_STATUS.AWAITING_REQUIREMENTS, CONTRACT_STATUS.REQUIREMENTS_UPLOADED].includes(
      status
    );
  const canClientUploadSelectedCategory =
    clientUploadCategory === "requirements"
      ? canClientUploadRequirements
      : canClientUploadAny;
  const canFreelancerUpload =
    role === "freelancer" &&
    ![CONTRACT_STATUS.AWAITING_PAYMENT, CONTRACT_STATUS.AWAITING_REQUIREMENTS].includes(
      status
    );

  const canPayContract = role === "client" && status === CONTRACT_STATUS.AWAITING_PAYMENT;
  const canApproveFlow = role === "client" && status === CONTRACT_STATUS.FLOW_SUBMITTED;
  const canRequestFlowRevision = canApproveFlow;
  const canUploadFeedback = role === "client" && status === CONTRACT_STATUS.DEMO_SCHEDULED;
  const canApproveFinal = role === "client" && status === CONTRACT_STATUS.FINAL_SUBMITTED;
  const canRequestCancellation =
    role === "client" &&
    status === CONTRACT_STATUS.AWAITING_REQUIREMENTS &&
    requirementDeadlineMissed;

  const canSubmitFlow =
    role === "freelancer" &&
    [CONTRACT_STATUS.REQUIREMENTS_UPLOADED, CONTRACT_STATUS.FLOW_REVISION].includes(status);
  const canStartDevelopment = role === "freelancer" && status === CONTRACT_STATUS.DEVELOPMENT_READY;
  const canScheduleDemo = role === "freelancer" && status === CONTRACT_STATUS.IN_PROGRESS;
  const canSubmitFinal =
    role === "freelancer" &&
    [CONTRACT_STATUS.REVISION_REQUESTED, CONTRACT_STATUS.IN_PROGRESS].includes(status);
  const actionBusy = Boolean(actionLoading);
  const escrowStatusMessage = useMemo(() => {
    if (paymentStatus === PAYMENT_STATUS.AWAITING_PAYMENT) {
      return role === "client"
        ? "Fund escrow here to unlock requirement upload and start the contract flow."
        : "Waiting for client escrow funding before work can begin.";
    }
    if (paymentStatus === PAYMENT_STATUS.FUNDED) {
      return role === "client"
        ? "Escrow is funded. Upload requirements to move the project forward."
        : "Client has funded escrow. Requirements upload is the next step.";
    }
    if (paymentStatus === PAYMENT_STATUS.RELEASE_PENDING) {
      return "Admin review is complete and payout is queued for release.";
    }
    if (paymentStatus === PAYMENT_STATUS.PAID) {
      return "Escrow has been released to the freelancer.";
    }
    return "Escrow status will update here as the contract moves forward.";
  }, [paymentStatus, role]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.uid) {
      navigate("/login", { replace: true });
      return;
    }
    if (!["client", "freelancer"].includes(role)) {
      navigate(toDashboardRoute(role), { replace: true });
    }
  }, [authLoading, navigate, role, user?.uid]);

  useEffect(() => {
    if (!contract || !user?.uid || authLoading) return;
    const member =
      contract.clientId === user.uid || contract.freelancerId === user.uid;
    if (!member) {
      navigate(toDashboardRoute(role), { replace: true });
    }
  }, [authLoading, contract, navigate, role, user?.uid]);

  useEffect(() => {
    setActionLoading("");
    setDemoDraft({ demoDate: "", demoTime: "", meetingLink: "" });
    setFinalFiles({ source: null, setup: null, docs: null });
  }, [contractId]);

  const handleClientUpload = async (file) => {
    if (!file || !user?.uid) return;
      if (!canClientUploadSelectedCategory) {
        const message =
          clientUploadCategory === "requirements"
            ? "Requirement documents can only be uploaded in requirement stage."
          : "Fund escrow before uploading files.";
        toast.error(message);
        return;
      }
    setUploadingClientFile(true);
    try {
      await uploadClientWorkspaceFile({
        contractId,
        clientId: user.uid,
        file,
        category: clientUploadCategory
      });
      toast.success("File uploaded to workspace.");
    } catch (err) {
      toast.error(err?.message || "Failed to upload file.");
    } finally {
      setUploadingClientFile(false);
    }
  };

  const handleFreelancerUpload = async (file) => {
    if (!file || !user?.uid) return;
    if (!canFreelancerUpload) {
      toast.error("Client requirements must be uploaded before freelancer uploads.");
      return;
    }
    setUploadingFreelancerFile(true);
    try {
      await uploadFreelancerWorkspaceFile({
        contractId,
        freelancerId: user.uid,
        file,
        category: "freelancer"
      });
      toast.success("Project file uploaded.");
    } catch (err) {
      toast.error(err?.message || "Failed to upload file.");
    } finally {
      setUploadingFreelancerFile(false);
    }
  };

  const runAction = async (key, executor, successMessage, fallbackMessage) => {
    setActionLoading(key);
    try {
      await executor();
      toast.success(successMessage);
    } catch (error) {
      toast.error(error?.message || fallbackMessage);
    } finally {
      setActionLoading("");
    }
  };

  const handlePayContract = async () => {
    if (!user?.uid || !canPayContract) return;
    await runAction(
      "pay",
      () =>
        markContractPaid({
          contractId,
          clientId: user.uid,
          commissionRate
        }),
      "Contract funded. Upload requirements within 24 hours.",
      "Failed to fund contract."
    );
  };

  const handleSubmitFlowDoc = async (file) => {
    if (!file || !user?.uid || !canSubmitFlow) return;
    setActionLoading("flow_upload");
    try {
      const url = await uploadContractFlowDoc({
        contractId,
        file
      });
      await submitFlowDoc({
        contractId,
        freelancerId: user.uid,
        flowDoc: { name: file.name, url }
      });
      toast.success("Flow document submitted.");
    } catch (error) {
      toast.error(getStorageUploadErrorMessage(error, "Failed to submit flow document."));
    } finally {
      setActionLoading("");
    }
  };

  const handleApproveFlow = async () => {
    if (!user?.uid || !canApproveFlow) return;
    await runAction(
      "flow_approve",
      () =>
        approveFlow({
          contractId,
          clientId: user.uid
        }),
      "Flow approved. Freelancer can start development.",
      "Failed to approve flow."
    );
  };

  const handleRequestFlowRevision = async () => {
    if (!user?.uid || !canRequestFlowRevision) return;
    await runAction(
      "flow_revision",
      () =>
        requestFlowRevision({
          contractId,
          clientId: user.uid
        }),
      "Flow revision requested.",
      "Failed to request flow revision."
    );
  };

  const handleStartDevelopment = async () => {
    if (!user?.uid || !canStartDevelopment) return;
    await runAction(
      "start_development",
      () =>
        startDevelopment({
          contractId,
          freelancerId: user.uid
        }),
      "Development started.",
      "Failed to start development."
    );
  };

  const handleScheduleDemo = async () => {
    if (!user?.uid || !canScheduleDemo) return;
    if (!demoDraft.demoDate || !demoDraft.demoTime || !demoDraft.meetingLink) {
      toast.error("Enter demo date, demo time and meeting link.");
      return;
    }
    const scheduled = new Date(`${demoDraft.demoDate}T${demoDraft.demoTime}`);
    if (Number.isNaN(scheduled.getTime())) {
      toast.error("Invalid demo date/time.");
      return;
    }
    await runAction(
      "schedule_demo",
      () =>
        scheduleDemo({
          contractId,
          freelancerId: user.uid,
          scheduledAt: scheduled.toISOString(),
          demoDate: demoDraft.demoDate,
          demoTime: demoDraft.demoTime,
          meetingLink: demoDraft.meetingLink
        }),
      "Demo scheduled.",
      "Failed to schedule demo."
    );
  };

  const handleFeedbackUpload = async (file) => {
    if (!file || !user?.uid || !canUploadFeedback) return;
    setActionLoading("feedback_upload");
    try {
      const url = await uploadContractFeedback({
        contractId,
        file
      });
      await uploadFeedback({
        contractId,
        clientId: user.uid,
        feedbackDoc: { name: file.name, url }
      });
      toast.success("Feedback uploaded.");
    } catch (error) {
      toast.error(getStorageUploadErrorMessage(error, "Failed to upload feedback."));
    } finally {
      setActionLoading("");
    }
  };

  const handleSubmitFinal = async () => {
    if (!user?.uid || !canSubmitFinal) return;
    if (!finalFiles.source || !finalFiles.setup || !finalFiles.docs) {
      toast.error("Upload source code, setup instructions, and documentation.");
      return;
    }
    setActionLoading("final_submit");
    try {
      const [sourceUrl, setupUrl, docsUrl] = await Promise.all([
        uploadContractFinalAsset({
          contractId,
          file: finalFiles.source,
          type: "source"
        }),
        uploadContractFinalAsset({
          contractId,
          file: finalFiles.setup,
          type: "setup"
        }),
        uploadContractFinalAsset({
          contractId,
          file: finalFiles.docs,
          type: "docs"
        })
      ]);
      await submitFinalProject({
        contractId,
        freelancerId: user.uid,
        finalSubmission: {
          sourceCode: { name: finalFiles.source.name, url: sourceUrl },
          setupInstructions: { name: finalFiles.setup.name, url: setupUrl },
          documentation: { name: finalFiles.docs.name, url: docsUrl }
        }
      });
      toast.success("Final submission uploaded.");
    } catch (error) {
      toast.error(getStorageUploadErrorMessage(error, "Failed to submit final project."));
    } finally {
      setActionLoading("");
    }
  };

  const handleApproveFinal = async () => {
    if (!user?.uid || !canApproveFinal) return;
    await runAction(
      "final_approve",
      () =>
        approveFinalSubmission({
          contractId,
          clientId: user.uid
        }),
      "Final submission approved. Payment moved to release pending.",
      "Failed to approve final submission."
    );
  };

  const handleRequestCancellation = async () => {
    if (!user?.uid || !canRequestCancellation) return;
    await runAction(
      "req_cancel",
      () =>
        requestRequirementCancellation({
          contractId,
          clientId: user.uid
        }),
      "Cancellation request submitted to admin.",
      "Failed to request cancellation."
    );
  };

  return (
    <DashboardLayout
      title="Project Workspace"
      sidebar={sidebar}
    >
      <PageHeader
        title="Project workspace"
        description="Private client-freelancer collaboration workspace."
      />

      {authLoading || contractLoading ? (
        <EmptyState title="Loading workspace" description="Fetching contract details..." />
      ) : !contract ? (
        <EmptyState title="Workspace not found" description="Contract not found." />
      ) : (
        <div className="grid gap-5">
          <section className="glass-card rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {contract.jobTitle || contract.title || "Project"}
                </h3>
                <p className="mt-1 text-sm text-slate-300">
                  Budget: {contract.currency || "INR"}{" "}
                  {Number(contract.budget ?? contract.amount ?? 0).toFixed(2)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Client:{" "}
                  <UserProfileLink
                    userId={contract.clientId}
                    name={contract.clientName || contract.clientId}
                    className="text-sky-200 underline hover:text-sky-100"
                  />
                  {" · "}
                  Freelancer:{" "}
                  <UserProfileLink
                    userId={contract.freelancerId}
                    name={contract.freelancerName || contract.freelancerId}
                    className="text-sky-200 underline hover:text-sky-100"
                  />
                </p>
                <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    Start date: {formatDate(workspaceJobMeta?.startDate)}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    Deadline: {formatDate(workspaceJobMeta?.deadline)}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    Duration: {workspaceJobMeta?.duration || workspaceJobMeta?.timeline || "N/A"}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    Milestones: {workspaceJobMeta?.milestoneCount || "N/A"}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    Escrow: {workspaceJobMeta?.currency || contract?.currency || "INR"}{" "}
                    {workspaceJobMeta?.escrowAmount || "N/A"}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    Priority: {formatLabel(workspaceJobMeta?.priority)}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    Communication: {formatLabel(workspaceJobMeta?.communication)}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    NDA required: {workspaceJobMeta?.ndaRequired ? "Yes" : "No"}
                  </div>
                </div>
              </div>
              <StatusBadge status={status} />
            </div>
          </section>

          <section className="glass-card rounded-2xl p-6">
            <h4 className="text-sm font-semibold text-white">Workflow Actions</h4>
            <p className="mt-1 text-xs text-slate-400">
              Contract status controls which action can be performed now.
            </p>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-300">
              <p>
                Current:{" "}
                <span className="font-semibold text-white">
                  {CONTRACT_STATUS_LABELS[status] || status}
                </span>
              </p>
              <p className="mt-1">
                Requirement deadline: {requirementDueAt ? requirementDueAt.toLocaleString() : "Not set"}
              </p>
              {canRequestCancellation ? (
                <p className="mt-1 text-rose-200">
                  Requirement deadline missed. You can request cancellation.
                </p>
                ) : null}
              </div>

              <div className="mt-4 rounded-xl border border-sky-400/30 bg-sky-500/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-sky-100/80">
                      Escrow funding
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {contract.currency || "INR"} {contractAmount.toFixed(2)}
                    </p>
                    <p className="mt-1 text-xs text-slate-200">
                      {escrowStatusMessage}
                    </p>
                  </div>
                  <StatusBadge status={paymentStatus} />
                </div>
                {role === "client" && canPayContract ? (
                  <div className="mt-4">
                    <Button onClick={handlePayContract} disabled={actionBusy}>
                      {actionLoading === "pay" ? "Processing..." : "Fund Escrow"}
                    </Button>
                  </div>
                ) : null}
              </div>

            {role === "client" ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {canApproveFlow ? (
                  <Button variant="ghost" onClick={handleApproveFlow} disabled={actionBusy}>
                    {actionLoading === "flow_approve" ? "Processing..." : "Approve Flow"}
                  </Button>
                ) : null}

                {canRequestFlowRevision ? (
                  <Button
                    variant="ghost"
                    onClick={handleRequestFlowRevision}
                    disabled={actionBusy}
                  >
                    {actionLoading === "flow_revision" ? "Processing..." : "Request Flow Revision"}
                  </Button>
                ) : null}

                {canUploadFeedback ? (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-200 hover:bg-white/10">
                    {actionLoading === "feedback_upload" ? "Uploading..." : "Upload Feedback"}
                    <input
                      type="file"
                      className="sr-only"
                      accept=".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg"
                      onChange={(event) => handleFeedbackUpload(event.target.files?.[0])}
                      disabled={actionBusy}
                    />
                  </label>
                ) : null}

                {canApproveFinal ? (
                  <Button variant="ghost" onClick={handleApproveFinal} disabled={actionBusy}>
                    {actionLoading === "final_approve" ? "Processing..." : "Approve Final Submission"}
                  </Button>
                ) : null}

                {canRequestCancellation ? (
                  <Button
                    variant="ghost"
                    onClick={handleRequestCancellation}
                    disabled={actionBusy}
                  >
                    {actionLoading === "req_cancel" ? "Processing..." : "Request Cancellation"}
                  </Button>
                ) : null}
              </div>
            ) : null}

            {role === "freelancer" ? (
              <div className="mt-4 grid gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  {canSubmitFlow ? (
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-200 hover:bg-white/10">
                      {actionLoading === "flow_upload" ? "Uploading..." : "Upload Flow Document"}
                      <input
                        type="file"
                        className="sr-only"
                        accept=".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg"
                        onChange={(event) => handleSubmitFlowDoc(event.target.files?.[0])}
                        disabled={actionBusy}
                      />
                    </label>
                  ) : null}

                  {canStartDevelopment ? (
                    <Button
                      variant="ghost"
                      onClick={handleStartDevelopment}
                      disabled={actionBusy}
                    >
                      {actionLoading === "start_development" ? "Processing..." : "Start Project"}
                    </Button>
                  ) : null}
                </div>

                {canScheduleDemo ? (
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
                    <input
                      type="date"
                      className="min-h-[40px] rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-slate-200"
                      value={demoDraft.demoDate}
                      onChange={(event) =>
                        setDemoDraft((prev) => ({ ...prev, demoDate: event.target.value }))
                      }
                      disabled={actionBusy}
                    />
                    <input
                      type="time"
                      className="min-h-[40px] rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-slate-200"
                      value={demoDraft.demoTime}
                      onChange={(event) =>
                        setDemoDraft((prev) => ({ ...prev, demoTime: event.target.value }))
                      }
                      disabled={actionBusy}
                    />
                    <input
                      className="min-h-[40px] rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-slate-200"
                      placeholder="Meeting link"
                      value={demoDraft.meetingLink}
                      onChange={(event) =>
                        setDemoDraft((prev) => ({ ...prev, meetingLink: event.target.value }))
                      }
                      disabled={actionBusy}
                    />
                    <Button onClick={handleScheduleDemo} disabled={actionBusy}>
                      {actionLoading === "schedule_demo" ? "Processing..." : "Schedule Demo"}
                    </Button>
                  </div>
                ) : null}

                {canSubmitFinal ? (
                  <div className="grid gap-2">
                    <p className="text-xs text-slate-400">
                      Final submission requires source code, setup instructions, and documentation.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        type="file"
                        className="form-input text-xs"
                        onChange={(event) =>
                          setFinalFiles((prev) => ({
                            ...prev,
                            source: event.target.files?.[0] || null
                          }))
                        }
                        disabled={actionBusy}
                      />
                      <input
                        type="file"
                        className="form-input text-xs"
                        onChange={(event) =>
                          setFinalFiles((prev) => ({
                            ...prev,
                            setup: event.target.files?.[0] || null
                          }))
                        }
                        disabled={actionBusy}
                      />
                      <input
                        type="file"
                        className="form-input text-xs"
                        onChange={(event) =>
                          setFinalFiles((prev) => ({
                            ...prev,
                            docs: event.target.files?.[0] || null
                          }))
                        }
                        disabled={actionBusy}
                      />
                    </div>
                    <div>
                      <Button onClick={handleSubmitFinal} disabled={actionBusy}>
                        {actionLoading === "final_submit" ? "Uploading..." : "Submit Final Project"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="glass-card rounded-2xl p-6">
            <h4 className="text-sm font-semibold text-white">Requirement Documents</h4>
            <p className="mt-1 text-xs text-slate-400">
              Client uploads requirement/reference/design files. Freelancer can view/download in realtime.
            </p>
            {role === "client" ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <select
                  value={clientUploadCategory}
                  onChange={(event) => setClientUploadCategory(event.target.value)}
                  className="min-h-[40px] rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-slate-200"
                  disabled={uploadingClientFile || actionBusy || !canClientUploadAny}
                >
                  <option value="requirements">Requirement document</option>
                  <option value="references">Reference file</option>
                  <option value="designs">Design file</option>
                  <option value="images">Image</option>
                </select>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-200 hover:bg-white/10">
                  {uploadingClientFile ? "Uploading..." : "Upload file"}
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg"
                    onChange={(event) => handleClientUpload(event.target.files?.[0])}
                    disabled={
                      uploadingClientFile ||
                      uploadingFreelancerFile ||
                      actionBusy ||
                      !canClientUploadSelectedCategory
                    }
                  />
                </label>
              </div>
            ) : null}
            {role === "client" && !canClientUploadAny ? (
              <p className="mt-3 text-xs text-amber-300">
                Escrow funding is required before file uploads.
              </p>
            ) : null}
            {role === "client" &&
            canClientUploadAny &&
            clientUploadCategory === "requirements" &&
            !canClientUploadRequirements ? (
              <p className="mt-3 text-xs text-amber-300">
                Requirement documents can only be uploaded in requirement stage.
              </p>
            ) : null}

            {requirementFiles.length === 0 ? (
              <p className="mt-4 text-xs text-slate-500">No requirement files uploaded yet.</p>
            ) : (
              <div className="mt-4 grid gap-2">
                {requirementFiles.map((file) => {
                  const fileUrl = resolveFileUrl(file.fileUrl);
                  return (
                    <article
                      key={file.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm text-white">{file.fileName || "File"}</p>
                          <p className="text-xs text-slate-400">
                            {getWorkspaceFileTypeLabel(file.fileName, file.mimeType)} ·{" "}
                            {toDate(file.uploadedAt)?.toLocaleString() || "N/A"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isPreviewableWorkspaceFile(file.fileName, file.mimeType) ? (
                            <Button
                              variant="ghost"
                              onClick={() => window.open(fileUrl, "_blank", "noopener,noreferrer")}
                            >
                              Preview
                            </Button>
                          ) : null}
                          <a href={fileUrl} target="_blank" rel="noreferrer" download>
                            <Button variant="ghost">Download</Button>
                          </a>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="glass-card rounded-2xl p-6">
            <h4 className="text-sm font-semibold text-white">Uploaded Files</h4>
            <p className="mt-1 text-xs text-slate-400">
              All shared workspace files (client + freelancer).
            </p>
            {role === "freelancer" ? (
              <div className="mt-4">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-200 hover:bg-white/10">
                  {uploadingFreelancerFile ? "Uploading..." : "Upload project file"}
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg"
                    onChange={(event) =>
                      handleFreelancerUpload(event.target.files?.[0])
                    }
                    disabled={
                      uploadingFreelancerFile ||
                      uploadingClientFile ||
                      actionBusy ||
                      !canFreelancerUpload
                    }
                  />
                </label>
              </div>
            ) : null}
            {role === "freelancer" && !canFreelancerUpload ? (
              <p className="mt-3 text-xs text-amber-300">
                Client requirements must be uploaded before freelancer file uploads.
              </p>
            ) : null}

            {sortedFiles.length === 0 ? (
              <p className="mt-4 text-xs text-slate-500">No files uploaded yet.</p>
            ) : (
              <div className="mt-4 grid gap-2">
                {sortedFiles.map((file) => {
                  const fileUrl = resolveFileUrl(file.fileUrl);
                  const uploaderInfo =
                    file.uploadedBy === contract.clientId
                      ? {
                          id: contract.clientId,
                          name: file.uploaderName || contract.clientName || "Client"
                        }
                      : file.uploadedBy === contract.freelancerId
                        ? {
                            id: contract.freelancerId,
                            name: file.uploaderName || contract.freelancerName || "Freelancer"
                          }
                        : {
                            id: file.uploadedBy || "",
                            name: file.uploaderName || file.role || "member"
                          };
                  return (
                    <article
                      key={file.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm text-white">{file.fileName || "File"}</p>
                          <p className="text-xs text-slate-400">
                            Uploader:{" "}
                            <UserProfileLink
                              userId={uploaderInfo.id}
                              name={uploaderInfo.name}
                              className="text-sky-200 underline hover:text-sky-100"
                            />
                            {" · "}
                            {toDate(file.uploadedAt)?.toLocaleString() || "N/A"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isPreviewableWorkspaceFile(file.fileName, file.mimeType) ? (
                            <Button
                              variant="ghost"
                              onClick={() => window.open(fileUrl, "_blank", "noopener,noreferrer")}
                            >
                              Preview
                            </Button>
                          ) : null}
                          <a href={fileUrl} target="_blank" rel="noreferrer" download>
                            <Button variant="ghost">Download</Button>
                          </a>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="glass-card rounded-2xl p-6">
            <h4 className="text-sm font-semibold text-white">Contract Status</h4>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CONTRACT_FLOW.map((entry) => {
                const isCurrent = entry === status;
                const isCompleted =
                  CONTRACT_FLOW.indexOf(entry) < CONTRACT_FLOW.indexOf(status);
                return (
                  <div
                    key={entry}
                    className={`rounded-xl border px-3 py-2 text-xs ${
                      isCurrent
                        ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                        : isCompleted
                          ? "border-sky-400/30 bg-sky-500/10 text-sky-100"
                          : "border-white/10 bg-white/5 text-slate-400"
                    }`}
                  >
                    {CONTRACT_STATUS_LABELS[entry] || entry}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="glass-card rounded-2xl p-6">
            <h4 className="text-sm font-semibold text-white">Activity Timeline</h4>
            {sortedTimeline.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">No timeline events yet.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {sortedTimeline.map((entry) => (
                  <article
                    key={entry.id}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <p className="text-sm text-white">
                      {entry.message || entry.action || "Activity"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {entry.actorRole || "member"} ·{" "}
                      {toDate(entry.createdAt)?.toLocaleString() || "N/A"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
