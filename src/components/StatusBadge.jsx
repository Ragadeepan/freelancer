import clsx from "../utils/clsx.js";
import { ACCOUNT_STATUS } from "../utils/accountStatus.js";

const styles = {
  incomplete: "bg-slate-500/15 text-slate-200 border-slate-400/40",
  pending_approval: "bg-amber-400/10 text-amber-200 border-amber-400/40",
  pending: "bg-amber-400/10 text-amber-200 border-amber-400/40",
  approved: "bg-emerald-400/10 text-emerald-200 border-emerald-400/40",
  selected: "bg-emerald-400/10 text-emerald-200 border-emerald-400/40",
  hired: "bg-emerald-400/10 text-emerald-200 border-emerald-400/40",
  not_selected: "bg-slate-400/10 text-slate-200 border-slate-400/40",
  rejected: "bg-rose-500/10 text-rose-200 border-rose-400/40",
  completed: "bg-cyan-400/10 text-cyan-200 border-cyan-400/40",
  blocked: "bg-rose-500/10 text-rose-200 border-rose-400/40",
  open: "bg-sky-400/10 text-sky-200 border-sky-400/40",
  closed: "bg-slate-400/10 text-slate-200 border-slate-400/40",
  in_progress: "bg-indigo-400/10 text-indigo-200 border-indigo-400/40",
  work_submitted: "bg-purple-400/10 text-purple-200 border-purple-400/40",
  revision_requested: "bg-amber-400/10 text-amber-200 border-amber-400/40",
  cancelled: "bg-rose-500/10 text-rose-200 border-rose-400/40",
  frozen: "bg-slate-400/10 text-slate-200 border-slate-400/40",
  escrow: "bg-indigo-400/10 text-indigo-200 border-indigo-400/40",
  held: "bg-indigo-400/10 text-indigo-200 border-indigo-400/40",
  paid: "bg-sky-400/10 text-sky-200 border-sky-400/40",
  released: "bg-emerald-400/10 text-emerald-200 border-emerald-400/40",
  refunded: "bg-rose-500/10 text-rose-200 border-rose-400/40",
  failed: "bg-rose-500/10 text-rose-200 border-rose-400/40",
  disputed: "bg-amber-400/10 text-amber-200 border-amber-400/40",
  funded: "bg-sky-400/10 text-sky-200 border-sky-400/40",
  created: "bg-slate-400/10 text-slate-200 border-slate-400/40",
  resolved: "bg-emerald-400/10 text-emerald-200 border-emerald-400/40",
  contract_created: "bg-slate-400/10 text-slate-200 border-slate-400/40",
  client_paid: "bg-sky-400/10 text-sky-200 border-sky-400/40",
  requirements_uploaded: "bg-sky-400/10 text-sky-200 border-sky-400/40",
  flow_submitted: "bg-amber-400/10 text-amber-200 border-amber-400/40",
  flow_approved: "bg-emerald-400/10 text-emerald-200 border-emerald-400/40",
  development_started: "bg-indigo-400/10 text-indigo-200 border-indigo-400/40",
  demo_scheduled: "bg-indigo-400/10 text-indigo-200 border-indigo-400/40",
  feedback_uploaded: "bg-sky-400/10 text-sky-200 border-sky-400/40",
  final_submitted: "bg-amber-400/10 text-amber-200 border-amber-400/40",
  final_approved: "bg-emerald-400/10 text-emerald-200 border-emerald-400/40",
  release_pending: "bg-amber-400/10 text-amber-200 border-amber-400/40"
  ,
  awaiting_payment: "bg-amber-400/10 text-amber-200 border-amber-400/40",
  awaiting_requirements: "bg-amber-400/10 text-amber-200 border-amber-400/40",
  flow_revision: "bg-amber-400/10 text-amber-200 border-amber-400/40",
  development_ready: "bg-emerald-400/10 text-emerald-200 border-emerald-400/40"
};

export default function StatusBadge({ status = "pending" }) {
  const raw = String(status || "").trim().toLowerCase();
  const safeStatus = Object.values(ACCOUNT_STATUS).includes(raw) ? raw : raw || "pending";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
        styles[safeStatus] || styles.pending
      )}
    >
      {safeStatus.replace(/_/g, " ")}
    </span>
  );
}
