import { useMemo, useState } from "react";
import { collection } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import StatCard from "../../components/StatCard.jsx";
import Table from "../../components/Table.jsx";
import Button from "../../components/Button.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import { adminNav } from "../../data/nav.js";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { resolveDispute } from "../../services/disputesService.js";
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

export default function AdminDisputes() {
  const { user } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [processing, setProcessing] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: disputes = [], loading } = useFirestoreQuery(
    () => collection(db, "disputes"),
    []
  );

  const openDisputes = useMemo(
    () => disputes.filter((dispute) => dispute.status === "open"),
    [disputes]
  );
  const resolvedDisputes = useMemo(
    () => disputes.filter((dispute) => dispute.status === "resolved"),
    [disputes]
  );

  const filteredDisputes = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return disputes.filter((dispute) => {
      if (
        statusFilter !== "all" &&
        (dispute.status || "unknown") !== statusFilter
      ) {
        return false;
      }
      if (!searchTerm) return true;
      return (
        String(dispute.id || "").toLowerCase().includes(searchTerm) ||
        String(dispute.projectId || "").toLowerCase().includes(searchTerm) ||
        String(dispute.raisedBy || "").toLowerCase().includes(searchTerm) ||
        String(dispute.reason || "").toLowerCase().includes(searchTerm)
      );
    });
  }, [disputes, search, statusFilter]);

  const handleResolve = async (dispute) => {
    if (!user?.uid) return;
    setStatus("");
    setProcessing(dispute.id);
    try {
      await resolveDispute(dispute.id, user.uid);
      setStatus(`Resolved dispute ${dispute.id}.`);
      toast.success("Dispute resolved.");
    } catch (err) {
      setStatus(err.message || "Failed to resolve dispute.");
      toast.error("Failed to resolve dispute.");
    } finally {
      setProcessing(null);
    }
  };

  const rows = filteredDisputes.map((dispute) => {
    const row = [
      dispute.id,
      dispute.projectId || "N/A",
      dispute.raisedBy || "N/A",
      dispute.reason || "No reason provided",
      { type: "status", value: dispute.status || "unknown" },
      formatDate(dispute.createdAt),
      dispute.status === "open" ? (
        <Button
          key={`${dispute.id}-resolve`}
          variant="primary"
          onClick={() => handleResolve(dispute)}
          disabled={processing === dispute.id}
        >
          Resolve
        </Button>
      ) : (
        <span className="text-xs text-slate-400">Resolved</span>
      )
    ];
    row.id = dispute.id;
    return row;
  });

  return (
    <DashboardLayout
      title="Disputes"
      sidebar={{ title: "Admin HQ", subtitle: "Admin", items: adminNav }}
    >
      <PageHeader
        title="Dispute resolution"
        description="Track escalations and resolve open disputes quickly to protect client and freelancer trust."
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <StatCard title="Total disputes" value={disputes.length} />
        <StatCard title="Open" value={openDisputes.length} meta="Needs action" />
        <StatCard title="Resolved" value={resolvedDisputes.length} />
      </section>

      <section className="glass-card rounded-2xl p-5">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.6fr]">
          <input
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
            placeholder="Search by dispute, project, raised by, or reason"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-white">Open escalations</h4>
        {loading ? (
          <EmptyState
            title="Loading disputes"
            description="Fetching dispute queue..."
          />
        ) : openDisputes.length === 0 ? (
          <EmptyState
            title="No open disputes"
            description="No escalations require action right now."
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {openDisputes.slice(0, 8).map((dispute) => (
              <div
                key={dispute.id}
                className="glass-card rounded-2xl p-5 text-sm text-slate-300"
              >
                <p className="text-white">Dispute {dispute.id}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Project {dispute.projectId || "N/A"} · Raised by{" "}
                  {dispute.raisedBy || "N/A"}
                </p>
                <p className="mt-3 text-xs text-slate-300">
                  {dispute.reason || "No reason provided"}
                </p>
                <Button
                  className="mt-4"
                  variant="primary"
                  onClick={() => handleResolve(dispute)}
                  disabled={processing === dispute.id}
                >
                  Resolve
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-white">
          Dispute registry ({filteredDisputes.length})
        </h4>
        {loading ? (
          <EmptyState title="Loading disputes" description="Fetching disputes..." />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No matching disputes"
            description="Try adjusting your filters."
          />
        ) : (
          <Table
            columns={[
              "Dispute",
              "Project",
              "Raised by",
              "Reason",
              "Status",
              "Date",
              "Action"
            ]}
            rows={rows}
            getRowKey={(row) => row.id}
          />
        )}
      </section>

      {status ? <p className="text-sm text-slate-300">{status}</p> : null}
    </DashboardLayout>
  );
}
