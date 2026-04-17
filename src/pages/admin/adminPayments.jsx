import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import StatCard from "../../components/StatCard.jsx";
import Table from "../../components/Table.jsx";
import Button from "../../components/Button.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import ReleaseButton from "../../components/releaseButton.jsx";
import { adminNav } from "../../data/nav.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import {
  fetchAdminPaymentPanel,
  markProjectCompletedByAdmin,
  refundProjectEscrow,
  releaseProjectEscrow
} from "../../services/adminPaymentsApi.js";

const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateTime = (value) => {
  const date = toDate(value);
  if (!date) return "N/A";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
};

const formatCurrency = (value, currency = "INR") =>
  `${String(currency || "INR").toUpperCase()} ${Number(value || 0).toFixed(2)}`;

const defaultSummary = {
  totalFundsHeld: 0,
  totalReleased: 0,
  pendingPayments: 0,
  commissionEarned: 0
};

export default function AdminPaymentsPanel() {
  const { user } = useAuth();
  const toast = useToast();

  const [summary, setSummary] = useState(defaultSummary);
  const [history, setHistory] = useState([]);
  const [escrowList, setEscrowList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [processingKey, setProcessingKey] = useState("");

  const refreshPanel = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const payload = await fetchAdminPaymentPanel(user);
      setSummary(payload.summary || defaultSummary);
      setHistory(Array.isArray(payload.history) ? payload.history : []);
      setEscrowList(Array.isArray(payload.escrow) ? payload.escrow : []);
    } catch (fetchError) {
      const message = fetchError?.message || "Failed to fetch payment panel.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [toast, user]);

  useEffect(() => {
    refreshPanel();
  }, [refreshPanel]);

  const escrowByPaymentId = useMemo(() => {
    return escrowList.reduce((acc, escrow) => {
      if (escrow.paymentId) {
        acc[escrow.paymentId] = escrow;
      }
      return acc;
    }, {});
  }, [escrowList]);

  const filteredHistory = useMemo(() => {
    const term = search.trim().toLowerCase();
    return history.filter((entry) => {
      const currentStatus = String(entry.status || "").toLowerCase();
      if (statusFilter !== "all" && currentStatus !== statusFilter) {
        return false;
      }
      if (!term) return true;
      return (
        String(entry.id || "").toLowerCase().includes(term) ||
        String(entry.projectId || "").toLowerCase().includes(term) ||
        String(entry.gateway || "").toLowerCase().includes(term) ||
        String(entry.payerId || "").toLowerCase().includes(term) ||
        String(entry.transactionId || "").toLowerCase().includes(term)
      );
    });
  }, [history, search, statusFilter]);

  const runEscrowAction = async (key, action, successText) => {
    setStatusMessage("");
    setProcessingKey(key);
    try {
      await action();
      setStatusMessage(successText);
      toast.success(successText);
      await refreshPanel();
    } catch (actionError) {
      const message = actionError?.message || "Action failed.";
      setStatusMessage(message);
      toast.error(message);
    } finally {
      setProcessingKey("");
    }
  };

  const handleMarkCompleted = (entry) => {
    if (!entry?.projectId) return;
    const key = `complete-${entry.projectId}`;
    runEscrowAction(
      key,
      () => markProjectCompletedByAdmin(user, entry.projectId),
      `Project ${entry.projectId} marked as completed.`
    );
  };

  const handleRelease = (entry) => {
    if (!entry?.projectId || !entry?.id) return;
    const key = `release-${entry.id}`;
    runEscrowAction(
      key,
      () =>
        releaseProjectEscrow(user, entry.projectId, {
          escrowId: entry.id
        }),
      "Payment released to freelancer."
    );
  };

  const handleRefund = (entry) => {
    if (!entry?.projectId || !entry?.id) return;
    const reason = window.prompt("Refund reason (optional):", "") || "";
    const key = `refund-${entry.id}`;
    runEscrowAction(
      key,
      () =>
        refundProjectEscrow(user, entry.projectId, {
          escrowId: entry.id,
          reason
        }),
      "Payment refunded to client."
    );
  };

  const historyRows = filteredHistory.map((entry) => {
    const linkedEscrow = escrowByPaymentId[entry.id];
    const actionCell =
      linkedEscrow && linkedEscrow.status === "held" ? (
        <div key={`${entry.id}-actions`} className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => handleMarkCompleted(linkedEscrow)}
            disabled={Boolean(processingKey)}
          >
            Mark completed
          </Button>
          <Button
            variant="danger"
            onClick={() => handleRefund(linkedEscrow)}
            disabled={processingKey === `refund-${linkedEscrow.id}`}
          >
            {processingKey === `refund-${linkedEscrow.id}` ? "Refunding..." : "Refund"}
          </Button>
          <ReleaseButton
            onClick={() => handleRelease(linkedEscrow)}
            loading={processingKey === `release-${linkedEscrow.id}`}
            disabled={Boolean(processingKey) && processingKey !== `release-${linkedEscrow.id}`}
          />
        </div>
      ) : (
        <span className="text-xs text-slate-400">No action</span>
      );

    const row = [
      entry.id || "N/A",
      entry.projectId || "N/A",
      String(entry.gateway || "N/A").toUpperCase(),
      formatCurrency(entry.amount, entry.currency),
      formatCurrency(entry.platformCommission, entry.currency),
      { type: "status", value: entry.status || "pending" },
      formatDateTime(entry.createdAt),
      actionCell
    ];
    row.id = entry.id;
    return row;
  });

  const escrowCards = escrowList
    .slice()
    .sort((a, b) => {
      const aDate = toDate(a.createdAt)?.getTime() || 0;
      const bDate = toDate(b.createdAt)?.getTime() || 0;
      return bDate - aDate;
    });

  return (
    <DashboardLayout
      title="Payments"
      sidebar={{ title: "Admin HQ", subtitle: "Admin", items: adminNav }}
    >
      <PageHeader
        title="Admin-controlled escrow payments"
        description="Client pays admin escrow first. Admin verifies completion, deducts commission, and releases freelancer payout."
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <StatCard
          title="Total funds held"
          value={formatCurrency(summary.totalFundsHeld, "INR")}
        />
        <StatCard
          title="Total released"
          value={formatCurrency(summary.totalReleased, "INR")}
        />
        <StatCard title="Pending payments" value={summary.pendingPayments || 0} />
        <StatCard
          title="Commission earned"
          value={formatCurrency(summary.commissionEarned, "INR")}
        />
      </section>

      <section className="glass-card rounded-2xl p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
          <input
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
            placeholder="Search by payment id, project id, payer, gateway, transaction id"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="held">Held</option>
            <option value="released">Released</option>
            <option value="refunded">Refunded</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <Button variant="ghost" onClick={refreshPanel} disabled={loading}>
            Refresh
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-white">
          Escrow status list ({escrowCards.length})
        </h4>
        {loading ? (
          <EmptyState title="Loading escrow" description="Fetching escrow statuses..." />
        ) : escrowCards.length === 0 ? (
          <EmptyState title="No escrow records" description="Escrow will appear after payment verification." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {escrowCards.slice(0, 20).map((entry) => (
              <div key={entry.id} className="glass-card rounded-2xl p-5 text-sm text-slate-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-white">{entry.projectId || "Project"}</p>
                  <span className="text-xs text-slate-400">Escrow: {entry.id}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Installment #{entry.installmentNumber || 1} · Gateway {String(
                    entry.gateway || "N/A"
                  ).toUpperCase()}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Total {formatCurrency(entry.totalAmount, entry.currency)} · Commission{" "}
                  {formatCurrency(entry.platformCommission, entry.currency)} · Freelancer{" "}
                  {formatCurrency(entry.freelancerAmount, entry.currency)}
                </p>
                <div className="mt-2">
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase text-slate-200">
                    {entry.status || "pending"}
                  </span>
                </div>
                {entry.status === "held" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => handleMarkCompleted(entry)}
                      disabled={processingKey === `complete-${entry.projectId}`}
                    >
                      {processingKey === `complete-${entry.projectId}`
                        ? "Updating..."
                        : "Mark completed"}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => handleRefund(entry)}
                      disabled={processingKey === `refund-${entry.id}`}
                    >
                      {processingKey === `refund-${entry.id}` ? "Refunding..." : "Refund"}
                    </Button>
                    <ReleaseButton
                      onClick={() => handleRelease(entry)}
                      loading={processingKey === `release-${entry.id}`}
                      disabled={
                        Boolean(processingKey) &&
                        processingKey !== `release-${entry.id}` &&
                        processingKey !== `complete-${entry.projectId}`
                      }
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-white">
          Payment history ({filteredHistory.length})
        </h4>
        {loading ? (
          <EmptyState title="Loading history" description="Fetching payment history..." />
        ) : historyRows.length === 0 ? (
          <EmptyState title="No payments found" description="Try changing your filters." />
        ) : (
          <Table
            columns={[
              "Payment",
              "Project",
              "Gateway",
              "Amount",
              "Commission",
              "Status",
              "Created",
              "Action"
            ]}
            rows={historyRows}
            getRowKey={(row) => row.id}
          />
        )}
      </section>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {statusMessage ? <p className="text-sm text-slate-300">{statusMessage}</p> : null}
    </DashboardLayout>
  );
}
