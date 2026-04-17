import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import StatCard from "../../components/StatCard.jsx";
import Table from "../../components/Table.jsx";
import Button from "../../components/Button.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import UserProfileLink from "../../components/UserProfileLink.jsx";
import { adminNav } from "../../data/nav.js";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { connectProjectMembers } from "../../services/marketplaceFlowApi.js";

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

const toStatus = (value) => String(value || "").trim().toLowerCase();

export default function AdminAssignments() {
  const { user } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [processing, setProcessing] = useState("");
  const [activeProjectId, setActiveProjectId] = useState(null);

  const { data: jobs = [], loading: jobsLoading } = useFirestoreQuery(
    () => collection(db, "jobs"),
    []
  );
  const { data: projects = [], loading: projectsLoading } = useFirestoreQuery(
    () => collection(db, "projects"),
    []
  );

  const jobsById = useMemo(() => {
    const map = new Map();
    jobs.forEach((job) => {
      map.set(job.id, job);
    });
    return map;
  }, [jobs]);

  const pendingConnectProjects = useMemo(() => {
    return projects
      .filter((project) => {
        const statusValue = toStatus(project.status);
        return statusValue === "assigned" || statusValue === "in_progress";
      })
      .sort((left, right) => {
        const leftTime = toDate(left.createdAt)?.getTime() || 0;
        const rightTime = toDate(right.createdAt)?.getTime() || 0;
        return rightTime - leftTime;
      });
  }, [projects]);

  const connectedProjects = useMemo(() => {
    return projects
      .filter((project) => toStatus(project.status) === "connected")
      .sort((left, right) => {
        const leftTime =
          toDate(left.connectedAt || left.updatedAt || left.createdAt)?.getTime() || 0;
        const rightTime =
          toDate(right.connectedAt || right.updatedAt || right.createdAt)?.getTime() || 0;
        return rightTime - leftTime;
      });
  }, [projects]);

  const jobsWithSelectedFreelancer = useMemo(() => {
    return jobs.filter((job) => Boolean(job.selectedProposalId));
  }, [jobs]);

  const activeProject = useMemo(() => {
    if (!activeProjectId) return null;
    return projects.find((project) => project.id === activeProjectId) || null;
  }, [activeProjectId, projects]);

  const activeProjectJob = useMemo(() => {
    if (!activeProject?.jobId) return null;
    return jobsById.get(activeProject.jobId) || null;
  }, [activeProject?.jobId, jobsById]);

  const handleConnect = async (project) => {
    if (!user || !project?.id) return;
    setStatus("");
    setProcessing(project.id);
    try {
      await connectProjectMembers(user, project.id);
      const message = `Project ${project.id} connected successfully.`;
      setStatus(message);
      toast.success(message);
    } catch (err) {
      const message = err?.message || "Failed to connect client and freelancer.";
      setStatus(message);
      toast.error(message);
    } finally {
      setProcessing("");
    }
  };

  const queueRows = pendingConnectProjects.map((project) => {
    const job = jobsById.get(project.jobId) || null;
    const row = [
      job?.title || project.jobTitle || "Untitled job",
      (
        <UserProfileLink
          key={`${project.id}-client-link`}
          userId={project.clientId}
          name={project.clientName || project.clientId || "N/A"}
          className="text-sky-200 underline hover:text-sky-100"
        />
      ),
      (
        <UserProfileLink
          key={`${project.id}-freelancer-link`}
          userId={project.freelancerId}
          name={project.freelancerName || project.freelancerId || "N/A"}
          className="text-sky-200 underline hover:text-sky-100"
        />
      ),
      { type: "status", value: project.status || "assigned" },
      formatDate(project.createdAt),
      <div key={project.id} className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => setActiveProjectId(project.id)}>
          Review
        </Button>
        <Button
          onClick={() => handleConnect(project)}
          disabled={processing === project.id}
        >
          {processing === project.id ? "Connecting..." : "Connect"}
        </Button>
      </div>
    ];
    row.id = project.id;
    return row;
  });

  const loading = jobsLoading || projectsLoading;

  return (
    <DashboardLayout
      title="Assignment Queue"
      sidebar={{ title: "Admin HQ", subtitle: "Admin", items: adminNav }}
    >
      <PageHeader
        title="Project connection queue"
        description="After client selects a freelancer, admin connects both members to unlock project workspace."
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <StatCard title="Total projects" value={projects.length} />
        <StatCard title="Pending connect" value={pendingConnectProjects.length} />
        <StatCard title="Connected" value={connectedProjects.length} />
        <StatCard
          title="Jobs with selection"
          value={jobsWithSelectedFreelancer.length}
          meta="Client selected freelancer"
        />
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-white">Connect required</h4>
        {loading ? (
          <EmptyState title="Loading assignments" description="Fetching projects..." />
        ) : queueRows.length === 0 ? (
          <EmptyState
            title="No pending connect actions"
            description="Projects awaiting admin connection will appear here."
          />
        ) : (
          <Table
            columns={[
              "Job",
              "Client",
              "Freelancer",
              "Project status",
              "Created",
              "Action"
            ]}
            rows={queueRows}
            getRowKey={(row) => row.id}
          />
        )}
      </section>

      {activeProject ? (
        <section className="glass-card rounded-2xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Selected project
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                {activeProjectJob?.title || activeProject.jobTitle || "Untitled job"}
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                Project ID: {activeProject.id} · Job ID: {activeProject.jobId || "N/A"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={activeProject.status || "assigned"} />
              <Button variant="ghost" onClick={() => setActiveProjectId(null)}>
                Close
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Client</p>
              <p className="mt-2 text-white">
                <UserProfileLink
                  userId={activeProject.clientId}
                  name={activeProject.clientName || activeProject.clientId || "N/A"}
                  className="text-white underline hover:text-sky-200"
                />
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Freelancer</p>
              <p className="mt-2 text-white">
                <UserProfileLink
                  userId={activeProject.freelancerId}
                  name={activeProject.freelancerName || activeProject.freelancerId || "N/A"}
                  className="text-white underline hover:text-sky-200"
                />
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              onClick={() => handleConnect(activeProject)}
              disabled={processing === activeProject.id}
            >
              {processing === activeProject.id ? "Connecting..." : "Connect Client & Freelancer"}
            </Button>
            <Link to={`/project/${activeProject.id}`}>
              <Button variant="ghost">Open project</Button>
            </Link>
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-white">Recently connected</h4>
        {connectedProjects.length === 0 ? (
          <EmptyState
            title="No connected projects yet"
            description="Connected projects will appear here."
          />
        ) : (
          <div className="grid gap-3">
            {connectedProjects.slice(0, 8).map((project) => {
              const job = jobsById.get(project.jobId) || null;
              return (
                <div key={project.id} className="glass-card rounded-2xl p-4 text-sm text-slate-300">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">
                        {job?.title || project.jobTitle || "Untitled job"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Client:{" "}
                        <UserProfileLink
                          userId={project.clientId}
                          name={project.clientName || project.clientId || "N/A"}
                          className="text-sky-200 underline hover:text-sky-100"
                        />{" "}
                        · Freelancer:{" "}
                        <UserProfileLink
                          userId={project.freelancerId}
                          name={project.freelancerName || project.freelancerId || "N/A"}
                          className="text-sky-200 underline hover:text-sky-100"
                        />
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={project.status || "connected"} />
                      <Link to={`/project/${project.id}`} className="text-xs underline">
                        Open project
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {status ? <p className="text-sm text-slate-300">{status}</p> : null}
    </DashboardLayout>
  );
}
