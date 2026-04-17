import { useMemo } from "react";
import { collection, query, where } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import { freelancerNav } from "../../data/nav.js";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export default function FreelancerPendingPayments() {
  const { user } = useAuth();
  const { data: payouts = [], loading } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "payouts"), where("freelancerId", "==", user.uid))
        : null,
    [user]
  );

  const pending = useMemo(
    () =>
      payouts.filter((payment) => payment.status === "pending"),
    [payouts]
  );

  return (
    <DashboardLayout
      title="Pending Payments"
      sidebar={{ title: "Growlanzer", subtitle: "Freelancer", items: freelancerNav }}
    >
      <PageHeader
        title="Pending Payments"
        description="Payments awaiting admin release."
      />

      {loading ? (
        <EmptyState title="Loading payments" description="Fetching payments..." />
      ) : pending.length === 0 ? (
        <EmptyState title="No pending payments" description="Release pending items will appear here." />
      ) : (
        <div className="grid gap-4">
          {pending.map((payment) => (
            <div key={payment.id} className="glass-card rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Contract payout
                  </p>
                  <p className="mt-2 text-sm text-slate-200">
                    INR {Number(payment.amount || 0).toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Requested: {toDate(payment.updatedAt)?.toLocaleString() || "N/A"}
                  </p>
                </div>
                <StatusBadge status={payment.status || "pending"} />
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
