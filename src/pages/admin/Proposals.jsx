import { useEffect, useMemo, useState } from "react";
import { collection } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import StatCard from "../../components/StatCard.jsx";
import ProposalCard from "../../components/ProposalCard.jsx";
import Table from "../../components/Table.jsx";
import Button from "../../components/Button.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import AdminJobView from "../../components/AdminJobView.jsx";
import UserProfileLink from "../../components/UserProfileLink.jsx";
import { adminNav } from "../../data/nav.js";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const clean = String(value || "")
    .replace(/[, ]+/g, "")
    .replace(/[^\d.]/g, "");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatDate = (value) => {
  const date = toDate(value);
  if (!date) return "N/A";
  return date.toLocaleDateString();
};

const formatDateTime = (value) => {
  const date = toDate(value);
  if (!date) return "N/A";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
};

const formatPrice = (proposal) => {
  const price = toNumber(proposal?.price ?? proposal?.bidAmount);
  const currency = String(proposal?.currency || "INR").toUpperCase();
  const mode =
    String(proposal?.priceType || proposal?.bidType || "fixed").toLowerCase() === "hourly"
      ? " / hr"
      : "";
  if (price == null) return "N/A";
  return `${currency} ${price.toFixed(2)}${mode}`;
};

const formatDelivery = (proposal) => {
  const days = Number(proposal?.deliveryDays);
  if (Number.isFinite(days) && days > 0) {
    const rounded = Math.round(days);
    return `${rounded} day${rounded === 1 ? "" : "s"}`;
  }
  return String(proposal?.deliveryTime || "").trim() || "N/A";
};

const normalize = (value) => String(value || "").trim().toLowerCase();
const REGISTRY_PAGE_SIZE = 20;

export default function AdminProposals() {
  const { user } = useAuth();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [proposalStatusFilter, setProposalStatusFilter] = useState("all");
  const [rankFilter, setRankFilter] = useState("all");
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [registryPage, setRegistryPage] = useState(1);

  const { data: jobs = [], loading: jobsLoading } = useFirestoreQuery(
    () => collection(db, "jobs"),
    []
  );
  const { data: proposals = [], loading: proposalsLoading } = useFirestoreQuery(
    () => collection(db, "proposals"),
    []
  );

  const proposalsByJob = useMemo(() => {
    const map = new Map();
    proposals.forEach((proposal) => {
      const key = String(proposal?.jobId || "").trim();
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(proposal);
    });
    return map;
  }, [proposals]);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) || null,
    [jobs, selectedJobId]
  );

  const filteredProposals = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return proposals
      .filter((proposal) => {
        const normalizedStatus = normalize(proposal?.status || "pending");
        if (proposalStatusFilter !== "all" && normalizedStatus !== proposalStatusFilter) {
          return false;
        }

        if (rankFilter === "top" && !proposal?.isTop) {
          return false;
        }
        if (rankFilter === "other" && proposal?.isTop) {
          return false;
        }

        if (!searchTerm) return true;
        const haystack = [
          proposal?.id,
          proposal?.jobId,
          proposal?.jobTitle,
          proposal?.freelancerName,
          proposal?.freelancerId,
          proposal?.clientId,
          Array.isArray(proposal?.skills) ? proposal.skills.join(" ") : ""
        ]
          .map((value) => String(value || ""))
          .join(" ")
          .toLowerCase();

        return haystack.includes(searchTerm);
      })
      .sort((left, right) => {
        const leftTop = left?.isTop ? 1 : 0;
        const rightTop = right?.isTop ? 1 : 0;
        if (rightTop !== leftTop) return rightTop - leftTop;
        const leftRank = Number(left?.topRank || 9999);
        const rightRank = Number(right?.topRank || 9999);
        if (leftRank !== rightRank) return leftRank - rightRank;
        const leftScore = Number(left?.score || 0);
        const rightScore = Number(right?.score || 0);
        if (rightScore !== leftScore) return rightScore - leftScore;
        const leftTime = toDate(left?.createdAt)?.getTime() || 0;
        const rightTime = toDate(right?.createdAt)?.getTime() || 0;
        return rightTime - leftTime;
      });
  }, [proposalStatusFilter, proposals, rankFilter, search]);

  const topSnapshot = useMemo(() => {
    return proposals
      .filter((proposal) => proposal?.isTop)
      .sort((left, right) => {
        const leftRank = Number(left?.topRank || 9999);
        const rightRank = Number(right?.topRank || 9999);
        if (leftRank !== rightRank) return leftRank - rightRank;
        const leftScore = Number(left?.score || 0);
        const rightScore = Number(right?.score || 0);
        if (rightScore !== leftScore) return rightScore - leftScore;
        const leftTime = toDate(left?.createdAt)?.getTime() || 0;
        const rightTime = toDate(right?.createdAt)?.getTime() || 0;
        return rightTime - leftTime;
      })
      .slice(0, 6);
  }, [proposals]);

  const stats = useMemo(() => {
    const selectedCount = proposals.filter(
      (proposal) => normalize(proposal?.status) === "selected"
    ).length;
    const topCount = proposals.filter((proposal) => proposal?.isTop).length;
    const jobsWithProposals = [...proposalsByJob.keys()].length;
    return {
      total: proposals.length,
      selected: selectedCount,
      top: topCount,
      jobsWithProposals
    };
  }, [proposals, proposalsByJob]);

  useEffect(() => {
    setRegistryPage(1);
  }, [search, proposalStatusFilter, rankFilter]);

  const registry = useMemo(() => {
    const total = filteredProposals.length;
    const totalPages = Math.max(1, Math.ceil(total / REGISTRY_PAGE_SIZE));
    const page = Math.min(Math.max(registryPage, 1), totalPages);
    const start = (page - 1) * REGISTRY_PAGE_SIZE;
    return {
      total,
      page,
      totalPages,
      items: filteredProposals.slice(start, start + REGISTRY_PAGE_SIZE)
    };
  }, [filteredProposals, registryPage]);

  const rows = registry.items.map((proposal) => {
    const jobId = String(proposal?.jobId || "").trim();
    const jobTitle =
      proposal?.jobTitle ||
      jobs.find((entry) => entry.id === jobId)?.title ||
      jobId ||
      "Untitled job";
    const rankLabel = proposal?.isTop
      ? `Top ${proposal?.topRank || "-"}`
      : proposal?.rank
        ? `#${proposal.rank}`
        : "N/A";

    const row = [
      jobTitle,
      (
        <UserProfileLink
          key={`${proposal.id}-freelancer-link`}
          userId={proposal?.freelancerId}
          name={proposal?.freelancerName || proposal?.freelancerId || "N/A"}
          className="text-sky-200 underline hover:text-sky-100"
        />
      ),
      formatPrice(proposal),
      formatDelivery(proposal),
      rankLabel,
      { type: "status", value: proposal?.status || "pending" },
      formatDateTime(proposal?.createdAt),
      <Button
        key={`${proposal.id}-view`}
        variant="ghost"
        onClick={() => setSelectedJobId(jobId || null)}
        disabled={!jobId}
      >
        Open job
      </Button>
    ];
    row.id = proposal.id;
    return row;
  });

  const loading = jobsLoading || proposalsLoading;

  return (
    <DashboardLayout
      title="Proposals"
      sidebar={{ title: "Admin HQ", subtitle: "Admin", items: adminNav }}
    >
      <PageHeader
        title="Proposal intelligence"
        description="Monitor ranked proposals, inspect top bids, and open full admin job view for selection and connection tracking."
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <StatCard title="Total proposals" value={stats.total} />
        <StatCard title="Top ranked" value={stats.top} meta="Top 3 labels across jobs" />
        <StatCard title="Selected proposals" value={stats.selected} />
        <StatCard title="Jobs with proposals" value={stats.jobsWithProposals} />
      </section>

      <section className="glass-card rounded-2xl p-5">
        <div className="grid gap-3 xl:grid-cols-[1.2fr_0.4fr_0.4fr]">
          <input
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
            placeholder="Search by job, freelancer, skill, proposal id, or client id"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
            value={proposalStatusFilter}
            onChange={(event) => setProposalStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="selected">Selected</option>
            <option value="not_selected">Not selected</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
            value={rankFilter}
            onChange={(event) => setRankFilter(event.target.value)}
          >
            <option value="all">All ranks</option>
            <option value="top">Top proposals</option>
            <option value="other">Other proposals</option>
          </select>
        </div>
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-white">Top proposal snapshot</h4>
        {loading ? (
          <EmptyState title="Loading proposals" description="Fetching top proposal ranking..." />
        ) : topSnapshot.length === 0 ? (
          <EmptyState
            title="No top proposals yet"
            description="Top-ranked proposals appear after freelancers apply."
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {topSnapshot.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                action="Open job"
                actionVariant="ghost"
                onAction={() => setSelectedJobId(String(proposal?.jobId || "").trim() || null)}
                showRank
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-white">
          Proposal registry ({filteredProposals.length})
        </h4>
        {loading ? (
          <EmptyState title="Loading proposals" description="Fetching proposal registry..." />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No matching proposals"
            description="Try changing search or filter values."
          />
        ) : (
          <Table
            columns={[
              "Job",
              "Freelancer",
              "Price",
              "Duration",
              "Rank",
              "Status",
              "Created",
              "Action"
            ]}
            rows={rows}
            getRowKey={(row) => row.id}
          />
        )}
        {!loading && registry.total > REGISTRY_PAGE_SIZE ? (
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
            <span>
              Page {registry.page} of {registry.totalPages} · Total {registry.total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setRegistryPage((page) => Math.max(1, page - 1))}
                disabled={registry.page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  setRegistryPage((page) => Math.min(registry.totalPages, page + 1))
                }
                disabled={registry.page >= registry.totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {selectedJob ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-300">
              Active job view: {selectedJob.title || selectedJob.id} · Created{" "}
              {formatDate(selectedJob.createdAt)}
            </p>
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
