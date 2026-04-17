import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Button from "../../components/Button.jsx";
import SkillLogo from "../../components/SkillLogo.jsx";
import { freelancerNav } from "../../data/nav.js";
import {
  SOFTWARE_SKILLS,
  filterSkillSuggestions,
  getCanonicalSkill,
  hasExactSkillMatch,
  toSkillKey
} from "../../data/skills.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import {
  requestAdminApproval,
  updateUserProfile
} from "../../services/usersService.js";
import {
  getStorageUploadErrorMessage,
  uploadFreelancerGovId,
  uploadFreelancerResume,
  uploadProfilePicture
} from "../../services/storageService.js";
import AvatarUpload from "../../components/AvatarUpload.jsx";
import {
  FREELANCER_REQUIRED_FIELD_LABELS,
  getFreelancerProfileCompletion,
  getFreelancerGovId,
  formatPortfolioLinksForTextarea,
  getFreelancerMissingRequiredFields,
  getFreelancerResume,
  getFreelancerSkills,
  isFreelancerProfileComplete,
  normalizePortfolioLinks
} from "../../utils/freelancerOnboarding.js";
import {
  ACCOUNT_STATUS,
  canRequestAdminApproval,
  normalizeAccountStatus
} from "../../utils/accountStatus.js";

const EXPERIENCE_LEVELS = [
  { value: "entry", label: "Entry level (0-1 years)" },
  { value: "intermediate", label: "Intermediate (2-4 years)" },
  { value: "expert", label: "Expert (5+ years)" }
];

const GOV_ID_TYPES = [
  "Aadhaar",
  "PAN",
  "Passport",
  "Driving License",
  "Voter ID",
  "Other Government ID"
];

const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

const STEP_DEFS = [
  { id: "professional", title: "Professional info" },
  { id: "about", title: "About and links" },
  { id: "resume", title: "Resume upload" },
  { id: "verification", title: "ID verification" },
  { id: "review", title: "Review and submit" }
];

const REQUIRED_FIELDS_BY_STEP = {
  professional: [
    "fullName",
    "phone",
    "profileImage",
    "primarySkills",
    "experience",
    "hourlyRate"
  ],
  about: ["bio", "portfolioLinks"],
  resume: ["resume"],
  verification: [],
  review: []
};

const parseExperienceValue = (value) => {
  const clean = String(value || "").trim().toLowerCase();
  if (!clean) return "";
  if (["entry", "intermediate", "expert"].includes(clean)) return clean;
  if (
    clean.includes("0") ||
    clean.includes("1") ||
    clean.includes("fresher") ||
    clean.includes("junior")
  ) {
    return "entry";
  }
  if (
    clean.includes("2") ||
    clean.includes("3") ||
    clean.includes("4") ||
    clean.includes("mid")
  ) {
    return "intermediate";
  }
  return "expert";
};

const toProfilePayload = (form) => {
  const portfolioLinks = normalizePortfolioLinks(form.portfolioLinksText);
  return {
    name: String(form.name || "").trim(),
    phone: String(form.phone || "").trim(),
    headline: String(form.headline || "").trim(),
    skill: form.primarySkills[0] || "",
    primarySkills: form.primarySkills,
    experience: form.experience,
    bio: String(form.bio || "").trim(),
    about: String(form.bio || "").trim(),
    portfolio: portfolioLinks[0] || "",
    portfolioLinks,
    github: String(form.github || "").trim(),
    linkedin: String(form.linkedin || "").trim(),
    website: String(form.website || "").trim(),
    languages: String(form.languages || "").trim(),
    availability: form.availability,
    hourlyRate: String(form.hourlyRate || "").trim(),
    resume: form.resume ? { name: form.resume.name, url: form.resume.url } : null,
    resumeUrl: form.resume?.url || "",
    govIdType: String(form.govIdType || "").trim(),
    govIdProof: form.govId ? { name: form.govId.name, url: form.govId.url } : null,
    govIdProofUrl: form.govId?.url || "",
    photoURL: form.photoURL || ""
  };
};

export default function FreelancerOnboarding() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, profile } = useAuth();

  const [form, setForm] = useState({
    name: "",
    phone: "",
    headline: "",
    primarySkills: [],
    experience: "",
    bio: "",
    portfolioLinksText: "",
    github: "",
    linkedin: "",
    website: "",
    languages: "",
    availability: "full_time",
    hourlyRate: "",
    resume: null,
    govIdType: "",
    govId: null,
    photoURL: ""
  });
  const [step, setStep] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [resumeUploadProgress, setResumeUploadProgress] = useState(0);
  const [uploadingGovId, setUploadingGovId] = useState(false);
  const [govIdUploadProgress, setGovIdUploadProgress] = useState(0);
  const [skillsQuery, setSkillsQuery] = useState("");
  const [missingFields, setMissingFields] = useState(new Set());
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name || "",
      phone: profile.phone || profile.contactPhone || "",
      headline: profile.headline || "",
      primarySkills: getFreelancerSkills(profile),
      experience: parseExperienceValue(profile.experience),
      bio: profile.bio || "",
      portfolioLinksText: formatPortfolioLinksForTextarea(
        profile.portfolioLinks || profile.portfolio
      ),
      github: profile.github || "",
      linkedin: profile.linkedin || "",
      website: profile.website || "",
      languages: profile.languages || "",
      availability: profile.availability || "full_time",
      hourlyRate: profile.hourlyRate || "",
      resume: getFreelancerResume(profile),
      govIdType: profile.govIdType || "",
      govId: getFreelancerGovId(profile),
      photoURL: profile.photoURL || profile.profileImage || ""
    });
    const nextStep = Number(profile.freelancerOnboardingStep);
    if (Number.isFinite(nextStep)) {
      setStep(Math.min(Math.max(nextStep, 0), STEP_DEFS.length - 1));
    } else {
      setStep(0);
    }
  }, [profile]);

  const visibleSkills = useMemo(
    () =>
      filterSkillSuggestions({
        query: skillsQuery,
        selectedSkills: form.primarySkills,
        skillLibrary: SOFTWARE_SKILLS
      }),
    [skillsQuery, form.primarySkills]
  );

  const customSkillLabel = skillsQuery.trim();
  const canAddCustomSkill = useMemo(() => {
    const queryKey = toSkillKey(customSkillLabel);
    if (!queryKey) return false;
    const alreadySelected = form.primarySkills.some(
      (skill) => toSkillKey(skill) === queryKey
    );
    if (alreadySelected) return false;
    return !hasExactSkillMatch(customSkillLabel, SOFTWARE_SKILLS);
  }, [customSkillLabel, form.primarySkills]);

  const draftProfile = useMemo(() => {
    return { ...(profile || {}), ...toProfilePayload(form), role: "freelancer" };
  }, [form, profile]);

  const completionSummary = useMemo(
    () => getFreelancerProfileCompletion(draftProfile),
    [draftProfile]
  );
  const missingRequiredFields = completionSummary.missingFields;
  const isComplete = completionSummary.percent === 100;
  const currentStepKey = STEP_DEFS[step].id;
  const currentStepRequired = REQUIRED_FIELDS_BY_STEP[currentStepKey];
  const currentStepMissing = currentStepRequired.filter((key) =>
    missingRequiredFields.includes(key)
  );
  const totalRequired = completionSummary.total;
  const completionPercent = completionSummary.percent;
  const normalizedStatus = normalizeAccountStatus(profile?.status);
  const isPendingApproval = normalizedStatus === ACCOUNT_STATUS.PENDING_APPROVAL;
  const isApproved = normalizedStatus === ACCOUNT_STATUS.APPROVED;
  const canRequestApprovalNow =
    completionPercent === 100 &&
    canRequestAdminApproval({
      ...(profile || {}),
      role: "freelancer",
      profileCompletion: completionPercent
    });

  const isMissing = (field) => missingFields.has(field);
  const fieldClass = (field, base) =>
    `${base} ${isMissing(field)
      ? "border-rose-400/60 focus:ring-rose-400/30 focus:border-rose-300"
      : ""
    }`;

  const clearFieldError = (field) => {
    setMissingFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  const persistDraft = async ({ nextStep, submitForReview, customForm }) => {
    if (!user) return false;
    setSaving(true);
    setStatusMessage("");
    try {
      const payload = toProfilePayload(customForm || form);
      const merged = { ...draftProfile, ...payload, role: "freelancer" };
      const profileCompleted = isFreelancerProfileComplete(merged);
      const nextSubmitted = submitForReview
        ? profileCompleted
        : Boolean(profile?.freelancerOnboardingSubmitted && profileCompleted);
      await updateUserProfile(user.uid, {
        ...payload,
        freelancerProfileCompleted: profileCompleted,
        freelancerOnboardingSubmitted: nextSubmitted,
        freelancerOnboardingStep: nextStep,
        freelancerOnboardingSubmittedAt: nextSubmitted
          ? profile?.freelancerOnboardingSubmittedAt || new Date().toISOString()
          : null
      });
      return true;
    } catch (err) {
      const message = err?.message || "Failed to save profile draft.";
      setStatusMessage(message);
      toast.error(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const goToNextStep = async () => {
    if (currentStepMissing.length > 0) {
      setMissingFields(new Set(currentStepMissing));
      setStatusMessage("Complete required fields to continue.");
      toast.error("Complete required fields to continue.");
      return;
    }
    const nextStep = Math.min(step + 1, STEP_DEFS.length - 1);
    const saved = await persistDraft({ nextStep, submitForReview: false });
    if (!saved) return;
    setStep(nextStep);
    setStatusMessage("Draft saved.");
    toast.success("Draft saved.");
  };

  const saveAndExit = async () => {
    const saved = await persistDraft({
      nextStep: step,
      submitForReview: false
    });
    if (!saved) return;
    toast.success("Draft saved. Complete remaining steps to apply for jobs.");
    navigate("/freelancer/dashboard");
  };

  const submitForAdminReview = async () => {
    if (!isComplete) {
      setMissingFields(new Set(missingRequiredFields));
      setStatusMessage("Complete all required details before submitting for review.");
      toast.error("Complete all required details before submitting.");
      return;
    }
    if (!canRequestApprovalNow) {
      if (isPendingApproval) {
        setStatusMessage("🚫 Admin approval required before applying to jobs.");
        toast.permission("🚫 Admin approval required before applying to jobs.");
        return;
      }
      if (isApproved) {
        setStatusMessage("Account already approved. You can apply for jobs.");
        toast.success("Account already approved.");
        return;
      }
    }
    const saved = await persistDraft({
      nextStep: STEP_DEFS.length - 1,
      submitForReview: true
    });
    if (!saved) return;
    setSaving(true);
    try {
      await requestAdminApproval(user.uid);
      setStatusMessage(
        "⏳ Your profile is under admin review. You can apply for jobs only after approval."
      );
      toast.success("Approval request sent to admin.");
    } catch (err) {
      const message = err?.message || "Failed to request admin approval.";
      setStatusMessage(message);
      toast.error(message);
      return;
    } finally {
      setSaving(false);
    }
    navigate("/freelancer/dashboard");
  };


  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    clearFieldError(name);
  };

  const handleSkillAdd = (skillValue) => {
    const skill = getCanonicalSkill(skillValue, SOFTWARE_SKILLS);
    const skillKey = toSkillKey(skill);
    if (!skillKey) return;
    setForm((prev) => {
      if (prev.primarySkills.some((entry) => toSkillKey(entry) === skillKey)) {
        return prev;
      }
      return { ...prev, primarySkills: [...prev.primarySkills, skill] };
    });
    clearFieldError("primarySkills");
    setSkillsQuery("");
  };

  const handleSkillRemove = (skill) => {
    const skillKey = toSkillKey(skill);
    setForm((prev) => ({
      ...prev,
      primarySkills: prev.primarySkills.filter(
        (entry) => toSkillKey(entry) !== skillKey
      )
    }));
    setMissingFields((prev) => {
      const next = new Set(prev);
      if (form.primarySkills.length - 1 < 3) {
        next.add("primarySkills");
      }
      return next;
    });
  };

  const handleSkillKey = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const cleaned = skillsQuery.trim();
    if (!cleaned) return;
    handleSkillAdd(cleaned);
  };

  const handleResumeUpload = async (event) => {
    if (!user) {
      const message = "Sign in again before uploading files.";
      setStatusMessage(message);
      toast.error(message);
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) {
      setStatusMessage("");
      return;
    }
    setStatusMessage("");
    const validMime = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    const ext = file.name.split(".").pop()?.toLowerCase();
    const validExt = ["pdf", "doc", "docx"];
    if (!validMime.includes(file.type) && !validExt.includes(ext)) {
      const message = "Upload PDF, DOC, or DOCX format.";
      setStatusMessage(message);
      toast.error(message);
      event.target.value = "";
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      const message = "Resume must be 20MB or smaller.";
      setStatusMessage(message);
      toast.error(message);
      event.target.value = "";
      return;
    }
    setUploadingResume(true);
    setResumeUploadProgress(0);
    setStatusMessage("Uploading resume...");
    try {
      const url = await uploadFreelancerResume({
        uid: user.uid,
        file,
        onProgress: (percent) => setResumeUploadProgress(percent)
      });
      setForm((prev) => ({
        ...prev,
        resume: { name: file.name, url }
      }));
      clearFieldError("resume");
      setStatusMessage("Resume uploaded.");
      toast.success("Resume uploaded.");
    } catch (err) {
      const baseMessage = getStorageUploadErrorMessage(
        err,
        "Failed to upload resume."
      );
      const code = String(err?.code || "").trim();
      const message =
        code && !baseMessage.includes(code) ? `${baseMessage} (${code})` : baseMessage;
      setStatusMessage(message);
      toast.error(message);
    } finally {
      setUploadingResume(false);
      setResumeUploadProgress(0);
      event.target.value = "";
    }
  };

  const handleRemoveResume = () => {
    setForm((prev) => ({ ...prev, resume: null }));
    setMissingFields((prev) => new Set([...prev, "resume"]));
  };

  const handleGovIdUpload = async (event) => {
    if (!user) {
      const message = "Sign in again before uploading files.";
      setStatusMessage(message);
      toast.error(message);
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) {
      setStatusMessage("");
      return;
    }
    setStatusMessage("");
    const validMime = [
      "application/pdf",
      "image/jpg",
      "image/pjpeg",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
      "image/bmp",
      "image/heic",
      "image/heif"
    ];
    const ext = file.name.split(".").pop()?.toLowerCase();
    const validExt = [
      "pdf",
      "jpg",
      "jpeg",
      "jfif",
      "png",
      "webp",
      "avif",
      "bmp",
      "heic",
      "heif"
    ];
    if (!validMime.includes(file.type) && !validExt.includes(ext)) {
      const message = "Upload PDF, JPG, JFIF, PNG, WEBP, AVIF, BMP, HEIC, or HEIF format.";
      setStatusMessage(message);
      toast.error(message);
      event.target.value = "";
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      const message = "Government ID file must be 20MB or smaller.";
      setStatusMessage(message);
      toast.error(message);
      event.target.value = "";
      return;
    }
    setUploadingGovId(true);
    setGovIdUploadProgress(0);
    setStatusMessage("Uploading Government ID...");
    try {
      const url = await uploadFreelancerGovId({
        uid: user.uid,
        file,
        onProgress: (percent) => setGovIdUploadProgress(percent)
      });
      setForm((prev) => ({
        ...prev,
        govId: { name: file.name, url }
      }));
      clearFieldError("govId");
      setStatusMessage("Government ID uploaded.");
      toast.success("Government ID uploaded.");
    } catch (err) {
      const baseMessage = getStorageUploadErrorMessage(
        err,
        "Failed to upload Government ID."
      );
      const code = String(err?.code || "").trim();
      const message =
        code && !baseMessage.includes(code) ? `${baseMessage} (${code})` : baseMessage;
      setStatusMessage(message);
      toast.error(message);
    } finally {
      setUploadingGovId(false);
      setGovIdUploadProgress(0);
      event.target.value = "";
    }
  };

  const handleRemoveGovId = () => {
    setForm((prev) => ({ ...prev, govId: null }));
    setMissingFields((prev) => new Set([...prev, "govId"]));
  };

  return (
    <DashboardLayout
      title="Freelancer Onboarding"
      sidebar={{
        title: "Growlanzer",
        subtitle: "Freelancer",
        items: freelancerNav
      }}
    >
      <PageHeader
        title="Complete freelancer profile setup"
        description="Complete all steps to unlock job applications after admin review."
      />

      {isApproved ? (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Admin already approved your account. Keep details updated.
        </div>
      ) : isPendingApproval ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          ⏳ Your profile is under admin review. You can apply for jobs only after approval.
        </div>
      ) : canRequestApprovalNow ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          All required fields are complete. Request admin approval to unlock job applications.
        </div>
      ) : (
        <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          ⚠️ Complete 100% profile details to request admin approval and apply for jobs.
        </div>
      )}

      <div className="glass-card rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Progress
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Step {step + 1} of {STEP_DEFS.length}: {STEP_DEFS[step].title}
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
            {completionPercent}% complete
          </span>
        </div>
        <div className="mt-4 h-2 rounded-full bg-white/10">
          <div
            className="h-2 rounded-full bg-glow-cyan"
            style={{ width: `${completionPercent}%` }}
          />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {STEP_DEFS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStep(index)}
              className={`rounded-xl border px-3 py-2 text-left text-xs transition ${index === step
                ? "border-glow-cyan/40 bg-white/10 text-white"
                : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
                }`}
            >
              {index + 1}. {item.title}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6">
        <div className="mb-8">
          <AvatarUpload
            currentPhotoURL={form.photoURL}
            onUploadSuccess={async (url) => {
              const updated = { ...form, photoURL: url };
              setForm(updated);
              clearFieldError("profileImage");
              // Sync to DB immediately using the updated state to avoid race condition
              const saved = await persistDraft({
                nextStep: step,
                submitForReview: false,
                customForm: updated
              });
              if (!saved) {
                throw new Error("Failed to save profile photo to profile.");
              }
            }}
            initial={form.name?.[0]?.toUpperCase() || profile?.name?.[0]?.toUpperCase() || "F"}
          />
        </div>

        {currentStepKey === "professional" ? (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <input
                className={fieldClass("fullName", "form-input")}
                placeholder="Full name *"
                name="name"
                value={form.name}
                onChange={(event) => {
                  handleChange(event);
                  clearFieldError("fullName");
                }}
              />
              <input
                className={fieldClass("phone", "form-input")}
                placeholder="Phone number *"
                name="phone"
                value={form.phone}
                onChange={handleChange}
              />
              <input
                className="form-input"
                placeholder="Professional title (optional)"
                name="headline"
                value={form.headline}
                onChange={handleChange}
              />
              <select
                className={fieldClass("experience", "form-select")}
                name="experience"
                value={form.experience}
                onChange={handleChange}
              >
                <option value="">Select experience level *</option>
                {EXPERIENCE_LEVELS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                className={fieldClass("hourlyRate", "form-input")}
                placeholder="Hourly rate * (e.g., INR 1500/hr)"
                name="hourlyRate"
                value={form.hourlyRate}
                onChange={handleChange}
              />
              <select
                className="form-select"
                name="availability"
                value={form.availability}
                onChange={handleChange}
              >
                <option value="full_time">Full-time availability</option>
                <option value="part_time">Part-time availability</option>
                <option value="hourly">Hourly availability</option>
                <option value="project_based">Project-based availability</option>
              </select>
              <div className="lg:col-span-2">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Skills (multi-select) *
                </p>
                <div className={fieldClass("primarySkills", "mt-3 form-surface px-4 py-3")}>
                  <input
                    className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
                    placeholder="Type software skill (React, Python, AWS) and press Enter"
                    value={skillsQuery}
                    onChange={(event) => setSkillsQuery(event.target.value)}
                    onKeyDown={handleSkillKey}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {form.primarySkills.length === 0 ? (
                    <span className="text-xs text-slate-500">
                      Add at least 3 skills.
                    </span>
                  ) : (
                    form.primarySkills.map((skill) => (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => handleSkillRemove(skill)}
                        className="flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100 hover:bg-emerald-500/20"
                      >
                        <SkillLogo skill={skill} size={16} />
                        {skill}
                        <span>×</span>
                      </button>
                    ))
                  )}
                </div>
                {form.primarySkills.length > 0 && form.primarySkills.length < 3 ? (
                  <p className="mt-2 text-xs text-amber-200">
                    Add {3 - form.primarySkills.length} more skill
                    {3 - form.primarySkills.length === 1 ? "" : "s"} to reach minimum 3.
                  </p>
                ) : null}
                <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-night-800/60 p-3">
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
                      const isSelected = form.primarySkills.includes(skill);
                      return (
                        <button
                          key={skill}
                          type="button"
                          disabled={isSelected}
                          onClick={() => handleSkillAdd(skill)}
                          className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${isSelected
                            ? "cursor-not-allowed border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
                            : "border-white/10 bg-white/10 text-slate-200 hover:bg-white/20"
                            }`}
                        >
                          <SkillLogo skill={skill} size={16} />
                          <span>{isSelected ? "Added" : "Add"}</span>
                          <span>{skill}</span>
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
            </div>
          </>
        ) : null}

        {currentStepKey === "about" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <textarea
              rows="6"
              className={fieldClass("bio", "lg:col-span-2 form-textarea")}
              placeholder="Bio / About *"
              name="bio"
              value={form.bio}
              onChange={handleChange}
            />
            <textarea
              rows="5"
              className={fieldClass("portfolioLinks", "lg:col-span-2 form-textarea")}
              placeholder="Portfolio links * (one per line)"
              name="portfolioLinksText"
              value={form.portfolioLinksText}
              onChange={(event) => {
                handleChange(event);
                clearFieldError("portfolioLinks");
              }}
            />
            <input
              className="form-input"
              placeholder="GitHub link (optional)"
              name="github"
              value={form.github}
              onChange={handleChange}
            />
            <input
              className="form-input"
              placeholder="LinkedIn link (optional)"
              name="linkedin"
              value={form.linkedin}
              onChange={handleChange}
            />
            <input
              className="form-input"
              placeholder="Personal website (optional)"
              name="website"
              value={form.website}
              onChange={handleChange}
            />
            <input
              className="form-input"
              placeholder="Languages (optional, comma separated)"
              name="languages"
              value={form.languages}
              onChange={handleChange}
            />
          </div>
        ) : null}

        {currentStepKey === "resume" ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Upload your resume in PDF/DOC/DOCX format. Max size 20MB.
            </p>
            <div className={fieldClass("resume", "form-surface rounded-2xl px-4 py-4")}>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleResumeUpload}
                disabled={uploadingResume}
                className="w-full text-sm text-slate-200"
              />
            </div>
            {uploadingResume ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-300">
                  Uploading resume: {resumeUploadProgress}%
                </p>
                <div className="h-2 rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full bg-glow-cyan transition-all"
                    style={{ width: `${resumeUploadProgress}%` }}
                  />
                </div>
              </div>
            ) : null}
            {form.resume ? (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                <p className="font-medium text-white">Uploaded resume</p>
                <a
                  href={form.resume.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block truncate text-slate-200 underline"
                >
                  {form.resume.name}
                </a>
                <Button className="mt-3" variant="ghost" onClick={handleRemoveResume}>
                  Remove resume
                </Button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No resume uploaded yet.</p>
            )}
          </div>
        ) : null}

        {currentStepKey === "verification" ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Upload any Government ID proof for KYC verification (Aadhaar, PAN, Passport, Driving License, Voter ID, etc.).
            </p>
            <p className="text-xs text-slate-400">
              Allowed formats: PDF, JPG, JFIF, PNG, WEBP, AVIF, BMP, HEIC, HEIF. Max size 20MB.
            </p>
            <select
              className={fieldClass("govId", "form-select")}
              name="govIdType"
              value={form.govIdType}
              onChange={handleChange}
            >
              <option value="">Select Government ID type (optional)</option>
              {GOV_ID_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <div className={fieldClass("govId", "form-surface rounded-2xl px-4 py-4")}>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.jfif,.png,.webp,.avif,.bmp,.heic,.heif"
                onChange={handleGovIdUpload}
                disabled={uploadingGovId}
                className="w-full text-sm text-slate-200"
              />
            </div>
            {uploadingGovId ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-300">
                  Uploading Government ID: {govIdUploadProgress}%
                </p>
                <div className="h-2 rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full bg-glow-cyan transition-all"
                    style={{ width: `${govIdUploadProgress}%` }}
                  />
                </div>
              </div>
            ) : null}
            {form.govId ? (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                <p className="font-medium text-white">Uploaded Government ID</p>
                {form.govIdType ? (
                  <p className="mt-1 text-xs text-slate-400">Type: {form.govIdType}</p>
                ) : null}
                <a
                  href={form.govId.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block truncate text-slate-200 underline"
                >
                  {form.govId.name}
                </a>
                <Button className="mt-3" variant="ghost" onClick={handleRemoveGovId}>
                  Remove ID proof
                </Button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No Government ID proof uploaded yet.</p>
            )}
          </div>
        ) : null}

        {currentStepKey === "review" ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Review your details. Request admin approval to unlock job applications.
            </p>
            <div className="flex flex-col gap-1 mb-6 p-4 rounded-2xl border border-white/5 bg-white/5">
              <p className="text-sm font-bold text-white">{form.name || "Unnamed Freelancer"}</p>
              <p className="text-xs text-slate-400">{form.headline || "No headline set"}</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {Object.entries(FREELANCER_REQUIRED_FIELD_LABELS).map(([key, label]) => {
                const missing = missingRequiredFields.includes(key);
                return (
                  <div
                    key={key}
                    className={`rounded-xl border px-4 py-3 text-sm ${missing
                      ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
                      : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                      }`}
                  >
                    {missing ? "Missing" : "Done"} - {label}
                  </div>
                );
              })}
            </div>
            {!isComplete ? (
              <p className="text-xs text-rose-200">
                Complete all required items to submit for admin review.
              </p>
            ) : (
              <p className="text-xs text-emerald-200">
                All required items are complete. You can submit now.
              </p>
            )}
          </div>
        ) : null}

        {statusMessage ? <p className="mt-4 text-sm text-slate-300">{statusMessage}</p> : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {step > 0 ? (
            <Button
              variant="ghost"
              onClick={() => setStep((prev) => Math.max(prev - 1, 0))}
              disabled={saving || uploadingResume || uploadingGovId}
            >
              Back
            </Button>
          ) : null}

          {currentStepKey !== "review" ? (
            <>
              <Button onClick={goToNextStep} disabled={saving || uploadingResume || uploadingGovId}>
                {saving ? "Saving..." : "Save and next"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={saveAndExit}
                disabled={saving || uploadingResume || uploadingGovId}
              >
                Save draft
              </Button>
              <Button
                onClick={submitForAdminReview}
                disabled={
                  saving || uploadingResume || uploadingGovId || !canRequestApprovalNow
                }
                title={
                  canRequestApprovalNow
                    ? "Request admin approval"
                    : isPendingApproval
                      ? "Approval request is already pending"
                      : isApproved
                        ? "Account is already approved"
                        : "Complete all required fields first"
                }
              >
                {saving ? "Submitting..." : "Request Admin Approval"}
              </Button>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}


