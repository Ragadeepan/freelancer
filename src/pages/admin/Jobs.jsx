import { useMemo, useState } from "react";
import { collection } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import StatCard from "../../components/StatCard.jsx";
import JobCard from "../../components/JobCard.jsx";
import Table from "../../components/Table.jsx";
import Button from "../../components/Button.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import AdminJobView from "../../components/AdminJobView.jsx";
import UserProfileLink from "../../components/UserProfileLink.jsx";
import { adminNav } from "../../data/nav.js";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { approveJob, rejectJob } from "../../services/jobsService.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";

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

const formatActionError = (err, fallback) => {
  const raw = String(err?.message || "");
  if (err?.code === "permission-denied" || /Missing or insufficient permissions/i.test(raw)) {
    return "Permission denied for this action. Use a valid admin account or update Firestore rules.";
  }
  return err?.message || fallback;
};

export default function AdminJobs() {
  const { user } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [processing, setProcessing] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedJobId, setSelectedJobId] = useState(null);

  const { data: jobs = [], loading } = useFirestoreQuery(
    () => collection(db, "jobs"),
    []
  );
  const { data: proposals = [] } = useFirestoreQuery(
    () => collection(db, "proposals"),
    []
  );

  const proposalsByJob = useMemo(() => {
    const map = new Map();
    proposals.forEach((proposal) => {
      if (!map.has(proposal.jobId)) {
        map.set(proposal.jobId, []);
      }
      map.get(proposal.jobId).push(proposal);
    });
    return map;
  }, [proposals]);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) || null,
    [jobs, selectedJobId]
  );

  const pendingJobs = useMemo(
    () => jobs.filter((job) => job.status === "pending"),
    [jobs]
  );
  const approvedJobs = useMemo(
    () => jobs.filter((job) => job.status === "approved"),
    [jobs]
  );
  const assignedJobs = useMemo(
    () => jobs.filter((job) => job.selectedProposalId),
    [jobs]
  );
  const rejectedJobs = useMemo(
    () => jobs.filter((job) => job.status === "rejected"),
    [jobs]
  );

  const filteredJobs = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return jobs.filter((job) => {
      if (statusFilter !== "all" && (job.status || "unknown") !== statusFilter) {
        return false;
      }
      if (!searchTerm) return true;
      const selectedFreelancer =
        job.selectedFreelancerName || job.selectedFreelancerId || "";
      return (
        String(job.title || "").toLowerCase().includes(searchTerm) ||
        String(job.clientId || "").toLowerCase().includes(searchTerm) ||
        String(job.id || "").toLowerCase().includes(searchTerm) ||
        String(selectedFreelancer).toLowerCase().includes(searchTerm)
      );
    });
  }, [jobs, search, statusFilter]);

  const handleApproveJob = async (job) => {
    if (!user?.uid) return;
    setStatus("");
    setProcessing(`job-${job.id}`);
    try {
      const result = await approveJob(job.id, user.uid);
      const base = `Approved ${job.title || job.id}.`;
      const delivery =
        ` Client notified: ${result.clientNotificationSent ? "yes" : "no"}.` +
        ` Freelancers notified: ${result.freelancerNotifications || 0}.`;
      if (result.notificationsDelivered === false) {
        const message =
          `${base}${delivery} ${result.failedNotifications || 0} notification(s) failed.`;
        setStatus(message);
        toast.permission("Job approved. Some notifications could not be sent.");
      } else {
        setStatus(`${base}${delivery}`);
        toast.success("Job approved and notifications sent.");
      }
    } catch (err) {
      const message = formatActionError(err, "Failed to approve job.");
      setStatus(message);
      toast.error("Failed to approve job.");
    } finally {
      setProcessing(null);
    }
  };

  const handleRejectJob = async (job) => {
    if (!user?.uid) return;
    setStatus("");
    setProcessing(`job-${job.id}`);
    try {
      const result = await rejectJob(job.id, user.uid);
      const base = `Rejected ${job.title || job.id}.`;
      if (result.notificationsDelivered === false) {
        setStatus(
          `${base} ${
            result.failedNotifications || 0
          } notification(s) failed.`
        );
        toast.permission("Job rejected. Notification delivery was partial.");
      } else {
        setStatus(
          `${base} Client notified: ${result.clientNotificationSent ? "yes" : "no"}.`
        );
        toast.success("Job rejected and client notified.");
      }
    } catch (err) {
      const message = formatActionError(err, "Failed to reject job.");
      setStatus(message);
      toast.error("Failed to reject job.");
    } finally {
      setProcessing(null);
    }
  };

  const rows = filteredJobs.map((job) => {
    const proposalCount = (proposalsByJob.get(job.id) || []).length;
    const selectedFreelancerName =
      job.selectedFreelancerName || job.selectedFreelancerId || "Not selected";
    const row = [
      job.title || "Untitled",
      (
        <UserProfileLink
          key={`${job.id}-client-link`}
          userId={job.clientId}
          name={job.clientName || job.clientId || "N/A"}
          className="text-sky-200 underline hover:text-sky-100"
        />
      ),
      formatBudget(job),
      proposalCount,
      { type: "status", value: job.status || "unknown" },
      job.selectedFreelancerId ? (
        <UserProfileLink
          key={`${job.id}-freelancer-link`}
          userId={job.selectedFreelancerId}
          name={selectedFreelancerName}
          className="text-sky-200 underline hover:text-sky-100"
        />
      ) : (
        selectedFreelancerName
      ),
      formatDate(job.createdAt),
      <Button
        key={`${job.id}-view`}
        variant="ghost"
        onClick={() => setSelectedJobId(job.id)}
      >
        View details
      </Button>
    ];
    row.id = job.id;
    return row;
  });

  return (
    <DashboardLayout
      title="Jobs"
      sidebar={{ title: "Admin HQ", subtitle: "Admin", items: adminNav }}
    >
      <PageHeader
        title="Job moderation and assignment"
        description="Approve jobs, inspect ranked proposals, and connect client and freelancer after client selection."
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <StatCard title="Total jobs" value={jobs.length} />
        <StatCard title="Pending jobs" value={pendingJobs.length} meta="Needs approval" />
        <StatCard title="Approved jobs" value={approvedJobs.length} />
        <StatCard
          title="Assigned jobs"
          value={assignedJobs.length}
          meta={`${rejectedJobs.length} rejected`}
        />
      </section>

      <section className="glass-card rounded-2xl p-5">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.6fr]">
          <input
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
            placeholder="Search by job title, client, job id, or selected freelancer"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In progress</option>
            <option value="connected">Connected</option>
            <option value="closed">Closed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-white">Pending job approvals</h4>
        {loading ? (
          <EmptyState title="Loading jobs" description="Fetching pending jobs..." />
        ) : pendingJobs.length === 0 ? (
          <EmptyState
            title="No pending jobs"
            description="No jobs are waiting for approval."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {pendingJobs.slice(0, 8).map((job) => (
              <JobCard
                key={job.id}
                job={job}
                action="Approve job"
                actionVariant="primary"
                onAction={handleApproveJob}
                actionDisabled={processing === `job-${job.id}`}
                secondaryAction="Reject"
                secondaryVariant="danger"
                onSecondaryAction={handleRejectJob}
                secondaryDisabled={processing === `job-${job.id}`}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-white">
          Job registry ({filteredJobs.length})
        </h4>
        {loading ? (
          <EmptyState title="Loading jobs" description="Fetching jobs..." />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No matching jobs"
            description="Try adjusting your filters."
          />
        ) : (
          <Table
            columns={[
              "Job",
              "Client",
              "Budget",
              "Proposals",
              "Status",
              "Selected freelancer",
              "Created",
              "Action"
            ]}
            rows={rows}
            getRowKey={(row) => row.id}
          />
        )}
      </section>

      {selectedJob ? (
        <section className="space-y-3">
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setSelectedJobId(null)}>
              Close job view
            </Button>
          </div>
          <AdminJobView user={user} jobId={selectedJob.id} onStatusChange={setStatus} />
        </section>
      ) : null}

      {status ? <p className="text-sm text-slate-300">{status}</p> : null}
    </DashboardLayout>
  );
}
