import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Button from "../../components/Button.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import SkillLogo from "../../components/SkillLogo.jsx";
import UserProfileLink from "../../components/UserProfileLink.jsx";
import { freelancerNav } from "../../data/nav.js";
import {
  SOFTWARE_SKILLS,
  filterSkillSuggestions,
  getCanonicalSkill,
  toSkillKey
} from "../../data/skills.js";
import { submitProposal } from "../../services/marketplaceFlowApi.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { collection, query, where } from "firebase/firestore";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { getUserProfile } from "../../services/usersService.js";
import { toggleSavedJob } from "../../services/savedJobsService.js";
import { getFreelancerProfileCompletion } from "../../utils/freelancerOnboarding.js";
import {
  ACCOUNT_STATUS,
  canFreelancerApplyJob,
  getFreelancerApplyBlockedMessage,
  normalizeAccountStatus
} from "../../utils/accountStatus.js";

const PROJECT_TYPE_FILTERS = [
  { value: "all", label: "All project types" },
  { value: "fixed", label: "Fixed price" },
  { value: "hourly", label: "Hourly" }
];

const EXPERIENCE_FILTERS = [
  { value: "all", label: "All experience levels" },
  { value: "entry", label: "Entry" },
  { value: "intermediate", label: "Intermediate" },
  { value: "expert", label: "Expert" }
];

const SCOPE_FILTERS = [
  { value: "all", label: "All scopes" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" }
];

const DURATION_FILTERS = [
  { value: "all", label: "Any duration" },
  { value: "short", label: "Up to 1 month" },
  { value: "medium", label: "1-3 months" },
  { value: "long", label: "3+ months" }
];

const JOB_TYPE_FILTERS = [
  { value: "all", label: "All job types" },
  { value: "one_time", label: "One-time" },
  { value: "ongoing", label: "Ongoing" }
];

const PRIORITY_FILTERS = [
  { value: "all", label: "All priorities" },
  { value: "standard", label: "Standard" },
  { value: "urgent", label: "Urgent" }
];

const NDA_FILTERS = [
  { value: "all", label: "NDA any" },
  { value: "required", label: "NDA required" },
  { value: "not_required", label: "NDA not required" }
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "deadline_soon", label: "Deadline soon" },
  { value: "budget_high", label: "Budget high to low" },
  { value: "budget_low", label: "Budget low to high" }
];

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

const formatProposalBid = (proposal, job) => {
  if (!proposal?.bidAmount) return "Bid not provided";
  const currency = proposal.currency || job?.currency || "INR";
  const suffix = proposal.bidType === "hourly" ? " / hr" : "";
  return `${currency} ${proposal.bidAmount}${suffix}`;
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

const truncate = (value, max = 160) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const toSafeLinks = (value) =>
  toStringList(value).filter((item) => /^https?:\/\/\S+$/i.test(item));

const getCreatedAtTime = (value) => {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 0;
  return date.getTime();
};

const toAmount = (value) => {
  const cleaned = String(value || "")
    .replace(/[, ]+/g, "")
    .replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
};

const getJobBudgetBounds = (job) => {
  let min = null;
  let max = null;
  if (job?.projectType === "hourly") {
    min = toAmount(job?.hourlyMin);
    max = toAmount(job?.hourlyMax);
  } else {
    min = toAmount(job?.budgetMin);
    max = toAmount(job?.budgetMax);
  }
  if (min == null && max == null && job?.budget) {
    const numbers = String(job.budget)
      .replace(/,/g, "")
      .match(/\d+(\.\d+)?/g);
    if (numbers?.length) {
      min = toAmount(numbers[0]);
      max = toAmount(numbers[1] || numbers[0]);
    }
  }
  return { min, max, hasAny: min != null || max != null };
};

const getBudgetSortValue = (job) => {
  const { min, max } = getJobBudgetBounds(job);
  if (max != null) return max;
  if (min != null) return min;
  return 0;
};

const getDurationWeeks = (value) => {
  const text = normalizeText(value);
  if (!text) return null;
  const matches = [...text.matchAll(/\d+(\.\d+)?/g)].map((item) =>
    Number(item[0])
  );
  if (matches.length === 0) return null;
  const avg = matches.reduce((sum, num) => sum + num, 0) / matches.length;
  if (text.includes("day")) return avg / 7;
  if (text.includes("week")) return avg;
  if (text.includes("month")) return avg * 4;
  if (text.includes("year")) return avg * 52;
  return null;
};

const getDurationBucket = (job) => {
  const weeks = getDurationWeeks(job?.duration || job?.timeline || "");
  if (weeks == null) return "unknown";
  if (weeks <= 4) return "short";
  if (weeks <= 12) return "medium";
  return "long";
};

const getDeadlineTime = (value) => {
  if (!value) return Number.POSITIVE_INFINITY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return date.getTime();
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

export default function FreelancerJobs() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const normalizedStatus = normalizeAccountStatus(profile?.status);
  const isApproved = normalizedStatus === ACCOUNT_STATUS.APPROVED;
  const canBrowseJobs = Boolean(user);
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
  const { data: jobs = [], loading } = useFirestoreQuery(
    () =>
      canBrowseJobs
        ? query(collection(db, "jobs"), where("status", "==", "approved"))
        : null,
    [canBrowseJobs]
  );
  const { data: myProposals = [] } = useFirestoreQuery(
    () =>
      user
        ? query(
            collection(db, "proposals"),
            where("freelancerId", "==", user.uid)
          )
        : null,
    [user]
  );
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [proposalForm, setProposalForm] = useState(PROPOSAL_DEFAULT);
  const [missingFields, setMissingFields] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [projectTypeFilter, setProjectTypeFilter] = useState("all");
  const [jobTypeFilter, setJobTypeFilter] = useState("all");
  const [experienceFilter, setExperienceFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [durationFilter, setDurationFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [communicationFilter, setCommunicationFilter] = useState("all");
  const [ndaFilter, setNdaFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [budgetMinFilter, setBudgetMinFilter] = useState("");
  const [budgetMaxFilter, setBudgetMaxFilter] = useState("");
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [skillFilterQuery, setSkillFilterQuery] = useState("");
  const [onlyNotApplied, setOnlyNotApplied] = useState(false);
  const [onlyApplied, setOnlyApplied] = useState(false);
  const [onlySaved, setOnlySaved] = useState(false);
  const [savingJobId, setSavingJobId] = useState("");
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  useEffect(() => {
    if (!isFiltersOpen || typeof document === "undefined") return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFiltersOpen]);

  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const aTime = getCreatedAtTime(a?.createdAt);
      const bTime = getCreatedAtTime(b?.createdAt);
      return bTime - aTime;
    });
  }, [jobs]);

  const myProposalsByJob = useMemo(() => {
    const map = new Map();
    myProposals.forEach((proposal) => {
      if (!map.has(proposal.jobId)) {
        map.set(proposal.jobId, proposal);
      }
    });
    return map;
  }, [myProposals]);
  const savedJobIds = useMemo(() => {
    const list = Array.isArray(profile?.savedJobIds) ? profile.savedJobIds : [];
    return new Set(
      list.map((entry) => String(entry || "").trim()).filter(Boolean)
    );
  }, [profile?.savedJobIds]);
  const savedJobsCount = useMemo(() => {
    return sortedJobs.filter((job) => savedJobIds.has(String(job?.id || ""))).length;
  }, [savedJobIds, sortedJobs]);
  const appliedJobsCount = myProposalsByJob.size;

  const categoryOptions = useMemo(() => {
    const set = new Set();
    sortedJobs.forEach((job) => {
      const category = String(job?.category || "").trim();
      if (category) set.add(category);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [sortedJobs]);

  const locationOptions = useMemo(() => {
    const set = new Set();
    sortedJobs.forEach((job) => {
      const location = String(job?.location || "").trim();
      if (location) set.add(location);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [sortedJobs]);

  const communicationOptions = useMemo(() => {
    const set = new Set();
    sortedJobs.forEach((job) => {
      const communication = String(job?.communication || "").trim();
      if (communication) set.add(communication);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [sortedJobs]);

  const skillFilterOptions = useMemo(() => {
    const set = new Set();
    sortedJobs.forEach((job) => {
      if (!Array.isArray(job?.skills)) return;
      job.skills.forEach((skill) => {
        const label = String(skill || "").trim();
        if (label) set.add(label);
      });
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [sortedJobs]);

  const skillFilterLibrary = useMemo(() => {
    const set = new Set();
    SOFTWARE_SKILLS.forEach((skill) => set.add(skill));
    skillFilterOptions.forEach((skill) => set.add(skill));
    selectedSkills.forEach((skill) => set.add(skill));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [selectedSkills, skillFilterOptions]);

  const visibleSkillFilterOptions = useMemo(
    () =>
      filterSkillSuggestions({
        query: skillFilterQuery,
        selectedSkills: [],
        skillLibrary: skillFilterLibrary,
        limit: 120
      }),
    [skillFilterLibrary, skillFilterQuery]
  );

  const selectedSkillKeys = useMemo(
    () =>
      new Set(
        selectedSkills.map((skill) => toSkillKey(skill)).filter(Boolean)
      ),
    [selectedSkills]
  );

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (String(searchQuery || "").trim()) count += 1;
    if (categoryFilter !== "all") count += 1;
    if (projectTypeFilter !== "all") count += 1;
    if (jobTypeFilter !== "all") count += 1;
    if (experienceFilter !== "all") count += 1;
    if (scopeFilter !== "all") count += 1;
    if (durationFilter !== "all") count += 1;
    if (priorityFilter !== "all") count += 1;
    if (locationFilter !== "all") count += 1;
    if (communicationFilter !== "all") count += 1;
    if (ndaFilter !== "all") count += 1;
    if (sortBy !== "newest") count += 1;
    if (String(budgetMinFilter || "").trim()) count += 1;
    if (String(budgetMaxFilter || "").trim()) count += 1;
    if (selectedSkills.length > 0) count += 1;
    if (onlyNotApplied) count += 1;
    if (onlyApplied) count += 1;
    if (onlySaved) count += 1;
    return count;
  }, [
    budgetMaxFilter,
    budgetMinFilter,
    categoryFilter,
    communicationFilter,
    durationFilter,
    experienceFilter,
    jobTypeFilter,
    locationFilter,
    ndaFilter,
    onlyApplied,
    onlyNotApplied,
    onlySaved,
    priorityFilter,
    projectTypeFilter,
    scopeFilter,
    searchQuery,
    selectedSkills,
    sortBy
  ]);

  const filteredJobs = useMemo(() => {
    const text = normalizeText(searchQuery);
    const minBudget = toAmount(budgetMinFilter);
    const maxBudget = toAmount(budgetMaxFilter);
    const filtered = sortedJobs.filter((job) => {
      if (text) {
        const skillText = Array.isArray(job?.skills) ? job.skills.join(" ") : "";
        const haystack = normalizeText(
          [
            job?.title,
            job?.category,
            job?.subcategory,
            job?.description,
            job?.deliverables,
            job?.successMetrics,
            job?.location,
            job?.duration,
            job?.timeline,
            job?.jobType,
            job?.priority,
            job?.communication,
            toStringList(job?.screeningQuestions).join(" "),
            skillText
          ].join(" ")
        );
        if (!haystack.includes(text)) return false;
      }

      if (categoryFilter !== "all" && String(job?.category || "") !== categoryFilter) {
        return false;
      }
      if (projectTypeFilter !== "all" && (job?.projectType || "") !== projectTypeFilter) {
        return false;
      }
      if (jobTypeFilter !== "all" && (job?.jobType || "") !== jobTypeFilter) {
        return false;
      }
      if (
        experienceFilter !== "all" &&
        (job?.experienceLevel || "") !== experienceFilter
      ) {
        return false;
      }
      if (scopeFilter !== "all" && (job?.scope || "") !== scopeFilter) {
        return false;
      }
      if (durationFilter !== "all" && getDurationBucket(job) !== durationFilter) {
        return false;
      }
      if (priorityFilter !== "all" && (job?.priority || "standard") !== priorityFilter) {
        return false;
      }
      if (locationFilter !== "all" && (job?.location || "") !== locationFilter) {
        return false;
      }
      if (
        communicationFilter !== "all" &&
        (job?.communication || "") !== communicationFilter
      ) {
        return false;
      }
      if (ndaFilter === "required" && !job?.ndaRequired) {
        return false;
      }
      if (ndaFilter === "not_required" && job?.ndaRequired) {
        return false;
      }

      if (selectedSkills.length > 0) {
        const jobSkills = Array.isArray(job?.skills)
          ? job.skills.map((skill) => normalizeText(skill))
          : [];
        const matchesAnySkill = selectedSkills.some((skill) =>
          jobSkills.includes(normalizeText(skill))
        );
        if (!matchesAnySkill) return false;
      }

      if (onlyNotApplied && myProposalsByJob.has(job.id)) {
        return false;
      }
      if (onlyApplied && !myProposalsByJob.has(job.id)) {
        return false;
      }

      if (onlySaved && !savedJobIds.has(String(job.id || ""))) {
        return false;
      }

      if (minBudget != null || maxBudget != null) {
        const { min, max, hasAny } = getJobBudgetBounds(job);
        if (!hasAny) return false;
        const lower = min ?? max ?? 0;
        const upper = max ?? min ?? 0;
        if (minBudget != null && upper < minBudget) return false;
        if (maxBudget != null && lower > maxBudget) return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      if (sortBy === "deadline_soon") {
        const deadlineDiff = getDeadlineTime(a?.deadline) - getDeadlineTime(b?.deadline);
        if (deadlineDiff !== 0) return deadlineDiff;
      } else if (sortBy === "budget_high") {
        const diff = getBudgetSortValue(b) - getBudgetSortValue(a);
        if (diff !== 0) return diff;
      } else if (sortBy === "budget_low") {
        const diff = getBudgetSortValue(a) - getBudgetSortValue(b);
        if (diff !== 0) return diff;
      }
      return getCreatedAtTime(b?.createdAt) - getCreatedAtTime(a?.createdAt);
    });

    return filtered;
  }, [
    budgetMaxFilter,
    budgetMinFilter,
    categoryFilter,
    durationFilter,
    experienceFilter,
    jobTypeFilter,
    locationFilter,
    communicationFilter,
    myProposalsByJob,
    ndaFilter,
    onlyApplied,
    onlyNotApplied,
    onlySaved,
    priorityFilter,
    projectTypeFilter,
    scopeFilter,
    searchQuery,
    savedJobIds,
    selectedSkills,
    sortBy,
    sortedJobs
  ]);

  const { data: jobProposals = [] } = useFirestoreQuery(
    () =>
      selectedJob?.id && user
        ? query(
            collection(db, "proposals"),
            where("jobId", "==", selectedJob.id),
            where("freelancerId", "==", user.uid)
          )
        : null,
    [selectedJob, user]
  );
  const selectedProposal = selectedJob
    ? myProposalsByJob.get(selectedJob.id)
    : null;
  const screeningEntries = selectedProposal
    ? Object.entries(selectedProposal.screeningAnswers || {})
    : [];
  const activeJobReferenceLinks = toSafeLinks(activeJob?.referenceLinks);
  const activeJobAssetsLink = toSafeLinks(activeJob?.assetsLink)[0] || "";
  const selectedJobReferenceLinks = toSafeLinks(selectedJob?.referenceLinks);
  const selectedJobAssetsLink = toSafeLinks(selectedJob?.assetsLink)[0] || "";
  const selectedJobScreeningQuestions = toStringList(selectedJob?.screeningQuestions);

  const openApply = useCallback((job) => {
    if (!canApplyJobs) {
      const message = applyBlockedMessage;
      setStatus(message);
      toast.permission(message);
      return;
    }
    setActiveJob(job);
    setSelectedJob(null);
    setProposalForm(buildFormForJob(job));
    setMissingFields(new Set());
    setStatus("");
  }, [applyBlockedMessage, canApplyJobs, toast]);

  useEffect(() => {
    const applyId = String(searchParams.get("apply") || "").trim();
    if (!applyId || loading) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("apply");
    setSearchParams(nextParams, { replace: true });

    const targetJob = sortedJobs.find((job) => String(job?.id || "") === applyId);
    if (!targetJob) {
      setStatus("Selected job is no longer available.");
      return;
    }
    openApply(targetJob);
  }, [loading, openApply, searchParams, setSearchParams, sortedJobs]);

  const openMyProposal = useCallback((job) => {
    setSelectedJob(job);
    setActiveJob(null);
  }, []);

  useEffect(() => {
    const proposalId = String(searchParams.get("proposal") || "").trim();
    if (!proposalId || loading) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("proposal");
    setSearchParams(nextParams, { replace: true });

    const targetJob = sortedJobs.find((job) => String(job?.id || "") === proposalId);
    if (!targetJob) {
      setStatus("Selected proposal job is no longer available.");
      return;
    }
    openMyProposal(targetJob);
  }, [loading, openMyProposal, searchParams, setSearchParams, sortedJobs]);

  useEffect(() => {
    const savedFlag = String(searchParams.get("saved") || "").trim() === "1";
    const appliedFlag = String(searchParams.get("applied") || "").trim() === "1";
    if (!savedFlag && !appliedFlag) return;

    if (savedFlag) {
      setOnlySaved(true);
    }
    if (appliedFlag) {
      setOnlyApplied(true);
      setOnlyNotApplied(false);
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("saved");
    nextParams.delete("applied");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const openJobDetails = (job) => {
    if (!job?.id) return;
    navigate(`/freelancer/jobs/${job.id}`);
  };

  const toggleSkillFilter = (skillValue) => {
    const skill = getCanonicalSkill(skillValue, skillFilterLibrary);
    const key = toSkillKey(skill);
    if (!key) return;
    setSelectedSkills((prev) =>
      prev.some((entry) => toSkillKey(entry) === key)
        ? prev.filter((entry) => toSkillKey(entry) !== key)
        : [...prev, skill]
    );
  };

  const handleSkillFilterKey = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = skillFilterQuery.trim();
    if (!value) return;
    const firstMatch = visibleSkillFilterOptions[0];
    toggleSkillFilter(firstMatch || value);
    setSkillFilterQuery("");
  };

  const clearFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setProjectTypeFilter("all");
    setJobTypeFilter("all");
    setExperienceFilter("all");
    setScopeFilter("all");
    setDurationFilter("all");
    setPriorityFilter("all");
    setLocationFilter("all");
    setCommunicationFilter("all");
    setNdaFilter("all");
    setSortBy("newest");
    setBudgetMinFilter("");
    setBudgetMaxFilter("");
    setSelectedSkills([]);
    setSkillFilterQuery("");
    setOnlyNotApplied(false);
    setOnlyApplied(false);
    setOnlySaved(false);
  };

  const isMissing = (field) => missingFields.has(field);
  const fieldClass = (field, base) =>
    `${base} ${
      isMissing(field)
        ? "border-rose-400/60 focus:ring-rose-400/30 focus:border-rose-300"
        : ""
    }`;

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

  const handleToggleSaveJob = async (job) => {
    if (!user?.uid || !job?.id) return;
    const jobId = String(job.id);
    const isSaved = savedJobIds.has(jobId);
    setSavingJobId(jobId);
    setStatus("");
    try {
      await toggleSavedJob({
        userId: user.uid,
        jobId,
        save: !isSaved
      });
      toast.success(isSaved ? "Job removed from saved list." : "Job saved.");
    } catch (err) {
      const message = err?.message || "Failed to update saved jobs.";
      setStatus(message);
      toast.error(message);
    } finally {
      setSavingJobId("");
    }
  };

  const handleSubmitProposal = async () => {
    if (!activeJob || !user) return;
    setStatus("");
    setSubmitting(true);
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
        setStatus(message);
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

      const screeningQuestions = Array.isArray(activeJob.screeningQuestions)
        ? activeJob.screeningQuestions
        : [];

      screeningQuestions.forEach((question, index) => {
        const answer = proposalForm.screeningAnswers?.[question] || "";
        if (!String(answer).trim()) {
          missing.push(`screening-${index}`);
        }
      });

      if (missing.length > 0) {
        setMissingFields(new Set(missing));
        setStatus("Please complete all proposal details.");
        toast.error("Please complete all proposal details.");
        return;
      }

      await submitProposal(user, {
        jobId: activeJob.id,
        freelancerName: profile?.name || latestProfile?.name || "Freelancer",
        priceType: proposalForm.bidType,
        price: proposalForm.bidAmount,
        deliveryDays: proposalForm.deliveryTime,
        skills: Array.isArray(activeJob.skills) ? activeJob.skills : [],
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

      setStatus("Proposal submitted successfully.");
      toast.success("Proposal submitted successfully.");
      setActiveJob(null);
      setMissingFields(new Set());
    } catch (err) {
      setStatus(err.message || "Failed to submit proposal.");
      toast.error("Failed to submit proposal.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout
      title="Browse Jobs"
      sidebar={{
        title: "Growlanzer",
        subtitle: "Freelancer",
        items: freelancerNav
      }}
    >
      <PageHeader
        title="Admin-approved job feed"
        description="Only admin-approved jobs are visible to freelancers."
      />
      {!isFreelancerProfileComplete ? (
        <div className="mb-6 rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          ⚠️ Complete 100% profile details to request admin approval and apply for jobs.
          Current completion: {freelancerProfilePercent}%.
        </div>
      ) : null}
      {normalizedStatus === ACCOUNT_STATUS.PENDING_APPROVAL ? (
        <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          🚫 Admin approval required before applying to jobs.
        </div>
      ) : null}
      {status ? (
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
          {status}
        </div>
      ) : null}
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={onlySaved ? "primary" : "ghost"}
              className="px-3 py-1 text-xs"
              onClick={() => setOnlySaved((prev) => !prev)}
            >
              Saved Jobs ({savedJobsCount})
            </Button>
            <Button
              variant={onlyApplied ? "primary" : "ghost"}
              className="px-3 py-1 text-xs"
              onClick={() =>
                setOnlyApplied((prev) => {
                  const next = !prev;
                  if (next) setOnlyNotApplied(false);
                  return next;
                })
              }
            >
              Applied Jobs ({appliedJobsCount})
            </Button>
          </div>
          <Button
            variant="ghost"
            className="px-4 py-2 text-sm"
            onClick={() => setIsFiltersOpen(true)}
          >
            {activeFiltersCount > 0 ? `Filters (${activeFiltersCount})` : "Filters"}
          </Button>
        </div>

        {isFiltersOpen && typeof document !== "undefined"
          ? createPortal(
          <div className="fixed inset-0 z-[220]">
            <button
              type="button"
              className="absolute inset-0 bg-night-950/85 backdrop-blur-sm"
              aria-label="Close filters"
              onClick={() => setIsFiltersOpen(false)}
            />
            <div className="absolute inset-y-0 right-0 w-full sm:max-w-[430px] sm:p-4">
              <div className="h-[100dvh] overflow-y-auto rounded-none border-l border-white/10 bg-night-900/98 p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:h-full sm:rounded-2xl sm:border sm:p-6">
                <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-white/10 bg-night-900/95 px-4 pb-3 pt-[max(0.35rem,env(safe-area-inset-top))] backdrop-blur sm:-mx-6 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-white">Filters</h4>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        className="px-3 py-1 text-xs"
                        onClick={clearFilters}
                      >
                        Clear
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-3 py-1 text-xs"
                        onClick={() => setIsFiltersOpen(false)}
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="mt-4 space-y-4 text-sm text-slate-300">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Search
              </p>
              <input
                className="mt-2 min-h-[42px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                placeholder="Title, category, skills"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            <div className="grid gap-3">
              <select
                className="min-h-[42px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="all">All categories</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                className="min-h-[42px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                value={projectTypeFilter}
                onChange={(event) => setProjectTypeFilter(event.target.value)}
              >
                {PROJECT_TYPE_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="min-h-[42px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                value={jobTypeFilter}
                onChange={(event) => setJobTypeFilter(event.target.value)}
              >
                {JOB_TYPE_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="min-h-[42px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                value={experienceFilter}
                onChange={(event) => setExperienceFilter(event.target.value)}
              >
                {EXPERIENCE_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="min-h-[42px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                value={scopeFilter}
                onChange={(event) => setScopeFilter(event.target.value)}
              >
                {SCOPE_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="min-h-[42px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                value={durationFilter}
                onChange={(event) => setDurationFilter(event.target.value)}
              >
                {DURATION_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="min-h-[42px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
              >
                {PRIORITY_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="min-h-[42px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
              >
                <option value="all">All locations</option>
                {locationOptions.map((location) => (
                  <option key={location} value={location}>
                    {formatEnumLabel(location)}
                  </option>
                ))}
              </select>
              <select
                className="min-h-[42px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                value={communicationFilter}
                onChange={(event) => setCommunicationFilter(event.target.value)}
              >
                <option value="all">All communication</option>
                {communicationOptions.map((item) => (
                  <option key={item} value={item}>
                    {formatEnumLabel(item)}
                  </option>
                ))}
              </select>
              <select
                className="min-h-[42px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                value={ndaFilter}
                onChange={(event) => setNdaFilter(event.target.value)}
              >
                {NDA_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="min-h-[42px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    Sort: {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Budget range
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input
                  className="min-h-[42px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                  placeholder="Min"
                  value={budgetMinFilter}
                  onChange={(event) => setBudgetMinFilter(event.target.value)}
                />
                <input
                  className="min-h-[42px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                  placeholder="Max"
                  value={budgetMaxFilter}
                  onChange={(event) => setBudgetMaxFilter(event.target.value)}
                />
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Skills
              </p>
              <input
                className="mt-2 min-h-[42px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                placeholder="Type skill and press Enter"
                value={skillFilterQuery}
                onChange={(event) => setSkillFilterQuery(event.target.value)}
                onKeyDown={handleSkillFilterKey}
              />
              {selectedSkills.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedSkills.map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkillFilter(skill)}
                      className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100 hover:bg-emerald-500/20"
                    >
                      {skill} x
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 max-h-40 space-y-2 overflow-y-auto pr-1">
                {visibleSkillFilterOptions.length === 0 ? (
                  <p className="text-xs text-slate-500">No skills available.</p>
                ) : (
                  visibleSkillFilterOptions.map((skill) => (
                    <label key={skill} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedSkillKeys.has(toSkillKey(skill))}
                        onChange={() => toggleSkillFilter(skill)}
                        className="accent-glow-cyan"
                      />
                      <span className="text-sm">{skill}</span>
                    </label>
                  ))
                )}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Type software skill and press Enter to apply quick filter.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={onlyNotApplied}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setOnlyNotApplied(checked);
                  if (checked) setOnlyApplied(false);
                }}
                className="accent-glow-cyan"
              />
              Show only jobs not applied yet
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={onlyApplied}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setOnlyApplied(checked);
                  if (checked) setOnlyNotApplied(false);
                }}
                className="accent-glow-cyan"
              />
              Show only applied jobs
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={onlySaved}
                onChange={(event) => setOnlySaved(event.target.checked)}
                className="accent-glow-cyan"
              />
              Show only saved jobs
            </label>
                <p className="text-xs text-slate-400">
                  Showing {filteredJobs.length} of {sortedJobs.length} approved jobs.
                </p>
                </div>
              </div>
            </div>
          </div>,
            document.body
          )
          : null}

        <div className="space-y-6">
          {activeJob ? (
            <div className="glass-card rounded-2xl p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h4 className="text-base font-semibold text-white">
                    Submit proposal · {activeJob.title}
                  </h4>
                  <p className="mt-2 text-sm text-slate-400">
                    Budget {formatBudgetLabel(activeJob)} · Posted {formatTimeAgo(activeJob.createdAt)}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    {(activeJob.category || "General")}{" "}
                    {activeJob.subcategory ? `· ${activeJob.subcategory}` : ""} ·{" "}
                    {activeJob.projectType === "hourly" ? "Hourly" : "Fixed"} ·{" "}
                    {activeJob.scope || "Scope"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setActiveJob(null)}
                >
                  Cancel
                </Button>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Project brief
                  </p>
                  <p className="mt-2 text-sm text-slate-200 whitespace-pre-line">
                    {activeJob.description || "No description provided."}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Deliverables
                  </p>
                  <p className="mt-2 text-sm text-slate-200 whitespace-pre-line">
                    {activeJob.deliverables || "Not provided."}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Success metrics
                  </p>
                  <p className="mt-2 text-sm text-slate-200 whitespace-pre-line">
                    {activeJob.successMetrics || "Not provided."}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Project info
                  </p>
                  <div className="mt-2 grid gap-1 text-sm text-slate-200">
                    <p>
                      Category: {activeJob.category || "General"}
                      {activeJob.subcategory ? ` · ${activeJob.subcategory}` : ""}
                    </p>
                    <p>Job type: {formatEnumLabel(activeJob.jobType, "One-time")}</p>
                    <p>Project type: {formatEnumLabel(activeJob.projectType, "Fixed")}</p>
                    <p>
                      Experience: {formatEnumLabel(activeJob.experienceLevel)}
                    </p>
                    <p>Scope: {formatEnumLabel(activeJob.scope)}</p>
                    <p>Location: {activeJob.location || "Remote"}</p>
                    <p>Hires: {activeJob.hires || 1}</p>
                    <p>Priority: {formatEnumLabel(activeJob.priority, "Standard")}</p>
                    <p>
                      Communication: {formatEnumLabel(activeJob.communication, "Email")}
                    </p>
                    <p>NDA required: {activeJob.ndaRequired ? "Yes" : "No"}</p>
                    <p>Start date: {formatDate(activeJob.startDate)}</p>
                    <p>Duration: {activeJob.duration || activeJob.timeline || "Not specified"}</p>
                    <p>Deadline: {formatDate(activeJob.deadline)}</p>
                    {activeJob.weeklyHours ? (
                      <p>Weekly hours: {activeJob.weeklyHours}</p>
                    ) : null}
                    {activeJob.milestoneCount ? (
                      <p>Milestones: {activeJob.milestoneCount}</p>
                    ) : null}
                    {activeJob.escrowAmount ? (
                      <p>Escrow: {activeJob.currency || "INR"} {activeJob.escrowAmount}</p>
                    ) : null}
                    <p>
                      Screening questions:{" "}
                      {Array.isArray(activeJob.screeningQuestions)
                        ? activeJob.screeningQuestions.length
                        : 0}
                    </p>
                  </div>
                </div>
                {activeJobAssetsLink ? (
                  <div className="lg:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Assets link
                    </p>
                    <a
                      href={activeJobAssetsLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block break-all text-sm text-sky-300 hover:text-sky-200"
                    >
                      {truncate(activeJobAssetsLink, 90)}
                    </a>
                  </div>
                ) : null}
                {activeJobReferenceLinks.length > 0 ? (
                  <div className="lg:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Reference links
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {activeJobReferenceLinks.map((link) => (
                        <a
                          key={link}
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 hover:bg-white/10"
                        >
                          {truncate(link, 70)}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
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

              {Array.isArray(activeJob.screeningQuestions) &&
              activeJob.screeningQuestions.length > 0 ? (
                <div className="mt-6">
                  <h5 className="text-sm font-semibold text-white">
                    Screening questions
                  </h5>
                  <div className="mt-3 grid gap-3">
                    {activeJob.screeningQuestions.map((question, index) => (
                      <div key={question} className="grid gap-2">
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
                  onClick={handleSubmitProposal}
                  disabled={submitting}
                  title={
                    canApplyJobs
                      ? "Submit proposal"
                      : applyBlockedMessage
                  }
                >
                  {submitting ? "Submitting..." : "Submit proposal"}
                </Button>
                <span className="text-xs text-slate-400">
                  All fields are required before submission.
                </span>
              </div>
            </div>
          ) : null}

          {selectedJob ? (
            <div className="glass-card rounded-2xl p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h4 className="text-base font-semibold text-white">
                    Proposal insights · {selectedJob.title}
                  </h4>
                  <p className="mt-2 text-sm text-slate-400">
                    Posted {formatTimeAgo(selectedJob.createdAt)} · Budget {formatBudgetLabel(selectedJob)}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => setSelectedJob(null)}>
                  Close
                </Button>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Job requirements
                  </p>
                  <div className="mt-2 grid gap-1 text-sm text-slate-300">
                    <p>
                      Category: {selectedJob.category || "General"}
                      {selectedJob.subcategory ? ` · ${selectedJob.subcategory}` : ""}
                    </p>
                    <p>Job type: {formatEnumLabel(selectedJob.jobType, "One-time")}</p>
                    <p>
                      Project type: {formatEnumLabel(selectedJob.projectType, "Fixed")}
                    </p>
                    <p>
                      Experience: {formatEnumLabel(selectedJob.experienceLevel)}
                    </p>
                    <p>Scope: {formatEnumLabel(selectedJob.scope)}</p>
                    <p>Location: {formatEnumLabel(selectedJob.location, "Remote")}</p>
                    <p>Hires: {selectedJob.hires || 1}</p>
                    <p>
                      Priority: {formatEnumLabel(selectedJob.priority, "Standard")}
                    </p>
                    <p>
                      Communication:{" "}
                      {formatEnumLabel(selectedJob.communication, "Email")}
                    </p>
                    <p>NDA required: {selectedJob.ndaRequired ? "Yes" : "No"}</p>
                    <p>Start date: {formatDate(selectedJob.startDate)}</p>
                    <p>
                      Duration: {selectedJob.duration || selectedJob.timeline || "Not specified"}
                    </p>
                    <p>Deadline: {formatDate(selectedJob.deadline)}</p>
                    {selectedJob.weeklyHours ? (
                      <p>Weekly hours: {selectedJob.weeklyHours}</p>
                    ) : null}
                    {selectedJob.milestoneCount ? (
                      <p>Milestones: {selectedJob.milestoneCount}</p>
                    ) : null}
                    {selectedJob.escrowAmount ? (
                      <p>
                        Escrow: {selectedJob.currency || "INR"}{" "}
                        {selectedJob.escrowAmount}
                      </p>
                    ) : null}
                    <p>
                      Screening questions:{" "}
                      {selectedJobScreeningQuestions.length || 0}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Client brief
                  </p>
                  <div className="mt-2 grid gap-2 text-sm text-slate-300">
                    <p className="text-xs text-slate-400">Project brief</p>
                    <p className="whitespace-pre-line">
                      {selectedJob.description || "Not provided."}
                    </p>
                    <p className="text-xs text-slate-400">Deliverables</p>
                    <p className="whitespace-pre-line">
                      {selectedJob.deliverables || "Not provided."}
                    </p>
                    <p className="text-xs text-slate-400">Success metrics</p>
                    <p className="whitespace-pre-line">
                      {selectedJob.successMetrics || "Not provided."}
                    </p>
                  </div>
                </div>
                {selectedJobAssetsLink ? (
                  <div className="lg:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Assets link
                    </p>
                    <a
                      href={selectedJobAssetsLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block break-all text-sm text-sky-300 hover:text-sky-200"
                    >
                      {truncate(selectedJobAssetsLink, 90)}
                    </a>
                  </div>
                ) : null}
                {selectedJobReferenceLinks.length > 0 ? (
                  <div className="lg:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Reference links
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedJobReferenceLinks.map((link) => (
                        <a
                          key={link}
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 hover:bg-white/10"
                        >
                          {truncate(link, 70)}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
                {selectedJobScreeningQuestions.length > 0 ? (
                  <div className="lg:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Screening questions
                    </p>
                    <div className="mt-2 grid gap-1 text-sm text-slate-300">
                      {selectedJobScreeningQuestions.map((question, index) => (
                        <p key={`${question}-${index}`}>{index + 1}. {question}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {selectedProposal ? (
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">Your proposal</p>
                    <StatusBadge status={selectedProposal.status} />
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-300">
                    <p>
                      Bid: {formatProposalBid(selectedProposal, selectedJob)}
                    </p>
                    <p>Delivery: {selectedProposal.deliveryTime || "-"}</p>
                    <p>Availability: {selectedProposal.availability || "-"}</p>
                    <p>
                      Title: {selectedProposal.proposalTitle || "-"}
                    </p>
                    {selectedProposal.message ? (
                      <p>Cover letter: {selectedProposal.message}</p>
                    ) : null}
                    {selectedProposal.milestones ? (
                      <p>Milestones: {selectedProposal.milestones}</p>
                    ) : null}
                    {selectedProposal.links ? (
                      <p>Links: {selectedProposal.links}</p>
                    ) : null}
                    {selectedProposal.questions ? (
                      <p>Questions: {selectedProposal.questions}</p>
                    ) : null}
                  </div>
                  {screeningEntries.length > 0 ? (
                    <div className="mt-3 grid gap-2 text-xs text-slate-400">
                      {screeningEntries.map(([question, answer]) => (
                        <p key={question}>
                          {question}: {answer || "-"}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-3 text-xs text-slate-400">
                    Submitted {formatTimeAgo(selectedProposal.createdAt)}
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-400">
                  You have not submitted a proposal for this job.
                </p>
              )}

              <div className="mt-6">
                <h5 className="text-sm font-semibold text-white">Your proposals for this job</h5>
                <div className="mt-3 grid gap-3">
                  {jobProposals.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                      You have not submitted another proposal for this job.
                    </div>
                  ) : (
                    jobProposals.map((proposal) => (
                      <div
                        key={proposal.id}
                        className="rounded-xl border border-white/10 bg-white/5 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              <UserProfileLink
                                userId={proposal.freelancerId || user?.uid}
                                name={proposal.freelancerName || "Freelancer"}
                                className="text-white underline hover:text-sky-200"
                              />
                            </p>
                            <p className="text-xs text-slate-400">
                              Bid {formatProposalBid(proposal, selectedJob)}
                            </p>
                          </div>
                          <StatusBadge status={proposal.status} />
                        </div>
                        <p className="mt-3 text-xs text-slate-400">
                          Submitted {formatTimeAgo(proposal.createdAt)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {loading ? (
              <EmptyState title="Loading jobs" description="Fetching jobs..." />
            ) : sortedJobs.length === 0 ? (
              <EmptyState
                title="No approved jobs"
                description="Admin must approve jobs before they appear."
              />
            ) : filteredJobs.length === 0 ? (
              <EmptyState
                title="No matching jobs"
                description="Try changing search or filter options."
              />
            ) : (
              filteredJobs.map((job) => {
                const myProposal = myProposalsByJob.get(job.id);
                const isSaved = savedJobIds.has(String(job?.id || ""));
                return (
                  <div key={job.id} className="glass-card rounded-2xl p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-base font-semibold text-white">
                          {job.title}
                        </h4>
                        <p className="mt-2 text-sm text-slate-400">
                          Budget {formatBudgetLabel(job)} · Posted {formatTimeAgo(job.createdAt)}
                        </p>
                        <p className="mt-2 text-xs text-slate-400">
                          {(job.category || "General")}{" "}
                          {job.subcategory ? `· ${job.subcategory}` : ""}
                        </p>
                        <p className="mt-2 text-xs text-slate-400">
                          {job.projectType === "hourly" ? "Hourly" : "Fixed"} ·{" "}
                          {formatEnumLabel(job.jobType, "One-time")} ·{" "}
                          {formatEnumLabel(job.experienceLevel)} ·{" "}
                          {formatEnumLabel(job.scope)} · {formatEnumLabel(job.location, "Remote")}
                        </p>
                        <p className="mt-2 text-xs text-slate-400">
                          Hires {job.hires || 1} · Deadline {formatDate(job.deadline)} · Priority{" "}
                          {formatEnumLabel(job.priority, "Standard")}
                          {job.ndaRequired ? " · NDA required" : ""}
                        </p>
                        <p className="mt-2 text-xs text-slate-400">
                          Communication {formatEnumLabel(job.communication, "Email")} · Duration{" "}
                          {job.duration || job.timeline || "Not specified"}
                        </p>
                        {job.description ? (
                          <p className="mt-2 text-sm text-slate-300">
                            {truncate(job.description, 180)}
                          </p>
                        ) : null}
                      </div>
                      <StatusBadge status={job.status} />
                    </div>
                    {Array.isArray(job.skills) && job.skills.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {job.skills.map((skill) => (
                          <span
                            key={skill}
                            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300"
                          >
                            <SkillLogo skill={skill} size={16} />
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {myProposal ? (
                      <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                        Proposal submitted · <StatusBadge status={myProposal.status} />
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button
                        onClick={() => openJobDetails(job)}
                        variant="ghost"
                      >
                        See more
                      </Button>
                      <Button
                        onClick={() => handleToggleSaveJob(job)}
                        variant="ghost"
                        disabled={savingJobId === String(job.id)}
                      >
                        {savingJobId === String(job.id)
                          ? "Saving..."
                          : isSaved
                            ? "Saved"
                            : "Save job"}
                      </Button>
                      {myProposal ? (
                        <Button
                          onClick={() => openMyProposal(job)}
                          variant="ghost"
                        >
                          View your proposal
                        </Button>
                      ) : (
                        <Button
                          onClick={() => openApply(job)}
                          disabled={submitting}
                          title={
                            canApplyJobs
                              ? "Apply for this job"
                              : applyBlockedMessage
                          }
                        >
                          Apply
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </DashboardLayout>
  );
}



