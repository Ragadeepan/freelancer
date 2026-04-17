import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { collection, doc, query, where } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import JobCard from "../../components/JobCard.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Button from "../../components/Button.jsx";
import ProposalsList from "../../components/ProposalsList.jsx";
import UserProfileLink from "../../components/UserProfileLink.jsx";
import { clientNav } from "../../data/nav.js";
import {
  SOFTWARE_SKILLS,
  filterSkillSuggestions,
  getCanonicalSkill,
  toSkillKey
} from "../../data/skills.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { db } from "../../firebase/firebase.js";
import useFirestoreDoc from "../../hooks/useFirestoreDoc.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { createEscrowPayment } from "../../services/paymentsService.js";
import { createProjectUpdate } from "../../services/projectUpdatesService.js";
import { createDispute } from "../../services/disputesService.js";
import {
  fetchJobProposals,
  selectFreelancerForJob
} from "../../services/marketplaceFlowApi.js";
import {
  TOTAL_PROJECT_INSTALLMENTS,
  buildInstallmentProgress,
  getInstallmentFundingState,
  parseAmountFromText,
  suggestInstallmentAmount
} from "../../utils/paymentFlow.js";
import { getClientProfileCompletion } from "../../utils/clientProfile.js";
import {
  ACCOUNT_STATUS,
  canClientPostJob,
  getClientPostJobBlockedMessage,
  normalizeAccountStatus
} from "../../utils/accountStatus.js";

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
  const date = toDate(value);
  if (!date) return "N/A";
  return date.toLocaleDateString();
};

const formatDateTime = (value) => {
  const date = toDate(value);
  if (!date) return "N/A";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
};

const formatBudget = (job) => {
  if (job?.budget) return String(job.budget);
  const currency = job?.currency || "INR";
  if (job?.projectType === "hourly") {
    const min = job?.hourlyMin || "";
    const max = job?.hourlyMax || "";
    if (min || max) return `${currency} ${min || "0"}-${max || ""} / hr`;
  }
  if (job?.budgetMin || job?.budgetMax) {
    return `${currency} ${job.budgetMin || "0"}-${job.budgetMax || ""}`;
  }
  return "N/A";
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();
const getProjectWorkspaceRoute = (project) =>
  project?.contractId ? `/workspace/project/${project.contractId}` : `/project/${project.id}`;

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

const formatActionError = (err, fallback) => {
  const raw = String(err?.message || "");
  if (
    err?.code === "permission-denied" ||
    /Missing or insufficient permissions/i.test(raw)
  ) {
    return "You do not have permission for this action yet. Ensure the client account is approved.";
  }
  return err?.message || fallback;
};

export default function ClientJobs() {
  const navigate = useNavigate();
  const { jobId: routeJobId } = useParams();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { user, profile } = useAuth();
  const normalizedStatus = normalizeAccountStatus(profile?.status);
  const isApprovedClient = normalizedStatus === ACCOUNT_STATUS.APPROVED;
  const { percent: clientProfilePercent } = useMemo(
    () => getClientProfileCompletion(profile || {}),
    [profile]
  );
  const canOpenPostJob = canClientPostJob({ ...(profile || {}), role: "client" });
  const requestedJobId = String(
    searchParams.get("job") || routeJobId || ""
  ).trim();

  const { data: jobs = [], loading: jobsLoading } = useFirestoreQuery(
    () =>
      user ? query(collection(db, "jobs"), where("clientId", "==", user.uid)) : null,
    [user]
  );
  const { data: projects = [] } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "projects"), where("clientId", "==", user.uid))
        : null,
    [user]
  );
  const { data: payments = [] } = useFirestoreQuery(
    () =>
      user
        ? query(collection(db, "payments"), where("clientId", "==", user.uid))
        : null,
    [user]
  );
  const { data: settings } = useFirestoreDoc(
    () => doc(db, "settings", "global"),
    []
  );

  const [selectedJobId, setSelectedJobId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [proposalFilter, setProposalFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [skillFilterQuery, setSkillFilterQuery] = useState("");
  const [jobProposalsPayload, setJobProposalsPayload] = useState(null);
  const [jobProposalsLoading, setJobProposalsLoading] = useState(false);
  const [jobProposalsPage, setJobProposalsPage] = useState(1);
  const [selectingProposalId, setSelectingProposalId] = useState("");
  const [pendingSelection, setPendingSelection] = useState(null);
  const [amounts, setAmounts] = useState({});
  const [disputes, setDisputes] = useState({});
  const [status, setStatus] = useState("");
  const [processing, setProcessing] = useState(null);

  const commissionRate = Number(settings?.commissionPercentage || 10);

  const skillOptions = useMemo(() => {
    const set = new Set();
    SOFTWARE_SKILLS.forEach((skill) => set.add(skill));
    jobs.forEach((job) => {
      if (!Array.isArray(job?.skills)) return;
      job.skills.forEach((skill) => {
        const label = String(skill || "").trim();
        if (label) set.add(label);
      });
    });
    selectedSkills.forEach((skill) => set.add(skill));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [jobs, selectedSkills]);

  const visibleSkillOptions = useMemo(
    () =>
      filterSkillSuggestions({
        query: skillFilterQuery,
        selectedSkills: [],
        skillLibrary: skillOptions,
        limit: 80
      }),
    [skillFilterQuery, skillOptions]
  );

  const selectedSkillKeys = useMemo(
    () =>
      new Set(
        selectedSkills.map((skill) => toSkillKey(skill)).filter(Boolean)
      ),
    [selectedSkills]
  );

  const filteredJobs = useMemo(() => {
    const text = normalizeText(search);
    return jobs
      .filter((job) => {
        if (statusFilter !== "all" && (job.status || "unknown") !== statusFilter) {
          return false;
        }

        if (text) {
          const inTitle = normalizeText(job.title).includes(text);
          const inCategory = normalizeText(job.category).includes(text);
          const inSkills = Array.isArray(job.skills)
            ? job.skills.some((skill) => normalizeText(skill).includes(text))
            : false;
          if (!(inTitle || inCategory || inSkills)) return false;
        }

        if (selectedSkills.length > 0) {
          const jobSkillKeys = Array.isArray(job.skills)
            ? job.skills.map((skill) => toSkillKey(skill)).filter(Boolean)
            : [];
          const hasMatch = selectedSkills.some((skill) =>
            jobSkillKeys.includes(toSkillKey(skill))
          );
          if (!hasMatch) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aTime = toDate(a.createdAt)?.getTime() || 0;
        const bTime = toDate(b.createdAt)?.getTime() || 0;
        return bTime - aTime;
      });
  }, [jobs, search, selectedSkills, statusFilter]);

  useEffect(() => {
    if (selectedJobId && jobs.some((job) => job.id === selectedJobId)) return;
    if (requestedJobId) {
      const requestedJobExists = jobs.some((job) => job.id === requestedJobId);
      if (requestedJobExists) {
        setSelectedJobId(requestedJobId);
        return;
      }
    }
    if (filteredJobs.length > 0) {
      setSelectedJobId(filteredJobs[0].id);
      return;
    }
    if (jobs.length > 0) {
      setSelectedJobId(jobs[0].id);
      return;
    }
    setSelectedJobId(null);
  }, [filteredJobs, jobs, requestedJobId, selectedJobId]);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) || null,
    [jobs, selectedJobId]
  );

  useEffect(() => {
    setJobProposalsPage(1);
    setJobProposalsPayload(null);
  }, [selectedJobId]);

  useEffect(() => {
    setPendingSelection(null);
  }, [selectedJobId]);

  useEffect(() => {
    if (!user || !selectedJob?.id) {
      setJobProposalsPayload(null);
      return;
    }

    let isMounted = true;

    const loadJobProposals = async () => {
      setJobProposalsLoading(true);
      try {
        const payload = await fetchJobProposals(user, selectedJob.id, {
          page: jobProposalsPage,
          limit: 20
        });
        if (!isMounted) return;
        setJobProposalsPayload(payload);
      } catch (err) {
        if (!isMounted) return;
        setJobProposalsPayload(null);
        setStatus(err?.message || "Failed to load proposals.");
      } finally {
        if (isMounted) {
          setJobProposalsLoading(false);
        }
      }
    };

    loadJobProposals();

    return () => {
      isMounted = false;
    };
  }, [jobProposalsPage, selectedJob?.id, user]);

  const projectsByJob = useMemo(() => {
    const map = new Map();
    projects.forEach((project) => {
      const existing = map.get(project.jobId);
      if (!existing) {
        map.set(project.jobId, project);
        return;
      }
      const existingTime = toDate(existing.createdAt)?.getTime() || 0;
      const currentTime = toDate(project.createdAt)?.getTime() || 0;
      if (currentTime >= existingTime) {
        map.set(project.jobId, project);
      }
    });
    return map;
  }, [projects]);

  const selectedProposalId = useMemo(() => {
    return String(
      selectedJob?.selectedProposalId ||
        jobProposalsPayload?.ranking?.selectedProposalId ||
        ""
    ).trim();
  }, [jobProposalsPayload?.ranking?.selectedProposalId, selectedJob?.selectedProposalId]);

  const allRankedProposals = useMemo(() => {
    return Array.isArray(jobProposalsPayload?.proposals)
      ? jobProposalsPayload.proposals
      : [];
  }, [jobProposalsPayload?.proposals]);

  const selectedJobProposals = useMemo(() => {
    if (proposalFilter === "all") return allRankedProposals;
    return allRankedProposals.filter((proposal) => {
      return String(proposal?.status || "").toLowerCase() === proposalFilter;
    });
  }, [allRankedProposals, proposalFilter]);

  const proposalStats = useMemo(() => {
    return allRankedProposals.reduce(
      (acc, proposal) => {
        const normalizedStatus = String(proposal?.status || "").toLowerCase();
        if (normalizedStatus === "selected") acc.selected += 1;
        else if (normalizedStatus === "rejected") acc.rejected += 1;
        else if (normalizedStatus === "not_selected") acc.notSelected += 1;
        else if (normalizedStatus === "pending") acc.pending += 1;
        if (proposal?.isTop) acc.top += 1;
        return acc;
      },
      {
        pending: 0,
        selected: 0,
        rejected: 0,
        notSelected: 0,
        top: 0,
        total: Number(jobProposalsPayload?.pagination?.total || 0)
      }
    );
  }, [allRankedProposals, jobProposalsPayload?.pagination?.total]);

  const selectedProposal = useMemo(() => {
    if (!selectedProposalId) return null;
    return allRankedProposals.find((proposal) => proposal.id === selectedProposalId) || null;
  }, [allRankedProposals, selectedProposalId]);

  const selectedJobReferenceLinks = useMemo(
    () => toSafeLinks(selectedJob?.referenceLinks),
    [selectedJob?.referenceLinks]
  );
  const selectedJobScreeningQuestions = useMemo(
    () => toStringList(selectedJob?.screeningQuestions),
    [selectedJob?.screeningQuestions]
  );

  const activeProject = selectedJob ? projectsByJob.get(selectedJob.id) || null : null;
  const projectConnectionPending =
    Boolean(activeProject) &&
    String(activeProject?.status || "").toLowerCase() !== "connected";

  const activeProjectPayments = useMemo(() => {
    if (!activeProject) return [];
    return payments
      .filter((payment) => payment.projectId === activeProject.id)
      .sort((a, b) => {
        const aTime = toDate(a.createdAt)?.getTime() || 0;
        const bTime = toDate(b.createdAt)?.getTime() || 0;
        return bTime - aTime;
      });
  }, [activeProject, payments]);

  const { data: activeProjectUpdates = [] } = useFirestoreQuery(
    () =>
      activeProject
        ? query(
            collection(db, "projectUpdates"),
            where("projectId", "==", activeProject.id)
          )
        : null,
    [activeProject]
  );

  const { data: activeProjectDisputes = [] } = useFirestoreQuery(
    () =>
      activeProject
        ? query(collection(db, "disputes"), where("projectId", "==", activeProject.id))
        : null,
    [activeProject]
  );

  const selectedEscrowTotal = useMemo(() => {
    return activeProjectPayments
      .filter((entry) => entry.status === "escrow" || entry.status === "held")
      .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  }, [activeProjectPayments]);

  const installmentProgress = useMemo(() => {
    return buildInstallmentProgress(
      activeProjectPayments,
      TOTAL_PROJECT_INSTALLMENTS
    );
  }, [activeProjectPayments]);

  const fundingState = useMemo(() => {
    return getInstallmentFundingState(
      activeProjectPayments,
      TOTAL_PROJECT_INSTALLMENTS
    );
  }, [activeProjectPayments]);
  const nextInstallmentNumber = fundingState.nextInstallment;

  const suggestedInstallmentAmount = useMemo(() => {
    if (!selectedJob || !nextInstallmentNumber) return 0;
    return suggestInstallmentAmount(selectedJob, nextInstallmentNumber);
  }, [nextInstallmentNumber, selectedJob]);

  useEffect(() => {
    if (!activeProject?.id || !nextInstallmentNumber) return;
    setAmounts((prev) => {
      const existing = String(prev[activeProject.id] || "").trim();
      if (existing) return prev;
      if (!suggestedInstallmentAmount) return prev;
      return {
        ...prev,
        [activeProject.id]: suggestedInstallmentAmount.toFixed(2)
      };
    });
  }, [activeProject?.id, nextInstallmentNumber, suggestedInstallmentAmount]);

  const handleAmountChange = (projectId, value) => {
    setAmounts((prev) => ({ ...prev, [projectId]: value }));
  };

  const handleDisputeChange = (projectId, value) => {
    setDisputes((prev) => ({ ...prev, [projectId]: value }));
  };

  const handleOpenJobProject = (job) => {
    const project = projectsByJob.get(job.id);
    if (!project) return;
    navigate(getProjectWorkspaceRoute(project));
  };

  const toggleSkillFilter = (skillValue) => {
    const skill = getCanonicalSkill(skillValue, skillOptions);
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
    const firstMatch = visibleSkillOptions[0];
    toggleSkillFilter(firstMatch || value);
    setSkillFilterQuery("");
  };

  const handleFundEscrow = async (project) => {
    if (!user?.uid) return;
    setStatus("");
    if (!nextInstallmentNumber) {
      const message =
        fundingState.reason ||
        "Installment funding is locked until admin review completes.";
      setStatus(message);
      toast.permission(message);
      return;
    }
    const rawAmount = parseAmountFromText(amounts[project.id]);
    if (!rawAmount) {
      const message = "Enter a valid escrow amount.";
      setStatus(message);
      toast.error(message);
      return;
    }
    setProcessing(`escrow-${project.id}-${nextInstallmentNumber}`);
    try {
      const commission = (rawAmount * commissionRate) / 100;
      await createEscrowPayment({
        projectId: project.id,
        jobId: selectedJob?.id || null,
        amount: rawAmount,
        commission,
        clientId: user.uid,
        freelancerId: project.freelancerId,
        installmentNumber: nextInstallmentNumber,
        totalInstallments: TOTAL_PROJECT_INSTALLMENTS,
        reviewStatus: "pending"
      });
      setAmounts((prev) => ({ ...prev, [project.id]: "" }));
      const message = `Installment ${nextInstallmentNumber}/${TOTAL_PROJECT_INSTALLMENTS} funded and moved to admin escrow for review.`;
      setStatus(message);
      toast.success(message);
    } catch (err) {
      const message = formatActionError(err, "Failed to fund escrow.");
      setStatus(message);
      toast.error(message);
    } finally {
      setProcessing(null);
    }
  };

  const handleRequestUpdate = async (project, requestedStatus) => {
    if (!user?.uid) return;
    setStatus("");
    const key = `update-${project.id}-${requestedStatus}`;
    setProcessing(key);
    try {
      await createProjectUpdate({
        projectId: project.id,
        requestedBy: user.uid,
        requestedStatus,
        message: `Client requested status: ${requestedStatus}`
      });
      const message =
        requestedStatus === "completed"
          ? "Completion approval request sent to Admin."
          : "Revision request sent to Admin.";
      setStatus(message);
      toast.success(message);
    } catch (err) {
      const message = formatActionError(err, "Failed to request update.");
      setStatus(message);
      toast.error(message);
    } finally {
      setProcessing(null);
    }
  };

  const handleRaiseDispute = async (project) => {
    if (!user?.uid) return;
    setStatus("");
    const reason = String(disputes[project.id] || "").trim();
    if (!reason) {
      const message = "Provide a dispute reason.";
      setStatus(message);
      toast.error(message);
      return;
    }
    setProcessing(`dispute-${project.id}`);
    try {
      await createDispute({
        projectId: project.id,
        raisedBy: user.uid,
        reason
      });
      setDisputes((prev) => ({ ...prev, [project.id]: "" }));
      setStatus("Dispute submitted to Admin.");
      toast.success("Dispute submitted.");
    } catch (err) {
      const message = formatActionError(err, "Failed to raise dispute.");
      setStatus(message);
      toast.error(message);
    } finally {
      setProcessing(null);
    }
  };

  const openSelectFreelancerConfirm = (proposalId) => {
    if (!proposalId) return;
    if (!isApprovedClient) {
      const message = "Client account must be approved before selecting freelancer.";
      setStatus(message);
      toast.permission(message);
      return;
    }
    if (String(selectedJob?.status || "").toLowerCase() !== "approved") {
      const message = "Job must be approved before selecting freelancer.";
      setStatus(message);
      toast.error(message);
      return;
    }
    if (selectedProposalId) {
      const message = "Freelancer is already selected for this job.";
      setStatus(message);
      toast.permission(message);
      return;
    }
    const proposal = allRankedProposals.find(
      (entry) => String(entry?.id || "") === String(proposalId)
    );
    setPendingSelection({
      proposalId: String(proposalId),
      freelancerName:
        proposal?.freelancerName || proposal?.bidder || "this freelancer",
      bidAmount: proposal?.price ?? proposal?.bidAmount ?? null,
      deliveryTime: proposal?.deliveryTime || null
    });
  };

  const handleSelectFreelancer = async (proposalId) => {
    if (!user || !selectedJob?.id || !proposalId) return;
    if (!isApprovedClient) {
      const message = "Client account must be approved before selecting freelancer.";
      setStatus(message);
      toast.permission(message);
      return;
    }
    if (String(selectedJob.status || "").toLowerCase() !== "approved") {
      const message = "Job must be approved before selecting freelancer.";
      setStatus(message);
      toast.error(message);
      return;
    }
    if (selectedProposalId) {
      const message = "Freelancer is already selected for this job.";
      setStatus(message);
      toast.permission(message);
      return;
    }

    setStatus("");
    setSelectingProposalId(String(proposalId));

    try {
      const result = await selectFreelancerForJob(user, {
        jobId: selectedJob.id,
        proposalId
      });
      const successMessage = `Freelancer selected. Private workspace created. Contract ${result.contractId}.`;
      setStatus(successMessage);
      toast.success(successMessage);
      setPendingSelection(null);

      const refreshedPayload = await fetchJobProposals(user, selectedJob.id, {
        page: 1,
        limit: 20
      });
      setJobProposalsPage(1);
      setJobProposalsPayload(refreshedPayload);
    } catch (err) {
      const message = err?.message || "Failed to select freelancer.";
      setStatus(message);
      toast.error(message);
    } finally {
      setSelectingProposalId("");
    }
  };

  const handleOpenPostJob = () => {
    if (canOpenPostJob) {
      navigate("/client/post-job");
      return;
    }
    const message = getClientPostJobBlockedMessage({
      ...(profile || {}),
      role: "client"
    });
    setStatus(message);
    toast.permission(message);
    navigate("/client/company-profile");
  };

  return (
    <DashboardLayout
      title="My Jobs"
      sidebar={{ title: "Client Suite", subtitle: "Client", items: clientNav }}
    >
      <PageHeader
        title="Job and proposal pipeline"
        description="Track jobs, review freelancer applications, and run project actions from one screen."
        primaryAction="Post new job"
        onPrimaryAction={handleOpenPostJob}
      />

      {normalizedStatus === ACCOUNT_STATUS.PENDING_APPROVAL ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          🚫 Admin approval required before posting jobs.
        </div>
      ) : null}
      {!isApprovedClient ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Client account approval is required for escrow funding and dispute actions.
        </div>
      ) : null}

      <section className="glass-card rounded-2xl p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.7fr_0.7fr]">
          <input
            className="min-h-[42px] rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
            placeholder="Search jobs by title, category, or skill"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="min-h-[42px] rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All job statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In progress</option>
            <option value="connected">Connected</option>
            <option value="closed">Closed</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            className="min-h-[42px] rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
            value={proposalFilter}
            onChange={(event) => setProposalFilter(event.target.value)}
          >
            <option value="all">All proposal statuses</option>
            <option value="pending">Pending</option>
            <option value="selected">Selected</option>
            <option value="not_selected">Not selected</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>
            <input
              className="min-h-[42px] w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
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
          </div>
          <div className="max-h-32 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex flex-wrap gap-2">
              {visibleSkillOptions.length === 0 ? (
                <span className="text-xs text-slate-500">No skills available.</span>
              ) : (
                visibleSkillOptions.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleSkillFilter(skill)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      selectedSkillKeys.has(toSkillKey(skill))
                        ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
                        : "border-white/10 bg-white/10 text-slate-200 hover:bg-white/20"
                    }`}
                  >
                    {selectedSkillKeys.has(toSkillKey(skill)) ? "Added" : "Add"} {skill}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          {jobsLoading ? (
            <EmptyState title="Loading jobs" description="Fetching jobs..." />
          ) : filteredJobs.length === 0 ? (
            <EmptyState
              title={jobs.length === 0 ? "No jobs yet" : "No matching jobs"}
              description={
                jobs.length === 0
                  ? "Post a job to start receiving proposals."
                  : "Adjust filters to view more jobs."
              }
            />
          ) : (
            filteredJobs.map((job) => {
              const hasProject = projectsByJob.has(job.id);
              return (
                <JobCard
                  key={job.id}
                  job={job}
                  action={selectedJobId === job.id ? "Selected" : "View details"}
                  actionVariant={selectedJobId === job.id ? "primary" : "ghost"}
                  onAction={() => setSelectedJobId(job.id)}
                  secondaryAction={hasProject ? "Open project" : undefined}
                  onSecondaryAction={hasProject ? handleOpenJobProject : undefined}
                />
              );
            })
          )}
        </div>

        <div className="space-y-4">
          {!selectedJob ? (
            <EmptyState
              title="Select a job"
              description="Choose a job to review proposals and manage actions."
            />
          ) : (
            <>
              <div className="glass-card rounded-2xl p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold text-white">
                      {selectedJob.title || "Untitled job"}
                    </h4>
                    <p className="mt-1 text-xs text-slate-400">
                      Budget {formatBudget(selectedJob)} · Created{" "}
                      {formatDate(selectedJob.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={selectedJob.status || "pending"} />
                </div>
                <div className="mt-4 grid gap-3 text-xs text-slate-300 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    Total: {proposalStats.total}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    Top ranked: {proposalStats.top}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    Selected: {proposalStats.selected}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    Pending: {proposalStats.pending}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Project requirements
                    </p>
                    <div className="mt-2 grid gap-1 text-sm text-slate-200">
                      <p>
                        Category: {selectedJob.category || "General"}
                        {selectedJob.subcategory ? ` · ${selectedJob.subcategory}` : ""}
                      </p>
                      <p>Scope: {selectedJob.scope || "N/A"}</p>
                      <p>Experience: {selectedJob.experienceLevel || "N/A"}</p>
                      <p>Location: {selectedJob.location || "Remote"}</p>
                      <p>Hires: {selectedJob.hires || 1}</p>
                      <p>Priority: {selectedJob.priority || "standard"}</p>
                      <p>Communication: {selectedJob.communication || "email"}</p>
                      <p>NDA required: {selectedJob.ndaRequired ? "Yes" : "No"}</p>
                      <p>Start date: {formatDate(selectedJob.startDate)}</p>
                      <p>Duration: {selectedJob.duration || selectedJob.timeline || "N/A"}</p>
                      <p>Deadline: {selectedJob.deadline || "N/A"}</p>
                      {selectedJob.weeklyHours ? (
                        <p>Weekly hours: {selectedJob.weeklyHours}</p>
                      ) : null}
                      {selectedJob.milestoneCount ? (
                        <p>Milestones: {selectedJob.milestoneCount}</p>
                      ) : null}
                      {selectedJob.escrowAmount ? (
                        <p>
                          Escrow: {selectedJob.currency || "INR"} {selectedJob.escrowAmount}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Brief and acceptance
                    </p>
                    <div className="mt-2 grid gap-2 text-sm text-slate-200">
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
                            className="break-all rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 hover:bg-white/10"
                          >
                            {link}
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
                      <div className="mt-2 grid gap-1 text-sm text-slate-200">
                        {selectedJobScreeningQuestions.map((question, index) => (
                          <p key={`${question}-${index}`}>{index + 1}. {question}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                {selectedProposal ? (
                  <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                    <p className="font-semibold">
                      Selected freelancer:{" "}
                      <UserProfileLink
                        userId={
                          selectedProposal.freelancerId || selectedJob.selectedFreelancerId
                        }
                        name={
                          selectedProposal.freelancerName ||
                          selectedJob.selectedFreelancerName ||
                          selectedProposal.freelancerId ||
                          selectedJob.selectedFreelancerId ||
                          "N/A"
                        }
                        className="text-emerald-100 underline hover:text-white"
                      />
                    </p>
                    <p className="mt-1 text-xs">
                      Proposal ID {selectedProposal.id}
                    </p>
                    {!activeProject || projectConnectionPending ? (
                      <p className="mt-1 text-xs">
                        Waiting for admin to connect client and freelancer workspace.
                      </p>
                    ) : null}
                  </div>
                ) : selectedJob.status === "approved" ? (
                  <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                    Job is approved. Review ranked proposals and select one freelancer.
                  </div>
                ) : selectedJob.status === "pending" ? (
                  <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                    Job is waiting for admin approval.
                  </div>
                ) : null}
              </div>

              {activeProject && projectConnectionPending ? (
                <div className="glass-card rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-sm text-amber-200 sm:p-6">
                  Freelancer is selected and admin connection is pending. Workspace actions unlock after admin clicks Connect Client & Freelancer.
                </div>
              ) : null}

              {activeProject && !projectConnectionPending ? (
                <div className="glass-card rounded-2xl p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-white">
                      3-stage payment flow
                    </h4>
                    <StatusBadge status={activeProject.status || "in_progress"} />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    Project ID: {activeProject.id} · Escrow total: INR{" "}
                    {selectedEscrowTotal.toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Flow: client funds installment to admin escrow, admin reviews
                    work, then admin releases payment to freelancer.
                  </p>

                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    {installmentProgress.map((entry) => (
                      <div
                        key={entry.installmentNumber}
                        className="rounded-xl border border-white/10 bg-white/5 p-4"
                      >
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          {entry.label}
                        </p>
                        <p className="mt-2 text-sm text-slate-200">
                          {entry.amount
                            ? `INR ${entry.amount.toFixed(2)}`
                            : "Not funded"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {entry.description}
                        </p>
                        <div className="mt-2">
                          {entry.status === "not_funded" ? (
                            <span className="rounded-full border border-slate-400/30 bg-slate-500/10 px-3 py-1 text-xs uppercase text-slate-300">
                              not funded
                            </span>
                          ) : (
                            <StatusBadge status={entry.status} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                    <input
                      className="min-h-[42px] rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
                      placeholder={
                        nextInstallmentNumber
                          ? `Installment ${nextInstallmentNumber} amount`
                          : "All installments funded"
                      }
                      value={amounts[activeProject.id] || ""}
                      onChange={(event) =>
                        handleAmountChange(activeProject.id, event.target.value)
                      }
                    />
                    <Button
                      className="w-full lg:w-auto"
                      onClick={() => handleFundEscrow(activeProject)}
                      disabled={
                        !isApprovedClient ||
                        !nextInstallmentNumber ||
                        processing === `escrow-${activeProject.id}-${nextInstallmentNumber}`
                      }
                    >
                      {nextInstallmentNumber
                        ? `Fund installment ${nextInstallmentNumber}`
                        : "All installments funded"}
                    </Button>
                  </div>
                  {!nextInstallmentNumber && fundingState.reason ? (
                    <p className="mt-2 text-xs text-amber-300">
                      {fundingState.reason}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-slate-500">
                    Commission rate: {commissionRate}% (auto-calculated)
                  </p>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link to={getProjectWorkspaceRoute(activeProject)}>
                      <Button variant="ghost">Open project</Button>
                    </Link>
                    <Button
                      variant="ghost"
                      onClick={() => handleRequestUpdate(activeProject, "revision_requested")}
                      disabled={
                        processing === `update-${activeProject.id}-revision_requested`
                      }
                    >
                      Request revision
                    </Button>
                    <Button
                      onClick={() => handleRequestUpdate(activeProject, "completed")}
                      disabled={processing === `update-${activeProject.id}-completed`}
                    >
                      Approve completion
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                    <input
                      className="min-h-[42px] rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
                      placeholder="Dispute reason"
                      value={disputes[activeProject.id] || ""}
                      onChange={(event) =>
                        handleDisputeChange(activeProject.id, event.target.value)
                      }
                    />
                    <Button
                      className="w-full lg:w-auto"
                      variant="danger"
                      onClick={() => handleRaiseDispute(activeProject)}
                      disabled={
                        !isApprovedClient || processing === `dispute-${activeProject.id}`
                      }
                    >
                      Raise dispute
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="glass-card rounded-2xl p-5 sm:p-6">
                <h4 className="text-sm font-semibold text-white">
                  Freelancer applications
                </h4>
                <div className="mt-4 space-y-3">
                  <ProposalsList
                    proposals={selectedJobProposals}
                    loading={jobProposalsLoading}
                    canSelectFreelancer={
                      isApprovedClient &&
                      String(selectedJob?.status || "").toLowerCase() === "approved" &&
                      !selectedProposalId
                    }
                    selectedProposalId={selectedProposalId}
                    selectingProposalId={selectingProposalId}
                    onSelectFreelancer={openSelectFreelancerConfirm}
                    page={jobProposalsPayload?.pagination?.page || jobProposalsPage}
                    totalPages={jobProposalsPayload?.pagination?.totalPages || 1}
                    total={jobProposalsPayload?.pagination?.total || 0}
                    onPageChange={setJobProposalsPage}
                    showRank
                    emptyTitle="No proposals yet"
                    emptyDescription="Freelancer proposals will appear here."
                  />
                  {selectedProposalId && activeProject && !projectConnectionPending ? (
                    <div className="pt-1">
                      <Link to={getProjectWorkspaceRoute(activeProject)}>
                        <Button variant="ghost">Open selected project</Button>
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>

              {activeProject && !projectConnectionPending ? (
                <div className="glass-card rounded-2xl p-5 sm:p-6">
                  <h4 className="text-sm font-semibold text-white">
                    Project activity
                  </h4>
                  <div className="mt-4 grid gap-4 lg:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Payments
                      </p>
                      {activeProjectPayments.length === 0 ? (
                        <p className="mt-3 text-xs text-slate-500">No payments yet.</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {activeProjectPayments.slice(0, 4).map((payment) => (
                            <div key={payment.id} className="text-xs text-slate-300">
                              #{payment.installmentNumber || 1}{" "}
                              {payment.installmentLabel || ""} · INR{" "}
                              {Number(payment.amount || 0).toFixed(2)} ·{" "}
                              <span className="text-slate-400">
                                {payment.status || "unknown"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Update requests
                      </p>
                      {activeProjectUpdates.length === 0 ? (
                        <p className="mt-3 text-xs text-slate-500">No requests yet.</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {activeProjectUpdates
                            .slice()
                            .sort((a, b) => {
                              const aTime = toDate(a.createdAt)?.getTime() || 0;
                              const bTime = toDate(b.createdAt)?.getTime() || 0;
                              return bTime - aTime;
                            })
                            .slice(0, 4)
                            .map((entry) => (
                              <div key={entry.id} className="text-xs text-slate-300">
                                {entry.requestedStatus || "status"} ·{" "}
                                <span className="text-slate-400">
                                  {entry.status || "pending"}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Disputes
                      </p>
                      {activeProjectDisputes.length === 0 ? (
                        <p className="mt-3 text-xs text-slate-500">No disputes.</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {activeProjectDisputes
                            .slice()
                            .sort((a, b) => {
                              const aTime = toDate(a.createdAt)?.getTime() || 0;
                              const bTime = toDate(b.createdAt)?.getTime() || 0;
                              return bTime - aTime;
                            })
                            .slice(0, 4)
                            .map((entry) => (
                              <div key={entry.id} className="text-xs text-slate-300">
                                {entry.status || "open"} ·{" "}
                                <span className="text-slate-400">
                                  {formatDateTime(entry.createdAt)}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {pendingSelection ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-night-950/75 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-night-900/95 p-5 shadow-2xl sm:p-6">
            <h4 className="text-lg font-semibold text-white">
              Confirm freelancer selection
            </h4>
            <p className="mt-2 text-sm text-slate-300">
              This will select {pendingSelection.freelancerName} and close the job for new applications.
            </p>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
              <p>Job: {selectedJob?.title || "Selected job"}</p>
              <p>
                Bid:{" "}
                {pendingSelection.bidAmount != null &&
                Number.isFinite(Number(pendingSelection.bidAmount))
                  ? `INR ${Number(pendingSelection.bidAmount).toLocaleString()}`
                  : "Not specified"}
              </p>
              <p>
                Delivery: {pendingSelection.deliveryTime || "Not specified"}
              </p>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setPendingSelection(null)}
                disabled={Boolean(selectingProposalId)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleSelectFreelancer(pendingSelection.proposalId)}
                disabled={Boolean(selectingProposalId)}
              >
                {selectingProposalId ? "Selecting..." : "Confirm selection"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {status ? <p className="text-sm text-slate-300">{status}</p> : null}
    </DashboardLayout>
  );
}
