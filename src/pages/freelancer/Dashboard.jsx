import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import StatCard from "../../components/StatCard.jsx";
import ChartLine from "../../components/ChartLine.jsx";
import ChartDonut from "../../components/ChartDonut.jsx";
import JobCard from "../../components/JobCard.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import { freelancerNav } from "../../data/nav.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { collection, query, where } from "firebase/firestore";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { filterVisibleProjects } from "../../utils/projectVisibility.js";
import {
  FREELANCER_REQUIRED_FIELD_LABELS,
  getFreelancerMissingRequiredFields,
  isFreelancerReviewReady
} from "../../utils/freelancerOnboarding.js";
import {
  ACCOUNT_STATUS,
  canFreelancerApplyJob,
  normalizeAccountStatus
} from "../../utils/accountStatus.js";

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

const toTime = (value) => {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 0;
  return date.getTime();
};

export default function FreelancerDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const normalizedStatus = normalizeAccountStatus(profile?.status);
  const isApproved = normalizedStatus === ACCOUNT_STATUS.APPROVED;
  const isReviewReady = isFreelancerReviewReady(profile);
  const canApplyJobs = canFreelancerApplyJob({
    ...(profile || {}),
    role: "freelancer"
  });
  const { data: jobs = [] } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "jobs"), where("status", "==", "approved"))
        : null,
    [user]
  );
  const { data: projects = [] } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "projects"), where("freelancerId", "==", user.uid))
        : null,
    [user]
  );
  const { data: proposals = [] } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "proposals"), where("freelancerId", "==", user.uid))
        : null,
    [user]
  );
  const { data: notifications = [] } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "notifications"), where("recipientId", "==", user.uid))
        : null,
    [user]
  );
  const { data: payouts = [] } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "payouts"), where("freelancerId", "==", user.uid))
        : null,
    [user]
  );

  const visibleProjects = useMemo(
    () => filterVisibleProjects(projects),
    [projects]
  );
  const earnings = payouts.reduce(
    (sum, payout) =>
      ["paid", "released", "processed"].includes(
        String(payout.status || "").toLowerCase()
      )
        ? sum + (Number(payout.amount) || 0)
        : sum,
    0
  );

  const jobSeries = useMemo(
    () => buildWeeklySeries(jobs, (job) => job.createdAt),
    [jobs]
  );
  const completedProjects = visibleProjects.filter(
    (project) => project.status === "completed"
  ).length;
  const selectedProposals = proposals.filter(
    (proposal) => proposal.status === "selected"
  ).length;
  const unreadNotifications = notifications.filter(
    (notification) => !notification.read
  ).length;
  const projectHealth = visibleProjects.length
    ? Math.round((completedProjects / visibleProjects.length) * 100)
    : 0;

  const totalRequired = Object.keys(FREELANCER_REQUIRED_FIELD_LABELS).length;
  const missingRequired = getFreelancerMissingRequiredFields(profile || {});
  const completedCount = totalRequired - missingRequired.length;
  const completionPercent = totalRequired
    ? Math.round((completedCount / totalRequired) * 100)
    : 0;
  const myProposalsByJob = useMemo(() => {
    const map = new Map();
    proposals.forEach((proposal) => {
      const jobId = String(proposal?.jobId || "").trim();
      if (!jobId || map.has(jobId)) return;
      map.set(jobId, proposal);
    });
    return map;
  }, [proposals]);
  const recommendedJobs = useMemo(() => {
    return [...jobs]
      .sort((a, b) => toTime(b?.createdAt) - toTime(a?.createdAt))
      .slice(0, 3);
  }, [jobs]);

  const handleRecommendedJobApply = (job) => {
    if (!job?.id) return;
    if (!isReviewReady) {
      navigate("/freelancer/profile");
      return;
    }
    if (!isApproved) {
      navigate("/freelancer/profile");
      return;
    }
    navigate(`/freelancer/jobs?apply=${job.id}`);
  };

  const handleRecommendedJobOpen = (job) => {
    if (!job?.id) return;
    navigate(`/freelancer/jobs/${job.id}`);
  };

  const handleRecommendedProposalOpen = (job) => {
    if (!job?.id) return;
    navigate(`/freelancer/jobs?proposal=${job.id}`);
  };

  return (
    <DashboardLayout
      title="Freelancer Overview"
      sidebar={{
        title: "Growlanzer",
        subtitle: "Freelancer",
        items: freelancerNav
      }}
    >
      {!isReviewReady ? (
        <div className="mb-6 rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          Complete onboarding profile and submit for admin review to unlock job applications.
          <Link to="/freelancer/profile" className="ml-2 underline">
            Continue onboarding
          </Link>
        </div>
      ) : null}
      {normalizedStatus === ACCOUNT_STATUS.PENDING_APPROVAL && isReviewReady ? (
        <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          🚫 Admin approval required before applying to jobs.
        </div>
      ) : null}
      <section className="grid gap-5 lg:grid-cols-4">
        <StatCard
          title="Weekly earnings"
          value={`₹${earnings.toFixed(2)}`}
          meta="Released via admin approvals"
        />
        <ChartDonut value={projectHealth} />
        <StatCard
          title="Selected jobs"
          value={selectedProposals}
          meta={`${unreadNotifications} unread notifications`}
        />
        <div className="glass-card rounded-2xl p-6">
          <h4 className="text-sm font-semibold text-white">
            Profile completion
          </h4>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
            <span>Progress</span>
            <span className="text-slate-100">{completionPercent}%</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/10">
            <div
              className="h-2 rounded-full bg-emerald-400"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {completedCount} of {totalRequired} required fields complete
          </p>
          <Link
            to="/freelancer/profile"
            className="mt-4 inline-block text-xs text-slate-200"
          >
            {isReviewReady ? "Update profile" : "Complete onboarding"}
          </Link>
        </div>
      </section>

      <section>
        <ChartLine
          title="New jobs"
          subtitle="Last 7 days"
          data={jobSeries}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-white">
            Recommended jobs
          </h4>
          <div className="grid gap-4">
            {jobs.length === 0 ? (
              <EmptyState
                title="No approved jobs"
                description="Admin must approve jobs before they show here."
              />
            ) : (
              recommendedJobs.map((job) => {
                const hasApplied = myProposalsByJob.has(String(job?.id || ""));
                return (
                  <JobCard
                    key={job.id}
                    job={job}
                    action={hasApplied ? "View proposal" : canApplyJobs ? "Apply" : "Complete profile"}
                    actionVariant={hasApplied ? "ghost" : canApplyJobs ? "primary" : "ghost"}
                    onAction={hasApplied ? handleRecommendedProposalOpen : handleRecommendedJobApply}
                    secondaryAction="See more"
                    onSecondaryAction={handleRecommendedJobOpen}
                  />
                );
              })
            )}
          </div>
        </div>
        <div className="glass-card rounded-2xl p-6">
          <h4 className="text-sm font-semibold text-white">
            Active projects
          </h4>
          <div className="mt-4 space-y-4">
            {visibleProjects.length === 0 ? (
              <EmptyState
                title="No active projects"
                description="Projects start after admin selects your proposal."
              />
            ) : (
              visibleProjects.map((project) => (
                <div
                  key={project.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">
                      {project.jobTitle || "Project"}
                    </p>
                    <span className="text-xs text-slate-400">
                      {project.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </DashboardLayout>
  );
}


