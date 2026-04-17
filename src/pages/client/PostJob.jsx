import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Button from "../../components/Button.jsx";
import SkillLogo from "../../components/SkillLogo.jsx";
import { clientNav } from "../../data/nav.js";
import {
  SOFTWARE_SKILLS,
  filterSkillSuggestions,
  getCanonicalSkill,
  hasExactSkillMatch,
  toSkillKey
} from "../../data/skills.js";
import { createJob } from "../../services/jobsService.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { getUserProfile } from "../../services/usersService.js";
import { getClientProfileCompletion } from "../../utils/clientProfile.js";
import {
  ACCOUNT_STATUS,
  canClientPostJob,
  getClientPostJobBlockedMessage,
  normalizeAccountStatus
} from "../../utils/accountStatus.js";

const CATEGORY_OPTIONS = [
  {
    id: "website",
    label: "Website Development",
    subcategories: ["Landing page", "Company site", "Ecommerce", "Web app"]
  },
  {
    id: "app",
    label: "App Development",
    subcategories: ["Android app", "iOS app", "Cross-platform app", "API backend"]
  },
  {
    id: "design",
    label: "Design & Creative",
    subcategories: ["UI/UX", "Branding", "Graphics", "Video design"]
  },
  {
    id: "marketing",
    label: "Marketing & Content",
    subcategories: ["SEO", "Ads", "Social media", "Content writing"]
  },
  {
    id: "data",
    label: "Data & AI",
    subcategories: ["Dashboard", "Automation", "ML model", "LLM integration"]
  }
];

const createDefaultForm = () => ({
  title: "",
  categoryId: "",
  category: "",
  subcategory: "",
  jobType: "one_time",
  projectType: "fixed",
  experienceLevel: "intermediate",
  scope: "medium",
  location: "remote",
  hires: "1",
  description: "",
  deliverables: "",
  successMetrics: "",
  referenceLinks: "",
  assetsLink: "",
  budgetMin: "",
  budgetMax: "",
  hourlyMin: "",
  hourlyMax: "",
  currency: "INR",
  startDate: "",
  deadline: "",
  duration: "",
  weeklyHours: "",
  milestoneCount: "",
  escrowAmount: "",
  priority: "standard",
  communication: "email",
  screeningQuestions: "",
  ndaRequired: false,
  skills: []
});

const hasText = (value) => String(value || "").trim() !== "";
const parseList = (value) =>
  String(value || "")
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
const DAY_MS = 24 * 60 * 60 * 1000;

const toDateInputValue = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDateDiffInDays = (startDate, endDate) => {
  if (!hasText(startDate) || !hasText(endDate)) return null;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
};

const formatDurationFromDays = (days) => {
  if (!Number.isFinite(days)) return "";
  if (days <= 1) return "1 day";
  if (days % 7 === 0) {
    const weeks = Math.round(days / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  }
  return `${days} days`;
};

const formatRange = (minValue, maxValue, suffix = "") => {
  const min = String(minValue || "").trim();
  const max = String(maxValue || "").trim();
  if (min && max) return `${min} - ${max}${suffix}`;
  if (min) return `${min}+${suffix}`;
  if (max) return `Up to ${max}${suffix}`;
  return "Not specified";
};

export default function ClientPostJob() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(createDefaultForm);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [skillsQuery, setSkillsQuery] = useState("");
  const [missingFields, setMissingFields] = useState(new Set());
  const todayDate = useMemo(() => toDateInputValue(new Date()), []);
  const profileLockToastShownRef = useRef(false);
  const { percent: clientProfilePercent, missingFields: clientMissingFields } = useMemo(
    () => getClientProfileCompletion(profile || {}),
    [profile]
  );
  const normalizedStatus = normalizeAccountStatus(profile?.status);
  const isClientApproved = normalizedStatus === ACCOUNT_STATUS.APPROVED;
  const canPostJobs = canClientPostJob({ ...(profile || {}), role: "client" });
  const postJobBlockedMessage = getClientPostJobBlockedMessage({
    ...(profile || {}),
    role: "client"
  });

  useEffect(() => {
    if (canPostJobs) {
      profileLockToastShownRef.current = false;
      return;
    }
    if (!profile || profileLockToastShownRef.current) return;

    const message = postJobBlockedMessage;
    profileLockToastShownRef.current = true;
    toast.permission(message);
  }, [canPostJobs, postJobBlockedMessage, profile, toast]);

  const selectedCategory = useMemo(
    () => CATEGORY_OPTIONS.find((item) => item.id === form.categoryId) || null,
    [form.categoryId]
  );

  const visibleSkills = useMemo(
    () =>
      filterSkillSuggestions({
        query: skillsQuery,
        selectedSkills: form.skills,
        skillLibrary: SOFTWARE_SKILLS
      }),
    [skillsQuery, form.skills]
  );

  const customSkillLabel = skillsQuery.trim();
  const canAddCustomSkill = useMemo(() => {
    const queryKey = toSkillKey(customSkillLabel);
    if (!queryKey) return false;
    const alreadySelected = form.skills.some(
      (skill) => toSkillKey(skill) === queryKey
    );
    if (alreadySelected) return false;
    return !hasExactSkillMatch(customSkillLabel, SOFTWARE_SKILLS);
  }, [customSkillLabel, form.skills]);

  const isMissing = (field) => missingFields.has(field);
  const fieldClass = (field, base) =>
    `${base} ${
      isMissing(field)
        ? "border-rose-400/60 focus:ring-rose-400/30 focus:border-rose-300"
        : ""
    }`;

  const clearMissingField = (field) => {
    setMissingFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    if (name === "categoryId") {
      const category = CATEGORY_OPTIONS.find((item) => item.id === value);
      setForm((prev) => ({
        ...prev,
        categoryId: value,
        category: category?.label || "",
        subcategory: ""
      }));
      setMissingFields((prev) => {
        const next = new Set(prev);
        next.delete("categoryId");
        next.delete("subcategory");
        return next;
      });
      return;
    }
    if (name === "startDate" || name === "deadline") {
      setForm((prev) => {
        const next = {
          ...prev,
          [name]: type === "checkbox" ? checked : value
        };
        if (
          name === "startDate" &&
          hasText(next.startDate) &&
          hasText(next.deadline) &&
          next.startDate > next.deadline
        ) {
          next.deadline = next.startDate;
        }
        const diffDays = getDateDiffInDays(next.startDate, next.deadline);
        if (diffDays != null && diffDays >= 0 && !hasText(prev.duration)) {
          next.duration = formatDurationFromDays(Math.max(diffDays, 1));
        }
        return next;
      });
      clearMissingField(name);
      if (name === "startDate") {
        clearMissingField("deadline");
      }
      return;
    }
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
    clearMissingField(name);
  };

  const applyTimelinePreset = (days) => {
    const startDateValue = hasText(form.startDate) ? form.startDate : todayDate;
    const start = new Date(`${startDateValue}T00:00:00`);
    const end = new Date(start.getTime() + days * DAY_MS);
    const deadlineValue = toDateInputValue(end);

    setForm((prev) => ({
      ...prev,
      startDate: startDateValue,
      deadline: deadlineValue,
      duration: formatDurationFromDays(days)
    }));
    clearMissingField("startDate");
    clearMissingField("deadline");
    clearMissingField("duration");
  };

  const handleSkillAdd = (skillValue) => {
    const skill = getCanonicalSkill(skillValue, SOFTWARE_SKILLS);
    const skillKey = toSkillKey(skill);
    if (!skillKey) return;
    setForm((prev) => {
      if (prev.skills.some((entry) => toSkillKey(entry) === skillKey)) return prev;
      return { ...prev, skills: [...prev.skills, skill] };
    });
    clearMissingField("skills");
    setSkillsQuery("");
  };

  const handleSkillRemove = (skill) => {
    const skillKey = toSkillKey(skill);
    setForm((prev) => {
      const nextSkills = prev.skills.filter(
        (entry) => toSkillKey(entry) !== skillKey
      );
      if (nextSkills.length === 0) {
        setMissingFields((prevMissing) => new Set([...prevMissing, "skills"]));
      }
      return { ...prev, skills: nextSkills };
    });
  };

  const handleSkillKey = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = skillsQuery.trim();
    if (!value) return;
    handleSkillAdd(value);
  };

  const getMissingFields = () => {
    const required = {
      title: form.title,
      categoryId: form.categoryId,
      subcategory: form.subcategory,
      hires: form.hires,
      description: form.description,
      deliverables: form.deliverables,
      successMetrics: form.successMetrics,
      currency: form.currency,
      deadline: form.deadline,
      duration: form.duration
    };
    if (form.projectType === "fixed") {
      required.budgetMin = form.budgetMin;
      required.budgetMax = form.budgetMax;
    } else {
      required.hourlyMin = form.hourlyMin;
      required.hourlyMax = form.hourlyMax;
      required.weeklyHours = form.weeklyHours;
    }
    const missing = Object.entries(required)
      .filter(([, value]) => !hasText(value))
      .map(([key]) => key);
    if (form.skills.length === 0) {
      missing.push("skills");
    }
    return missing;
  };

  const getValidationErrors = () => {
    const errors = [];
    if (hasText(form.description) && String(form.description).trim().length < 40) {
      errors.push({
        field: "description",
        message: "Description must be at least 40 characters."
      });
    }
    const hires = Number(form.hires);
    if (hasText(form.hires) && (!Number.isFinite(hires) || hires < 1)) {
      errors.push({
        field: "hires",
        message: "Number of freelancers must be at least 1."
      });
    }
    if (form.projectType === "fixed") {
      const min = Number(form.budgetMin);
      const max = Number(form.budgetMax);
      if (hasText(form.budgetMin) && !Number.isFinite(min)) {
        errors.push({
          field: "budgetMin",
          message: "Budget min must be numeric."
        });
      }
      if (hasText(form.budgetMax) && !Number.isFinite(max)) {
        errors.push({
          field: "budgetMax",
          message: "Budget max must be numeric."
        });
      }
      if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
        errors.push({
          field: "budgetMin",
          message: "Budget max must be greater than or equal to budget min."
        });
        errors.push({
          field: "budgetMax",
          message: "Budget max must be greater than or equal to budget min."
        });
      }
    } else {
      const min = Number(form.hourlyMin);
      const max = Number(form.hourlyMax);
      if (hasText(form.hourlyMin) && !Number.isFinite(min)) {
        errors.push({
          field: "hourlyMin",
          message: "Hourly min must be numeric."
        });
      }
      if (hasText(form.hourlyMax) && !Number.isFinite(max)) {
        errors.push({
          field: "hourlyMax",
          message: "Hourly max must be numeric."
        });
      }
      if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
        errors.push({
          field: "hourlyMin",
          message: "Hourly max must be greater than or equal to hourly min."
        });
        errors.push({
          field: "hourlyMax",
          message: "Hourly max must be greater than or equal to hourly min."
        });
      }
    }
    if (hasText(form.startDate) && hasText(form.deadline)) {
      const start = new Date(form.startDate).getTime();
      const end = new Date(form.deadline).getTime();
      if (start > end) {
        errors.push({
          field: "startDate",
          message: "Start date cannot be after deadline."
        });
        errors.push({
          field: "deadline",
          message: "Start date cannot be after deadline."
        });
      }
    }
    if (
      hasText(form.assetsLink) &&
      !/^https?:\/\/\S+$/i.test(String(form.assetsLink).trim())
    ) {
      errors.push({
        field: "assetsLink",
        message: "Assets link must be a valid URL (https://...)."
      });
    }
    return errors;
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!canPostJobs) {
      const message = postJobBlockedMessage;
      setStatus(message);
      toast.permission(message);
      return;
    }
    setStatus("");
    const missing = getMissingFields();
    const validationErrors = getValidationErrors();
    if (missing.length > 0 || validationErrors.length > 0) {
      setMissingFields(
        new Set([...missing, ...validationErrors.map((entry) => entry.field)])
      );
      const message =
        validationErrors[0]?.message ||
        "Please complete all required fields before submitting.";
      setStatus(message);
      toast.error(message);
      return;
    }

    setLoading(true);
    try {
      const latestProfile = await getUserProfile(user.uid);
      if (!latestProfile) {
        throw new Error("Profile not found.");
      }
      if (!canClientPostJob({ ...latestProfile, role: "client" })) {
        const message = getClientPostJobBlockedMessage({
          ...latestProfile,
          role: "client"
        });
        setStatus(message);
        toast.permission(message);
        return;
      }

      const { percent: profilePercent } =
        getClientProfileCompletion(latestProfile);
      if (profilePercent < 100) {
        setStatus(
          "Please complete your client profile (100%) before posting jobs."
        );
        toast.error(
          "Please complete your client profile (100%) before posting jobs."
        );
        return;
      }

      const budgetLabel =
        form.projectType === "hourly"
          ? `${form.currency} ${formatRange(form.hourlyMin, form.hourlyMax, " / hr")}`
          : `${form.currency} ${formatRange(form.budgetMin, form.budgetMax)}`;
      const timeline =
        form.duration ||
        (form.startDate && form.deadline
          ? `${form.startDate} to ${form.deadline}`
          : form.deadline || form.startDate || "");
      const clientPublicName = String(
        latestProfile.displayName ||
          latestProfile.companyName ||
          latestProfile.name ||
          "Verified client"
      ).trim();
      const profileRatingCandidates = [
        latestProfile.profileRating,
        latestProfile.clientRating,
        latestProfile.rating
      ];
      let clientProfileRating = null;
      for (const entry of profileRatingCandidates) {
        const numeric = Number(entry);
        if (Number.isFinite(numeric) && numeric > 0) {
          clientProfileRating = Number(Math.min(5, Math.max(0, numeric)).toFixed(1));
          break;
        }
      }
      const clientPublicSnapshot = {
        clientPublicName: clientPublicName || "Verified client",
        clientName: clientPublicName || "Verified client",
        clientDisplayName: String(latestProfile.displayName || "").trim() || null,
        clientCompanyName: String(latestProfile.companyName || "").trim() || null,
        clientMemberSince:
          latestProfile.createdAt || latestProfile.joinedAt || latestProfile.memberSince || null,
        clientProfileRating,
        clientRating: clientProfileRating,
        clientVerified: Boolean(
          latestProfile.verified ??
            latestProfile.clientVerified ??
            latestProfile.identityVerified ??
            false
        ),
        clientPaymentReview:
          String(
            latestProfile.paymentReviewSummary ||
              latestProfile.clientPaymentSummary ||
              latestProfile.clientReviewSummary ||
              ""
          ).trim() || null,
        clientTotalSpent: latestProfile.totalSpent || latestProfile.clientTotalSpent || null,
        clientTotalHires: latestProfile.totalHires || latestProfile.clientTotalHires || null
      };

      await createJob({
        clientId: user.uid,
        title: form.title.trim(),
        description: form.description.trim(),
        budget: budgetLabel,
        skills: form.skills,
        timeline,
        category: selectedCategory?.label || form.category || "",
        categoryId: form.categoryId,
        subcategory: form.subcategory,
        jobType: form.jobType,
        projectType: form.projectType,
        experienceLevel: form.experienceLevel,
        scope: form.scope,
        location: form.location,
        hires: Number(form.hires) || 1,
        deliverables: form.deliverables.trim(),
        successMetrics: form.successMetrics.trim(),
        referenceLinks: parseList(form.referenceLinks),
        assetsLink: form.assetsLink.trim(),
        budgetMin: form.budgetMin,
        budgetMax: form.budgetMax,
        hourlyMin: form.hourlyMin,
        hourlyMax: form.hourlyMax,
        currency: form.currency,
        startDate: form.startDate,
        deadline: form.deadline,
        duration: form.duration.trim(),
        weeklyHours: form.weeklyHours.trim(),
        milestoneCount: form.milestoneCount,
        escrowAmount: form.escrowAmount,
        priority: form.priority,
        urgency: form.priority,
        communication: form.communication,
        attachments: form.assetsLink.trim() ? [form.assetsLink.trim()] : [],
        screeningQuestions: parseList(form.screeningQuestions),
        ndaRequired: form.ndaRequired,
        ...clientPublicSnapshot
      });
      setStatus("Job submitted for admin approval.");
      toast.success("Job submitted for admin approval.");
      setForm(createDefaultForm());
      setMissingFields(new Set());
      setSkillsQuery("");
    } catch (err) {
      setStatus(err.message || "Failed to submit job.");
      toast.error("Failed to submit job.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout
      title="Post a Job"
      sidebar={{ title: "Client Suite", subtitle: "Client", items: clientNav }}
    >
      <PageHeader
        title="Post a clear job for freelancers"
        description="Select a category, define scope clearly, and submit for admin approval."
        primaryAction={loading ? "Submitting..." : "Submit for approval"}
        onPrimaryAction={handleSubmit}
        primaryDisabled={loading || !canPostJobs}
        primaryTitle={
          canPostJobs ? "Submit job for admin approval" : postJobBlockedMessage
        }
      />
      {clientProfilePercent < 100 ? (
        <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          ⚠️ Complete 100% profile details to request admin approval and post a job.
        </div>
      ) : null}
      {normalizedStatus === ACCOUNT_STATUS.INCOMPLETE && clientProfilePercent === 100 ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Profile is 100% complete. Request Admin Approval from your profile page to unlock posting.
        </div>
      ) : null}
      {normalizedStatus === ACCOUNT_STATUS.PENDING_APPROVAL ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          🚫 Admin approval required before posting jobs.
        </div>
      ) : null}
      {normalizedStatus === ACCOUNT_STATUS.REJECTED ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Your approval request was rejected. Update profile and request admin approval again.
        </div>
      ) : null}
      {isClientApproved && clientProfilePercent < 100 ? (
        <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p>Complete your client profile to 100% before posting jobs.</p>
              <p className="mt-1 text-xs text-sky-200">
                Current completion: {clientProfilePercent}% ({clientMissingFields.length} fields remaining).
              </p>
            </div>
            <Link
              to="/client/company-profile"
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-sky-300/40 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/25"
            >
              Complete profile
            </Link>
          </div>
        </div>
      ) : null}
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
        Fill clear project details so freelancers can understand scope quickly.
        Only core fields are mandatory.
      </div>

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-6">
            <h4 className="text-sm font-semibold text-white">Job basics</h4>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <input
                className={fieldClass("title", "lg:col-span-2 form-input")}
                placeholder="Job title *"
                name="title"
                value={form.title}
                onChange={handleChange}
              />
              <select
                className={fieldClass("categoryId", "form-select")}
                name="categoryId"
                value={form.categoryId}
                onChange={handleChange}
              >
                <option value="">Select category *</option>
                {CATEGORY_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <select
                className={fieldClass("subcategory", "form-select")}
                name="subcategory"
                value={form.subcategory}
                onChange={handleChange}
                disabled={!selectedCategory}
              >
                <option value="">
                  {selectedCategory ? "Select work type *" : "Choose category first"}
                </option>
                {(selectedCategory?.subcategories || []).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                className="form-select"
                name="jobType"
                value={form.jobType}
                onChange={handleChange}
              >
                <option value="one_time">One-time project</option>
                <option value="ongoing">Ongoing work</option>
              </select>
              <select
                className="form-select"
                name="projectType"
                value={form.projectType}
                onChange={handleChange}
              >
                <option value="fixed">Fixed price</option>
                <option value="hourly">Hourly</option>
              </select>
              <select
                className="form-select"
                name="experienceLevel"
                value={form.experienceLevel}
                onChange={handleChange}
              >
                <option value="entry">Entry</option>
                <option value="intermediate">Intermediate</option>
                <option value="expert">Expert</option>
              </select>
              <select
                className="form-select"
                name="scope"
                value={form.scope}
                onChange={handleChange}
              >
                <option value="small">Small scope</option>
                <option value="medium">Medium scope</option>
                <option value="large">Large scope</option>
              </select>
              <select
                className="form-select"
                name="location"
                value={form.location}
                onChange={handleChange}
              >
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="on_site">On-site</option>
              </select>
              <input
                className={fieldClass("hires", "form-input")}
                placeholder="No. of freelancers *"
                name="hires"
                value={form.hires}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h4 className="text-sm font-semibold text-white">Project clarity</h4>
            <div className="mt-4 grid gap-4">
              <textarea
                rows="5"
                className={fieldClass("description", "form-textarea")}
                placeholder="Project brief * (what should be built)"
                name="description"
                value={form.description}
                onChange={handleChange}
              />
              <textarea
                rows="4"
                className={fieldClass("deliverables", "form-textarea")}
                placeholder="Deliverables * (what freelancer must submit)"
                name="deliverables"
                value={form.deliverables}
                onChange={handleChange}
              />
              <textarea
                rows="3"
                className={fieldClass("successMetrics", "form-textarea")}
                placeholder="Success metrics * (how work will be accepted)"
                name="successMetrics"
                value={form.successMetrics}
                onChange={handleChange}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <textarea
                  rows="3"
                  className="form-textarea"
                  placeholder="Reference links (optional)"
                  name="referenceLinks"
                  value={form.referenceLinks}
                  onChange={handleChange}
                />
                <input
                  className={fieldClass("assetsLink", "form-input")}
                  placeholder="Assets link (optional, https://...)"
                  name="assetsLink"
                  value={form.assetsLink}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h4 className="text-sm font-semibold text-white">Budget and timeline</h4>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <select
                className={fieldClass("currency", "form-select")}
                name="currency"
                value={form.currency}
                onChange={handleChange}
              >
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
              {form.projectType === "fixed" ? (
                <>
                  <input
                    className={fieldClass("budgetMin", "form-input")}
                    placeholder="Budget min *"
                    name="budgetMin"
                    value={form.budgetMin}
                    onChange={handleChange}
                  />
                  <input
                    className={fieldClass("budgetMax", "form-input")}
                    placeholder="Budget max *"
                    name="budgetMax"
                    value={form.budgetMax}
                    onChange={handleChange}
                  />
                </>
              ) : (
                <>
                  <input
                    className={fieldClass("hourlyMin", "form-input")}
                    placeholder="Hourly min *"
                    name="hourlyMin"
                    value={form.hourlyMin}
                    onChange={handleChange}
                  />
                  <input
                    className={fieldClass("hourlyMax", "form-input")}
                    placeholder="Hourly max *"
                    name="hourlyMax"
                    value={form.hourlyMax}
                    onChange={handleChange}
                  />
                  <input
                    className={fieldClass("weeklyHours", "form-input")}
                    placeholder="Weekly hours *"
                    name="weeklyHours"
                    value={form.weeklyHours}
                    onChange={handleChange}
                  />
                </>
              )}
              <div className="space-y-1">
                <p className="text-xs text-slate-400">Start date</p>
                <input
                  className={fieldClass("startDate", "form-input")}
                  type="date"
                  name="startDate"
                  value={form.startDate}
                  min={todayDate}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-slate-400">Deadline *</p>
                <input
                  className={fieldClass("deadline", "form-input")}
                  type="date"
                  name="deadline"
                  value={form.deadline}
                  min={form.startDate || todayDate}
                  onChange={handleChange}
                />
              </div>
              <input
                className={fieldClass("duration", "form-input")}
                placeholder="Expected duration * (e.g., 4 weeks)"
                name="duration"
                value={form.duration}
                onChange={handleChange}
              />
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 lg:col-span-2">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Quick timeline
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    { label: "1 week", days: 7 },
                    { label: "2 weeks", days: 14 },
                    { label: "1 month", days: 30 }
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyTimelinePreset(preset.days)}
                      className="rounded-lg border border-white/10 bg-white/10 px-3 py-1 text-xs text-slate-200 hover:bg-white/20"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Tip: Pick dates from calendar icon or use quick options.
                </p>
              </div>
              <select
                className="form-select"
                name="priority"
                value={form.priority}
                onChange={handleChange}
              >
                <option value="standard">Standard priority</option>
                <option value="urgent">Urgent</option>
              </select>
              <select
                className="form-select"
                name="communication"
                value={form.communication}
                onChange={handleChange}
              >
                <option value="email">Email</option>
                <option value="slack">Slack</option>
                <option value="meet">Google Meet</option>
                <option value="zoom">Zoom</option>
              </select>
              <label className="flex items-center gap-3 form-surface px-4 py-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  name="ndaRequired"
                  checked={form.ndaRequired}
                  onChange={handleChange}
                  className="accent-glow-cyan"
                />
                NDA required
              </label>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h4 className="text-sm font-semibold text-white">Required skills</h4>
            <p className="mt-2 text-xs text-slate-400">
              Add skills freelancers must have for this project.
            </p>
            <div className={fieldClass("skills", "mt-3 form-surface px-4 py-3")}>
              <input
                className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
                placeholder="Type software skill (React, Python, AWS) and press Enter"
                value={skillsQuery}
                onChange={(event) => setSkillsQuery(event.target.value)}
                onKeyDown={handleSkillKey}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {form.skills.length === 0 ? (
                <span className="text-xs text-slate-500">No skills selected.</span>
              ) : (
                form.skills.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => handleSkillRemove(skill)}
                    className="flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100 hover:bg-emerald-500/20"
                  >
                    <SkillLogo skill={skill} size={16} />
                    <span>{skill}</span>
                    <span>x</span>
                  </button>
                ))
              )}
            </div>
            <div className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-night-800/60 p-3">
              <div className="flex flex-wrap gap-2">
                {canAddCustomSkill ? (
                  <button
                    type="button"
                    onClick={() => handleSkillAdd(customSkillLabel)}
                    className="rounded-full border border-glow-cyan/50 bg-glow-cyan/10 px-3 py-1 text-xs text-glow-cyan hover:bg-glow-cyan/20"
                  >
                    Add "{customSkillLabel}"
                  </button>
                ) : null}
                {visibleSkills.map((skill) => {
                  const selected = form.skills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      disabled={selected}
                      onClick={() => handleSkillAdd(skill)}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                        selected
                          ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200 cursor-not-allowed"
                          : "border-white/10 bg-white/10 text-slate-200 hover:bg-white/20"
                      }`}
                    >
                      <SkillLogo skill={skill} size={16} />
                      {selected ? "Added" : "Add"} {skill}
                    </button>
                  );
                })}
                {!canAddCustomSkill && visibleSkills.length === 0 ? (
                  <span className="text-xs text-slate-400">
                    No matching software skills.
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h4 className="text-sm font-semibold text-white">
              Optional screening questions
            </h4>
            <textarea
              rows="4"
              className="mt-3 form-textarea"
              placeholder="Add one question per line (optional)"
              name="screeningQuestions"
              value={form.screeningQuestions}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-6">
            <h4 className="text-sm font-semibold text-white">Live preview</h4>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <p>{form.title || "Untitled project"}</p>
              <p className="text-xs text-slate-400">
                {selectedCategory?.label || "Category"}{" "}
                {form.subcategory ? `· ${form.subcategory}` : ""}
              </p>
              <p className="text-xs text-slate-400">
                Budget{" "}
                {form.projectType === "hourly"
                  ? `${form.currency} ${formatRange(form.hourlyMin, form.hourlyMax, " / hr")}`
                  : `${form.currency} ${formatRange(form.budgetMin, form.budgetMax)}`}
              </p>
              <p className="text-xs text-slate-400">
                Timeline{" "}
                {form.duration ||
                  (form.startDate && form.deadline
                    ? `${form.startDate} to ${form.deadline}`
                    : form.deadline || form.startDate || "Not set")}
              </p>
              <p className="text-xs text-slate-400">
                Skills required: {form.skills.length}
              </p>
            </div>
            {status ? <p className="mt-4 text-sm text-slate-300">{status}</p> : null}
            <Button
              className="mt-6 w-full"
              onClick={handleSubmit}
              disabled={loading || !canPostJobs}
              title={
                canPostJobs
                  ? "Submit job for admin approval"
                  : postJobBlockedMessage
              }
            >
              {loading ? "Submitting..." : "Submit for approval"}
            </Button>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h4 className="text-sm font-semibold text-white">Checklist</h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li>Choose category and work type.</li>
              <li>Explain deliverables and success metrics.</li>
              <li>Set clear budget and duration.</li>
              <li>Add skills freelancers must have.</li>
            </ul>
          </div>
        </div>
      </section>
    </DashboardLayout>
  );
}
