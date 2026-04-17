import { useMemo, useState } from "react";
import { collection, doc, query, where } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Button from "../../components/Button.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import UserProfileLink from "../../components/UserProfileLink.jsx";
import { clientNav } from "../../data/nav.js";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import {
  uploadContractFeedback,
  uploadContractRequirement,
  getStorageUploadErrorMessage
} from "../../services/storageService.js";
import {
  approveFinalSubmission,
  approveFlow,
  markContractPaid,
  requestFlowRevision,
  requestRequirementCancellation,
  uploadFeedback,
  uploadRequirements
} from "../../services/contractsService.js";
import {
  CONTRACT_STATUS,
  CONTRACT_STATUS_LABELS,
  normalizeContractStatus
} from "../../utils/contracts.js";

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateTime = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleString() : "N/A";
};

export default function ClientContracts() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: settings } = useFirestoreQuery(
    () => doc(db, "settings", "global"),
    [],
    null
  );
  const { data: contracts = [], loading } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "contracts"), where("clientId", "==", user.uid))
        : null,
    [user]
  );

  const [processingId, setProcessingId] = useState("");

  const commissionRate = Number(settings?.commissionPercentage || 0);

  const sortedContracts = useMemo(() => {
    return [...contracts].sort((a, b) => {
      const aTime = toDate(a.createdAt)?.getTime() || 0;
      const bTime = toDate(b.createdAt)?.getTime() || 0;
      return bTime - aTime;
    });
  }, [contracts]);

  const handlePay = async (contract) => {
    if (!user?.uid) return;
    setProcessingId(contract.id);
    try {
      await markContractPaid({
        contractId: contract.id,
        clientId: user.uid,
        commissionRate
      });
      toast.success("Contract funded. Upload requirements within 24 hours.");
    } catch (err) {
      toast.error(err?.message || "Failed to fund contract.");
    } finally {
      setProcessingId("");
    }
  };

  const handleRequirementUpload = async (contract, file) => {
    if (!user?.uid || !file) return;
    setProcessingId(contract.id);
    try {
      const url = await uploadContractRequirement({
        contractId: contract.id,
        file
      });
      await uploadRequirements({
        contractId: contract.id,
        clientId: user.uid,
        requirementFile: { name: file.name, url }
      });
      toast.success("Requirements uploaded.");
    } catch (err) {
      toast.error(getStorageUploadErrorMessage(err, "Failed to upload requirements."));
    } finally {
      setProcessingId("");
    }
  };

  const handleApproveFlow = async (contract) => {
    if (!user?.uid) return;
    setProcessingId(contract.id);
    try {
      await approveFlow({ contractId: contract.id, clientId: user.uid });
      toast.success("Flow approved. Freelancer can start development.");
    } catch (err) {
      toast.error(err?.message || "Failed to approve flow.");
    } finally {
      setProcessingId("");
    }
  };

  const handleFlowRevision = async (contract) => {
    if (!user?.uid) return;
    setProcessingId(contract.id);
    try {
      await requestFlowRevision({
        contractId: contract.id,
        clientId: user.uid
      });
      toast.success("Flow revision requested.");
    } catch (err) {
      toast.error(err?.message || "Failed to request flow revision.");
    } finally {
      setProcessingId("");
    }
  };

  const handleFeedbackUpload = async (contract, file) => {
    if (!user?.uid || !file) return;
    setProcessingId(contract.id);
    try {
      const url = await uploadContractFeedback({
        contractId: contract.id,
        file
      });
      await uploadFeedback({
        contractId: contract.id,
        clientId: user.uid,
        feedbackDoc: { name: file.name, url }
      });
      toast.success("Feedback uploaded.");
    } catch (err) {
      toast.error(getStorageUploadErrorMessage(err, "Failed to upload feedback."));
    } finally {
      setProcessingId("");
    }
  };

  const handleApproveFinal = async (contract) => {
    if (!user?.uid) return;
    setProcessingId(contract.id);
    try {
      await approveFinalSubmission({ contractId: contract.id, clientId: user.uid });
      toast.success("Final submission approved.");
    } catch (err) {
      toast.error(err?.message || "Failed to approve final submission.");
    } finally {
      setProcessingId("");
    }
  };

  const handleCancellationRequest = async (contract) => {
    if (!user?.uid) return;
    setProcessingId(contract.id);
    try {
      await requestRequirementCancellation({ contractId: contract.id, clientId: user.uid });
      toast.success("Cancellation request submitted to admin.");
    } catch (err) {
      toast.error(err?.message || "Failed to request cancellation.");
    } finally {
      setProcessingId("");
    }
  };

  return (
    <DashboardLayout
      title="Contracts"
      sidebar={{ title: "Client Suite", subtitle: "Client", items: clientNav }}
    >
      <PageHeader
        title="Contracts"
        description="Manage enterprise contract workflow with required approvals."
      />

      {loading ? (
        <EmptyState title="Loading contracts" description="Fetching contracts..." />
      ) : sortedContracts.length === 0 ? (
        <EmptyState title="No contracts yet" description="Contracts appear after freelancer selection." />
      ) : (
        <div className="grid gap-4">
          {sortedContracts.map((contract) => {
            const status = normalizeContractStatus(
              contract.contractStatus || contract.status
            );
            const dueAt = toDate(contract.requirementDeadline || contract.requirementDueAt);
            const isDeadlineMissed = Boolean(dueAt && Date.now() > dueAt.getTime());
            const canPay = status === CONTRACT_STATUS.AWAITING_PAYMENT;
            const canUploadReq = status === CONTRACT_STATUS.AWAITING_REQUIREMENTS;
            const canApproveFlow = status === CONTRACT_STATUS.FLOW_SUBMITTED;
            const canRequestFlowRevision = status === CONTRACT_STATUS.FLOW_SUBMITTED;
            const canUploadFeedback = status === CONTRACT_STATUS.DEMO_SCHEDULED;
            const canApproveFinal = status === CONTRACT_STATUS.FINAL_SUBMITTED;
            // release pending is handled after final approval

            return (
              <div key={contract.id} className="glass-card rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      {contract.title || "Contract"}
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      Amount: {contract.currency || "INR"} {Number(contract.amount || 0).toFixed(2)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Freelancer:{" "}
                      <UserProfileLink
                        userId={contract.freelancerId}
                        name={contract.freelancerName || contract.freelancerId}
                        className="text-sky-200 underline hover:text-sky-100"
                      />
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Created: {formatDateTime(contract.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={status} />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-300">
                    <p className="uppercase tracking-[0.2em] text-slate-500">Requirement due</p>
                    <p className="mt-2 text-sm text-white">
                      {dueAt ? dueAt.toLocaleString() : "N/A"}
                    </p>
                    {status === CONTRACT_STATUS.AWAITING_REQUIREMENTS && dueAt ? (
                      <p className="mt-1 text-xs text-amber-200">
                        Upload required within 24 hours.
                      </p>
                    ) : null}
                    {isDeadlineMissed && status === CONTRACT_STATUS.AWAITING_REQUIREMENTS ? (
                      <p className="mt-1 text-xs text-rose-200">
                        Deadline missed. You can request cancellation.
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-300">
                    <p className="uppercase tracking-[0.2em] text-slate-500">Status</p>
                    <p className="mt-2 text-sm text-white">
                      {CONTRACT_STATUS_LABELS[status] || status}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  {canPay ? (
                    <Button
                      onClick={() => handlePay(contract)}
                      disabled={processingId === contract.id}
                    >
                      Pay full amount
                    </Button>
                  ) : null}

                  {canUploadReq ? (
                    <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-200">
                      Upload requirements
                      <input
                        type="file"
                        className="sr-only"
                        onChange={(event) =>
                          handleRequirementUpload(contract, event.target.files?.[0])
                        }
                        disabled={processingId === contract.id}
                      />
                    </label>
                  ) : null}

                  {isDeadlineMissed && status === CONTRACT_STATUS.AWAITING_REQUIREMENTS ? (
                    <Button
                      variant="ghost"
                      onClick={() => handleCancellationRequest(contract)}
                      disabled={processingId === contract.id}
                    >
                      Request cancellation
                    </Button>
                  ) : null}

                  {canApproveFlow ? (
                    <Button
                      variant="ghost"
                      onClick={() => handleApproveFlow(contract)}
                      disabled={processingId === contract.id}
                    >
                      Approve flow
                    </Button>
                  ) : null}

                  {canRequestFlowRevision ? (
                    <Button
                      variant="ghost"
                      onClick={() => handleFlowRevision(contract)}
                      disabled={processingId === contract.id}
                    >
                      Request flow revision
                    </Button>
                  ) : null}

                  {canUploadFeedback ? (
                    <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-200">
                      Upload feedback
                      <input
                        type="file"
                        className="sr-only"
                        onChange={(event) =>
                          handleFeedbackUpload(contract, event.target.files?.[0])
                        }
                        disabled={processingId === contract.id}
                      />
                    </label>
                  ) : null}

                  {canApproveFinal ? (
                    <Button
                      variant="ghost"
                      onClick={() => handleApproveFinal(contract)}
                      disabled={processingId === contract.id}
                    >
                      Approve final submission
                    </Button>
                  ) : null}

                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
