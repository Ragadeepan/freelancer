import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Timestamp,
  collection,
  limit,
  orderBy,
  query,
  where
} from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import StatCard from "../../components/StatCard.jsx";
import ChartLine from "../../components/ChartLine.jsx";
import Table from "../../components/Table.jsx";
import Button from "../../components/Button.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import { adminNav } from "../../data/nav.js";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { ACCOUNT_STATUS, normalizeAccountStatus } from "../../utils/accountStatus.js";
import { normalizeContractStatus, CONTRACT_STATUS } from "../../utils/contracts.js";

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatTime = (value) => {
  const date = toDate(value);
  if (!date) return "N/A";
  return date.toLocaleString();
};

const formatAction = (action) => {
  if (!action) return "Unknown";
  return action.replace(/_/g, " ");
};

const formatCurrency = (value) => `INR ${Number(value || 0).toFixed(2)}`;
const toStatus = (value) => String(value || "").trim().toLowerCase();

export default function AdminDashboard() {
  const [activityWindow, setActivityWindow] = useState(7);
  const startOfWindow = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - (activityWindow - 1));
    start.setHours(0, 0, 0, 0);
    return start;
  }, [activityWindow]);

  const { data: users = [] } = useFirestoreQuery(
    () => collection(db, "users"),
    []
  );
  const { data: jobs = [] } = useFirestoreQuery(
    () => collection(db, "jobs"),
    []
  );
  const { data: proposals = [] } = useFirestoreQuery(
    () => collection(db, "proposals"),
    []
  );
  const { data: projects = [] } = useFirestoreQuery(
    () => collection(db, "projects"),
    []
  );
  const { data: contracts = [] } = useFirestoreQuery(
    () => collection(db, "contracts"),
    []
  );
  const { data: projectUpdates = [] } = useFirestoreQuery(
    () => collection(db, "projectUpdates"),
    []
  );
  const { data: disputes = [] } = useFirestoreQuery(
    () => collection(db, "disputes"),
    []
  );
  const { data: payments = [] } = useFirestoreQuery(
    () => collection(db, "payments"),
    []
  );
  const { data: payouts = [] } = useFirestoreQuery(
    () => collection(db, "payouts"),
    []
  );
  const { data: activityLogs = [] } = useFirestoreQuery(
    () =>
      query(
        collection(db, "activityLogs"),
        orderBy("timestamp", "desc"),
        limit(20)
      ),
    []
  );
  const { data: scopedActivityLogs = [] } = useFirestoreQuery(
    () =>
      query(
        collection(db, "activityLogs"),
        where("timestamp", ">=", Timestamp.fromDate(startOfWindow)),
        orderBy("timestamp", "asc")
      ),
    [startOfWindow]
  );

  const pendingUsers = useMemo(
    () => users.filter((entry) => normalizeAccountStatus(entry.status) === ACCOUNT_STATUS.PENDING_APPROVAL),
    [users]
  );
  const pendingClientApprovals = useMemo(
    () =>
      pendingUsers.filter(
        (entry) => String(entry?.role || "").trim().toLowerCase() === "client"
      ),
    [pendingUsers]
  );
  const pendingFreelancerApprovals = useMemo(
    () =>
      pendingUsers.filter(
        (entry) => String(entry?.role || "").trim().toLowerCase() === "freelancer"
      ),
    [pendingUsers]
  );
  const pendingJobs = useMemo(
    () => jobs.filter((entry) => entry.status === "pending"),
    [jobs]
  );
  const assignmentQueue = useMemo(
    () => jobs.filter((entry) => entry.status === "approved" && !entry.selectedProposalId),
    [jobs]
  );
  const pendingConnections = useMemo(
    () =>
      projects.filter((entry) => {
        const status = toStatus(entry.status);
        return status === "assigned" || status === "in_progress";
      }),
    [projects]
  );
  const pendingProposals = useMemo(
    () => proposals.filter((entry) => entry.status === "pending"),
    [proposals]
  );
  const pendingUpdates = useMemo(
    () => projectUpdates.filter((entry) => entry.status === "pending"),
    [projectUpdates]
  );
  const activeContracts = useMemo(
    () =>
      contracts.filter(
        (entry) =>
          normalizeContractStatus(entry.contractStatus || entry.status) !== CONTRACT_STATUS.CLOSED
      ),
    [contracts]
  );
  const pendingPayouts = useMemo(
    () => payouts.filter((entry) => entry.status === "pending"),
    [payouts]
  );
  const openDisputes = useMemo(
    () => disputes.filter((entry) => entry.status === "open"),
    [disputes]
  );

  const paymentsByStatus = useMemo(() => {
    return payments.reduce(
      (acc, payment) => {
        const amount = Number(payment.amount) || 0;
        if (payment.status === "escrow" || payment.status === "held") {
          acc.escrow += amount;
          acc.escrowCount += 1;
        } else if (payment.status === "released") {
          acc.released += amount;
          acc.releasedCount += 1;
        } else if (payment.status === "refunded") {
          acc.refunded += amount;
          acc.refundedCount += 1;
        }
        return acc;
      },
      {
        escrow: 0,
        released: 0,
        refunded: 0,
        escrowCount: 0,
        releasedCount: 0,
        refundedCount: 0
      }
    );
  }, [payments]);

  const projectCounts = useMemo(() => {
    return projects.reduce(
      (acc, project) => {
        const status = toStatus(project.status);
        if (status === "in_progress") acc.inProgress += 1;
        if (status === "connected") acc.connected += 1;
        if (status === "assigned") acc.assigned += 1;
        if (project.status === "frozen") acc.frozen += 1;
        if (project.status === "completed") acc.completed += 1;
        return acc;
      },
      { inProgress: 0, connected: 0, assigned: 0, frozen: 0, completed: 0 }
    );
  }, [projects]);

  const queueItems = useMemo(() => {
    return [
      {
        label: "Pending client approvals",
        count: pendingClientApprovals.length,
        description: "Client profiles waiting for admin action.",
        to: "/secure-admin/users"
      },
      {
        label: "Pending freelancer approvals",
        count: pendingFreelancerApprovals.length,
        description: "Freelancer profiles waiting for admin action.",
        to: "/secure-admin/users"
      },
      {
        label: "Job approvals",
        count: pendingJobs.length,
        description: "New client jobs waiting for moderation.",
        to: "/secure-admin/jobs"
      },
      {
        label: "Selection queue",
        count: assignmentQueue.length,
        description: "Approved jobs waiting for client to select a freelancer.",
        to: "/secure-admin/assignments"
      },
      {
        label: "Incoming proposals",
        count: pendingProposals.length,
        description: "New freelancer proposals received.",
        to: "/secure-admin/proposals"
      },
      {
        label: "Pending connections",
        count: pendingConnections.length,
        description: "Selected projects waiting for admin connect action.",
        to: "/secure-admin/assignments"
      },
      {
        label: "Project updates",
        count: pendingUpdates.length,
        description: "Status changes requiring admin decision.",
        to: "/secure-admin/projects"
      }
      ,
      {
        label: "Active contracts",
        count: activeContracts.length,
        description: "Enterprise contracts in progress.",
        to: "/secure-admin/contracts"
      },
      {
        label: "Pending payouts",
        count: pendingPayouts.length,
        description: "Ready for manual payment release.",
        to: "/secure-admin/contracts"
      }
    ];
  }, [
    assignmentQueue.length,
    pendingJobs.length,
    pendingClientApprovals.length,
    pendingFreelancerApprovals.length,
    pendingProposals.length,
    pendingConnections.length,
    pendingUpdates.length,
    activeContracts.length,
    pendingPayouts.length
  ]);

  const pendingApprovalTotal = queueItems.reduce(
    (sum, item) => sum + item.count,
    0
  );

  const activitySeries = useMemo(() => {
    const series = Array(activityWindow).fill(0);
    const msPerDay = 24 * 60 * 60 * 1000;
    scopedActivityLogs.forEach((log) => {
      const date = toDate(log.timestamp);
      if (!date) return;
      const index = Math.floor((date - startOfWindow) / msPerDay);
      if (index >= 0 && index < series.length) {
        series[index] += 1;
      }
    });
    return series;
  }, [activityWindow, scopedActivityLogs, startOfWindow]);

  const approvalRows = activityLogs
    .filter((log) => log.action?.endsWith("_approved"))
    .slice(0, 8)
    .map((log) => [
      formatAction(log.action),
      log.targetId || "N/A",
      log.actor || "system",
      formatTime(log.timestamp)
    ]);

  const escalationRows = openDisputes.slice(0, 8).map((dispute) => [
    dispute.projectId || "N/A",
    dispute.raisedBy || "N/A",
    dispute.reason || "No reason provided",
    { type: "status", value: dispute.status || "open" }
  ]);

  return (
    <DashboardLayout
      title="Admin Dashboard"
      sidebar={{ title: "Admin HQ", subtitle: "Admin", items: adminNav }}
      action="Release payments"
      actionTo="/secure-admin/contracts"
    >
      <PageHeader
        title="Operations control tower"
        description="Monitor approval load, dispute pressure, escrow exposure, and recent administrative actions."
      />

      <section className="grid gap-5 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Pending approvals"
          value={pendingApprovalTotal}
          meta="Users, jobs, proposals, updates"
        />
        <StatCard
          title="Open disputes"
          value={openDisputes.length}
          meta="Needs arbitration"
        />
        <StatCard
          title="Escrow exposure"
          value={formatCurrency(paymentsByStatus.escrow)}
          meta={`${paymentsByStatus.escrowCount} in escrow`}
        />
        <StatCard
          title="Released revenue"
          value={formatCurrency(paymentsByStatus.released)}
          meta={`${paymentsByStatus.releasedCount} released`}
        />
        <StatCard
          title="Projects in progress"
          value={projectCounts.inProgress}
          meta={`${projectCounts.connected} connected · ${projectCounts.assigned} assigned`}
        />
        <StatCard
          title="Active contracts"
          value={activeContracts.length}
          meta={`${pendingPayouts.length} pending payouts`}
        />
        <StatCard
          title="Pending payouts"
          value={pendingPayouts.length}
          meta="Ready for manual release"
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-white">
              Admin activity trend
            </h4>
            <div className="flex items-center gap-2">
              {[7, 30].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setActivityWindow(days)}
                  className={`rounded-lg border px-3 py-1 text-xs transition ${
                    activityWindow === days
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
                  }`}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>
          <ChartLine
            title="Moderation actions"
            subtitle={`Last ${activityWindow} days`}
            data={activitySeries}
          />
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h4 className="text-sm font-semibold text-white">Approval queue</h4>
          <p className="mt-2 text-sm text-slate-400">
            Keep queue size low to maintain marketplace quality and response time.
          </p>
          <div className="mt-4 space-y-3">
            {queueItems.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.label}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.description}</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                    {item.count}
                  </span>
                </div>
                <Link to={item.to} className="mt-3 inline-block text-xs text-slate-200">
                  Open section
                </Link>
              </div>
            ))}
          </div>
          <Link to="/secure-admin/assignments">
            <Button className="mt-6 w-full">Open assignment queue</Button>
          </Link>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-white">Latest approvals</h4>
          {approvalRows.length === 0 ? (
            <EmptyState
              title="No approvals yet"
              description="Approved actions will appear here."
            />
          ) : (
            <Table
              columns={["Action", "Target", "Actor", "Time"]}
              rows={approvalRows}
            />
          )}
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-white">Live escalations</h4>
          {escalationRows.length === 0 ? (
            <EmptyState
              title="No open disputes"
              description="Escalations will appear here when disputes are raised."
            />
          ) : (
            <Table
              columns={["Project", "Raised by", "Reason", "Status"]}
              rows={escalationRows}
            />
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-white">Recent activity log</h4>
        {activityLogs.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Administrative events will appear here."
          />
        ) : (
          <div className="glass-card rounded-2xl p-5 text-sm text-slate-300">
            <ul className="space-y-3">
              {activityLogs.slice(0, 8).map((log) => (
                <li
                  key={log.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div>
                    <p className="text-white">{formatAction(log.action)}</p>
                    <p className="text-xs text-slate-400">
                      Target: {log.targetId || "N/A"}
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <p>{log.actor || "system"}</p>
                    <p>{formatTime(log.timestamp)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </DashboardLayout>
  );
}
