export default function TopBadge({ label = "Top Candidate" }) {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-100">
      {label}
    </span>
  );
}
