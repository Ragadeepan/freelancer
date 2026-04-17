import { useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import Button from "../../components/Button.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import UserProfileLink from "../../components/UserProfileLink.jsx";
import { freelancerNav } from "../../data/nav.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { collection, query, where } from "firebase/firestore";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { createProjectUpdate } from "../../services/projectUpdatesService.js";
import { createDispute } from "../../services/disputesService.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { filterVisibleProjects } from "../../utils/projectVisibility.js";
import { ACCOUNT_STATUS, normalizeAccountStatus } from "../../utils/accountStatus.js";

const toStatus = (value) => String(value || "").trim().toLowerCase();
const isConnectedProject = (project) => toStatus(project?.status) === "connected";
const getProjectWorkspaceRoute = (project) =>
  project?.contractId ? `/workspace/project/${project.contractId}` : `/project/${project.id}`;

export default function FreelancerProjects() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const normalizedStatus = normalizeAccountStatus(profile?.status);
  const isApproved = normalizedStatus === ACCOUNT_STATUS.APPROVED;
  const { data: projects = [], loading } = useFirestoreQuery(
    () =>
      user && isApproved
        ? query(collection(db, "projects"), where("freelancerId", "==", user.uid))
        : null,
    [user, isApproved]
  );
  const visibleProjects = filterVisibleProjects(projects);
  const [status, setStatus] = useState("");
  const [disputes, setDisputes] = useState({});

  const ensureConnected = (project, actionLabel) => {
    if (isConnectedProject(project)) return true;
    const message = `Admin connection pending. You can ${actionLabel} after admin connects client and freelancer.`;
    setStatus(message);
    toast.permission(message);
    return false;
  };

  const requestUpdate = async (project, requestedStatus) => {
    setStatus("");
    if (!ensureConnected(project, "submit updates")) return;
    try {
      await createProjectUpdate({
        projectId: project.id,
        requestedBy: user.uid,
        requestedStatus,
        message: `Freelancer requested status: ${requestedStatus}`
      });
      setStatus("Update sent to Admin for approval.");
      toast.success("Update request sent.");
    } catch (err) {
      setStatus(err.message || "Failed to request update.");
      toast.error("Failed to request update.");
    }
  };

  const handleDisputeChange = (projectId, value) => {
    setDisputes((prev) => ({ ...prev, [projectId]: value }));
  };

  const handleRaiseDispute = async (project) => {
    setStatus("");
    if (!ensureConnected(project, "raise disputes")) return;
    const reason = disputes[project.id]?.trim();
    if (!reason) {
      setStatus("Provide a reason to raise a dispute.");
      return;
    }
    try {
      await createDispute({
        projectId: project.id,
        raisedBy: user.uid,
        reason
      });
      setStatus("Dispute submitted to Admin.");
      toast.success("Dispute submitted.");
    } catch (err) {
      setStatus(err.message || "Failed to raise dispute.");
      toast.error("Failed to raise dispute.");
    }
  };

  return (
    <DashboardLayout
      title="Projects"
      sidebar={{
        title: "Growlanzer",
        subtitle: "Freelancer",
        items: freelancerNav
      }}
    >
      <PageHeader
        title="Active engagements"
        description="Status updates require Admin approval."
      />
      {normalizedStatus === ACCOUNT_STATUS.PENDING_APPROVAL ? (
        <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          🚫 Admin approval required before applying to jobs.
        </div>
      ) : null}
      <div className="grid gap-4">
        {loading ? (
          <EmptyState title="Loading projects" description="Fetching..." />
        ) : !isApproved ? (
          <EmptyState
            title="Approval required"
            description="Admin approval is required before viewing projects."
          />
        ) : visibleProjects.length === 0 ? (
          <EmptyState
            title="No active projects"
            description="Projects appear once a client selects your proposal."
          />
        ) : (
          visibleProjects.map((project) => (
            <div key={project.id} className="glass-card rounded-2xl p-6">
              {(() => {
                const connected = isConnectedProject(project);
                return (
                  <>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h4 className="text-lg font-semibold text-white">
                    {project.jobTitle || "Project"}
                  </h4>
                  <p className="mt-1 text-sm text-slate-400">
                    Client:{" "}
                    <UserProfileLink
                      userId={project.clientId}
                      name={project.clientName || project.clientId}
                      className="text-sky-200 underline hover:text-sky-100"
                    />
                  </p>
                </div>
                <StatusBadge status={project.status} />
              </div>
              {!connected ? (
                <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                  Admin connection pending. Work submission and project actions unlock after admin connects both members.
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <Link to={getProjectWorkspaceRoute(project)}>
                  <Button variant="ghost">
                    Open project
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  onClick={() => requestUpdate(project, "in_progress")}
                >
                  Submit update
                </Button>
                <Button
                  onClick={() => requestUpdate(project, "work_submitted")}
                >
                  Submit work
                </Button>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                <input
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500"
                  placeholder="Dispute reason"
                  value={disputes[project.id] || ""}
                  onChange={(event) =>
                    handleDisputeChange(project.id, event.target.value)
                  }
                />
                <Button
                  variant="danger"
                  onClick={() => handleRaiseDispute(project)}
                >
                  Raise dispute
                </Button>
              </div>
                  </>
                );
              })()}
            </div>
          ))
        )}
        {status && <p className="text-sm text-slate-300">{status}</p>}
      </div>
    </DashboardLayout>
  );
}


