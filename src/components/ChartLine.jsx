import { useId } from "react";

export default function ChartLine({
  title = "Weekly performance",
  subtitle = "Last 7 days",
  data = []
}) {
  const gradientId = useId();
  const padding = 18;
  const width = 400;
  const height = 120;
  const maxValue = data.length ? Math.max(...data, 0) : 0;
  const hasData = data.length > 1 && maxValue > 0;

  const points = hasData
    ? data.map((value, index) => {
        const step = (width - padding * 2) / (data.length - 1);
        const x = padding + step * index;
        const y =
          height -
          padding -
          (value / maxValue) * (height - padding * 2);
        return { x, y };
      })
    : [];

  const linePath = hasData
    ? points
        .map((point, index) =>
          `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
        )
        .join(" ")
    : "";

  const areaPath = hasData
    ? `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${
        points[0].x
      } ${height - padding} Z`
    : "";

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-white">{title}</h4>
        <span className="text-xs text-slate-400">{subtitle}</span>
      </div>
      {hasData ? (
        <svg className="mt-4 h-32 w-full" viewBox="0 0 400 120">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7c5cff" />
              <stop offset="100%" stopColor="#4df2ff" />
            </linearGradient>
          </defs>
          <path
            d={linePath}
            stroke={`url(#${gradientId})`}
            strokeWidth="4"
            fill="none"
          />
          <path d={areaPath} fill={`url(#${gradientId})`} opacity="0.15" />
        </svg>
      ) : (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-slate-400">
          No activity yet.
        </div>
      )}
    </div>
  );
}
