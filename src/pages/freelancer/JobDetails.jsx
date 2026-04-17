import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { collection, doc, query, where } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Button from "../../components/Button.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import SkillLogo from "../../components/SkillLogo.jsx";
import UserProfileLink from "../../components/UserProfileLink.jsx";
import { freelancerNav } from "../../data/nav.js";
import { db } from "../../firebase/firebase.js";
import useFirestoreDoc from "../../hooks/useFirestoreDoc.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { getFreelancerProfileCompletion } from "../../utils/freelancerOnboarding.js";
import { submitProposal } from "../../services/marketplaceFlowApi.js";
import { getUserProfile } from "../../services/usersService.js";
import { toggleSavedJob } from "../../services/savedJobsService.js";
import { reportJobIssue } from "../../services/jobReportsService.js";
import {
  ACCOUNT_STATUS,
  canFreelancerApplyJob,
  getFreelancerApplyBlockedMessage,
  normalizeAccountStatus
} from "../../utils/accountStatus.js";
import { resolveFileUrl } from "../../utils/fileUrl.js";

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const formatBudgetLabel = (job) => {
  if (job?.budget) return job.budget;
  const currency = job?.currency || "INR";
  if (job?.projectType === "hourly") {
    const min = job?.hourlyMin || "";
    const max = job?.hourlyMax || "";
    if (min || max) {
      return `${currency} ${min || "0"}-${max || ""} / hr`;
    }
  }
  if (job?.budgetMin || job?.budgetMax) {
    return `${currency} ${job.budgetMin || "0"}-${job.budgetMax || ""}`;
  }
  return "Budget on request";
};

const formatTimeAgo = (timestamp) => {
  const date = timestamp?.toDate ? timestamp.toDate() : timestamp ? new Date(timestamp) : null;
  if (!date || Number.isNaN(date.getTime())) return "recently";
  const diffMs = Date.now() - date.getTime();
  if (diffMs <= 0) return "just now";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
};

const formatDate = (value) => {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Not specified";
  return date.toLocaleDateString();
};

const formatEnumLabel = (value, fallback = "Not specified") => {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text
    .split(/[_\s-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const toStringList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const toSafeLinks = (value) =>
  toStringList(value).filter((item) => /^https?:\/\/\S+$/i.test(item));

const truncate = (value, max = 96) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
};

const getCreatedAtTime = (value) => {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 0;
  return date.getTime();
};

const formatProposalBid = (proposal, job) => {
  if (!proposal?.bidAmount) return "Bid not provided";
  const currency = proposal.currency || job?.currency || "INR";
  const suffix = proposal.bidType === "hourly" ? " / hr" : "";
  return `${currency} ${proposal.bidAmount}${suffix}`;
};

const getClientSinceLabel = (source) => {
  const raw =
    source?.clientMemberSince ||
    source?.memberSince ||
    source?.joinedAt ||
    source?.createdAt ||
    source?.clientCreatedAt;
  const date = raw?.toDate ? raw.toDate() : raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
};

const getPublicClientReviewSummary = (source) => {
  const direct = String(
    source?.clientPaymentReview ||
    source?.clientPaymentSummary ||
    source?.paymentReviewSummary ||
    source?.clientReviewSummary ||
    ""
  ).trim();
  if (direct) return direct;

  const totalSpent = String(
    source?.clientTotalSpent || source?.totalSpent || ""
  ).trim();
  const totalHires = String(
    source?.clientTotalHires || source?.totalHires || ""
  ).trim();
  if (totalSpent && totalHires) {
    return `${totalSpent} total spent · ${totalHires} hires`;
  }
  if (totalSpent) return `${totalSpent} total spent`;
  if (totalHires) return `${totalHires} hires`;
  return "Public payment review details are not available yet.";
};

const getPublicClientRating = (source) => {
  const candidates = [
    source?.clientProfileRating,
    source?.clientRating,
    source?.profileRating,
    source?.rating
  ];
  for (const entry of candidates) {
    const numeric = Number(entry);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Number(Math.min(5, Math.max(0, numeric)).toFixed(1));
    }
  }
  return null;
};

const PROPOSAL_DEFAULT = {
  proposalTitle: "",
  coverLetter: "",
  bidAmount: "",
  bidType: "fixed",
  currency: "INR",
  deliveryTime: "",
  availability: "",
  milestones: "",
  links: "",
  attachment: "",
  questions: "",
  screeningAnswers: {}
};

const buildFormForJob = (job) => {
  const base = {
    ...PROPOSAL_DEFAULT,
    bidType: job?.projectType === "hourly" ? "hourly" : "fixed",
    currency: job?.currency || "INR",
    screeningAnswers: {}
  };
  if (Array.isArray(job?.screeningQuestions)) {
    job.screeningQuestions.forEach((question) => {
      base.screeningAnswers[question] = "";
    });
  }
  return base;
};

export default function FreelancerJobDetails() {
  const { jobId } = useParams();
  const { user, profile } = useAuth();
  const toast = useToast();
  const [showClientRating, setShowClientRating] = useState(false);
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [submittingProposal, setSubmittingProposal] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [reportingJob, setReportingJob] = useState(false);
  const [proposalForm, setProposalForm] = useState(PROPOSAL_DEFAULT);
  const [missingFields, setMissingFields] = useState(new Set());
  const [clientPhotoError, setClientPhotoError] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const normalizedStatus = normalizeAccountStatus(profile?.status);
  const isApproved = normalizedStatus === ACCOUNT_STATUS.APPROVED;
  const { percent: freelancerProfilePercent } = useMemo(
    () => getFreelancerProfileCompletion(profile || {}),
    [profile]
  );
  const isFreelancerProfileComplete = freelancerProfilePercent === 100;
  const canApplyJobs = canFreelancerApplyJob({
    ...(profile || {}),
    role: "freelancer"
  });
  const applyBlockedMessage = getFreelancerApplyBlockedMessage({
    ...(profile || {}),
    role: "freelancer"
  });

  const { data: job, loading } = useFirestoreDoc(
    () => (jobId ? doc(db, "jobs", jobId) : null),
    [jobId],
    null
  );

  const { data: approvedJobs = [] } = useFirestoreQuery(
    () => query(collection(db, "jobs"), where("status", "==", "approved")),
    []
  );

  const { data: myProposals = [] } = useFirestoreQuery(
    () =>
      jobId && user
        ? query(
          collection(db, "proposals"),
          where("jobId", "==", jobId),
          where("freelancerId", "==", user.uid)
        )
        : null,
    [jobId, user]
  );

  const myProposal = useMemo(() => {
    if (!Array.isArray(myProposals) || myProposals.length === 0) return null;
    return [...myProposals].sort(
      (a, b) => getCreatedAtTime(b?.createdAt) - getCreatedAtTime(a?.createdAt)
    )[0];
  }, [myProposals]);

  const screeningQuestions = useMemo(
    () => toStringList(job?.screeningQuestions),
    [job?.screeningQuestions]
  );
  const referenceLinks = useMemo(
    () => toSafeLinks(job?.referenceLinks),
    [job?.referenceLinks]
  );
  const assetsLink = useMemo(
    () => toSafeLinks(job?.assetsLink)[0] || "",
    [job?.assetsLink]
  );

  const similarJobs = useMemo(() => {
    if (!job) return [];
    const jobSkills = new Set((Array.isArray(job.skills) ? job.skills : []).map(normalizeText));

    return approvedJobs
      .filter((entry) => entry.id !== job.id)
      .map((entry) => {
        let score = 0;
        if (String(entry.category || "") === String(job.category || "")) score += 4;
        if (String(entry.subcategory || "") === String(job.subcategory || "")) score += 2;
        if (Array.isArray(entry.skills) && jobSkills.size > 0) {
          entry.skills.forEach((skill) => {
            if (jobSkills.has(normalizeText(skill))) score += 1;
          });
        }
        return { entry, score };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return getCreatedAtTime(b.entry?.createdAt) - getCreatedAtTime(a.entry?.createdAt);
      })
      .slice(0, 4)
      .map((item) => item.entry);
  }, [approvedJobs, job]);

  const latestProposal = useMemo(() => {
    if (!Array.isArray(myProposals) || myProposals.length === 0) return null;
    return [...myProposals].sort(
      (a, b) => getCreatedAtTime(b?.createdAt) - getCreatedAtTime(a?.createdAt)
    )[0];
  }, [myProposals]);
  const publicProposalCount = useMemo(() => {
    const candidates = [
      job?.proposalCount,
      job?.proposalTotal,
      job?.proposalStats?.total
    ];
    for (const entry of candidates) {
      const numeric = Number(entry);
      if (Number.isFinite(numeric) && numeric >= 0) {
        return Math.round(numeric);
      }
    }
    return null;
  }, [job?.proposalCount, job?.proposalStats?.total, job?.proposalTotal]);
  const clientPaymentStats = useMemo(
    () => ({
      reviewSummary: getPublicClientReviewSummary(job)
    }),
    [job]
  );
  const clientProfileRating = useMemo(() => {
    const explicit = getPublicClientRating(job);
    if (explicit != null) {
      return {
        value: explicit,
        source: "profile"
      };
    }
    return { value: null, source: "none" };
  }, [job]);
  const clientRatingStars = useMemo(() => {
    if (!clientProfileRating.value) return "";
    const rounded = Math.max(0, Math.min(5, Math.round(clientProfileRating.value)));
    return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
  }, [clientProfileRating.value]);
  const clientPublicName = useMemo(() => {
    const name =
      String(job?.clientPublicName || "").trim() ||
      String(job?.clientDisplayName || "").trim() ||
      String(job?.clientCompanyName || "").trim() ||
      String(job?.clientName || "").trim();
    return name || "Verified client";
  }, [job?.clientCompanyName, job?.clientDisplayName, job?.clientName, job?.clientPublicName]);
  const clientPhotoUrl = useMemo(() => resolveFileUrl(job?.clientPhotoURL), [job?.clientPhotoURL]);
  const clientMemberSince = useMemo(
    () => getClientSinceLabel(job),
    [job]
  );
  const savedJobIds = useMemo(() => {
    const list = Array.isArray(profile?.savedJobIds) ? profile.savedJobIds : [];
    return new Set(
      list.map((entry) => String(entry || "").trim()).filter(Boolean)
    );
  }, [profile?.savedJobIds]);
  const isSavedJob = savedJobIds.has(String(job?.id || ""));
  const displaySkills = Array.isArray(job?.skills) ? job.skills.slice(0, 6) : [];
  const hiddenSkills = Math.max((Array.isArray(job?.skills) ? job.skills.length : 0) - 6, 0);
  const isMissing = (field) => missingFields.has(field);
  const fieldClass = (field, base) =>
    `${base} ${isMissing(field)
      ? "border-rose-400/60 focus:ring-rose-400/30 focus:border-rose-300"
      : ""
    }`;

  useEffect(() => {
    if (!job) {
      setProposalForm(PROPOSAL_DEFAULT);
      setShowApplyForm(false);
      setMissingFields(new Set());
      setStatusMessage("");
      return;
    }
    setProposalForm(buildFormForJob(job));
    setShowApplyForm(false);
    setMissingFields(new Set());
    setStatusMessage("");
  }, [job?.id, job?.projectType, job?.currency, job?.screeningQuestions]);

  useEffect(() => {
    setClientPhotoError(false);
  }, [clientPhotoUrl]);

  useEffect(() => {
    if (myProposal) {
      setShowApplyForm(false);
    }
  }, [myProposal]);

  const handleProposalChange = (event) => {
    const { name, value } = event.target;
    setProposalForm((prev) => ({ ...prev, [name]: value }));
    setMissingFields((prev) => {
      if (!prev.has(name)) return prev;
      const next = new Set(prev);
      if (String(value || "").trim()) {
        next.delete(name);
      }
      return next;
    });
  };

  const handleScreeningAnswer = (question, value, index) => {
    setProposalForm((prev) => ({
      ...prev,
      screeningAnswers: { ...prev.screeningAnswers, [question]: value }
    }));
    setMissingFields((prev) => {
      const key = `screening-${index}`;
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      if (String(value || "").trim()) {
        next.delete(key);
      }
      return next;
    });
  };

  const handleStartApply = () => {
    if (!canApplyJobs) {
      const message = applyBlockedMessage;
      setStatusMessage(message);
      toast.permission(message);
      return;
    }
    setShowApplyForm(true);
    setStatusMessage("");
  };

  const handleSubmitProposal = async () => {
    if (!job || !user) return;
    if (myProposal) {
      const message = "You already submitted a proposal for this job.";
      setStatusMessage(message);
      toast.permission(message);
      return;
    }

    setStatusMessage("");
    setSubmittingProposal(true);
    try {
      const latestProfile = await getUserProfile(user.uid);
      if (!latestProfile) {
        throw new Error("Profile not found.");
      }
      if (!canFreelancerApplyJob({ ...latestProfile, role: "freelancer" })) {
        const message = getFreelancerApplyBlockedMessage({
          ...latestProfile,
          role: "freelancer"
        });
        setStatusMessage(message);
        toast.permission(message);
        return;
      }

      const requiredFields = {
        coverLetter: proposalForm.coverLetter,
        bidAmount: proposalForm.bidAmount,
        deliveryTime: proposalForm.deliveryTime
      };

      const missing = Object.entries(requiredFields)
        .filter(([, value]) => String(value || "").trim() === "")
        .map(([key]) => key);

      screeningQuestions.forEach((question, index) => {
        const answer = proposalForm.screeningAnswers?.[question] || "";
        if (!String(answer).trim()) {
          missing.push(`screening-${index}`);
        }
      });

      if (missing.length > 0) {
        setMissingFields(new Set(missing));
        const message = "Please complete all proposal details.";
        setStatusMessage(message);
        toast.error(message);
        return;
      }

      await submitProposal(user, {
        jobId: job.id,
        freelancerName: profile?.name || latestProfile?.name || "Freelancer",
        priceType: proposalForm.bidType,
        price: proposalForm.bidAmount,
        deliveryDays: proposalForm.deliveryTime,
        skills: Array.isArray(job.skills) ? job.skills : [],
        proposalText: proposalForm.coverLetter,
        proposalTitle: proposalForm.proposalTitle,
        currency: proposalForm.currency,
        availability: proposalForm.availability,
        milestones: proposalForm.milestones,
        links: proposalForm.links,
        attachment: proposalForm.attachment,
        questions: proposalForm.questions,
        screeningAnswers: proposalForm.screeningAnswers || {}
      });

      setStatusMessage("Proposal submitted successfully.");
      toast.success("Proposal submitted successfully.");
      setShowApplyForm(false);
      setMissingFields(new Set());
      setProposalForm(buildFormForJob(job));
    } catch (err) {
      const message = err?.message || "Failed to submit proposal.";
      setStatusMessage(message);
      toast.error(message);
    } finally {
      setSubmittingProposal(false);
    }
  };

  const handleToggleSaveJob = async () => {
    if (!user?.uid || !job?.id) return;
    setSavingJob(true);
    setStatusMessage("");
    try {
      await toggleSavedJob({
        userId: user.uid,
        jobId: job.id,
        save: !isSavedJob
      });
      toast.success(isSavedJob ? "Job removed from saved list." : "Job saved.");
    } catch (err) {
      const message = err?.message || "Failed to update saved jobs.";
      setStatusMessage(message);
      toast.error(message);
    } finally {
      setSavingJob(false);
    }
  };

  const handleReportJob = async () => {
    if (!user?.uid || !job?.id) return;
    const reason = window.prompt("Enter a reason for reporting this job:");
    if (reason == null) return;
    setReportingJob(true);
    setStatusMessage("");
    try {
      await reportJobIssue({
        jobId: job.id,
        jobTitle: job.title,
        reporterId: user.uid,
        reason
      });
      toast.success("Job reported to admin.");
      setStatusMessage("Report submitted. Admin will review this job.");
    } catch (err) {
      const message = err?.message || "Failed to report job.";
      setStatusMessage(message);
      toast.error(message);
    } finally {
      setReportingJob(false);
    }
  };

  return (
    <DashboardLayout
      title="Job details"
      sidebar={{
        title: "Growlanzer",
        subtitle: "Freelancer",
        items: freelancerNav
      }}
    >
      <PageHeader
        title="Job full details"
        description="Review complete client scope, requirements, and activity before you apply."
      />
      {!isFreelancerProfileComplete ? (
        <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          ⚠️ Complete 100% profile details to request admin approval and apply for jobs. Current completion:{" "}
          {freelancerProfilePercent}%.
        </div>
      ) : null}
      {normalizedStatus === ACCOUNT_STATUS.PENDING_APPROVAL ? (
        <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          🚫 Admin approval required before applying to jobs.
        </div>
      ) : null}
      {statusMessage ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
          {statusMessage}
        </div>
      ) : null}

      {loading ? (
        <EmptyState title="Loading job" description="Fetching full job details..." />
      ) : !job ? (
        <EmptyState
          title="Job not found"
          description="The job may have been removed or this link is invalid."
        />
      ) : job.status !== "approved" ? (
        <EmptyState
          title="Job unavailable"
          description="This job is not currently approved for freelancer browsing."
        />
      ) : (
        <>
          <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <div className="space-y-6">
              <div className="glass-card rounded-2xl p-5 sm:p-6">
                <Link
                  to="/freelancer/jobs"
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Back to Browse Jobs
                </Link>

                <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                  <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                    {job.title || "Untitled job"}
                  </h2>
                  <StatusBadge status={job.status} />
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-400">
                  <span>Posted {formatTimeAgo(job.createdAt)}</span>
                  <span>{formatEnumLabel(job.location, "Remote")}</span>
                  <span>{formatEnumLabel(job.projectType, "Fixed")}</span>
                </div>

                <div className="mt-8">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Summary</p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-200">
                    {job.description || "Client did not provide a summary yet."}
                  </p>
                </div>

                <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs text-slate-400">Hours needed</p>
                    <p className="mt-1 text-base text-white">
                      {job.weeklyHours || "Not specified"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs text-slate-400">Duration</p>
                    <p className="mt-1 text-base text-white">
                      {job.duration || job.timeline || "Not specified"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs text-slate-400">Experience level</p>
                    <p className="mt-1 text-base text-white">
                      {formatEnumLabel(job.experienceLevel)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs text-slate-400">Budget</p>
                    <p className="mt-1 text-base text-white">{formatBudgetLabel(job)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs text-slate-400">Project type</p>
                    <p className="mt-1 text-base text-white">
                      {formatEnumLabel(job.jobType, "One-time")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs text-slate-400">Deadline</p>
                    <p className="mt-1 text-base text-white">{formatDate(job.deadline)}</p>
                  </div>
                </div>

                <div className="mt-8">
                  <h3 className="text-xl font-semibold text-white sm:text-2xl">Skills and expertise</h3>
                  {displaySkills.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {displaySkills.map((skill) => (
                        <span
                          key={skill}
                          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200"
                        >
                          <SkillLogo skill={skill} size={16} />
                          {skill}
                        </span>
                      ))}
                      {hiddenSkills > 0 ? (
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                          + {hiddenSkills} more
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">No mandatory skills listed.</p>
                  )}
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Deliverables
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm text-slate-200">
                      {job.deliverables || "Not provided."}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Success metrics
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm text-slate-200">
                      {job.successMetrics || "Not provided."}
                    </p>
                  </div>
                </div>

                <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-xl font-semibold text-white">Activity on this job</h3>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300">
                    <span>
                      Proposals:{" "}
                      {publicProposalCount != null
                        ? publicProposalCount
                        : `${myProposals.length} (your visible)`}
                    </span>
                    <span>
                      {publicProposalCount != null ? "Latest proposal" : "Latest your proposal"}:{" "}
                      {latestProposal ? formatTimeAgo(latestProposal.createdAt) : "No proposals yet"}
                    </span>
                    <span>Hires required: {job.hires || 1}</span>
                    <span>
                      Your status: {myProposal ? formatEnumLabel(myProposal.status) : "Not applied"}
                    </span>
                  </div>
                </div>

                {canApplyJobs && !myProposal ? (
                  <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-semibold text-white sm:text-2xl">Submit proposal</h3>
                        <p className="mt-2 text-sm text-slate-300">
                          Apply from this page with complete proposal details.
                        </p>
                      </div>
                      {showApplyForm ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="px-3 py-1 text-xs"
                          onClick={() => setShowApplyForm(false)}
                        >
                          Hide form
                        </Button>
                      ) : (
                        <Button type="button" onClick={handleStartApply}>
                          Apply now
                        </Button>
                      )}
                    </div>

                    <div className="mt-4 rounded-xl border border-white/10 bg-night-900/40 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Job details for your proposal
                      </p>
                      <div className="mt-2 grid gap-1 text-sm text-slate-200">
                        <p>Budget: {formatBudgetLabel(job)}</p>
                        <p>Duration: {job.duration || job.timeline || "Not specified"}</p>
                        <p>Experience: {formatEnumLabel(job.experienceLevel)}</p>
                        <p>Project type: {formatEnumLabel(job.jobType, "One-time")}</p>
                        <p>Deadline: {formatDate(job.deadline)}</p>
                      </div>
                    </div>

                    {showApplyForm ? (
                      <>
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          <input
                            className={fieldClass("proposalTitle", "form-input")}
                            placeholder="Proposal title (optional)"
                            name="proposalTitle"
                            value={proposalForm.proposalTitle}
                            onChange={handleProposalChange}
                          />
                          <input
                            className={fieldClass("bidAmount", "form-input")}
                            placeholder="Your bid amount *"
                            name="bidAmount"
                            value={proposalForm.bidAmount}
                            onChange={handleProposalChange}
                          />
                          <select
                            className="form-select"
                            name="bidType"
                            value={proposalForm.bidType}
                            onChange={handleProposalChange}
                          >
                            <option value="fixed">Fixed price</option>
                            <option value="hourly">Hourly rate</option>
                          </select>
                          <select
                            className="form-select"
                            name="currency"
                            value={proposalForm.currency}
                            onChange={handleProposalChange}
                          >
                            <option value="INR">INR</option>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                            <option value="GBP">GBP</option>
                          </select>
                          <input
                            className={fieldClass("deliveryTime", "form-input")}
                            placeholder="Estimated delivery time * (e.g., 2 weeks)"
                            name="deliveryTime"
                            value={proposalForm.deliveryTime}
                            onChange={handleProposalChange}
                          />
                          <input
                            className={fieldClass("availability", "form-input")}
                            placeholder="Availability (optional)"
                            name="availability"
                            value={proposalForm.availability}
                            onChange={handleProposalChange}
                          />
                          <textarea
                            rows="5"
                            className={fieldClass("coverLetter", "lg:col-span-2 form-textarea")}
                            placeholder="Cover letter / approach *"
                            name="coverLetter"
                            value={proposalForm.coverLetter}
                            onChange={handleProposalChange}
                          />
                          <textarea
                            rows="4"
                            className={fieldClass("milestones", "lg:col-span-2 form-textarea")}
                            placeholder="Milestones & deliverables (optional)"
                            name="milestones"
                            value={proposalForm.milestones}
                            onChange={handleProposalChange}
                          />
                          <input
                            className={fieldClass("links", "form-input")}
                            placeholder="Portfolio / case study links (optional)"
                            name="links"
                            value={proposalForm.links}
                            onChange={handleProposalChange}
                          />
                          <input
                            className="form-input"
                            placeholder="Attachment URL (optional)"
                            name="attachment"
                            value={proposalForm.attachment}
                            onChange={handleProposalChange}
                          />
                          <input
                            className={fieldClass("questions", "form-input")}
                            placeholder="Questions for the client (optional)"
                            name="questions"
                            value={proposalForm.questions}
                            onChange={handleProposalChange}
                          />
                        </div>

                        {screeningQuestions.length > 0 ? (
                          <div className="mt-5">
                            <h4 className="text-sm font-semibold text-white">
                              Screening questions
                            </h4>
                            <div className="mt-3 grid gap-3">
                              {screeningQuestions.map((question, index) => (
                                <div key={`${question}-${index}`} className="grid gap-2">
                                  <p className="text-xs text-slate-400">{question}</p>
                                  <input
                                    className={fieldClass(`screening-${index}`, "form-input")}
                                    placeholder="Your answer *"
                                    value={proposalForm.screeningAnswers?.[question] || ""}
                                    onChange={(event) =>
                                      handleScreeningAnswer(
                                        question,
                                        event.target.value,
                                        index
                                      )
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-6 flex flex-wrap items-center gap-3">
                          <Button
                            type="button"
                            onClick={handleSubmitProposal}
                            disabled={submittingProposal}
                            title={
                              canApplyJobs
                                ? "Submit proposal"
                                : applyBlockedMessage
                            }
                          >
                            {submittingProposal ? "Submitting..." : "Submit proposal"}
                          </Button>
                          <span className="text-xs text-slate-400">
                            All fields are required before submission.
                          </span>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-night-900">
                      {clientPhotoUrl && !clientPhotoError ? (
                        <img
                          src={clientPhotoUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={() => setClientPhotoError(true)}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-slate-500">
                          {(job.clientName || "C")[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-white sm:text-2xl">About the client</h3>
                      <div className="mt-3 grid gap-2 text-sm text-slate-300">
                        <p>
                          Name:{" "}
                          <UserProfileLink
                            userId={job?.clientId}
                            name={clientPublicName}
                            className="text-sky-200 underline hover:text-sky-100"
                          />
                        </p>
                        <p>Member since: {clientMemberSince}</p>
                        <p>Payment reviews: {clientPaymentStats.reviewSummary}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      className="px-3 py-1 text-xs"
                      onClick={() => setShowClientRating((prev) => !prev)}
                    >
                      {showClientRating ? "Hide profile rating" : "View profile rating"}
                    </Button>
                    <p className="text-xs text-slate-500">
                      Client personal contact details are hidden for privacy.
                    </p>
                  </div>
                  {showClientRating ? (
                    <div className="mt-4 rounded-xl border border-white/10 bg-night-900/50 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Profile rating
                      </p>
                      {clientProfileRating.value ? (
                        <>
                          <p className="mt-2 text-lg font-semibold text-white">
                            {clientRatingStars} {clientProfileRating.value.toFixed(1)} / 5
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {clientProfileRating.source === "profile"
                              ? "From client public profile snapshot."
                              : "Rating will appear when client public rating data is available."}
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-sm text-slate-300">
                          Rating will appear after completed payment activity.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>

                {screeningQuestions.length > 0 ? (
                  <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
                    <h3 className="text-xl font-semibold text-white">Screening questions</h3>
                    <div className="mt-3 grid gap-2 text-sm text-slate-300">
                      {screeningQuestions.map((question, index) => (
                        <p key={`${question}-${index}`}>
                          {index + 1}. {question}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-6">
              <div className="glass-card rounded-2xl p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Actions
                </p>
                <div className="mt-3 grid gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={handleToggleSaveJob}
                    disabled={savingJob}
                  >
                    {savingJob
                      ? "Saving..."
                      : isSavedJob
                        ? "Saved"
                        : "Save Job"}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    className="w-full"
                    onClick={handleReportJob}
                    disabled={reportingJob}
                  >
                    {reportingJob ? "Reporting..." : "Report Job"}
                  </Button>
                </div>
                <div className="mt-4 border-t border-white/10 pt-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Application
                  </p>
                </div>
                {myProposal ? (
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white">You already applied</p>
                      <StatusBadge status={myProposal.status} />
                    </div>
                    <p className="text-xs text-slate-400">
                      Bid: {formatProposalBid(myProposal, job)}
                    </p>
                    <p className="text-xs text-slate-400">
                      Submitted {formatTimeAgo(myProposal.createdAt)}
                    </p>
                    <Link to="/freelancer/proposals" className="block">
                      <Button variant="ghost" className="mt-2 w-full">
                        Open proposals
                      </Button>
                    </Link>
                  </div>
                ) : canApplyJobs ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm text-slate-300">
                      You can apply directly on this page.
                    </p>
                    <Button type="button" className="w-full" onClick={handleStartApply}>
                      {showApplyForm ? "Proposal form opened below" : "Apply now"}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm text-slate-300">
                      Complete your profile to 100% and get admin approval to unlock applying.
                    </p>
                    <Button
                      type="button"
                      className="w-full"
                      onClick={handleStartApply}
                      title={applyBlockedMessage}
                    >
                      Apply now
                    </Button>
                    <Link to="/freelancer/profile" className="block">
                      <Button variant="ghost" className="w-full">
                        Complete profile
                      </Button>
                    </Link>
                  </div>
                )}
              </div>

              <div className="glass-card rounded-2xl p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Project links
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  {assetsLink ? (
                    <a
                      href={assetsLink}
                      target="_blank"
                      rel="noreferrer"
                      className="block break-all text-sky-300 hover:text-sky-200"
                    >
                      Assets: {truncate(assetsLink, 70)}
                    </a>
                  ) : (
                    <p className="text-slate-400">Assets link not provided.</p>
                  )}
                  {referenceLinks.length > 0 ? (
                    referenceLinks.map((link) => (
                      <a
                        key={link}
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="block break-all text-sky-300 hover:text-sky-200"
                      >
                        {truncate(link, 70)}
                      </a>
                    ))
                  ) : (
                    <p className="text-slate-400">Reference links not provided.</p>
                  )}
                </div>
              </div>

              <div className="glass-card rounded-2xl p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Similar jobs
                </p>
                <div className="mt-3 space-y-3">
                  {similarJobs.length === 0 ? (
                    <p className="text-sm text-slate-400">No similar jobs yet.</p>
                  ) : (
                    similarJobs.map((similarJob) => (
                      <Link
                        key={similarJob.id}
                        to={`/freelancer/jobs/${similarJob.id}`}
                        className="block rounded-xl border border-white/10 bg-white/5 p-3 hover:bg-white/10"
                      >
                        <p className="text-sm font-semibold text-white">
                          {similarJob.title || "Untitled job"}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {formatEnumLabel(similarJob.projectType, "Fixed")} · Posted{" "}
                          {formatTimeAgo(similarJob.createdAt)}
                        </p>
                        <p className="mt-1 text-xs text-slate-300">
                          {formatBudgetLabel(similarJob)}
                        </p>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </DashboardLayout>
  );
}



