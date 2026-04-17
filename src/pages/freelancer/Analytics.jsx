import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import ChartLine from "../../components/ChartLine.jsx";
import StatCard from "../../components/StatCard.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import { freelancerNav } from "../../data/nav.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { collection, query, where } from "firebase/firestore";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { filterVisibleProjects } from "../../utils/projectVisibility.js";
import { ACCOUNT_STATUS, normalizeAccountStatus } from "../../utils/accountStatus.js";

export default function FreelancerAnalytics() {
  const { user, profile } = useAuth();
  const isApproved = normalizeAccountStatus(profile?.status) === ACCOUNT_STATUS.APPROVED;
  const { data: proposals = [] } = useFirestoreQuery(
    () =>
      user && isApproved
        ? query(collection(db, "proposals"), where("freelancerId", "==", user.uid))
        : null,
    [user, isApproved]
  );
  const { data: projects = [] } = useFirestoreQuery(
    () =>
      user && isApproved
        ? query(collection(db, "projects"), where("freelancerId", "==", user.uid))
        : null,
    [user, isApproved]
  );
  const { data: payouts = [] } = useFirestoreQuery(
    () =>
      user && isApproved
        ? query(collection(db, "payouts"), where("freelancerId", "==", user.uid))
        : null,
    [user, isApproved]
  );
  const visibleProjects = filterVisibleProjects(projects);

  const approvedCount = proposals.filter(
    (proposal) => proposal.status === "approved"
  ).length;
  const winRate =
    proposals.length === 0
      ? 0
      : Math.round((approvedCount / proposals.length) * 100);
  const earnings = payouts.reduce(
    (sum, payout) =>
      ["paid", "released", "processed"].includes(
        String(payout.status || "").toLowerCase()
      )
        ? sum + (Number(payout.amount) || 0)
        : sum,
    0
  );

  return (
    <DashboardLayout
      title="Analytics"
      sidebar={{
        title: "Growlanzer",
        subtitle: "Freelancer",
        items: freelancerNav
      }}
    >
      <PageHeader
        title="Performance insights"
        description="Insights are derived from admin-approved projects only."
      />
      {!isApproved ? (
        <EmptyState
          title="Approval required"
          description="Admin approval is required before viewing analytics."
        />
      ) : proposals.length === 0 && visibleProjects.length === 0 ? (
        <EmptyState
          title="No analytics yet"
          description="Submit proposals to generate analytics."
        />
      ) : (
        <>
          <section className="grid gap-5 lg:grid-cols-3">
            <StatCard
              title="Proposal win rate"
              value={`${winRate}%`}
              meta={`${approvedCount} approved`}
            />
            <StatCard
              title="Active projects"
              value={visibleProjects.length}
              meta="Admin approved only"
            />
            <StatCard
              title="Earnings"
              value={`₹${earnings.toFixed(2)}`}
              meta="Released payments"
            />
          </section>
          <ChartLine />
        </>
      )}
    </DashboardLayout>
  );
}


