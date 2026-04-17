import { useMemo } from "react";
import { Link } from "react-router-dom";
import { collection, query, where } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import ProposalCard from "../../components/ProposalCard.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Button from "../../components/Button.jsx";
import { freelancerNav } from "../../data/nav.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { markNotificationRead } from "../../services/notificationsService.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { filterVisibleProjects } from "../../utils/projectVisibility.js";
import { isFreelancerReviewReady } from "../../utils/freelancerOnboarding.js";
import { ACCOUNT_STATUS, normalizeAccountStatus } from "../../utils/accountStatus.js";

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

const toStatus = (value) => String(value || "").trim().toLowerCase();

export default function FreelancerProposals() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const normalizedStatus = normalizeAccountStatus(profile?.status);
  const isApproved = normalizedStatus === ACCOUNT_STATUS.APPROVED;
  const isReviewReady = isFreelancerReviewReady(profile);

  const { data: proposals = [], loading } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "proposals"), where("freelancerId", "==", user.uid))
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
  const visibleProjects = useMemo(
    () => filterVisibleProjects(projects),
    [projects]
  );

  const { data: notifications = [] } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "notifications"), where("recipientId", "==", user.uid))
        : null,
    [user]
  );

  const projectByJobId = useMemo(() => {
    return visibleProjects.reduce((acc, project) => {
      acc[project.jobId] = project;
      return acc;
    }, {});
  }, [visibleProjects]);

  const sortedNotifications = useMemo(() => {
    return [...notifications]
      .sort((a, b) => {
        const aTime = toDate(a.createdAt)?.getTime() || 0;
        const bTime = toDate(b.createdAt)?.getTime() || 0;
        return bTime - aTime;
      })
      .slice(0, 8);
  }, [notifications]);

  const selectedProposals = useMemo(
    () => proposals.filter((proposal) => proposal.status === "selected"),
    [proposals]
  );
  const rejectedProposals = useMemo(
    () => proposals.filter((proposal) => proposal.status === "rejected"),
    [proposals]
  );
  const pendingProposals = useMemo(
    () => proposals.filter((proposal) => proposal.status === "pending"),
    [proposals]
  );

  const handleMarkRead = async (notification) => {
    try {
      await markNotificationRead(notification.id);
      toast.success("Notification marked as read.");
    } catch {
      toast.error("Failed to update notification.");
    }
  };

  return (
    <DashboardLayout
      title="My Proposals"
      sidebar={{
        title: "Growlanzer",
        subtitle: "Freelancer",
        items: freelancerNav
      }}
    >
      <PageHeader
        title="Proposal status and notifications"
        description="Track selected, rejected, and pending proposals with project links and admin notifications."
      />

      {!isReviewReady ? (
        <div className="mb-6 rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          Complete onboarding details and submit for admin review to unlock proposal actions.
        </div>
      ) : null}
      {normalizedStatus === ACCOUNT_STATUS.PENDING_APPROVAL && isReviewReady ? (
        <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          🚫 Admin approval required before applying to jobs.
        </div>
      ) : null}

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-white">Recent notifications</h4>
        {sortedNotifications.length === 0 ? (
          <EmptyState
            title="No notifications"
            description="Proposal updates will appear here."
          />
        ) : (
          <div className="grid gap-3">
            {sortedNotifications.map((notification) => (
              <div
                key={notification.id}
                className="glass-card rounded-2xl p-4 text-sm text-slate-300"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{notification.title}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {notification.message}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {formatDate(notification.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={notification.read ? "resolved" : "open"} />
                    {!notification.read ? (
                      <Button
                        variant="ghost"
                        onClick={() => handleMarkRead(notification)}
                      >
                        Mark read
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="glass-card rounded-2xl p-4 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Selected
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {selectedProposals.length}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Pending
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {pendingProposals.length}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Rejected
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {rejectedProposals.length}
          </p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {loading ? (
          <EmptyState title="Loading proposals" description="Fetching..." />
        ) : !isApproved ? (
          <EmptyState
            title="Approval required"
            description="Admin approval is required before submitting proposals."
          />
        ) : proposals.length === 0 ? (
          <EmptyState
            title="No proposals"
            description="Apply to a job to submit a proposal."
          />
        ) : (
          proposals
            .sort((a, b) => {
              const aTime = toDate(a.createdAt)?.getTime() || 0;
              const bTime = toDate(b.createdAt)?.getTime() || 0;
              return bTime - aTime;
            })
            .map((proposal) => {
              const project = projectByJobId[proposal.jobId];
              const projectConnected = toStatus(project?.status) === "connected";
              return (
                <div key={proposal.id} className="space-y-3">
                  <ProposalCard proposal={proposal} />
                  {proposal.status === "selected" && project ? (
                    <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
                      {projectConnected ? (
                        <>
                          You are selected for this job.
                          <Link
                            to={`/project/${project.id}`}
                            className="ml-2 underline"
                          >
                            Open project
                          </Link>
                        </>
                      ) : (
                        "You are selected. Waiting for admin to connect project workspace."
                      )}
                    </div>
                  ) : null}
                  {proposal.status === "rejected" ? (
                    <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">
                      {proposal.rejectedReason || "This application was rejected for the job."}
                    </div>
                  ) : null}
                </div>
              );
            })
        )}
      </div>
    </DashboardLayout>
  );
}


