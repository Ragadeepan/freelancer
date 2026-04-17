import clsx from "../utils/clsx.js";

export default function Button({
  variant = "primary",
  className,
  type = "button",
  children,
  ...props
}) {
  const base =
    "btn-shell inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold leading-none transition duration-200 touch-manipulation active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-glow-violet/60 disabled:cursor-not-allowed disabled:opacity-50";
  const variants = {
    primary:
      "btn-primary bg-gradient-to-r from-glow-violet via-glow-blue to-glow-cyan text-white shadow-glow hover:brightness-110",
    ghost:
      "btn-ghost border border-white/15 bg-white/5 text-slate-100 hover:bg-white/10",
    danger:
      "btn-danger border border-rose-400/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
  };

  return (
    <button
      type={type}
      className={clsx(base, variants[variant], className)}
      {...props}
    >
      <span className="relative z-[1]">{children}</span>
    </button>
  );
}
