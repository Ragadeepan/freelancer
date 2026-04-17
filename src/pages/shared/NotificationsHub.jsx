import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Button from "../../components/Button.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import {
  markNotificationRead,
  markNotificationsRead
} from "../../services/notificationsService.js";
import { adminNav, clientNav, freelancerNav } from "../../data/nav.js";

const normalize = (value) => String(value || "").trim().toLowerCase();

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
  const type = normalize(notification.type);
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

export default function NotificationsHub() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");

  const role = normalize(profile?.role);
  const sidebar = useMemo(() => {
    if (role === "admin") {
      return { title: "Admin HQ", subtitle: "Admin", items: adminNav };
    }
    if (role === "client") {
      return { title: "Client Suite", subtitle: "Client", items: clientNav };
    }
    return { title: "Growlanzer", subtitle: "Freelancer", items: freelancerNav };
  }, [role]);

  const { data: notifications = [], loading } = useFirestoreQuery(
    () =>
      user
        ? role === "admin"
          ? query(
              collection(db, "notifications"),
              where("recipientId", "in", [user.uid, "admins"])
            )
          : query(collection(db, "notifications"), where("recipientId", "==", user.uid))
        : null,
    [role, user]
  );

  const sortedNotifications = useMemo(
    () => [...notifications].sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt)),
    [notifications]
  );
  const unreadNotifications = useMemo(
    () => sortedNotifications.filter((entry) => !entry.read),
    [sortedNotifications]
  );
  const visibleNotifications = useMemo(() => {
    if (filter === "unread") {
      return sortedNotifications.filter((entry) => !entry.read);
    }
    return sortedNotifications;
  }, [filter, sortedNotifications]);

  const handleOpenNotification = async (notification) => {
    if (!notification) return;
    if (!notification.read) {
      try {
        await markNotificationRead(notification.id);
      } catch {
        toast.error("Failed to update notification.");
      }
    }
    const linkTo = getNotificationLink(notification, role);
    if (linkTo) {
      navigate(linkTo);
    }
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

  return (
    <DashboardLayout title="Notifications" sidebar={sidebar}>
      <PageHeader
        title="Notifications"
        description="Track all account, job, proposal, project, and payment updates."
      />

      <section className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={filter === "all" ? "primary" : "ghost"}
            onClick={() => setFilter("all")}
          >
            All ({sortedNotifications.length})
          </Button>
          <Button
            type="button"
            variant={filter === "unread" ? "primary" : "ghost"}
            onClick={() => setFilter("unread")}
          >
            Unread ({unreadNotifications.length})
          </Button>
          <div className="ml-auto">
            <Button type="button" variant="ghost" onClick={handleMarkAllRead}>
              Mark all read
            </Button>
          </div>
        </div>

        {loading ? (
          <EmptyState title="Loading notifications" description="Fetching updates..." />
        ) : visibleNotifications.length === 0 ? (
          <EmptyState title="No notifications" description="You are all caught up." />
        ) : (
          <div className="space-y-3">
            {visibleNotifications.map((notification) => (
              <article
                key={notification.id}
                className="rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {notification.title || "Notification"}
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      {notification.message || "No details provided."}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {formatTime(notification.createdAt)}
                    </p>
                  </div>
                  {!notification.read ? (
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleOpenNotification(notification)}
                  >
                    Open
                  </Button>
                  {!notification.read ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => markNotificationRead(notification.id)}
                    >
                      Mark read
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </DashboardLayout>
  );
}
