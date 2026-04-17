import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import clsx from "../utils/clsx.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useToast } from "../contexts/ToastContext.jsx";
import BrandLogo from "./BrandLogo.jsx";
import { getWorkspaceNavLockState } from "../utils/accountStatus.js";
import { resolveUserPhotoUrl } from "../utils/fileUrl.js";

export default function Sidebar({
  title,
  subtitle,
  items,
  isAdmin = false,
  unreadNotificationCount = 0
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);
  const profilePhotoUrl = resolveUserPhotoUrl(profile);
  const getNavLockState = (item) => getWorkspaceNavLockState(profile, item);
  const isNotificationsItem = (item) =>
    String(item?.label || "").trim().toLowerCase() === "notifications" ||
    String(item?.to || "").toLowerCase().includes("/notifications");

  useEffect(() => {
    setImgError(false);
  }, [profilePhotoUrl]);

  const handleLockedItemClick = (item) => {
    const lockState = getNavLockState(item);
    if (!lockState.locked) return;
    toast.permission(lockState.message || "This section is locked.");
    if (lockState.redirectTo) {
      navigate(lockState.redirectTo);
    }
  };

  return (
    <aside
      className={clsx(
        "hidden h-[100dvh] min-h-[100dvh] w-64 flex-col overflow-hidden border-r border-white/10 bg-night-800/80 p-6 backdrop-blur-glass lg:sticky lg:top-0 lg:flex",
        !isAdmin && "workspace-sidebar"
      )}
    >
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
          {subtitle}
        </p>
        {isAdmin ? (
          <h1 className="mt-2 font-display text-xl font-semibold text-white">{title}</h1>
        ) : (
          <BrandLogo
            className="mt-2"
            name={title || "Growlanzer"}
            size="sm"
            textClassName="title-gradient text-xl"
          />
        )}
      </div>
      <nav className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
        {items.map((item) => {
          const lockState = getNavLockState(item);
          if (lockState.locked) {
            return (
              <button
                key={item.to}
                type="button"
                onClick={() => handleLockedItemClick(item)}
                className="workspace-sidebar-link flex w-full items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-left text-sm font-medium text-amber-100 transition hover:bg-amber-500/15"
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
                {isNotificationsItem(item) && unreadNotificationCount > 0 ? (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-100">
                    {unreadNotificationCount}
                  </span>
                ) : null}
                <span className="ml-auto text-[11px] uppercase tracking-[0.12em] text-amber-200">
                  Locked
                </span>
              </button>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  "workspace-sidebar-link flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-slate-300 transition",
                  isActive
                    ? clsx(
                        "text-white",
                        isAdmin
                          ? "border-white/10 bg-white/10 glow-border"
                          : "border-white/20 bg-white/10 glow-border shadow-glow"
                      )
                    : clsx(
                        "hover:bg-white/5",
                        !isAdmin && "hover:border-white/15 hover:-translate-y-[1px]"
                      )
                )
              }
            >
              <span className="text-lg">{item.icon}</span>
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

      <div className="mt-auto border-t border-white/10 pt-6">
        <Link
          to={
            isAdmin
              ? "/secure-admin/settings"
              : subtitle?.toLowerCase().includes("client")
                ? "/client/settings"
                : "/freelancer/settings"
          }
          className="group flex items-center gap-3 rounded-xl border border-transparent p-2 transition hover:bg-white/5"
        >
          <div className="h-10 w-10 overflow-hidden rounded-full border border-white/20 bg-night-900 group-hover:border-glow-cyan/50 transition-colors">
            {profilePhotoUrl && !imgError ? (
              <img
                src={profilePhotoUrl}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">
                {(profile?.name || profile?.displayName || "M")[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {profile?.name || profile?.displayName || "Member"}
            </p>
            <p className="truncate text-xs text-slate-500">
              {profile?.email || profile?.role || "View profile"}
            </p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
