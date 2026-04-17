import { useEffect, useMemo, useState } from "react";
import { collection } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Table from "../../components/Table.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import Button from "../../components/Button.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import { adminNav } from "../../data/nav.js";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { updateUserStatus } from "../../services/usersService.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import {
  CLIENT_REQUIRED_FIELD_LABELS,
  getClientDocuments,
  getClientGovIdProof,
  getClientProfileCompletion,
  getNormalizedClientType
} from "../../utils/clientProfile.js";
import {
  getFreelancerGovId,
  getFreelancerMissingRequiredFields,
  getFreelancerResume,
  getFreelancerSkills,
  normalizePortfolioLinks
} from "../../utils/freelancerOnboarding.js";
import {
  ACCOUNT_STATUS,
  getNormalizedStatusBadgeValue,
  getRoleProfileCompletion,
  isAccountPendingApproval,
  normalizeAccountStatus
} from "../../utils/accountStatus.js";
import { resolveUserPhotoUrl } from "../../utils/fileUrl.js";

const asText = (value) => String(value || "").trim();
const normalize = (value) => String(value || "").toLowerCase();

const toExternalHref = (value) => {
  const raw = asText(value);
  if (!raw) return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, "")}`;
};

const toLinkLabel = (value) => {
  const raw = asText(value).replace(/^https?:\/\//i, "");
  if (!raw) return "";
  return raw.length > 72 ? `${raw.slice(0, 71)}...` : raw;
};

function DetailItem({ label, value }) {
  const hasValue = asText(value) !== "";
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-1 text-sm ${hasValue ? "text-slate-200" : "text-slate-500"}`}>
        {hasValue ? value : "Not provided"}
      </p>
    </div>
  );
}

function DetailLinkItem({ label, value, text }) {
  const href = toExternalHref(value);
  const displayLabel = asText(text) || toLinkLabel(value) || "Open link";

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block break-all text-sm text-sky-200 underline hover:text-sky-100"
          title={href}
        >
          {displayLabel}
        </a>
      ) : (
        <p className="mt-1 text-sm text-slate-500">Not provided</p>
      )}
    </div>
  );
}

function MetricCard({ title, count, meta, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`glass-card rounded-2xl p-5 text-left transition ${active ? "border-glow-cyan/40 shadow-glow" : "border-white/10 hover:border-white/20"
        }`}
    >
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{title}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{count}</p>
      <p className="mt-2 text-sm text-slate-400">{meta}</p>
      <p className="mt-3 text-xs text-slate-500">
        {active ? "Showing users below" : "Click to view users"}
      </p>
    </button>
  );
}

function PendingApprovalCard({ user, onApprove, onReject, processingId }) {
  const status = normalizeAccountStatus(user?.status);
  const completionPercent = getRoleProfileCompletion(user || {});
  const isPendingApproval = status === ACCOUNT_STATUS.PENDING_APPROVAL;
  const canApprove = completionPercent === 100;
  const isProcessing = processingId === user?.id;

  return (
    <article className="glass-card rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h5 className="truncate text-sm font-semibold text-white">
            {user?.name || user?.email || "Unnamed user"}
          </h5>
          <p className="mt-1 text-xs text-slate-400">{user?.role || "unknown"}</p>
        </div>
        <StatusBadge status={getNormalizedStatusBadgeValue(status)} />
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>Profile completion</span>
          <span>{completionPercent}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-white/10">
          <div
            className={`h-2 rounded-full ${completionPercent === 100 ? "bg-emerald-400" : "bg-amber-300"}`}
            style={{ width: `${completionPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="danger"
          onClick={() => onReject(user)}
          disabled={isProcessing || !isPendingApproval}
          title={isPendingApproval ? "Reject user" : "Only pending approvals can be rejected"}
        >
          Reject
        </Button>
        <Button
          variant="primary"
          onClick={() => onApprove(user)}
          disabled={isProcessing || !isPendingApproval || !canApprove}
          title={
            !isPendingApproval
              ? "Only pending approvals can be approved"
              : canApprove
                ? "Approve user"
                : "Profile completion must be 100% before approval"
          }
        >
          Approve
        </Button>
      </div>
    </article>
  );
}

export default function AdminUsers() {
  const { user } = useAuth();
  const toast = useToast();

  const [activeExplorerId, setActiveExplorerId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserImgError, setSelectedUserImgError] = useState(false);
  const [processing, setProcessing] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");

  const {
    data: allUsers = [],
    loading: usersLoading
  } = useFirestoreQuery(() => collection(db, "users"), []);

  const pendingClientApprovals = useMemo(
    () =>
      allUsers.filter(
        (entry) =>
          normalize(entry.role) === "client" &&
          normalizeAccountStatus(entry.status) === ACCOUNT_STATUS.PENDING_APPROVAL
      ),
    [allUsers]
  );
  const pendingFreelancerApprovals = useMemo(
    () =>
      allUsers.filter(
        (entry) =>
          normalize(entry.role) === "freelancer" &&
          normalizeAccountStatus(entry.status) === ACCOUNT_STATUS.PENDING_APPROVAL
      ),
    [allUsers]
  );
  const pendingUsers = useMemo(
    () => [...pendingClientApprovals, ...pendingFreelancerApprovals],
    [pendingClientApprovals, pendingFreelancerApprovals]
  );
  const rejectedUsers = useMemo(
    () =>
      allUsers.filter(
        (entry) => normalizeAccountStatus(entry.status) === ACCOUNT_STATUS.REJECTED
      ),
    [allUsers]
  );
  const approvedUsers = useMemo(
    () =>
      allUsers.filter(
        (entry) => normalizeAccountStatus(entry.status) === ACCOUNT_STATUS.APPROVED
      ),
    [allUsers]
  );
  const freelancerUsers = useMemo(
    () => allUsers.filter((entry) => normalize(entry.role) === "freelancer"),
    [allUsers]
  );
  const clientUsers = useMemo(
    () => allUsers.filter((entry) => normalize(entry.role) === "client"),
    [allUsers]
  );

  const explorerCards = useMemo(
    () => [
      {
        id: "total",
        title: "Total users",
        count: allUsers.length,
        meta: "All roles",
        users: allUsers
      },
      {
        id: "pending",
        title: "All pending approvals",
        count: pendingUsers.length,
        meta: "Needs admin action",
        users: pendingUsers
      },
      {
        id: "pending-clients",
        title: "Pending client approvals",
        count: pendingClientApprovals.length,
        meta: "Client review queue",
        users: pendingClientApprovals
      },
      {
        id: "pending-freelancers",
        title: "Pending freelancer approvals",
        count: pendingFreelancerApprovals.length,
        meta: "Freelancer review queue",
        users: pendingFreelancerApprovals
      },
      {
        id: "rejected",
        title: "Rejected users",
        count: rejectedUsers.length,
        meta: "Rejected by admin",
        users: rejectedUsers
      },
      {
        id: "freelancers",
        title: "Total freelancers",
        count: freelancerUsers.length,
        meta: "Freelancer accounts",
        users: freelancerUsers
      },
      {
        id: "clients",
        title: "Total clients",
        count: clientUsers.length,
        meta: "Client accounts",
        users: clientUsers
      },
      {
        id: "approved",
        title: "Total approved users",
        count: approvedUsers.length,
        meta: "Ready to work",
        users: approvedUsers
      }
    ],
    [
      allUsers,
      pendingUsers,
      pendingClientApprovals,
      pendingFreelancerApprovals,
      rejectedUsers,
      freelancerUsers,
      clientUsers,
      approvedUsers
    ]
  );

  const activeCard = useMemo(
    () => explorerCards.find((entry) => entry.id === activeExplorerId) || null,
    [activeExplorerId, explorerCards]
  );

  const activeUsers = activeCard?.users || [];

  const selectedFreelancerSkills = useMemo(() => {
    if (!selectedUser || selectedUser.role !== "freelancer") return [];
    return getFreelancerSkills(selectedUser);
  }, [selectedUser]);

  const selectedFreelancerMissingFields = useMemo(() => {
    if (!selectedUser || selectedUser.role !== "freelancer") return [];
    return getFreelancerMissingRequiredFields(selectedUser);
  }, [selectedUser]);

  const selectedFreelancerPortfolioLinks = useMemo(() => {
    if (!selectedUser || selectedUser.role !== "freelancer") return [];
    return normalizePortfolioLinks(selectedUser.portfolioLinks || selectedUser.portfolio);
  }, [selectedUser]);

  const selectedFreelancerResume = useMemo(() => {
    if (!selectedUser || selectedUser.role !== "freelancer") return null;
    return getFreelancerResume(selectedUser);
  }, [selectedUser]);

  const selectedUserPhotoUrl = useMemo(
    () => resolveUserPhotoUrl(selectedUser),
    [selectedUser]
  );

  const selectedFreelancerGovId = useMemo(() => {
    if (!selectedUser || selectedUser.role !== "freelancer") return null;
    return getFreelancerGovId(selectedUser);
  }, [selectedUser]);

  const selectedClientGovId = useMemo(() => {
    if (!selectedUser || selectedUser.role !== "client") return null;
    return getClientGovIdProof(selectedUser);
  }, [selectedUser]);

  const selectedClientDocuments = useMemo(() => {
    if (!selectedUser || selectedUser.role !== "client") return [];
    return getClientDocuments(selectedUser);
  }, [selectedUser]);

  const selectedClientType = useMemo(() => {
    if (!selectedUser || selectedUser.role !== "client") return "";
    return getNormalizedClientType(selectedUser);
  }, [selectedUser]);

  const selectedClientCompletion = useMemo(() => {
    if (!selectedUser || selectedUser.role !== "client") return null;
    return getClientProfileCompletion({
      ...selectedUser,
      clientType: selectedClientType || selectedUser.clientType
    });
  }, [selectedClientType, selectedUser]);

  const selectedClientMissingFields = useMemo(() => {
    const rawMissing = Array.isArray(selectedClientCompletion?.missingFields)
      ? selectedClientCompletion.missingFields
      : [];
    return rawMissing.filter((fieldKey) =>
      selectedClientType === "company" ? fieldKey !== "workCategory" : fieldKey !== "companyName"
    );
  }, [selectedClientCompletion, selectedClientType]);
  const selectedUserStatus = useMemo(
    () => normalizeAccountStatus(selectedUser?.status),
    [selectedUser?.status]
  );
  const selectedUserCompletionPercent = useMemo(
    () => getRoleProfileCompletion(selectedUser || {}),
    [selectedUser]
  );
  const selectedClientMissingFieldsForDisplay = useMemo(() => {
    if (selectedUser?.role !== "client") return [];
    if (selectedUserCompletionPercent >= 100) return [];
    return selectedClientMissingFields;
  }, [selectedClientMissingFields, selectedUser?.role, selectedUserCompletionPercent]);
  const canModerateSelectedUser = useMemo(
    () => isAccountPendingApproval(selectedUserStatus),
    [selectedUserStatus]
  );

  useEffect(() => {
    setSelectedUserImgError(false);
  }, [selectedUser?.id, selectedUserPhotoUrl]);

  const handleMetricClick = (metricId) => {
    setActiveExplorerId(metricId);
    setSelectedUser(null);
    setStatusMessage("");
  };

  const handleApprove = async (target) => {
    if (!user?.uid || !target) return;
    const completionPercent = getRoleProfileCompletion(target || {});
    if (completionPercent < 100) {
      const message = "Profile completion must be 100% before approval.";
      setStatusMessage(message);
      toast.permission(message);
      return;
    }
    setStatusMessage("");
    setProcessing(target.id);
    try {
      await updateUserStatus(target.id, "approved", user.uid);
      setStatusMessage(`Approved ${target.name || target.email || target.id}.`);
      toast.success("User approved.");
      setSelectedUser((prev) =>
        prev?.id === target.id ? { ...prev, status: "approved" } : prev
      );
    } catch (err) {
      setStatusMessage(err.message || "Failed to approve user.");
      toast.error("Failed to approve user.");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (target) => {
    if (!user?.uid || !target) return;
    setStatusMessage("");
    setProcessing(target.id);
    try {
      await updateUserStatus(target.id, "rejected", user.uid);
      setStatusMessage(`Rejected ${target.name || target.email || target.id}.`);
      toast.success("User rejected.");
      setSelectedUser((prev) =>
        prev?.id === target.id ? { ...prev, status: "rejected" } : prev
      );
    } catch (err) {
      setStatusMessage(err.message || "Failed to reject user.");
      toast.error("Failed to reject user.");
    } finally {
      setProcessing(null);
    }
  };

  const explorerRows = useMemo(() => {
    return activeUsers.map((entry) => {
      const completionPercent = getRoleProfileCompletion(entry || {});
      const row = [
        entry.name || "Unnamed",
        entry.role || "unknown",
        entry.email || "Not provided",
        `${completionPercent}%`,
        { type: "status", value: getNormalizedStatusBadgeValue(entry.status) },
        <Button
          key={`${entry.id}-details`}
          variant="ghost"
          className="whitespace-nowrap"
          onClick={() => setSelectedUser(entry)}
        >
          User details
        </Button>
      ];
      row.id = entry.id;
      return row;
    });
  }, [activeUsers]);

  return (
    <DashboardLayout
      title="Users"
      sidebar={{ title: "Admin HQ", subtitle: "Admin", items: adminNav }}
    >
      <PageHeader
        title="Users workspace"
        description="Review pending approvals first, then use the quick explorer for all users."
      />

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-white">Pending client approvals</h4>
        {pendingClientApprovals.length === 0 ? (
          <EmptyState
            title="No pending client approvals"
            description="New client requests will appear here."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {pendingClientApprovals.map((entry) => (
              <PendingApprovalCard
                key={entry.id}
                user={entry}
                onApprove={handleApprove}
                onReject={handleReject}
                processingId={processing}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-white">
          Pending freelancer approvals
        </h4>
        {pendingFreelancerApprovals.length === 0 ? (
          <EmptyState
            title="No pending freelancer approvals"
            description="New freelancer requests will appear here."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {pendingFreelancerApprovals.map((entry) => (
              <PendingApprovalCard
                key={entry.id}
                user={entry}
                onApprove={handleApprove}
                onReject={handleReject}
                processingId={processing}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-white">Status quick explorer</h4>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {explorerCards.map((card) => (
            <MetricCard
              key={card.id}
              title={card.title}
              count={card.count}
              meta={card.meta}
              active={activeExplorerId === card.id}
              onClick={() => handleMetricClick(card.id)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {!activeCard ? (
          <EmptyState
            title="Select one option"
            description="Click a metric card above to load users."
          />
        ) : (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-white">
              {activeCard.title} ({activeUsers.length})
            </h4>
            {usersLoading ? (
              <EmptyState title="Loading users" description="Fetching user data..." />
            ) : explorerRows.length === 0 ? (
              <EmptyState
                title="No users found"
                description="No users available for this option."
              />
            ) : (
              <Table
                columns={["Name", "Role", "Email", "Completion", "Status", "Action"]}
                rows={explorerRows}
                getRowKey={(row) => row.id}
              />
            )}
          </div>
        )}
      </section>

      {selectedUser ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-3 sm:p-6"
          onClick={() => setSelectedUser(null)}
        >
          <section
            className="glass-card max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl p-5 sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-night-900">
                  {selectedUserPhotoUrl && !selectedUserImgError ? (
                    <img
                      src={selectedUserPhotoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() => setSelectedUserImgError(true)}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-slate-500">
                      {(selectedUser.name || "U")[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    User details
                  </p>
                  <h3 className="mt-2 font-display text-2xl font-semibold text-white">
                    {selectedUser.name || "Unnamed user"}
                  </h3>
                  <p className="mt-2 text-sm text-slate-400">
                    Role: {selectedUser.role || "unknown"}
                  </p>
                  <div className="mt-2">
                    <StatusBadge status={getNormalizedStatusBadgeValue(selectedUserStatus)} />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {canModerateSelectedUser ? (
                  <>
                    <Button
                      variant="danger"
                      onClick={() => handleReject(selectedUser)}
                      disabled={processing === selectedUser.id}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => handleApprove(selectedUser)}
                      disabled={
                        processing === selectedUser.id ||
                        selectedUserCompletionPercent < 100
                      }
                      title={
                        selectedUserCompletionPercent === 100
                          ? "Approve user"
                          : "Profile completion must be 100% before approval"
                      }
                    >
                      Approve
                    </Button>
                  </>
                ) : null}
                <Button variant="ghost" onClick={() => setSelectedUser(null)}>
                  Close
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <DetailItem label="User ID" value={selectedUser.id} />
              <DetailItem label="Email" value={selectedUser.email} />
              <DetailItem label="Phone" value={selectedUser.phone} />
              <DetailItem
                label="Profile completion"
                value={`${selectedUserCompletionPercent}%`}
              />
              <DetailItem
                label="Location"
                value={
                  asText(selectedUser.country) || asText(selectedUser.city)
                    ? `${selectedUser.country || "Not provided"} / ${selectedUser.city || "Not provided"
                    }`
                    : ""
                }
              />
            </div>

            {selectedUser.role === "freelancer" ? (
              <>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <DetailItem
                    label="Status"
                    value={selectedUserStatus}
                  />
                  <DetailItem label="Headline" value={selectedUser.headline} />
                  <DetailItem label="Experience" value={selectedUser.experience} />
                  <DetailItem label="Skills" value={selectedFreelancerSkills.join(", ")} />
                  <DetailItem
                    label="Missing required fields"
                    value={
                      selectedFreelancerMissingFields.length > 0
                        ? selectedFreelancerMissingFields.join(", ")
                        : "0"
                    }
                  />
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {selectedFreelancerPortfolioLinks.length > 0 ? (
                    selectedFreelancerPortfolioLinks.map((link, index) => (
                      <DetailLinkItem
                        key={`portfolio-${selectedUser.id}-${index}`}
                        label={
                          selectedFreelancerPortfolioLinks.length > 1
                            ? `Portfolio link ${index + 1}`
                            : "Portfolio link"
                        }
                        value={link}
                      />
                    ))
                  ) : (
                    <DetailLinkItem label="Portfolio link" value="" />
                  )}
                  <DetailLinkItem label="GitHub" value={selectedUser.github} />
                  <DetailLinkItem label="LinkedIn" value={selectedUser.linkedin} />
                  <DetailLinkItem
                    label="Resume"
                    value={selectedFreelancerResume?.url}
                    text={selectedFreelancerResume?.name || "View resume"}
                  />
                  <DetailItem label="Gov ID type" value={selectedUser.govIdType} />
                  <DetailLinkItem
                    label="Gov ID proof"
                    value={selectedFreelancerGovId?.url}
                    text={selectedFreelancerGovId?.name || "View document"}
                  />
                </div>
              </>
            ) : selectedUser.role === "client" ? (
              <>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <DetailItem
                    label="Profile completion"
                    value={`${selectedUserCompletionPercent}%`}
                  />
                  <DetailItem
                    label="Client type"
                    value={selectedClientType === "company" ? "Company" : "Individual"}
                  />
                  <DetailItem
                    label="Display name"
                    value={selectedUser.displayName || selectedUser.name}
                  />
                  {selectedClientType === "company" ? (
                    <>
                      <DetailItem label="Company" value={selectedUser.companyName} />
                      <DetailItem label="Company size" value={selectedUser.companySize} />
                      <DetailItem label="Industry" value={selectedUser.industry} />
                    </>
                  ) : (
                    <DetailItem label="Work category" value={selectedUser.workCategory} />
                  )}
                  <DetailItem
                    label="Missing required fields"
                    value={
                      selectedClientMissingFieldsForDisplay.length > 0
                        ? selectedClientMissingFieldsForDisplay
                            .map(
                              (fieldKey) => CLIENT_REQUIRED_FIELD_LABELS[fieldKey] || fieldKey
                            )
                            .join(", ")
                        : "0"
                    }
                  />
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {selectedClientType === "company" ? (
                    <DetailLinkItem
                      label="Company website"
                      value={selectedUser.companyWebsite || selectedUser.website}
                    />
                  ) : null}
                  <DetailLinkItem label="LinkedIn" value={selectedUser.linkedin} />
                  <DetailItem
                    label="Gov ID type"
                    value={selectedUser.clientGovIdType || selectedUser.govIdType}
                  />
                  <DetailLinkItem
                    label="Gov ID proof"
                    value={selectedClientGovId?.url}
                    text={selectedClientGovId?.name || "View document"}
                  />
                  {selectedClientDocuments.length > 0 ? (
                    selectedClientDocuments.map((document, index) => (
                      <DetailLinkItem
                        key={`client-document-${selectedUser.id}-${index}`}
                        label={
                          selectedClientDocuments.length > 1
                            ? `Document ${index + 1}`
                            : "Additional document"
                        }
                        value={document.url}
                        text={document.name || `Document ${index + 1}`}
                      />
                    ))
                  ) : (
                    <DetailItem label="Additional documents" value="0 uploaded" />
                  )}
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-slate-400">
                Role-specific metadata is not available for this account.
              </p>
            )}
          </section>
        </div>
      ) : null}

      {statusMessage ? <p className="text-sm text-slate-300">{statusMessage}</p> : null}
    </DashboardLayout>
  );
}
