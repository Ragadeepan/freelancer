import StatusBadge from "./StatusBadge.jsx";
import Button from "./Button.jsx";
import SkillLogo from "./SkillLogo.jsx";
import UserProfileLink from "./UserProfileLink.jsx";
import { useEffect, useState } from "react";
import { resolveFileUrl } from "../utils/fileUrl.js";

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatTimeAgo = (value) => {
  const date = toDate(value);
  if (!date) return "recently";
  const diffMs = Date.now() - date.getTime();
  if (diffMs <= 0) return "just now";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
};

const formatEnumLabel = (value, fallback = "Not specified") => {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text
    .split(/[_\s-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const toRatingValue = (job) => {
  const candidates = [job?.clientRating, job?.clientProfileRating];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Number(Math.min(5, Math.max(0, numeric)).toFixed(1));
    }
  }
  return null;
};

const toStars = (rating) => {
  if (!Number.isFinite(rating)) return "";
  const rounded = Math.max(0, Math.min(5, Math.round(rating)));
  return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
};

const truncate = (value, max = 150) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
};

export default function JobCard({
  job,
  action = "Apply",
  onAction,
  actionVariant = "ghost",
  actionDisabled = false,
  secondaryAction,
  onSecondaryAction,
  secondaryVariant = "ghost",
  secondaryDisabled = false
}) {
  const [imgError, setImgError] = useState(false);
  const skills = Array.isArray(job.skills) ? job.skills : [];
  const postedLabel = job.posted || formatTimeAgo(job.createdAt);
  const budgetLabel =
    job.budget != null
      ? /₹|INR/i.test(`${job.budget}`)
        ? `${job.budget}`
        : `₹${job.budget}`
      : "Budget on request";
  const clientName =
    job.clientCompanyName || job.clientPublicName || job.clientName || "Verified client";
  const clientPhotoUrl = resolveFileUrl(job.clientPhotoURL);
  const clientRating = toRatingValue(job);
  const clientLocation = job.clientLocation || job.location || "Remote";
  const clientVerified = Boolean(job.clientVerified);
  const duration = job.duration || job.timeline || "Not specified";
  const experienceLevel = formatEnumLabel(job.experienceLevel);
  const shortDescription = truncate(job.description);

  useEffect(() => {
    setImgError(false);
  }, [clientPhotoUrl]);

  return (
    <div className="glass-card rounded-2xl p-5 reveal-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 bg-night-900">
            {clientPhotoUrl && !imgError ? (
              <img
                src={clientPhotoUrl}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">
                {clientName[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h4 className="truncate text-base font-semibold text-white">{job.title}</h4>
            <p className="mt-1 text-xs text-slate-500 uppercase tracking-wider">
              <UserProfileLink
                userId={job.clientId}
                name={clientName}
                className="text-slate-300 underline hover:text-sky-200"
              />
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Posted {postedLabel} · {clientLocation}
            </p>
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">
              Budget {budgetLabel} · Duration {duration} · {experienceLevel}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {clientRating ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-amber-200">
                  {toStars(clientRating)} {clientRating.toFixed(1)}
                </span>
              ) : (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-300">
                  Rating N/A
                </span>
              )}
              {clientVerified ? (
                <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-emerald-100">
                  Verified
                </span>
              ) : (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-300">
                  Unverified
                </span>
              )}
            </div>
            {shortDescription ? (
              <p className="mt-2 text-sm text-slate-300">{shortDescription}</p>
            ) : null}
          </div>
        </div>
        <StatusBadge status={job.status} />
      </div>
      {skills.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {skills.map((skill) => (
            <span
              key={skill}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300"
            >
              <SkillLogo skill={skill} size={16} />
              {skill}
            </span>
          ))}
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Moderated listing</p>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          {secondaryAction ? (
            <Button
              variant={secondaryVariant}
              onClick={() => onSecondaryAction?.(job)}
              disabled={secondaryDisabled}
            >
              {secondaryAction}
            </Button>
          ) : null}
          <Button
            variant={actionVariant}
            onClick={() => onAction?.(job)}
            disabled={actionDisabled}
          >
            {action}
          </Button>
        </div>
      </div>
    </div>
  );
}
