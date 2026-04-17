import { useMemo, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Button from "../../components/Button.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import UserProfileLink from "../../components/UserProfileLink.jsx";
import { freelancerNav } from "../../data/nav.js";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import {
  uploadContractFlowDoc,
  uploadContractFinalAsset,
  getStorageUploadErrorMessage
} from "../../services/storageService.js";
import {
  scheduleDemo,
  startDevelopment,
  submitFinalProject,
  submitFlowDoc
} from "../../services/contractsService.js";
import { CONTRACT_STATUS, normalizeContractStatus } from "../../utils/contracts.js";

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

export default function FreelancerContracts() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: contracts = [], loading } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "contracts"), where("freelancerId", "==", user.uid))
        : null,
    [user]
  );

  const [processingId, setProcessingId] = useState("");
  const [demoDraft, setDemoDraft] = useState({});
  const [finalFiles, setFinalFiles] = useState({});

  const sortedContracts = useMemo(() => {
    return [...contracts].sort((a, b) => {
      const aTime = toDate(a.createdAt)?.getTime() || 0;
      const bTime = toDate(b.createdAt)?.getTime() || 0;
      return bTime - aTime;
    });
  }, [contracts]);

  const handleFlowUpload = async (contract, file) => {
    if (!user?.uid || !file) return;
    setProcessingId(contract.id);
    try {
      const url = await uploadContractFlowDoc({
        contractId: contract.id,
        file
      });
      await submitFlowDoc({
        contractId: contract.id,
        freelancerId: user.uid,
        flowDoc: { name: file.name, url }
      });
      toast.success("Flow document submitted.");
    } catch (err) {
      toast.error(getStorageUploadErrorMessage(err, "Failed to upload flow document."));
    } finally {
      setProcessingId("");
    }
  };

  const handleStartDevelopment = async (contract) => {
    if (!user?.uid) return;
    setProcessingId(contract.id);
    try {
      await startDevelopment({ contractId: contract.id, freelancerId: user.uid });
      toast.success("Development started.");
    } catch (err) {
      toast.error(err?.message || "Failed to start development.");
    } finally {
      setProcessingId("");
    }
  };

  const handleScheduleDemo = async (contract) => {
    if (!user?.uid) return;
    const draft = demoDraft[contract.id] || {};
    if (!draft.demoDate || !draft.demoTime || !draft.meetingLink) {
      toast.error("Provide demo date/time and meeting link.");
      return;
    }
    setProcessingId(contract.id);
    try {
      const scheduledAt = new Date(`${draft.demoDate}T${draft.demoTime}`).toISOString();
      await scheduleDemo({
        contractId: contract.id,
        freelancerId: user.uid,
        scheduledAt,
        demoDate: draft.demoDate,
        demoTime: draft.demoTime,
        meetingLink: draft.meetingLink
      });
      toast.success("Demo scheduled.");
    } catch (err) {
      toast.error(err?.message || "Failed to schedule demo.");
    } finally {
      setProcessingId("");
    }
  };

  const handleFinalSubmit = async (contract) => {
    if (!user?.uid) return;
    const files = finalFiles[contract.id] || {};
    if (!files.source || !files.setup || !files.docs) {
      toast.error("Upload source code, setup instructions, and documentation.");
      return;
    }
    setProcessingId(contract.id);
    try {
      const [sourceUrl, setupUrl, docsUrl] = await Promise.all([
        uploadContractFinalAsset({
          contractId: contract.id,
          file: files.source,
          type: "source",
          onProgress: null
        }),
        uploadContractFinalAsset({
          contractId: contract.id,
          file: files.setup,
          type: "setup",
          onProgress: null
        }),
        uploadContractFinalAsset({
          contractId: contract.id,
          file: files.docs,
          type: "docs",
          onProgress: null
        })
      ]);
      await submitFinalProject({
        contractId: contract.id,
        freelancerId: user.uid,
        finalSubmission: {
          sourceCode: { name: files.source.name, url: sourceUrl },
          setupInstructions: { name: files.setup.name, url: setupUrl },
          documentation: { name: files.docs.name, url: docsUrl }
        }
      });
      toast.success("Final submission uploaded.");
    } catch (err) {
      toast.error(getStorageUploadErrorMessage(err, "Failed to submit final project."));
    } finally {
      setProcessingId("");
    }
  };

  return (
    <DashboardLayout
      title="My Contracts"
      sidebar={{ title: "Growlanzer", subtitle: "Freelancer", items: freelancerNav }}
    >
      <PageHeader
        title="My Contracts"
        description="Follow the enterprise workflow and keep deliverables on track."
      />

      {loading ? (
        <EmptyState title="Loading contracts" description="Fetching contracts..." />
      ) : sortedContracts.length === 0 ? (
        <EmptyState title="No contracts yet" description="Contracts appear after you are selected." />
      ) : (
        <div className="grid gap-4">
          {sortedContracts.map((contract) => {
            const status = normalizeContractStatus(
              contract.contractStatus || contract.status
            );
            const canSubmitFlow =
              status === CONTRACT_STATUS.REQUIREMENTS_UPLOADED ||
              status === CONTRACT_STATUS.FLOW_REVISION;
            const canStartDev = status === CONTRACT_STATUS.DEVELOPMENT_READY;
            const canScheduleDemo = status === CONTRACT_STATUS.IN_PROGRESS;
            const canSubmitFinal =
              status === CONTRACT_STATUS.REVISION_REQUESTED ||
              status === CONTRACT_STATUS.IN_PROGRESS;
            const draft = demoDraft[contract.id] || {};

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
                      Client:{" "}
                      <UserProfileLink
                        userId={contract.clientId}
                        name={contract.clientName || contract.clientId}
                        className="text-sky-200 underline hover:text-sky-100"
                      />
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Created: {formatDateTime(contract.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={status} />
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  {canSubmitFlow ? (
                    <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-200">
                      Upload flow doc
                      <input
                        type="file"
                        className="sr-only"
                        onChange={(event) =>
                          handleFlowUpload(contract, event.target.files?.[0])
                        }
                        disabled={processingId === contract.id}
                      />
                    </label>
                  ) : null}

                  {canStartDev ? (
                    <Button
                      variant="ghost"
                      onClick={() => handleStartDevelopment(contract)}
                      disabled={processingId === contract.id}
                    >
                      Start development
                    </Button>
                  ) : null}

                  {canScheduleDemo ? (
                    <div className="flex flex-wrap gap-2 items-center">
                      <input
                        type="date"
                        className="min-h-[40px] rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-slate-200"
                        value={draft.demoDate || ""}
                        onChange={(event) =>
                          setDemoDraft((prev) => ({
                            ...prev,
                            [contract.id]: {
                              ...draft,
                              demoDate: event.target.value
                            }
                          }))
                        }
                      />
                      <input
                        type="time"
                        className="min-h-[40px] rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-slate-200"
                        value={draft.demoTime || ""}
                        onChange={(event) =>
                          setDemoDraft((prev) => ({
                            ...prev,
                            [contract.id]: {
                              ...draft,
                              demoTime: event.target.value
                            }
                          }))
                        }
                      />
                      <input
                        className="min-h-[40px] rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-slate-200"
                        placeholder="Meeting link"
                        value={draft.meetingLink || ""}
                        onChange={(event) =>
                          setDemoDraft((prev) => ({
                            ...prev,
                            [contract.id]: {
                              ...draft,
                              meetingLink: event.target.value
                            }
                          }))
                        }
                      />
                      <Button
                        variant="ghost"
                        onClick={() => handleScheduleDemo(contract)}
                        disabled={processingId === contract.id}
                      >
                        Schedule demo
                      </Button>
                    </div>
                  ) : null}

                  {canSubmitFinal ? (
                    <div className="w-full grid gap-2 sm:grid-cols-3">
                      <input
                        type="file"
                        className="form-input text-xs"
                        onChange={(event) =>
                          setFinalFiles((prev) => ({
                            ...prev,
                            [contract.id]: {
                              ...prev[contract.id],
                              source: event.target.files?.[0] || null
                            }
                          }))
                        }
                      />
                      <input
                        type="file"
                        className="form-input text-xs"
                        onChange={(event) =>
                          setFinalFiles((prev) => ({
                            ...prev,
                            [contract.id]: {
                              ...prev[contract.id],
                              setup: event.target.files?.[0] || null
                            }
                          }))
                        }
                      />
                      <input
                        type="file"
                        className="form-input text-xs"
                        onChange={(event) =>
                          setFinalFiles((prev) => ({
                            ...prev,
                            [contract.id]: {
                              ...prev[contract.id],
                              docs: event.target.files?.[0] || null
                            }
                          }))
                        }
                      />
                      <div className="sm:col-span-3">
                        <Button
                          onClick={() => handleFinalSubmit(contract)}
                          disabled={processingId === contract.id}
                        >
                          Submit final project
                        </Button>
                      </div>
                    </div>
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
