import { useMemo } from "react";
import { collection, query, where } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Table from "../../components/Table.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import StatCard from "../../components/StatCard.jsx";
import { freelancerNav } from "../../data/nav.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
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

const formatCurrency = (value) => `INR ${Number(value || 0).toFixed(2)}`;

export default function FreelancerEarnings() {
  const { user, profile } = useAuth();
  const isApproved = normalizeAccountStatus(profile?.status) === ACCOUNT_STATUS.APPROVED;
  const { data: payouts = [], loading } = useFirestoreQuery(
    () =>
      user && isApproved
        ? query(collection(db, "payouts"), where("freelancerId", "==", user.uid))
        : null,
    [user, isApproved]
  );

  const summary = useMemo(() => {
    return payouts.reduce(
      (acc, payout) => {
        const amount = Number(payout.amount) || 0;
        if (["paid", "released", "processed"].includes(String(payout.status || "").toLowerCase())) {
          acc.released += amount;
          acc.releasedCount += 1;
        } else {
          acc.pending += amount;
          acc.pendingCount += 1;
        }
        return acc;
      },
      { released: 0, pending: 0, releasedCount: 0, pendingCount: 0 }
    );
  }, [payouts]);

  const rows = useMemo(() => {
    return [...payouts]
      .sort((a, b) => {
        const aTime = toDate(a.createdAt)?.getTime() || 0;
        const bTime = toDate(b.createdAt)?.getTime() || 0;
        return bTime - aTime;
      })
      .map((payout) => [
        payout.projectId || "N/A",
        payout.id || "N/A",
        String(payout.gateway || "N/A").toUpperCase(),
        formatCurrency(payout.amount),
        { type: "status", value: payout.status || "pending" },
        formatDate(payout.createdAt)
      ]);
  }, [payouts]);

  return (
    <DashboardLayout
      title="Earnings"
      sidebar={{
        title: "Growlanzer",
        subtitle: "Freelancer",
        items: freelancerNav
      }}
    >
      <PageHeader
        title="Installment payouts"
        description="Client funds to admin escrow first. Admin reviews work and releases installment payouts."
      />
      {!isApproved ? (
        <EmptyState
          title="Approval required"
          description="Admin approval is required before viewing earnings."
        />
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-3">
            <StatCard
              title="Released earnings"
              value={formatCurrency(summary.released)}
              meta={`${summary.releasedCount} installments released`}
            />
            <StatCard
              title="Pending in escrow"
              value={formatCurrency(summary.pending)}
              meta={`${summary.pendingCount} payouts processing`}
            />
            <StatCard title="Total payouts" value={payouts.length} />
          </section>

          {loading ? (
            <EmptyState title="Loading earnings" description="Fetching..." />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No earnings yet"
              description="Payments will appear after client funds and admin release."
            />
          ) : (
            <Table
              columns={[
                "Project",
                "Payout",
                "Gateway",
                "Amount",
                "Status",
                "Date"
              ]}
              rows={rows}
            />
          )}
        </>
      )}
    </DashboardLayout>
  );
}


