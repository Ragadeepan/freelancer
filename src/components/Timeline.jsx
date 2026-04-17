import StatusBadge from "./StatusBadge.jsx";

const steps = [
  "Job posted",
  "Admin approved",
  "Freelancer selected",
  "Escrow funded",
  "Work in progress",
  "Work submitted",
  "Admin approved",
  "Client approved",
  "Payment released"
];

export default function Timeline({ currentStatus = "work_submitted" }) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">Project timeline</h4>
        <StatusBadge status={currentStatus} />
      </div>
      <ul className="mt-4 space-y-3 text-sm text-slate-300">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-gradient-to-r from-glow-violet to-glow-cyan" />
            {step}
            {index < 4 && (
              <span className="text-xs text-slate-500">approved</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
