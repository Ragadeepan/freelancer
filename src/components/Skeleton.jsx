export default function Skeleton({ lines = 3 }) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className="h-3 w-full animate-pulse rounded-full bg-white/10"
          />
        ))}
      </div>
    </div>
  );
}
