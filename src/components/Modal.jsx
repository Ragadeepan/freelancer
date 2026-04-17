import Button from "./Button.jsx";

export function SlideOver({
  title,
  children,
  onClose,
  onApprove,
  closeLabel = "Close",
  approveLabel = "Approve",
  approveDisabled = false
}) {
  return (
    <div className="glass-card rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <h4 className="font-display text-lg font-semibold text-white">
          {title}
        </h4>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 transition hover:text-white"
        >
          ✕
        </button>
      </div>
      <div className="py-4 text-sm text-slate-300">{children}</div>
      <div className="flex flex-wrap justify-end gap-3 border-t border-white/10 pt-4">
        <Button variant="ghost" onClick={onClose}>
          {closeLabel}
        </Button>
        <Button onClick={onApprove} disabled={approveDisabled}>
          {approveLabel}
        </Button>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  description,
  onCancel,
  onConfirm,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  confirmDisabled = false
}) {
  return (
    <div className="glass-card rounded-2xl p-5 sm:p-6">
      <h4 className="font-display text-lg font-semibold text-white">{title}</h4>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={confirmDisabled}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
