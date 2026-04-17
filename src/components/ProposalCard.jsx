import StatusBadge from "./StatusBadge.jsx";
import Button from "./Button.jsx";
import SkillLogo from "./SkillLogo.jsx";
import TopBadge from "./TopBadge.jsx";
import UserProfileLink from "./UserProfileLink.jsx";
import { useEffect, useState } from "react";
import { resolveFileUrl } from "../utils/fileUrl.js";

const toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const clean = String(value || "")
    .replace(/[, ]+/g, "")
    .replace(/[^\d.]/g, "");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatPrice = (proposal) => {
  const price = toNumber(proposal.price ?? proposal.bidAmount);
  const currency = String(proposal.currency || "INR").toUpperCase();
  const suffix =
    String(proposal.priceType || proposal.bidType || "fixed").toLowerCase() === "hourly"
      ? " / hr"
      : "";
  if (price == null) return "Price not specified";
  return `${currency} ${price.toFixed(2)}${suffix}`;
};

const formatDuration = (proposal) => {
  const days =
    typeof proposal.deliveryDays === "number" && Number.isFinite(proposal.deliveryDays)
      ? Math.round(proposal.deliveryDays)
      : null;
  if (days && days > 0) return `${days} day${days === 1 ? "" : "s"}`;
  const fallback = String(proposal.deliveryTime || "").trim();
  return fallback || "Duration not specified";
};

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatSubmittedAt = (proposal) => {
  const date = toDate(proposal?.submittedAt || proposal?.createdAt);
  if (!date) return "N/A";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
};

const getRatingValue = (proposal) => {
  const candidates = [proposal?.freelancerRating, proposal?.rating];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return Number(Math.min(5, Math.max(0, numeric)).toFixed(1));
    }
  }
  return null;
};

const toStars = (value) => {
  const rounded = Number.isFinite(value) ? Math.round(value) : 0;
  const safe = Math.max(0, Math.min(5, rounded));
  return `${"★".repeat(safe)}${"☆".repeat(5 - safe)}`;
};

const formatExperience = (value) => {
  const text = String(value || "").trim();
  if (!text) return "Not specified";
  return text
    .split(/[_\s-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

export default function ProposalCard({
  proposal,
  action = "Review",
  onAction,
  actionVariant = "ghost",
  actionDisabled = false,
  secondaryAction,
  onSecondaryAction,
  secondaryVariant = "ghost",
  secondaryDisabled = false,
  showRank = true,
  showDetails = true
}) {
  const [imgError, setImgError] = useState(false);
  const bidderName =
    proposal.bidder || proposal.freelancerName || proposal.freelancerId || "Freelancer";
  const freelancerPhotoUrl = resolveFileUrl(proposal.freelancerPhotoURL);
  const proposalMessage = String(
    proposal.coverLetter || proposal.proposalText || proposal.message || ""
  ).trim();
  const skills = Array.isArray(proposal.skills)
    ? proposal.skills.slice(0, 8)
    : [];
  const ratingValue = getRatingValue(proposal);
  const isVerified = Boolean(proposal?.freelancerVerified ?? proposal?.verified);
  const experienceLevel = formatExperience(
    proposal?.freelancerExperienceLevel || proposal?.experienceLevel
  );
  const rankLabel =
    proposal.topRank && Number.isFinite(Number(proposal.topRank))
      ? `Top Candidate #${proposal.topRank}`
      : "";

  useEffect(() => {
    setImgError(false);
  }, [freelancerPhotoUrl]);

  return (
    <div className="glass-card rounded-2xl p-5 reveal-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border border-white/10 bg-night-900">
            {freelancerPhotoUrl && !imgError ? (
              <img
                src={freelancerPhotoUrl}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">
                {bidderName[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Proposal
            </p>
            <h4 className="mt-1 truncate text-base font-semibold text-white">
              <UserProfileLink
                userId={proposal.freelancerId}
                name={bidderName}
                className="text-white underline hover:text-sky-200"
              />
            </h4>
            <p className="mt-1 truncate text-xs text-slate-400">
              {proposal.jobTitle || "Freelancer application"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {ratingValue != null ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-amber-200">
                  {toStars(ratingValue)} {ratingValue.toFixed(1)}
                </span>
              ) : (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-300">
                  Rating N/A
                </span>
              )}
              {isVerified ? (
                <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-emerald-100">
                  Verified
                </span>
              ) : (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-300">
                  Unverified
                </span>
              )}
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-300">
                {experienceLevel}
              </span>
            </div>
            {showRank && proposal.isTop ? (
              <div className="mt-2">
                <TopBadge label={rankLabel || "Top Candidate"} />
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <StatusBadge status={proposal.status} />
          {showRank ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              Score: {Number(proposal.score || 0).toFixed(2)}
            </span>
          ) : null}
        </div>
      </div>

      {showDetails ? (
        <div className="mt-4 grid gap-3">
          <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
            <p>Price: {formatPrice(proposal)}</p>
            <p>Duration: {formatDuration(proposal)}</p>
            <p className="sm:col-span-2">
              Submitted: {formatSubmittedAt(proposal)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Skills</p>
            {skills.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">No skills specified.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200"
                  >
                    <SkillLogo skill={skill} size={14} />
                    <span>{skill}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          {proposalMessage ? (
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Message</p>
              <p className="mt-1 text-sm text-slate-300">{proposalMessage}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Proposal actions</p>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          {secondaryAction ? (
            <Button
              variant={secondaryVariant}
              onClick={() => onSecondaryAction?.(proposal)}
              disabled={secondaryDisabled}
            >
              {secondaryAction}
            </Button>
          ) : null}
          <Button
            variant={actionVariant}
            onClick={() => onAction?.(proposal)}
            disabled={actionDisabled}
          >
            {action}
          </Button>
        </div>
      </div>
    </div>
  );
}
