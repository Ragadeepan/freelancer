export default function StatCard({ title, value, meta, icon }) {
  return (
    <div className="glass-card rounded-2xl p-5 reveal-up">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 sm:text-xs">
            {title}
          </p>
          <h3 className="mt-3 text-xl font-semibold text-white sm:text-2xl">{value}</h3>
          {meta && <p className="mt-2 text-sm text-slate-400">{meta}</p>}
        </div>
        {icon && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-200">
            {icon}
          </div>
        )}
      </div>
      <div className="mt-4 h-px w-full bg-gradient-to-r from-glow-violet/40 via-glow-cyan/30 to-transparent" />
    </div>
  );
}
