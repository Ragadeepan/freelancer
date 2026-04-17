import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import Button from "../../components/Button.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import UserProfileLink from "../../components/UserProfileLink.jsx";
import { clientNav } from "../../data/nav.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { collection, doc, query, where } from "firebase/firestore";
import { db } from "../../firebase/firebase.js";
import useFirestoreDoc from "../../hooks/useFirestoreDoc.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { createProjectUpdate } from "../../services/projectUpdatesService.js";
import { createEscrowPayment } from "../../services/paymentsService.js";
import { createDispute } from "../../services/disputesService.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import {
  TOTAL_PROJECT_INSTALLMENTS,
  buildInstallmentProgress,
  getInstallmentFundingState,
  parseAmountFromText
} from "../../utils/paymentFlow.js";

const toStatus = (value) => String(value || "").trim().toLowerCase();
const isConnectedProject = (project) => toStatus(project?.status) === "connected";
const getProjectWorkspaceRoute = (project) =>
  project?.contractId ? `/workspace/project/${project.contractId}` : `/project/${project.id}`;

export default function ClientProjects() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: projects = [], loading } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "projects"), where("clientId", "==", user.uid))
        : null,
    [user]
  );
  const { data: settings } = useFirestoreDoc(
    () => doc(db, "settings", "global"),
    []
  );
  const { data: payments = [] } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "payments"), where("clientId", "==", user.uid))
        : null,
    [user]
  );
  const [amounts, setAmounts] = useState({});
  const [disputes, setDisputes] = useState({});
  const [status, setStatus] = useState("");
  const [commissionRate, setCommissionRate] = useState(10);

  useEffect(() => {
    if (settings?.commissionPercentage != null) {
      setCommissionRate(Number(settings.commissionPercentage));
    }
  }, [settings]);

  const paymentsByProject = useMemo(() => {
    const map = new Map();
    payments.forEach((payment) => {
      if (!payment.projectId) return;
      if (!map.has(payment.projectId)) {
        map.set(payment.projectId, []);
      }
      map.get(payment.projectId).push(payment);
    });
    return map;
  }, [payments]);

  const handleAmountChange = (projectId, value) => {
    setAmounts((prev) => ({ ...prev, [projectId]: value }));
  };

  const ensureConnected = (project, actionLabel) => {
    if (isConnectedProject(project)) return true;
    const message = `Admin connection pending. You can ${actionLabel} after admin connects client and freelancer.`;
    setStatus(message);
    toast.permission(message);
    return false;
  };

  const handleRequestUpdate = async (project, requestedStatus) => {
    setStatus("");
    if (!ensureConnected(project, "request updates")) return;
    try {
      await createProjectUpdate({
        projectId: project.id,
        requestedBy: user.uid,
        requestedStatus,
        message: `Client requested status: ${requestedStatus}`
      });
      setStatus("Update request sent to Admin for approval.");
      toast.success("Update request sent.");
    } catch (err) {
      setStatus(err.message || "Failed to request update.");
      toast.error("Failed to request update.");
    }
  };

  const handleFundEscrow = async (project) => {
    setStatus("");
    if (!ensureConnected(project, "fund escrow")) return;
    const projectPayments = paymentsByProject.get(project.id) || [];
    const fundingState = getInstallmentFundingState(
      projectPayments,
      TOTAL_PROJECT_INSTALLMENTS
    );
    const nextInstallment = fundingState.nextInstallment;
    if (!nextInstallment) {
      setStatus(
        fundingState.reason ||
          "Installment funding is locked until admin review completes."
      );
      return;
    }
    const rawAmount = parseAmountFromText(amounts[project.id]);
    if (!rawAmount) {
      setStatus("Enter an escrow amount to fund.");
      return;
    }
    try {
      const commission = (rawAmount * commissionRate) / 100;
      await createEscrowPayment({
        projectId: project.id,
        jobId: project.jobId || null,
        amount: rawAmount,
        commission,
        clientId: user.uid,
        freelancerId: project.freelancerId,
        installmentNumber: nextInstallment,
        totalInstallments: TOTAL_PROJECT_INSTALLMENTS,
        reviewStatus: "pending"
      });
      setStatus(
        `Installment ${nextInstallment}/${TOTAL_PROJECT_INSTALLMENTS} funded. Admin will review and release.`
      );
      toast.success("Installment funded.");
    } catch (err) {
      setStatus(err.message || "Failed to fund escrow.");
      toast.error("Failed to fund escrow.");
    }
  };

  const handleDisputeChange = (projectId, value) => {
    setDisputes((prev) => ({ ...prev, [projectId]: value }));
  };

  const handleRaiseDispute = async (project) => {
    setStatus("");
    if (!ensureConnected(project, "raise disputes")) return;
    const reason = disputes[project.id]?.trim();
    if (!reason) {
      setStatus("Provide a reason to raise a dispute.");
      return;
    }
    try {
      await createDispute({
        projectId: project.id,
        raisedBy: user.uid,
        reason
      });
      setStatus("Dispute submitted to Admin.");
      toast.success("Dispute submitted.");
    } catch (err) {
      setStatus(err.message || "Failed to raise dispute.");
      toast.error("Failed to raise dispute.");
    }
  };

  return (
    <DashboardLayout
      title="Client Projects"
      sidebar={{ title: "Client Suite", subtitle: "Client", items: clientNav }}
    >
      <PageHeader
        title="Active projects"
        description="Review progress, approve submissions, and manage escrow."
      />
      <div className="grid gap-4">
        {loading ? (
          <EmptyState title="Loading projects" description="Fetching projects..." />
        ) : projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Projects start after admin selects a freelancer for your job."
          />
        ) : (
          projects.map((project) => (
            <div key={project.id} className="glass-card rounded-2xl p-6">
              {(() => {
                const projectPayments = paymentsByProject.get(project.id) || [];
                const fundingState = getInstallmentFundingState(
                  projectPayments,
                  TOTAL_PROJECT_INSTALLMENTS
                );
                const nextInstallment = fundingState.nextInstallment;
                const installmentProgress = buildInstallmentProgress(
                  projectPayments,
                  TOTAL_PROJECT_INSTALLMENTS
                );
                const connected = isConnectedProject(project);
                return (
                  <>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h4 className="text-lg font-semibold text-white">
                    {project.jobTitle || "Project"}
                  </h4>
                  <p className="mt-1 text-sm text-slate-400">
                    Freelancer:{" "}
                    <UserProfileLink
                      userId={project.freelancerId}
                      name={project.freelancerName || project.freelancerId}
                      className="text-sky-200 underline hover:text-sky-100"
                    />
                  </p>
                </div>
                <StatusBadge status={project.status} />
              </div>
              {!connected ? (
                <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                  Admin connection pending. Payment and workspace actions unlock after admin connects client and freelancer.
                </div>
              ) : null}
              <div className="mt-3 grid gap-2 lg:grid-cols-3">
                {installmentProgress.map((entry) => (
                  <div
                    key={`${project.id}-${entry.installmentNumber}`}
                    className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300"
                  >
                    #{entry.installmentNumber} {entry.label}:{" "}
                    {entry.latestPayment
                      ? `${entry.status} · INR ${Number(
                          entry.latestPayment.amount || 0
                        ).toFixed(2)}`
                      : "not funded"}
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                <input
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500"
                  placeholder={
                    nextInstallment
                      ? `Installment ${nextInstallment} amount`
                      : "All installments funded"
                  }
                  value={amounts[project.id] || ""}
                  onChange={(event) =>
                    handleAmountChange(project.id, event.target.value)
                  }
                />
                <Button
                  onClick={() => handleFundEscrow(project)}
                >
                  {nextInstallment
                    ? `Fund installment ${nextInstallment}`
                    : "All installments funded"}
                </Button>
              </div>
              {!nextInstallment && fundingState.reason ? (
                <p className="mt-2 text-xs text-amber-300">{fundingState.reason}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <Link to={getProjectWorkspaceRoute(project)}>
                  <Button variant="ghost">
                    Open project
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  onClick={() => handleRequestUpdate(project, "revision_requested")}
                >
                  Request revision
                </Button>
                <Button
                  onClick={() => handleRequestUpdate(project, "completed")}
                >
                  Approve completion
                </Button>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                <input
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500"
                  placeholder="Dispute reason"
                  value={disputes[project.id] || ""}
                  onChange={(event) =>
                    handleDisputeChange(project.id, event.target.value)
                  }
                />
                <Button
                  variant="danger"
                  onClick={() => handleRaiseDispute(project)}
                >
                  Raise dispute
                </Button>
              </div>
                  </>
                );
              })()}
            </div>
          ))
        )}
        {status && <p className="text-sm text-slate-300">{status}</p>}
      </div>
    </DashboardLayout>
  );
}
