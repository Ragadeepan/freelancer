export default function ChartDonut({ value = 72 }) {
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="glass-card rounded-2xl p-5">
      <h4 className="text-sm font-semibold text-white">Project health</h4>
      <div className="mt-4 flex items-center gap-3 sm:gap-4">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="40"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="10"
            fill="none"
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            stroke="#7c5cff"
            strokeWidth="10"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div>
          <p className="text-xl font-semibold text-white sm:text-2xl">{value}%</p>
          <p className="text-xs text-slate-400">Healthy delivery pace</p>
        </div>
      </div>
    </div>
  );
}
