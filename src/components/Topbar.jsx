import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, limit, query, where } from "firebase/firestore";
import Button from "./Button.jsx";
import clsx from "../utils/clsx.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { db } from "../firebase/firebase.js";
import useFirestoreQuery from "../hooks/useFirestoreQuery.js";
import {
  markNotificationRead,
  markNotificationsRead
} from "../services/notificationsService.js";
import { useToast } from "../contexts/ToastContext.jsx";
import {
  getWorkspaceActionBlockedMessage,
  getWorkspaceNavLockState
} from "../utils/accountStatus.js";
import { resolveUserPhotoUrl } from "../utils/fileUrl.js";

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toTime = (value) => toDate(value)?.getTime() || 0;

const formatTime = (value) => {
  const date = toDate(value);
  if (!date) return "N/A";
  return date.toLocaleString();
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const getJobRouteByRole = (role) => {
  if (role === "admin") return "/secure-admin/jobs";
  if (role === "client") return "/client/jobs";
  return "/freelancer/jobs";
};

const getProjectRouteByRole = (role) => {
  if (role === "admin") return "/secure-admin/projects";
  if (role === "client") return "/client/projects";
  return "/freelancer/projects";
};

const getContractsRouteByRole = (role) => {
  if (role === "client") return "/client/contracts";
  if (role === "freelancer") return "/freelancer/contracts";
  return "/secure-admin/contracts";
};

const getProposalRouteByRole = (role) => {
  if (role === "admin") return "/secure-admin/proposals";
  if (role === "client") return "/client/jobs";
  return "/freelancer/proposals";
};

const getMessageRouteByRole = (role) => {
  if (role === "admin") return "/secure-admin/assignments";
  if (role === "client") return "/client/messages";
  return "/freelancer/messages";
};

const getNotificationHubRoute = (role) => {
  if (role === "admin") return "/secure-admin/notifications";
  if (role === "client") return "/client/notifications";
  return "/freelancer/notifications";
};

const getNotificationLink = (notification, role) => {
  if (!notification) return null;
  const type = normalizeText(notification.type);
  if (notification.contractId && role !== "admin") {
    return `/workspace/project/${notification.contractId}`;
  }
  if (
    role !== "admin" &&
    !notification.contractId &&
    ["job_assigned", "job_assigned_confirmed", "contract_created"].includes(type)
  ) {
    return getContractsRouteByRole(role);
  }
  if (notification.projectId) return `/project/${notification.projectId}`;
  if (type.includes("message")) return getMessageRouteByRole(role);
  if (type.includes("proposal")) return getProposalRouteByRole(role);
  if (type.includes("job")) return getJobRouteByRole(role);
  if (
    type.includes("project") ||
    type.includes("payment") ||
    type.includes("dispute")
  ) {
    return getProjectRouteByRole(role);
  }
  if (type.includes("user_")) {
    if (role === "client") return "/client/company-profile";
    if (role === "freelancer") return "/freelancer/profile";
    return "/secure-admin/users";
  }
  return getNotificationHubRoute(role);
};

const dedupeById = (items = []) => {
  const map = new Map();
  items.forEach((entry) => {
    if (!entry?.id) return;
    if (map.has(entry.id)) return;
    map.set(entry.id, entry);
  });
  return [...map.values()];
};

export default function Topbar({
  title,
  action,
  actionTo,
  onAction,
  navItems = [],
  onOpenMenu
}) {
  const { user, profile } = useAuth();
  const role = profile?.role;
  const navigate = useNavigate();
  const toast = useToast();
  const notificationsRef = useRef(null);
  const searchRef = useRef(null);
  const [openNotifications, setOpenNotifications] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState("all");
  const [openSearch, setOpenSearch] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const shouldLoadSearchData = openSearch || searchQuery.trim().length > 0;
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
  const { data: jobs = [] } = useFirestoreQuery(
    () => {
      if (!shouldLoadSearchData) return null;
      if (!user || !role) return null;
      if (role === "admin") return query(collection(db, "jobs"), limit(80));
      if (role === "client") {
        return query(
          collection(db, "jobs"),
          where("clientId", "==", user.uid),
          limit(80)
        );
      }
      return query(
        collection(db, "jobs"),
        where("status", "==", "approved"),
        limit(80)
      );
    },
    [role, shouldLoadSearchData, user]
  );
  const { data: freelancerJobs = [] } = useFirestoreQuery(
    () =>
      shouldLoadSearchData && role === "freelancer" && user
        ? query(
            collection(db, "jobs"),
            where("selectedFreelancerId", "==", user.uid),
            limit(40)
          )
        : null,
    [role, shouldLoadSearchData, user]
  );
  const { data: projects = [] } = useFirestoreQuery(
    () => {
      if (!shouldLoadSearchData) return null;
      if (!user || !role) return null;
      if (role === "admin") return query(collection(db, "projects"), limit(80));
      if (role === "client") {
        return query(
          collection(db, "projects"),
          where("clientId", "==", user.uid),
          limit(80)
        );
      }
      return query(
        collection(db, "projects"),
        where("freelancerId", "==", user.uid),
        limit(80)
      );
    },
    [role, shouldLoadSearchData, user]
  );
  const { data: proposals = [] } = useFirestoreQuery(
    () => {
      if (!shouldLoadSearchData) return null;
      if (!user || !role) return null;
      if (role === "admin") return query(collection(db, "proposals"), limit(80));
      if (role === "client") {
        return query(
          collection(db, "proposals"),
          where("clientId", "==", user.uid),
          limit(80)
        );
      }
      return query(
        collection(db, "proposals"),
        where("freelancerId", "==", user.uid),
        limit(80)
      );
    },
    [role, shouldLoadSearchData, user]
  );
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    return localStorage.getItem("theme") || "dark";
  });

  const mergedJobs = useMemo(() => {
    if (role !== "freelancer") return jobs;
    return dedupeById([...(jobs || []), ...(freelancerJobs || [])]);
  }, [freelancerJobs, jobs, role]);

  const unreadNotifications = useMemo(
    () => notifications.filter((entry) => !entry.read),
    [notifications]
  );
  const sortedNotifications = useMemo(() => {
    return [...notifications]
      .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))
      .slice(0, 20);
  }, [notifications]);
  const visibleNotifications = useMemo(() => {
    if (notificationFilter === "unread") {
      return sortedNotifications.filter((entry) => !entry.read);
    }
    return sortedNotifications;
  }, [notificationFilter, sortedNotifications]);

  const displayName =
    profile?.name ||
    user?.displayName ||
    user?.email?.split("@")[0] ||
    "Member";
  const profilePhotoUrl = resolveUserPhotoUrl(profile);
  const isAdmin = role === "admin";
  const hasMobileMenu = Array.isArray(navItems) && navItems.length > 0;
  const defaultHome =
    role === "admin"
      ? "/secure-admin/dashboard"
      : role === "client"
        ? "/client/dashboard"
        : "/freelancer/dashboard";
  const notificationHubRoute = getNotificationHubRoute(role);
  const profileRoute =
    role === "admin"
      ? "/secure-admin/settings"
      : role === "client"
        ? "/client/company-profile"
        : "/freelancer/profile";
  const workspaceActionBlockedMessage = useMemo(() => {
    if (role !== "client" && role !== "freelancer") return "";
    return getWorkspaceActionBlockedMessage(profile);
  }, [profile, role]);
  const workspaceNoticeTone = useMemo(() => {
    const text = normalizeText(workspaceActionBlockedMessage);
    if (!text) return "";
    if (text.includes("rejected")) return "rose";
    if (
      text.includes("admin approval required") ||
      text.includes("under admin review") ||
      text.includes("request admin approval")
    ) {
      return "amber";
    }
    return "sky";
  }, [workspaceActionBlockedMessage]);

  const searchItems = useMemo(() => {
    const navResults = (navItems || []).map((item) => ({
      ...(() => {
        const lockState = getWorkspaceNavLockState(profile, item);
        return {
          locked: lockState.locked,
          lockedMessage: lockState.message,
          lockedRedirectTo: lockState.redirectTo
        };
      })(),
      key: `nav-${item.to}`,
      kind: "navigation",
      title: item.label,
      subtitle: "Open workspace page",
      to: item.to,
      updatedAt: 0,
      searchText: normalizeText(`${item.label} navigation ${item.to}`)
    }));

    const jobResults = (mergedJobs || []).map((job) => ({
      key: `job-${job.id}`,
      kind: "job",
      title: job.title || "Untitled job",
      subtitle: `Job · ${job.status || "status unknown"}`,
      to: getJobRouteByRole(role),
      updatedAt: toTime(job.createdAt),
      searchText: normalizeText(
        `${job.title} ${job.category} ${job.subcategory} ${job.description} ${Array.isArray(job.skills) ? job.skills.join(" ") : ""
        } ${job.status}`
      )
    }));

    const projectResults = (projects || []).map((project) => ({
      key: `project-${project.id}`,
      kind: "project",
      title: project.jobTitle || "Project",
      subtitle: `Project · ${project.status || "status unknown"}`,
      to: project.contractId ? `/workspace/project/${project.contractId}` : `/project/${project.id}`,
      updatedAt: toTime(project.updatedAt || project.createdAt),
      searchText: normalizeText(
        `${project.jobTitle} ${project.clientName} ${project.freelancerName} ${project.status}`
      )
    }));

    const proposalResults = (proposals || []).map((proposal) => ({
      key: `proposal-${proposal.id}`,
      kind: "proposal",
      title: proposal.jobTitle || "Proposal",
      subtitle: `Proposal · ${proposal.status || "pending"}`,
      to: getProposalRouteByRole(role),
      updatedAt: toTime(proposal.reviewedAt || proposal.createdAt),
      searchText: normalizeText(
        `${proposal.jobTitle} ${proposal.freelancerName} ${proposal.clientId} ${proposal.status}`
      )
    }));

    const notificationResults = (sortedNotifications || []).map((entry) => ({
      key: `notification-${entry.id}`,
      kind: "notification",
      title: entry.title || "Notification",
      subtitle: entry.message || "Open notification",
      to: getNotificationLink(entry, role),
      updatedAt: toTime(entry.createdAt),
      notificationId: entry.id,
      notificationRead: Boolean(entry.read),
      searchText: normalizeText(`${entry.title} ${entry.message} ${entry.type}`)
    }));

    return [
      ...navResults,
      ...projectResults,
      ...jobResults,
      ...proposalResults,
      ...notificationResults
    ];
  }, [mergedJobs, navItems, profile, projects, proposals, role, sortedNotifications]);

  const filteredSearchItems = useMemo(() => {
    const text = normalizeText(searchQuery);
    if (!text) {
      return [...searchItems]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8);
    }
    const scored = searchItems
      .map((item) => {
        if (!item.searchText.includes(text)) return null;
        let score = 1;
        if (normalizeText(item.title).includes(text)) score += 4;
        if (normalizeText(item.subtitle).includes(text)) score += 2;
        if (normalizeText(item.kind).includes(text)) score += 1;
        return { ...item, score };
      })
      .filter(Boolean);

    return scored
      .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
      .slice(0, 10);
  }, [searchItems, searchQuery]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    setImgError(false);
  }, [profilePhotoUrl]);

  useEffect(() => {
    const onOutsideClick = (event) => {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target)
      ) {
        setOpenNotifications(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setOpenSearch(false);
      }
    };
    const onEscape = (event) => {
      if (event.key !== "Escape") return;
      setOpenNotifications(false);
      setOpenSearch(false);
    };
    document.addEventListener("mousedown", onOutsideClick);
    window.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutsideClick);
      window.removeEventListener("keydown", onEscape);
    };
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const handleOpenNotification = async (notification, shouldNavigate = false) => {
    if (!notification) return;
    if (!notification.read) {
      try {
        await markNotificationRead(notification.id);
      } catch {
        toast.error("Failed to update notification.");
      }
    }
    if (shouldNavigate) {
      const linkTo = getNotificationLink(notification, role);
      if (linkTo) {
        navigate(linkTo);
      }
    }
    setOpenNotifications(false);
  };

  const handleMarkAllRead = async () => {
    if (unreadNotifications.length === 0) return;
    try {
      await markNotificationsRead(unreadNotifications.map((entry) => entry.id));
      toast.success("All notifications marked as read.");
    } catch {
      toast.error("Failed to mark all notifications as read.");
    }
  };

  const handleSearchSelect = async (item) => {
    if (!item) return;
    if (item.locked) {
      toast.permission(item.lockedMessage || "This section is locked.");
      navigate(item.lockedRedirectTo || defaultHome);
      setSearchQuery("");
      setOpenSearch(false);
      return;
    }
    if (item.kind === "notification" && item.notificationId && !item.notificationRead) {
      try {
        await markNotificationRead(item.notificationId);
      } catch {
        toast.error("Failed to update notification.");
      }
    }
    navigate(item.to || defaultHome);
    setSearchQuery("");
    setOpenSearch(false);
  };

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(defaultHome);
  };

  const handleSearchKeyDown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (filteredSearchItems.length === 0) return;
    void handleSearchSelect(filteredSearchItems[0]);
  };

  return (
    <header
      className={clsx(
        "relative z-50 flex flex-wrap items-start justify-between gap-4 overflow-visible border-b border-white/10 pb-5 sm:gap-4 sm:pb-6",
        !isAdmin && "workspace-topbar reveal-up"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2 lg:hidden">
          {hasMobileMenu && onOpenMenu ? (
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="Open menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200"
            >
              <span className="flex flex-col gap-1">
                <span className="block h-0.5 w-4 rounded bg-current" />
                <span className="block h-0.5 w-4 rounded bg-current" />
                <span className="block h-0.5 w-4 rounded bg-current" />
              </span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/5 px-3 text-xs leading-none text-slate-200"
          >
            Back
          </button>
        </div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400 sm:text-xs">
          Workspace
        </p>
        <h2
          className={clsx(
            "mt-2 truncate font-display text-lg font-semibold sm:text-2xl",
            isAdmin ? "text-white" : "title-gradient"
          )}
        >
          {title}
        </h2>
        {!isAdmin ? (
          <p className="mt-2 text-xs text-slate-400">
            {role === "client" ? "Client workspace" : "Freelancer workspace"}
          </p>
        ) : null}
      </div>
      <div className="relative z-50 flex w-full flex-wrap items-stretch gap-2 overflow-visible sm:items-center sm:gap-3 lg:w-auto lg:justify-end">
        <button
          type="button"
          onClick={handleBack}
          className="hidden h-11 items-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm leading-none text-slate-200 transition hover:bg-white/10 lg:inline-flex"
        >
          Back
        </button>

        <div
          className="relative order-1 w-full self-stretch sm:order-none sm:w-[340px] sm:self-auto lg:w-[360px]"
          ref={searchRef}
        >
          <div className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-300">
            <span aria-hidden="true">⌕</span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onFocus={() => setOpenSearch(true)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search projects, jobs, updates"
              className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-400"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="flex min-h-[30px] min-w-[30px] items-center justify-center rounded-md px-1 text-xs text-slate-400 hover:text-slate-200"
              >
                x
              </button>
            ) : null}
          </div>
          {openSearch ? (
            <div className="absolute right-0 z-[120] mt-2 w-full rounded-2xl border border-white/10 bg-night-800/95 p-3 shadow-card backdrop-blur-glass reveal-up">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Search results
                </p>
                <p className="text-[11px] text-slate-500">
                  {filteredSearchItems.length} found
                </p>
              </div>
              {filteredSearchItems.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
                  No matching results.
                </p>
              ) : (
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {filteredSearchItems.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        void handleSearchSelect(item);
                      }}
                      className={clsx(
                        "w-full rounded-xl border p-3 text-left",
                        item.locked
                          ? "border-amber-400/30 bg-amber-500/10 hover:bg-amber-500/15"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      )}
                    >
                      <p className="text-xs font-semibold text-white">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.subtitle}</p>
                      {item.locked ? (
                        <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-amber-200">
                          locked
                        </p>
                      ) : (
                        <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                          {item.kind}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
        {workspaceActionBlockedMessage ? (
          <div
            className={clsx(
              "order-2 w-full self-stretch rounded-xl border px-3 py-2 text-xs sm:self-auto sm:text-sm lg:order-none lg:w-auto lg:max-w-[28rem]",
              workspaceNoticeTone === "rose" &&
                "border-rose-400/40 bg-rose-500/10 text-rose-100",
              workspaceNoticeTone === "amber" &&
                "border-amber-400/40 bg-amber-500/10 text-amber-100",
              workspaceNoticeTone === "sky" &&
                "border-sky-400/40 bg-sky-500/10 text-sky-100"
            )}
          >
            {workspaceActionBlockedMessage}
          </div>
        ) : null}

        <div className="relative self-stretch sm:self-auto" ref={notificationsRef}>
          <button
            type="button"
            onClick={() => setOpenNotifications((prev) => !prev)}
            className={clsx(
              "inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-medium leading-none text-slate-300 transition hover:bg-white/10 sm:text-sm",
              unreadNotifications.length > 0 && !isAdmin && "soft-pulse border-glow-cyan/35"
            )}
          >
            <span className="sm:hidden">🔔</span>
            <span className="hidden sm:inline">
              {unreadNotifications.length > 0
                ? `🔔 ${unreadNotifications.length}`
                : "🔔"}
            </span>
            {unreadNotifications.length > 0 ? (
              <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-200 sm:hidden">
                {unreadNotifications.length}
              </span>
            ) : null}
          </button>
          {openNotifications ? (
            <div className="absolute right-0 z-[120] mt-2 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-white/10 bg-night-800/95 p-4 shadow-card backdrop-blur-glass reveal-up sm:w-[430px] sm:max-w-none">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">Notifications</p>
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs text-slate-300 hover:text-white"
                >
                  Mark all read
                </button>
              </div>
              <div className="mb-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNotificationFilter("all")}
                  className={clsx(
                    "rounded-full border px-3 py-1 text-xs",
                    notificationFilter === "all"
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-white/10 bg-white/5 text-slate-300"
                  )}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setNotificationFilter("unread")}
                  className={clsx(
                    "rounded-full border px-3 py-1 text-xs",
                    notificationFilter === "unread"
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-white/10 bg-white/5 text-slate-300"
                  )}
                >
                  Unread
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigate(notificationHubRoute);
                    setOpenNotifications(false);
                  }}
                  className="ml-auto text-xs text-slate-300 underline hover:text-white"
                >
                  Open page
                </button>
              </div>
              {visibleNotifications.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
                  No notifications yet.
                </p>
              ) : (
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {visibleNotifications.map((notification) => {
                    const linkTo = getNotificationLink(notification, role);
                    return (
                      <div
                        key={notification.id}
                        className="rounded-xl border border-white/10 bg-white/5 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-white">
                              {notification.title}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {notification.message}
                            </p>
                            <p className="mt-2 text-[11px] text-slate-500">
                              {formatTime(notification.createdAt)}
                            </p>
                          </div>
                          {!notification.read ? (
                            <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                          ) : null}
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          {linkTo ? (
                            <button
                              type="button"
                              onClick={() => handleOpenNotification(notification, true)}
                              className="text-xs text-slate-200 underline"
                            >
                              Open
                            </button>
                          ) : null}
                          {!notification.read ? (
                            <button
                              type="button"
                              onClick={() => handleOpenNotification(notification)}
                              className="text-xs text-slate-300 hover:text-white"
                            >
                              Mark read
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
        <button
          onClick={toggleTheme}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-medium leading-none text-slate-300 transition hover:-translate-y-[1px] hover:bg-white/10 sm:text-sm"
        >
          {theme === "dark" ? "Light" : "Dark"}
        </button>
        {action ? (
          actionTo ? (
            <Link to={actionTo} className="self-stretch sm:self-auto">
              <Button className="h-11 px-4 text-xs sm:text-sm">{action}</Button>
            </Link>
          ) : (
            <Button onClick={onAction} className="h-11 px-4 text-xs sm:text-sm">
              {action}
            </Button>
          )
        ) : null}
        {user ? (
          <Link
            to={profileRoute}
            className="group flex h-11 min-w-0 self-stretch items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 transition hover:bg-white/10 sm:self-auto sm:gap-3 sm:px-3"
          >
            <div className="h-8 w-8 overflow-hidden rounded-full border border-white/20 bg-night-900 transition group-hover:border-glow-cyan/50">
              {profilePhotoUrl && !imgError ? (
                <img
                  src={profilePhotoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-500">
                  {displayName[0].toUpperCase()}
                </div>
              )}
            </div>
            <div className="hidden min-w-0 text-sm leading-tight text-slate-200 md:block">
              <p className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Welcome back
              </p>
              <p className="truncate font-semibold">{displayName}</p>
            </div>
          </Link>
        ) : null}
      </div>
    </header>
  );
}
