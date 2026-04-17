import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import StatCard from "../../components/StatCard.jsx";
import ChartLine from "../../components/ChartLine.jsx";
import ProposalCard from "../../components/ProposalCard.jsx";
import Button from "../../components/Button.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import { clientNav } from "../../data/nav.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { collection, query, where } from "firebase/firestore";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { getClientProfileCompletion } from "../../utils/clientProfile.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import {
  ACCOUNT_STATUS,
  canClientPostJob,
  getClientPostJobBlockedMessage,
  normalizeAccountStatus
} from "../../utils/accountStatus.js";

const statusProgress = {
  assigned: 20,
  connected: 30,
  in_progress: 45,
  work_submitted: 82,
  revision_requested: 62,
  completed: 100,
  cancelled: 0,
  frozen: 30
};

const buildWeeklySeries = (items, getDate) => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  const series = Array(7).fill(0);
  const msPerDay = 24 * 60 * 60 * 1000;
  items.forEach((item) => {
    const raw = getDate(item);
    const date = raw?.toDate ? raw.toDate() : raw ? new Date(raw) : null;
    if (!date) return;
    const index = Math.floor((date - start) / msPerDay);
    if (index >= 0 && index < series.length) {
      series[index] += 1;
    }
  });
  return series;
};

export default function ClientDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: jobs = [] } = useFirestoreQuery(
    () =>
      user ? query(collection(db, "jobs"), where("clientId", "==", user.uid)) : null,
    [user]
  );
  const { data: projects = [] } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "projects"), where("clientId", "==", user.uid))
        : null,
    [user]
  );
  const { data: payments = [] } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "payments"), where("clientId", "==", user.uid))
        : null,
    [user]
  );
  const { data: proposals = [] } = useFirestoreQuery(
    () =>
      user
        ? query(
            collection(db, "proposals"),
            where("clientId", "==", user.uid)
          )
        : null,
    [user]
  );

  const pendingJobs = useMemo(
    () => jobs.filter((job) => job.status === "pending").length,
    [jobs]
  );
  const pendingProposals = proposals.filter(
    (proposal) => proposal.status === "pending"
  );
  const selectedProposals = proposals.filter(
    (proposal) => proposal.status === "selected"
  );
  const visibleProposals = proposals.filter((proposal) =>
    ["selected", "pending"].includes(proposal.status)
  );
  const escrowTotal = payments
    .filter((payment) => ["escrow", "held"].includes(payment.status))
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const activeProjects = projects.filter(
    (project) => ["connected", "in_progress", "work_submitted", "revision_requested"].includes(project.status)
  ).length;

  const jobSeries = useMemo(
    () => buildWeeklySeries(jobs, (job) => job.createdAt),
    [jobs]
  );

  const { completedCount, total, percent } = getClientProfileCompletion(profile);
  const normalizedStatus = normalizeAccountStatus(profile?.status);
  const canOpenPostJob = canClientPostJob({ ...(profile || {}), role: "client" });
  const handleOpenPostJob = () => {
    if (canOpenPostJob) {
      navigate("/client/post-job");
      return;
    }
    const message = getClientPostJobBlockedMessage({
      ...(profile || {}),
      role: "client"
    });
    toast.permission(message);
    navigate("/client/company-profile");
  };

  return (
    <DashboardLayout
      title="Client Overview"
      action="Post a Job"
      onAction={handleOpenPostJob}
      sidebar={{ title: "Client Suite", subtitle: "Client", items: clientNav }}
    >
      {normalizedStatus === ACCOUNT_STATUS.PENDING_APPROVAL ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          🚫 Admin approval required before posting jobs.
        </div>
      ) : null}
      <section className="grid gap-5 lg:grid-cols-4">
        <StatCard
          title="Active jobs"
          value={jobs.length}
          meta={`${pendingJobs} pending approval`}
        />
        <StatCard
          title="Proposals"
          value={proposals.length}
          meta={`${selectedProposals.length} selected`}
        />
        <StatCard
          title="Escrow balance"
          value={`₹${escrowTotal.toFixed(2)}`}
          meta={`${payments.filter((p) => ["escrow", "held"].includes(p.status)).length} in escrow`}
        />
        <div className="glass-card rounded-2xl p-6">
          <h4 className="text-sm font-semibold text-white">
            Profile completion
          </h4>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
            <span>Progress</span>
            <span className="text-slate-100">{percent}%</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/10">
            <div
              className="h-2 rounded-full bg-emerald-400"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {completedCount} of {total} fields complete
          </p>
          <Link to="/client/company-profile" className="mt-4 inline-block text-xs text-slate-200">
            Update profile
          </Link>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <ChartLine
          title="Job activity"
          subtitle="Last 7 days"
          data={jobSeries}
        />
        <div className="glass-card rounded-2xl p-6">
          <h4 className="text-sm font-semibold text-white">
            Project progress
          </h4>
          <div className="mt-4 space-y-4">
            {projects.length === 0 ? (
              <EmptyState
                title="No active projects"
                description="Projects appear after an admin-approved proposal is selected."
              />
            ) : (
              projects.map((project) => {
                const progress =
                  statusProgress[project.status] ??
                  (project.status === "completed" ? 100 : 20);
                return (
                  <div
                    key={project.id}
                    className="rounded-xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">
                        {project.jobTitle || "Project"}
                      </p>
                      <span className="text-xs text-slate-400">
                        {progress}%
                      </span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white/10">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-glow-violet to-glow-cyan"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-white">Top proposals</h4>
          <div className="grid gap-4">
            {visibleProposals.length === 0 ? (
              <EmptyState
                title="No proposals yet"
                description="Proposals will show up after freelancers apply."
              />
            ) : (
              visibleProposals.slice(0, 3).map((proposal) => (
                <ProposalCard key={proposal.id} proposal={proposal} />
              ))
            )}
          </div>
        </div>
        <div className="glass-card rounded-2xl p-6">
          <h4 className="text-sm font-semibold text-white">Next actions</h4>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            <li>{pendingJobs} jobs awaiting admin approval.</li>
            <li>{pendingProposals.length} proposals pending your review.</li>
            <li>{selectedProposals.length} freelancers selected by you.</li>
            <li>{activeProjects} active projects in progress.</li>
          </ul>
          <Link to="/client/jobs">
            <Button className="mt-6 w-full" variant="ghost">
              Review proposals
            </Button>
          </Link>
        </div>
      </section>
    </DashboardLayout>
  );
}
