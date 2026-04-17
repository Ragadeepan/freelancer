import { createContext, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

const styles = {
  success: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  error: "border-rose-400/40 bg-rose-500/10 text-rose-200",
  permission: "border-amber-400/40 bg-amber-500/10 text-amber-200"
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = (type, message) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3200);
  };

  const api = useMemo(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      permission: (message) => push("permission", message)
    }),
    []
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed left-4 right-4 top-4 z-50 flex flex-col gap-3 sm:left-auto sm:right-6 sm:top-6 sm:w-[320px]">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`glass-card rounded-2xl border px-4 py-3 text-sm shadow-card ${styles[toast.type]}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
