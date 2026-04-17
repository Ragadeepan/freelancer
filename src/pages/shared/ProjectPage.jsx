import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import Timeline from "../../components/Timeline.jsx";
import UploadBox from "../../components/UploadBox.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import Button from "../../components/Button.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import UserProfileLink from "../../components/UserProfileLink.jsx";
import { freelancerNav, clientNav, adminNav } from "../../data/nav.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { collection, doc, query, where } from "firebase/firestore";
import { db } from "../../firebase/firebase.js";
import useFirestoreDoc from "../../hooks/useFirestoreDoc.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";
import {
  approveProjectUpdate,
  rejectProjectUpdate
} from "../../services/projectUpdatesService.js";
import { createProjectUpdate } from "../../services/projectUpdatesService.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { checkProjectWorkspaceAccess } from "../../services/marketplaceFlowApi.js";
import { resolveFileUrl } from "../../utils/fileUrl.js";

export default function ProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const toast = useToast();
  const { data: project, loading } = useFirestoreDoc(
    () => (id ? doc(db, "projects", id) : null),
    [id],
    null
  );
  const { data: updates = [] } = useFirestoreQuery(
    () =>
      id
        ? query(collection(db, "projectUpdates"), where("projectId", "==", id))
        : null,
    [id]
  );
  const [status, setStatus] = useState("");
  const [processing, setProcessing] = useState(null);
  const [clientImgError, setClientImgError] = useState(false);
  const [freelancerImgError, setFreelancerImgError] = useState(false);
  const [workspaceAccess, setWorkspaceAccess] = useState({
    loading: true,
    allowed: false,
    reason: ""
  });
  const clientPhotoUrl = resolveFileUrl(project?.clientPhotoURL);
  const freelancerPhotoUrl = resolveFileUrl(project?.freelancerPhotoURL);
  const normalizedRole = String(profile?.role || "").trim().toLowerCase();

  const sidebar = useMemo(() => {
    if (profile?.role === "admin") {
      return { title: "Admin HQ", subtitle: "Admin", items: adminNav };
    }
    if (profile?.role === "client") {
      return { title: "Client Suite", subtitle: "Client", items: clientNav };
    }
    return { title: "Growlanzer", subtitle: "Freelancer", items: freelancerNav };
  }, [profile]);

  useEffect(() => {
    if (authLoading) {
      setWorkspaceAccess((prev) => ({ ...prev, loading: true }));
      return;
    }

    if (!id || !user) {
      setWorkspaceAccess({
        loading: false,
        allowed: false,
        reason: "Authentication required."
      });
      return;
    }

    let isMounted = true;

    const verifyWorkspaceAccess = async () => {
      setWorkspaceAccess((prev) => ({ ...prev, loading: true, reason: "" }));
      try {
        const response = await checkProjectWorkspaceAccess(user, id);
        if (!isMounted) return;
        setWorkspaceAccess({
          loading: false,
          allowed: Boolean(response?.canAccess),
          reason: String(response?.reason || "")
        });
      } catch (error) {
        if (!isMounted) return;
        setWorkspaceAccess({
          loading: false,
          allowed: false,
          reason: error?.message || "You do not have access to this project workspace."
        });
      }
    };

    verifyWorkspaceAccess();

    return () => {
      isMounted = false;
    };
  }, [authLoading, id, user]);

  useEffect(() => {
    if (authLoading || !project?.contractId) return;
    if (normalizedRole !== "client" && normalizedRole !== "freelancer") return;
    navigate(`/workspace/project/${project.contractId}`, { replace: true });
  }, [authLoading, navigate, normalizedRole, project?.contractId]);

  useEffect(() => {
    setClientImgError(false);
  }, [clientPhotoUrl]);

  useEffect(() => {
    setFreelancerImgError(false);
  }, [freelancerPhotoUrl]);

  const handleRequestUpdate = async (requestedStatus) => {
    if (!project) return;
    setStatus("");
    try {
      await createProjectUpdate({
        projectId: project.id,
        requestedBy: user.uid,
        requestedStatus,
        message: `${profile?.role || "member"} requested status: ${requestedStatus}`
      });
      setStatus("Update request sent to Admin for approval.");
      toast.success("Update request sent.");
    } catch (err) {
      setStatus(err.message || "Failed to request update.");
      toast.error("Failed to request update.");
    }
  };

  const handleApproveUpdate = async (update) => {
    setStatus("");
    setProcessing(update.id);
    try {
      await approveProjectUpdate(update.id, user.uid);
      setStatus("Update approved.");
      toast.success("Update approved.");
    } catch (err) {
      setStatus(err.message || "Failed to approve update.");
      toast.error("Failed to approve update.");
    } finally {
      setProcessing(null);
    }
  };

  const handleRejectUpdate = async (update) => {
    setStatus("");
    setProcessing(update.id);
    try {
      await rejectProjectUpdate(update.id, user.uid);
      setStatus("Update rejected.");
      toast.success("Update rejected.");
    } catch (err) {
      setStatus(err.message || "Failed to reject update.");
      toast.error("Failed to reject update.");
    } finally {
      setProcessing(null);
    }
  };

  return (
    <DashboardLayout
      title="Project Detail"
      sidebar={sidebar}
    >
      {workspaceAccess.loading ? (
        <EmptyState title="Checking workspace access" description="Verifying permissions..." />
      ) : !workspaceAccess.allowed ? (
        <EmptyState
          title="Workspace access denied"
          description={
            workspaceAccess.reason ||
            "Only connected project members can access this workspace."
          }
        />
      ) : loading ? (
        <EmptyState title="Loading project" description="Fetching project data..." />
      ) : !project ? (
        <EmptyState
          title="Project not found"
          description="This project may not exist or you do not have access."
        />
      ) : (
        <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <div className="glass-card rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-2xl font-semibold text-white">
                    {project.jobTitle || "Project"}
                  </h3>
                  <p className="mt-2 text-sm text-slate-400">
                    Client:{" "}
                    <UserProfileLink
                      userId={project.clientId}
                      name={project.clientName || project.clientId}
                      className="text-sky-200 underline hover:text-sky-100"
                    />{" "}
                    · Freelancer:{" "}
                    <UserProfileLink
                      userId={project.freelancerId}
                      name={project.freelancerName || project.freelancerId}
                      className="text-sky-200 underline hover:text-sky-100"
                    />
                  </p>
                </div>
                <StatusBadge status={project.status} />
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                {profile?.role === "freelancer" ? (
                  <>
                    <Button onClick={() => handleRequestUpdate("in_progress")}>
                      Submit update
                    </Button>
                    <Button variant="ghost" onClick={() => handleRequestUpdate("work_submitted")}>
                      Submit work
                    </Button>
                  </>
                ) : null}
                {profile?.role === "client" ? (
                  <>
                    <Button onClick={() => handleRequestUpdate("completed")}>
                      Approve completion
                    </Button>
                    <Button variant="ghost" onClick={() => handleRequestUpdate("revision_requested")}>
                      Request revision
                    </Button>
                  </>
                ) : null}
              </div>
              {status && <p className="mt-4 text-sm text-slate-300">{status}</p>}
            </div>

            <Timeline currentStatus={project.status} />

            <div className="glass-card rounded-2xl p-6">
              <h4 className="text-sm font-semibold text-white">
                Status update approvals
              </h4>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                {updates.length === 0 ? (
                  <EmptyState
                    title="No updates"
                    description="No status updates awaiting review."
                  />
                ) : (
                  updates.map((update) => (
                    <div
                      key={update.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white">
                            Requested: {update.requestedStatus}
                          </p>
                          <p className="text-xs text-slate-400">
                            By {update.requestedBy}
                          </p>
                        </div>
                        <StatusBadge status={update.status} />
                      </div>
                      {profile?.role === "admin" ? (
                        <div className="mt-3 flex gap-2">
                          <Button
                            variant="primary"
                            onClick={() => handleApproveUpdate(update)}
                            disabled={processing === update.id}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => handleRejectUpdate(update)}
                            disabled={processing === update.id}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <UploadBox />
            <div className="glass-card rounded-2xl p-6">
              <h4 className="text-sm font-semibold text-white">
                Client & freelancer
              </h4>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full border border-white/10 bg-night-900">
                    {clientPhotoUrl && !clientImgError ? (
                      <img
                        src={clientPhotoUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={() => setClientImgError(true)}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-500">
                        {(project.clientName || "C")[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-white">
                      <UserProfileLink
                        userId={project.clientId}
                        name={project.clientName || project.clientId}
                        className="text-white underline hover:text-sky-200"
                      />
                    </p>
                    <p className="text-xs text-slate-500">Client</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full border border-white/10 bg-night-900">
                    {freelancerPhotoUrl && !freelancerImgError ? (
                      <img
                        src={freelancerPhotoUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={() => setFreelancerImgError(true)}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-500">
                        {(project.freelancerName || "F")[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-white">
                      <UserProfileLink
                        userId={project.freelancerId}
                        name={project.freelancerName || project.freelancerId}
                        className="text-white underline hover:text-sky-200"
                      />
                    </p>
                    <p className="text-xs text-slate-500">Freelancer</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </DashboardLayout>
  );
}


