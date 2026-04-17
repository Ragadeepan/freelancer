import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { collection, limit, query, where } from "firebase/firestore";
import clsx from "../utils/clsx.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useToast } from "../contexts/ToastContext.jsx";
import { db } from "../firebase/firebase.js";
import useFirestoreQuery from "../hooks/useFirestoreQuery.js";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";
import BrandLogo from "./BrandLogo.jsx";
import { getWorkspaceNavLockState } from "../utils/accountStatus.js";

export default function DashboardLayout({
  sidebar,
  title,
  action,
  actionTo,
  onAction,
  children
}) {
  const { user, profile } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const role = profile?.role;
  const isAdmin = profile?.role === "admin";
  const mobileItems = useMemo(
    () => (Array.isArray(sidebar?.items) ? sidebar.items : []),
    [sidebar?.items]
  );
  const { data: notifications = [] } = useFirestoreQuery(
    () =>
      user
        ? role === "admin"
          ? query(
              collection(db, "notifications"),
              where("recipientId", "in", [user.uid, "admins"]),
              limit(80)
            )
          : query(
              collection(db, "notifications"),
              where("recipientId", "==", user.uid),
              limit(80)
            )
        : null,
    [role, user]
  );
  const unreadNotificationCount = useMemo(
    () => notifications.filter((entry) => !entry.read).length,
    [notifications]
  );
  const isNotificationsItem = (item) =>
    String(item?.label || "").trim().toLowerCase() === "notifications" ||
    String(item?.to || "").toLowerCase().includes("/notifications");
  const homeRoute =
    profile?.role === "admin"
      ? "/secure-admin/dashboard"
      : profile?.role === "client"
        ? "/client/dashboard"
        : "/freelancer/dashboard";
  const getNavLockState = (item) => getWorkspaceNavLockState(profile, item);
  const isNavItemLocked = (item) => getNavLockState(item).locked;
  const handleLockedNavItemClick = (item) => {
    const lockState = getNavLockState(item);
    if (!lockState.locked) return;
    toast.permission(lockState.message || "This section is locked.");
    if (lockState.redirectTo) {
      navigate(lockState.redirectTo);
    }
    setMobileNavOpen(false);
  };

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileNavOpen]);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(homeRoute);
  };

  return (
    <div
      className={clsx(
        "flex min-h-screen lg:h-[100dvh] lg:overflow-hidden",
        !isAdmin && "workspace-shell"
      )}
    >
      {!isAdmin ? (
        <>
          <div className="pointer-events-none fixed -left-24 top-12 z-0 h-64 w-64 rounded-full bg-glow-violet/20 blur-3xl float-slow" />
          <div className="pointer-events-none fixed bottom-8 right-8 z-0 h-72 w-72 rounded-full bg-glow-cyan/10 blur-3xl float-slow float-delay" />
        </>
      ) : null}
      <Sidebar
        {...sidebar}
        isAdmin={isAdmin}
        unreadNotificationCount={unreadNotificationCount}
      />
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="mobile-drawer absolute left-0 top-0 h-full w-[84vw] max-w-xs border-r border-white/10 bg-night-800/95 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  {sidebar?.subtitle || "Workspace"}
                </p>
                {isAdmin ? (
                  <h2 className="mt-2 font-display text-lg font-semibold text-white">
                    {sidebar?.title || "Navigation"}
                  </h2>
                ) : (
                  <BrandLogo
                    className="mt-2"
                    name={sidebar?.title || "Growlanzer"}
                    size="sm"
                    textClassName="title-gradient text-lg"
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="min-h-[36px] rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200"
              >
                Close
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleBack}
                className="min-h-[40px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100"
              >
                Back
              </button>
              <Link
                to={homeRoute}
                onClick={() => setMobileNavOpen(false)}
                className="inline-flex min-h-[40px] items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100"
              >
                Home
              </Link>
            </div>
            <nav className="mt-5 space-y-2">
              {mobileItems.map((item) => {
                if (isNavItemLocked(item)) {
                  return (
                    <button
                      key={item.to}
                      type="button"
                      onClick={() => handleLockedNavItemClick(item)}
                      className="flex min-h-[42px] w-full items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-100"
                    >
                      <span className="text-base">{item.icon}</span>
                      <span>{item.label}</span>
                      <span className="ml-auto text-[10px] uppercase tracking-[0.12em] text-amber-200">
                        Locked
                      </span>
                    </button>
                  );
                }

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileNavOpen(false)}
                    className={({ isActive }) =>
                      clsx(
                        "flex min-h-[42px] items-center gap-3 rounded-xl border px-3 py-2 text-sm transition",
                        isActive
                          ? "border-white/20 bg-white/10 text-white glow-border"
                          : "border-transparent bg-white/5 text-slate-300"
                      )
                    }
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                    {isNotificationsItem(item) && unreadNotificationCount > 0 ? (
                      <span className="ml-auto rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-100">
                        {unreadNotificationCount}
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
            </nav>
          </aside>
        </div>
      ) : null}
      <main
        className={clsx(
          "relative z-10 flex-1 px-4 py-5 pb-28 sm:px-6 sm:py-6 sm:pb-24 lg:h-[100dvh] lg:overflow-y-auto lg:px-10 lg:py-8 lg:pb-8",
          !isAdmin && "workspace-main"
        )}
      >
        <Topbar
          title={title}
          action={action}
          actionTo={actionTo}
          onAction={onAction}
          navItems={mobileItems}
          onOpenMenu={() => setMobileNavOpen(true)}
        />
        <div className="relative z-0 mt-6 space-y-6 sm:mt-8 sm:space-y-8">{children}</div>
      </main>
      {mobileItems.length > 0 ? (
        <nav className="mobile-bottom-nav lg:hidden">
          <div className="mobile-bottom-nav-track">
            {mobileItems.map((item) => {
              if (isNavItemLocked(item)) {
                return (
                  <button
                    key={`bottom-${item.to}`}
                    type="button"
                    onClick={() => handleLockedNavItemClick(item)}
                    className="mobile-bottom-link"
                  >
                    <span className="text-base leading-none">{item.icon}</span>
                    <span className="max-w-16 truncate text-[10px]">
                      {item.label}
                    </span>
                    {isNotificationsItem(item) && unreadNotificationCount > 0 ? (
                      <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-100">
                        {unreadNotificationCount}
                      </span>
                    ) : null}
                  </button>
                );
              }

              return (
                <NavLink
                  key={`bottom-${item.to}`}
                  to={item.to}
                  className={({ isActive }) =>
                    clsx(
                      "mobile-bottom-link",
                      isActive && "mobile-bottom-link-active"
                    )
                  }
                  >
                    <span className="text-base leading-none">{item.icon}</span>
                    <span className="max-w-16 truncate text-[10px]">{item.label}</span>
                    {isNotificationsItem(item) && unreadNotificationCount > 0 ? (
                      <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-100">
                        {unreadNotificationCount}
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
