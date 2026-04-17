export default function LoadingScreen({ message = "Loading secure workspace..." }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="glass-card rounded-2xl p-8 text-center">
        <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-white/10" />
        <p className="mt-4 text-sm text-slate-300">{message}</p>
      </div>
    </div>
  );
}
