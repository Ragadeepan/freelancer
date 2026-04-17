import { useCallback, useEffect, useState } from "react";
import Button from "./Button.jsx";
import EmptyState from "./EmptyState.jsx";
import ProposalsList from "./ProposalsList.jsx";
import StatusBadge from "./StatusBadge.jsx";
import UserProfileLink from "./UserProfileLink.jsx";
import {
  connectProjectMembers,
  fetchAdminJobView
} from "../services/marketplaceFlowApi.js";

const formatDate = (value) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString();
};

const formatBudget = (job) => {
  if (job?.budget) return String(job.budget);
  const currency = job?.currency || "INR";
  if (job?.projectType === "hourly") {
    const min = job?.hourlyMin || "";
    const max = job?.hourlyMax || "";
    if (min || max) return `${currency} ${min || "0"}-${max || ""} / hr`;
  }
  if (job?.budgetMin || job?.budgetMax) {
    return `${currency} ${job.budgetMin || "0"}-${job.budgetMax || ""}`;
  }
  return "N/A";
};

export default function AdminJobView({ user, jobId, onStatusChange }) {
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const loadView = useCallback(async () => {
    if (!user || !jobId) {
      setPayload(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetchAdminJobView(user, jobId, {
        page,
        limit: 20
      });
      setPayload(response);
    } catch (err) {
      setPayload(null);
      setError(err?.message || "Failed to load admin job view.");
    } finally {
      setLoading(false);
    }
  }, [jobId, page, user]);

  useEffect(() => {
    loadView();
  }, [loadView, refreshTick]);

  useEffect(() => {
    setPage(1);
  }, [jobId]);

  const handleConnect = async () => {
    const projectId = payload?.project?.id || payload?.job?.projectId;
    if (!projectId || !user) return;
    setConnecting(true);
    try {
      await connectProjectMembers(user, projectId);
      onStatusChange?.("Client and freelancer connected by admin.");
      setRefreshTick((value) => value + 1);
    } catch (err) {
      onStatusChange?.(err?.message || "Failed to connect project members.");
    } finally {
      setConnecting(false);
    }
  };

  if (!jobId) {
    return (
      <EmptyState
        title="Select a job"
        description="Pick a job to inspect proposals and project connection status."
      />
    );
  }

  if (loading) {
    return <EmptyState title="Loading job details" description="Fetching proposals..." />;
  }

  if (error) {
    return <p className="text-sm text-rose-300">{error}</p>;
  }

  const job = payload?.job;
  if (!job) {
    return (
      <EmptyState
        title="Job view unavailable"
        description="Unable to load selected job details."
      />
    );
  }

  const project = payload?.project || null;
  const canConnect = Boolean(project?.id) && String(project.status || "").toLowerCase() === "assigned";

  return (
    <section className="glass-card rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Admin job view</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            {job.title || "Untitled job"}
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            Client:{" "}
            <UserProfileLink
              userId={job.clientId}
              name={job.clientName || job.clientId || "N/A"}
              className="text-sky-200 underline hover:text-sky-100"
            />{" "}
            · Budget: {formatBudget(job)} · Created{" "}
            {formatDate(job.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={job.status || "unknown"} />
          {canConnect ? (
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? "Connecting..." : "Connect Client & Freelancer"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
          Proposals: {payload?.pagination?.total || 0}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
          Selected:{" "}
          {payload?.selectedProposal ? (
            <UserProfileLink
              userId={payload.selectedProposal.freelancerId}
              name={
                payload.selectedProposal.freelancerName ||
                payload.selectedProposal.freelancerId ||
                "Not selected"
              }
              className="text-sky-200 underline hover:text-sky-100"
            />
          ) : (
            "Not selected"
          )}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
          Project: {project?.id || job.projectId || "Not created"}
          {project?.status ? ` · ${project.status}` : ""}
        </div>
      </div>

      <div className="mt-6">
        <h4 className="text-sm font-semibold text-white">All proposals</h4>
        <div className="mt-3">
          <ProposalsList
            proposals={payload?.proposals || []}
            loading={false}
            canSelectFreelancer={false}
            selectedProposalId={job.selectedProposalId || ""}
            page={payload?.pagination?.page || 1}
            totalPages={payload?.pagination?.totalPages || 1}
            total={payload?.pagination?.total || 0}
            onPageChange={setPage}
            showRank
            emptyTitle="No proposals"
            emptyDescription="No proposals were submitted for this job."
          />
        </div>
      </div>
    </section>
  );
}
