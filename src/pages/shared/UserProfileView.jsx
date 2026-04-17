import { useMemo, useState } from "react";
import { doc } from "firebase/firestore";
import { useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import Button from "../../components/Button.jsx";
import { adminNav, clientNav, freelancerNav } from "../../data/nav.js";
import { db } from "../../firebase/firebase.js";
import useFirestoreDoc from "../../hooks/useFirestoreDoc.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { resolveUserPhotoUrl } from "../../utils/fileUrl.js";
import {
  ACCOUNT_STATUS,
  getNormalizedStatusBadgeValue,
  getRoleProfileCompletion,
  normalizeAccountStatus
} from "../../utils/accountStatus.js";
import {
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

const asText = (value) => String(value || "").trim();
const normalize = (value) => asText(value).toLowerCase();

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

const getSidebarByRole = (role) => {
  if (role === "admin") {
    return { title: "Admin HQ", subtitle: "Admin", items: adminNav };
  }
  if (role === "client") {
    return { title: "Client Suite", subtitle: "Client", items: clientNav };
  }
  return { title: "Growlanzer", subtitle: "Freelancer", items: freelancerNav };
};

const getSelfEditRoute = (role) => {
  if (role === "client") return "/client/company-profile";
  if (role === "freelancer") return "/freelancer/profile";
  return "";
};

export default function UserProfileView() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, profile: currentProfile } = useAuth();
  const viewerRole = normalize(currentProfile?.role);
  const [photoError, setPhotoError] = useState(false);

  const { data: viewedUser, loading } = useFirestoreDoc(
    () => (userId ? doc(db, "users", userId) : null),
    [userId],
    null
  );

  const viewedRole = normalize(viewedUser?.role);
  const completionPercent = getRoleProfileCompletion(viewedUser || {});
  const userPhotoUrl = useMemo(() => resolveUserPhotoUrl(viewedUser), [viewedUser]);
  const normalizedStatus = normalizeAccountStatus(viewedUser?.status);
  const statusBadge = getNormalizedStatusBadgeValue(normalizedStatus);
  const isOwnProfile = Boolean(currentUser?.uid && currentUser.uid === userId);
  const selfEditRoute = getSelfEditRoute(viewerRole);
  const canViewSensitive = viewerRole === "admin" || isOwnProfile;

  const freelancerSkills = useMemo(() => {
    if (viewedRole !== "freelancer") return [];
    return getFreelancerSkills(viewedUser);
  }, [viewedRole, viewedUser]);

  const freelancerMissing = useMemo(() => {
    if (viewedRole !== "freelancer") return [];
    return getFreelancerMissingRequiredFields(viewedUser);
  }, [viewedRole, viewedUser]);

  const freelancerPortfolio = useMemo(() => {
    if (viewedRole !== "freelancer") return [];
    return normalizePortfolioLinks(viewedUser?.portfolioLinks || viewedUser?.portfolio);
  }, [viewedRole, viewedUser]);

  const freelancerResume = useMemo(() => {
    if (viewedRole !== "freelancer") return null;
    return getFreelancerResume(viewedUser);
  }, [viewedRole, viewedUser]);

  const freelancerGovId = useMemo(() => {
    if (viewedRole !== "freelancer") return null;
    return getFreelancerGovId(viewedUser);
  }, [viewedRole, viewedUser]);

  const clientType = useMemo(() => {
    if (viewedRole !== "client") return "";
    return getNormalizedClientType(viewedUser);
  }, [viewedRole, viewedUser]);

  const clientCompletion = useMemo(() => {
    if (viewedRole !== "client") return null;
    return getClientProfileCompletion({
      ...(viewedUser || {}),
      clientType: clientType || viewedUser?.clientType
    });
  }, [clientType, viewedRole, viewedUser]);

  const clientGovId = useMemo(() => {
    if (viewedRole !== "client") return null;
    return getClientGovIdProof(viewedUser);
  }, [viewedRole, viewedUser]);

  const clientDocs = useMemo(() => {
    if (viewedRole !== "client") return [];
    return getClientDocuments(viewedUser);
  }, [viewedRole, viewedUser]);

  return (
    <DashboardLayout
      title="User Profile"
      sidebar={getSidebarByRole(viewerRole)}
    >
      <PageHeader
        title="User profile"
        description="Profile details for selected user."
      />

      {loading ? (
        <EmptyState title="Loading profile" description="Fetching user profile..." />
      ) : !viewedUser ? (
        <EmptyState title="Profile not found" description="User does not exist or is unavailable." />
      ) : (
        <section className="space-y-4">
          <div className="glass-card rounded-2xl p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-wrap items-start gap-4">
                <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-white/10 bg-night-900">
                  {userPhotoUrl && !photoError ? (
                    <img
                      src={userPhotoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() => setPhotoError(true)}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-slate-500">
                      {(viewedUser.name || "U")[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    {viewedRole || "user"}
                  </p>
                  <h3 className="mt-2 font-display text-2xl font-semibold text-white">
                    {viewedUser.name || viewedUser.displayName || viewedUser.email || "Unnamed user"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {canViewSensitive ? viewedUser.email || "No email" : "Contact hidden"}
                  </p>
                  <div className="mt-2">
                    <StatusBadge status={statusBadge} />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" onClick={() => navigate(-1)}>
                  Back
                </Button>
                {isOwnProfile && selfEditRoute ? (
                  <Button onClick={() => navigate(selfEditRoute)}>
                    Edit profile
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <DetailItem label="User ID" value={userId} />
              <DetailItem label="Role" value={viewedRole || "unknown"} />
              <DetailItem
                label="Profile completion"
                value={`${completionPercent}%`}
              />
              <DetailItem
                label="Status"
                value={normalizedStatus || ACCOUNT_STATUS.INCOMPLETE}
              />
              <DetailItem label="Phone" value={canViewSensitive ? viewedUser.phone : "Hidden"} />
              <DetailItem
                label="Location"
                value={
                  asText(viewedUser.country) || asText(viewedUser.city)
                    ? `${viewedUser.country || "Not provided"} / ${viewedUser.city || "Not provided"}`
                    : ""
                }
              />
            </div>
          </div>

          {viewedRole === "freelancer" ? (
            <>
              <div className="glass-card rounded-2xl p-5 sm:p-6">
                <h4 className="text-sm font-semibold text-white">Freelancer details</h4>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <DetailItem label="Headline" value={viewedUser.headline} />
                  <DetailItem label="Experience" value={viewedUser.experience} />
                  <DetailItem label="Skills" value={freelancerSkills.join(", ")} />
                  <DetailItem
                    label="Missing required fields"
                    value={freelancerMissing.length > 0 ? freelancerMissing.join(", ") : "0"}
                  />
                </div>
              </div>

              <div className="glass-card rounded-2xl p-5 sm:p-6">
                <h4 className="text-sm font-semibold text-white">Portfolio and documents</h4>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {freelancerPortfolio.length > 0 ? (
                    freelancerPortfolio.map((link, index) => (
                      <DetailLinkItem
                        key={`portfolio-${index}`}
                        label={
                          freelancerPortfolio.length > 1
                            ? `Portfolio link ${index + 1}`
                            : "Portfolio link"
                        }
                        value={link}
                      />
                    ))
                  ) : (
                    <DetailLinkItem label="Portfolio link" value="" />
                  )}
                  <DetailLinkItem label="GitHub" value={viewedUser.github} />
                  <DetailLinkItem label="LinkedIn" value={viewedUser.linkedin} />
                  {canViewSensitive ? (
                    <>
                      <DetailLinkItem
                        label="Resume"
                        value={freelancerResume?.url}
                        text={freelancerResume?.name || "View resume"}
                      />
                      <DetailItem label="Gov ID type" value={viewedUser.govIdType} />
                      <DetailLinkItem
                        label="Gov ID proof"
                        value={freelancerGovId?.url}
                        text={freelancerGovId?.name || "View document"}
                      />
                    </>
                  ) : (
                    <>
                      <DetailItem label="Resume" value="Private" />
                      <DetailItem label="Gov ID proof" value="Private" />
                    </>
                  )}
                </div>
              </div>
            </>
          ) : null}

          {viewedRole === "client" ? (
            <>
              <div className="glass-card rounded-2xl p-5 sm:p-6">
                <h4 className="text-sm font-semibold text-white">Client details</h4>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <DetailItem
                    label="Client type"
                    value={clientType === "company" ? "Company" : "Individual"}
                  />
                  <DetailItem label="Display name" value={viewedUser.displayName || viewedUser.name} />
                  {clientType === "company" ? (
                    <>
                      <DetailItem label="Company" value={viewedUser.companyName} />
                      <DetailItem label="Company size" value={viewedUser.companySize} />
                      <DetailItem label="Industry" value={viewedUser.industry} />
                    </>
                  ) : (
                    <DetailItem label="Work category" value={viewedUser.workCategory} />
                  )}
                  <DetailItem
                    label="Missing required fields"
                    value={
                      clientCompletion?.missingFields?.length
                        ? clientCompletion.missingFields.join(", ")
                        : "0"
                    }
                  />
                </div>
              </div>

              <div className="glass-card rounded-2xl p-5 sm:p-6">
                <h4 className="text-sm font-semibold text-white">Client documents</h4>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {clientType === "company" ? (
                    <DetailLinkItem
                      label="Company website"
                      value={viewedUser.companyWebsite || viewedUser.website}
                    />
                  ) : null}
                  <DetailLinkItem label="LinkedIn" value={viewedUser.linkedin} />
                  {canViewSensitive ? (
                    <>
                      <DetailItem
                        label="Gov ID type"
                        value={viewedUser.clientGovIdType || viewedUser.govIdType}
                      />
                      <DetailLinkItem
                        label="Gov ID proof"
                        value={clientGovId?.url}
                        text={clientGovId?.name || "View document"}
                      />
                      {clientDocs.length > 0 ? (
                        clientDocs.map((file, index) => (
                          <DetailLinkItem
                            key={`client-doc-${index}`}
                            label={clientDocs.length > 1 ? `Document ${index + 1}` : "Additional document"}
                            value={file.url}
                            text={file.name || `Document ${index + 1}`}
                          />
                        ))
                      ) : (
                        <DetailItem label="Additional documents" value="0 uploaded" />
                      )}
                    </>
                  ) : (
                    <>
                      <DetailItem label="Gov ID proof" value="Private" />
                      <DetailItem label="Additional documents" value="Private" />
                    </>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </section>
      )}
    </DashboardLayout>
  );
}
