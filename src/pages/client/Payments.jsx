import { useMemo } from "react";
import { collection, query, where } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Table from "../../components/Table.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import StatCard from "../../components/StatCard.jsx";
import { clientNav } from "../../data/nav.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import {
  TOTAL_PROJECT_INSTALLMENTS,
  buildInstallmentProgress,
  getInstallmentLabel
} from "../../utils/paymentFlow.js";

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

const formatCurrency = (value) => {
  return `INR ${Number(value || 0).toFixed(2)}`;
};

export default function ClientPayments() {
  const { user } = useAuth();
  const { data: payments = [], loading } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "payments"), where("clientId", "==", user.uid))
        : null,
    [user]
  );
  const { data: projects = [] } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "projects"), where("clientId", "==", user.uid))
        : null,
    [user]
  );

  const projectById = useMemo(() => {
    return projects.reduce((acc, project) => {
      acc[project.id] = project;
      return acc;
    }, {});
  }, [projects]);

  const summary = useMemo(() => {
    return payments.reduce(
      (acc, payment) => {
        const amount = Number(payment.amount) || 0;
        if (["escrow", "held"].includes(payment.status)) {
          acc.escrow += amount;
          acc.pendingReview += 1;
        }
        if (payment.status === "released") {
          acc.released += amount;
          acc.releasedCount += 1;
        }
        if (payment.status === "refunded") {
          acc.refunded += amount;
          acc.refundedCount += 1;
        }
        return acc;
      },
      {
        escrow: 0,
        released: 0,
        refunded: 0,
        pendingReview: 0,
        releasedCount: 0,
        refundedCount: 0
      }
    );
  }, [payments]);

  const groupedByProject = useMemo(() => {
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

  const projectIds = useMemo(() => {
    return [...new Set([...projects.map((project) => project.id), ...groupedByProject.keys()])];
  }, [groupedByProject, projects]);

  const installmentRows = useMemo(() => {
    const rows = [];
    projectIds.forEach((projectId) => {
      const projectPayments = groupedByProject.get(projectId) || [];
      const project = projectById[projectId];
      const progress = buildInstallmentProgress(
        projectPayments,
        TOTAL_PROJECT_INSTALLMENTS
      );
      progress.forEach((entry) => {
        const payment = entry.latestPayment;
        rows.push([
          project?.jobTitle || projectId,
          `#${entry.installmentNumber} ${getInstallmentLabel(entry.installmentNumber)}`,
          payment ? "Client -> Admin escrow -> Freelancer" : "Waiting client funding",
          payment ? formatCurrency(payment.amount) : "-",
          payment ? formatCurrency(payment.netAmount) : "-",
          payment
            ? { type: "status", value: payment.status || "escrow" }
            : "Not funded",
          payment ? formatDate(payment.createdAt) : "-"
        ]);
      });
    });
    return rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }, [groupedByProject, projectById, projectIds]);

  return (
    <DashboardLayout
      title="Payments"
      sidebar={{ title: "Client Suite", subtitle: "Client", items: clientNav }}
    >
      <PageHeader
        title="3-stage escrow payments"
        description="Client funds installment to admin escrow. Admin reviews work and releases to freelancer."
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <StatCard title="Total payments" value={payments.length} />
        <StatCard
          title="In escrow"
          value={formatCurrency(summary.escrow)}
          meta={`${summary.pendingReview} awaiting admin review`}
        />
        <StatCard
          title="Released to freelancer"
          value={formatCurrency(summary.released)}
          meta={`${summary.releasedCount} released`}
        />
        <StatCard
          title="Refunded to client"
          value={formatCurrency(summary.refunded)}
          meta={`${summary.refundedCount} refunded`}
        />
      </section>

      {loading ? (
        <EmptyState title="Loading payments" description="Fetching records..." />
      ) : installmentRows.length === 0 ? (
        <EmptyState
          title="No payments yet"
          description="Fund installment 1 (advance) from My Jobs to start the payment flow."
        />
      ) : (
        <Table
          columns={[
            "Project",
            "Installment",
            "Flow",
            "Gross amount",
            "Net to freelancer",
            "Status",
            "Date"
          ]}
          rows={installmentRows}
        />
      )}
    </DashboardLayout>
  );
}
