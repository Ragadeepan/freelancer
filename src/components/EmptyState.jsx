export default function EmptyState({ title, description }) {
  return (
    <div className="glass-card rounded-2xl p-6 text-center reveal-up sm:p-8">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xl soft-pulse">
        ✦
      </div>
      <h4 className="mt-4 font-display text-lg font-semibold text-white">
        {title}
      </h4>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </div>
  );
}
