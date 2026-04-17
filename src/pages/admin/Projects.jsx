import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import StatCard from "../../components/StatCard.jsx";
import Table from "../../components/Table.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import Button from "../../components/Button.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import UserProfileLink from "../../components/UserProfileLink.jsx";
import { adminNav } from "../../data/nav.js";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import { updateProjectStatus } from "../../services/projectsService.js";
import {
  approveProjectUpdate,
  rejectProjectUpdate
} from "../../services/projectUpdatesService.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";

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

export default function AdminProjects() {
  const { user } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [processing, setProcessing] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: projects = [], loading: projectsLoading } = useFirestoreQuery(
    () => collection(db, "projects"),
    []
  );
  const { data: projectUpdates = [] } = useFirestoreQuery(
    () => collection(db, "projectUpdates"),
    []
  );

  const pendingUpdates = useMemo(
    () => projectUpdates.filter((entry) => entry.status === "pending"),
    [projectUpdates]
  );

  const projectById = useMemo(() => {
    return projects.reduce((acc, project) => {
      acc[project.id] = project;
      return acc;
    }, {});
  }, [projects]);

  const projectCounts = useMemo(() => {
    return projects.reduce(
      (acc, project) => {
        const status = toStatus(project.status);
        if (status === "assigned") acc.assigned += 1;
        if (status === "connected") acc.connected += 1;
        if (status === "in_progress") acc.inProgress += 1;
        if (status === "frozen") acc.frozen += 1;
        if (status === "completed") acc.completed += 1;
        return acc;
      },
      { assigned: 0, connected: 0, inProgress: 0, frozen: 0, completed: 0 }
    );
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return projects.filter((project) => {
      if (
        statusFilter !== "all" &&
        (project.status || "unknown") !== statusFilter
      ) {
        return false;
      }
      if (!searchTerm) return true;
      return (
        String(project.jobTitle || "").toLowerCase().includes(searchTerm) ||
        String(project.clientName || project.clientId || "")
          .toLowerCase()
          .includes(searchTerm) ||
        String(project.freelancerName || project.freelancerId || "")
          .toLowerCase()
          .includes(searchTerm) ||
        String(project.id || "").toLowerCase().includes(searchTerm)
      );
    });
  }, [projects, search, statusFilter]);

  const handleToggleFreeze = async (project) => {
    if (!user?.uid) return;
    const targetStatus = project.status === "frozen" ? "in_progress" : "frozen";
    setStatus("");
    setProcessing(project.id);
    try {
      await updateProjectStatus(project.id, targetStatus, user.uid);
      setStatus(
        `Project ${project.jobTitle || project.id} set to ${targetStatus}.`
      );
      toast.success(
        targetStatus === "frozen" ? "Project frozen." : "Project unfrozen."
      );
    } catch (err) {
      setStatus(err.message || "Failed to update project status.");
      toast.error("Failed to update project status.");
    } finally {
      setProcessing(null);
    }
  };

  const handleApproveUpdate = async (update) => {
    if (!user?.uid) return;
    setStatus("");
    setProcessing(update.id);
    try {
      await approveProjectUpdate(update.id, user.uid);
      setStatus("Project update approved.");
      toast.success("Update approved.");
    } catch (err) {
      setStatus(err.message || "Failed to approve update.");
      toast.error("Failed to approve update.");
    } finally {
      setProcessing(null);
    }
  };

  const handleRejectUpdate = async (update) => {
    if (!user?.uid) return;
    setStatus("");
    setProcessing(update.id);
    try {
      await rejectProjectUpdate(update.id, user.uid);
      setStatus("Project update rejected.");
      toast.success("Update rejected.");
    } catch (err) {
      setStatus(err.message || "Failed to reject update.");
      toast.error("Failed to reject update.");
    } finally {
      setProcessing(null);
    }
  };

  const updateRows = pendingUpdates.map((update) => {
    const project = projectById[update.projectId];
    const row = [
      project?.jobTitle || update.projectId || "N/A",
      update.requestedBy || "N/A",
      update.requestedStatus || "N/A",
      formatDate(update.createdAt),
      <div key={`${update.id}-actions`} className="flex gap-2">
        <Button
          variant="ghost"
          onClick={() => handleRejectUpdate(update)}
          disabled={processing === update.id}
        >
          Reject
        </Button>
        <Button
          variant="primary"
          onClick={() => handleApproveUpdate(update)}
          disabled={processing === update.id}
        >
          Approve
        </Button>
      </div>
    ];
    row.id = update.id;
    return row;
  });

  return (
    <DashboardLayout
      title="Projects"
      sidebar={{ title: "Admin HQ", subtitle: "Admin", items: adminNav }}
    >
      <PageHeader
        title="Project oversight"
        description="Control project lifecycle, process requested status changes, and freeze risky projects."
      />

      <section className="grid gap-4 lg:grid-cols-5">
        <StatCard title="Total projects" value={projects.length} />
        <StatCard
          title="Assigned / Connected"
          value={`${projectCounts.assigned} / ${projectCounts.connected}`}
        />
        <StatCard title="In progress" value={projectCounts.inProgress} />
        <StatCard title="Frozen" value={projectCounts.frozen} />
        <StatCard
          title="Pending updates"
          value={pendingUpdates.length}
          meta="Needs admin decision"
        />
      </section>

      <section className="glass-card rounded-2xl p-5">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.6fr]">
          <input
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
            placeholder="Search by project, client, freelancer, or id"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="assigned">Assigned</option>
            <option value="connected">Connected</option>
            <option value="in_progress">In progress</option>
            <option value="frozen">Frozen</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-white">
          Active projects ({filteredProjects.length})
        </h4>
        {projectsLoading ? (
          <EmptyState title="Loading projects" description="Fetching projects..." />
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            title="No matching projects"
            description="Try adjusting filters."
          />
        ) : (
          <div className="grid gap-4">
            {filteredProjects.map((project) => {
              const normalizedStatus = toStatus(project.status);
              const canToggleFreeze =
                normalizedStatus === "connected" ||
                normalizedStatus === "in_progress" ||
                normalizedStatus === "frozen";
              const isFrozen = normalizedStatus === "frozen";
              return (
                <div key={project.id} className="glass-card rounded-2xl p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h4 className="text-lg font-semibold text-white">
                        {project.jobTitle || "Project"}
                      </h4>
                      <p className="mt-1 text-sm text-slate-400">
                        Client:{" "}
                        <UserProfileLink
                          userId={project.clientId}
                          name={project.clientName || project.clientId || "N/A"}
                          className="text-sky-200 underline hover:text-sky-100"
                        />{" "}
                        ·
                        Freelancer:{" "}
                        <UserProfileLink
                          userId={project.freelancerId}
                          name={project.freelancerName || project.freelancerId || "N/A"}
                          className="text-sky-200 underline hover:text-sky-100"
                        />
                      </p>
                    </div>
                    <StatusBadge status={project.status || "unknown"} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link to={`/project/${project.id}`}>
                      <Button variant="ghost">Open project</Button>
                    </Link>
                    <Button
                      variant={isFrozen ? "ghost" : "danger"}
                      onClick={() => handleToggleFreeze(project)}
                      disabled={!canToggleFreeze || processing === project.id}
                    >
                      {isFrozen ? "Unfreeze project" : "Freeze project"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-white">Pending status updates</h4>
        {updateRows.length === 0 ? (
          <EmptyState
            title="No updates pending"
            description="Project status requests will appear here."
          />
        ) : (
          <Table
            columns={["Project", "Requested by", "Requested status", "Date", "Action"]}
            rows={updateRows}
            getRowKey={(row) => row.id}
          />
        )}
      </section>

      {status ? <p className="text-sm text-slate-300">{status}</p> : null}
    </DashboardLayout>
  );
}
