import { useMemo, useState } from "react";
import { collection } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Button from "../../components/Button.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import UserProfileLink from "../../components/UserProfileLink.jsx";
import { adminNav } from "../../data/nav.js";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { verifyBankDetails, releaseContractPayout } from "../../services/contractsService.js";
import {
  CONTRACT_STATUS,
  CONTRACT_STATUS_LABELS,
  PAYMENT_STATUS,
  normalizeContractStatus
} from "../../utils/contracts.js";

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export default function AdminContracts() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: contracts = [], loading } = useFirestoreQuery(
    () => collection(db, "contracts"),
    []
  );
  const { data: users = [] } = useFirestoreQuery(() => collection(db, "users"), []);
  const { data: bankDetails = [] } = useFirestoreQuery(() => collection(db, "bankDetails"), []);
  const { data: payouts = [] } = useFirestoreQuery(() => collection(db, "payouts"), []);
  const [processingId, setProcessingId] = useState("");

  const usersById = useMemo(() => {
    const map = new Map();
    users.forEach((entry) => map.set(entry.id, entry));
    return map;
  }, [users]);

  const payoutsByContractId = useMemo(() => {
    const map = new Map();
    payouts.forEach((entry) => {
      if (entry.contractId) {
        map.set(entry.contractId, entry);
      }
    });
    return map;
  }, [payouts]);

  const bankByUserId = useMemo(() => {
    const map = new Map();
    bankDetails.forEach((entry) => map.set(entry.userId || entry.id, entry));
    return map;
  }, [bankDetails]);

  const sortedContracts = useMemo(() => {
    return [...contracts].sort((a, b) => {
      const aTime = toDate(a.createdAt)?.getTime() || 0;
      const bTime = toDate(b.createdAt)?.getTime() || 0;
      return bTime - aTime;
    });
  }, [contracts]);

  const handleVerifyBank = async (freelancerId, verified) => {
    if (!user?.uid) return;
    setProcessingId(freelancerId);
    try {
      await verifyBankDetails({ freelancerId, adminId: user.uid, verified });
      toast.success("Bank details updated.");
    } catch (err) {
      toast.error(err?.message || "Failed to update bank verification.");
    } finally {
      setProcessingId("");
    }
  };

  const handleReleasePayment = async (contractId) => {
    if (!user?.uid) return;
    setProcessingId(contractId);
    try {
      await releaseContractPayout({ contractId, adminId: user.uid });
      toast.success("Payment released.");
    } catch (err) {
      toast.error(err?.message || "Failed to release payment.");
    } finally {
      setProcessingId("");
    }
  };

  return (
    <DashboardLayout
      title="Contracts"
      sidebar={{ title: "Admin HQ", subtitle: "Admin", items: adminNav }}
    >
      <PageHeader
        title="Contracts"
        description="Monitor active enterprise contracts and release payments."
      />

      {loading ? (
        <EmptyState title="Loading contracts" description="Fetching contracts..." />
      ) : sortedContracts.length === 0 ? (
        <EmptyState title="No contracts" description="Contracts will appear after selection." />
      ) : (
        <div className="grid gap-4">
          {sortedContracts.map((contract) => {
            const status = normalizeContractStatus(
              contract.contractStatus || contract.status
            );
            const freelancer = usersById.get(contract.freelancerId);
            const bank = bankByUserId.get(contract.freelancerId);
            const payout = payoutsByContractId.get(contract.id);
            const bankVerified = bank?.status === "verified";
            const canRelease =
              contract.paymentStatus === PAYMENT_STATUS.RELEASE_PENDING &&
              status === CONTRACT_STATUS.COMPLETED &&
              bankVerified &&
              payout?.status === "pending";

            return (
              <div key={contract.id} className="glass-card rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      {contract.title || "Contract"}
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      Client:{" "}
                      <UserProfileLink
                        userId={contract.clientId}
                        name={contract.clientName || contract.clientId}
                        className="text-sky-200 underline hover:text-sky-100"
                      />{" "}
                      · Freelancer:{" "}
                      <UserProfileLink
                        userId={contract.freelancerId}
                        name={freelancer?.displayName || freelancer?.name || contract.freelancerName || contract.freelancerId}
                        className="text-sky-200 underline hover:text-sky-100"
                      />
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Amount: {contract.currency || "INR"} {Number(contract.amount || 0).toFixed(2)}
                    </p>
                  </div>
                  <StatusBadge status={status} />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-300">
                    <p className="uppercase tracking-[0.2em] text-slate-500">Status</p>
                    <p className="mt-2 text-sm text-white">
                      {CONTRACT_STATUS_LABELS[status] || status}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-300">
                    <p className="uppercase tracking-[0.2em] text-slate-500">Payment</p>
                    <p className="mt-2 text-sm text-white">
                      {contract.paymentStatus || "N/A"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => handleVerifyBank(contract.freelancerId, !bankVerified)}
                    disabled={processingId === contract.freelancerId}
                  >
                    {bankVerified ? "Unverify bank" : "Verify bank"}
                  </Button>
                  <Button
                    onClick={() => handleReleasePayment(contract.id)}
                    disabled={!canRelease || processingId === contract.id}
                  >
                    Release payment
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
