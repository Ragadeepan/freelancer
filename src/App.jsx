import { Suspense, lazy, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import LoadingScreen from "./components/LoadingScreen.jsx";
import { useAuth } from "./contexts/AuthContext.jsx";
import AccessDenied from "./pages/shared/AccessDenied.jsx";
import PendingApproval from "./pages/shared/PendingApproval.jsx";
import lazyWithRetry from "./utils/lazyWithRetry.js";

const lazyPage = (importer) => lazy(lazyWithRetry(importer));

const Home = lazyPage(() => import("./pages/public/Home.jsx"));
const Login = lazyPage(() => import("./pages/public/Login.jsx"));
const Signup = lazyPage(() => import("./pages/public/Signup.jsx"));
const ChooseRole = lazyPage(() => import("./pages/public/ChooseRole.jsx"));

const ClientDashboard = lazyPage(() => import("./pages/client/Dashboard.jsx"));
const ClientPostJob = lazyPage(() => import("./pages/client/PostJob.jsx"));
const ClientJobs = lazyPage(() => import("./pages/client/Jobs.jsx"));
const ClientProjects = lazyPage(() => import("./pages/client/Projects.jsx"));
const ClientPayments = lazyPage(() => import("./pages/client/Payments.jsx"));
const ClientMessages = lazyPage(() => import("./pages/client/Messages.jsx"));
const ClientCompany = lazyPage(() => import("./pages/client/CompanyProfile.jsx"));
const ClientSettings = lazyPage(() => import("./pages/client/Settings.jsx"));
const ClientContracts = lazyPage(() => import("./pages/client/Contracts.jsx"));
const ClientWorkspaceProjects = lazyPage(() => import("./pages/client/WorkspaceProjects.jsx"));

const FreelancerDashboard = lazyPage(() => import("./pages/freelancer/Dashboard.jsx"));
const FreelancerJobs = lazyPage(() => import("./pages/freelancer/Jobs.jsx"));
const FreelancerJobDetails = lazyPage(() => import("./pages/freelancer/JobDetails.jsx"));
const FreelancerProposals = lazyPage(() => import("./pages/freelancer/Proposals.jsx"));
const FreelancerProjects = lazyPage(() => import("./pages/freelancer/Projects.jsx"));
const FreelancerEarnings = lazyPage(() => import("./pages/freelancer/Earnings.jsx"));
const FreelancerAnalytics = lazyPage(() => import("./pages/freelancer/Analytics.jsx"));
const FreelancerMessages = lazyPage(() => import("./pages/freelancer/Messages.jsx"));
const FreelancerProfile = lazyPage(() => import("./pages/freelancer/Profile.jsx"));
const FreelancerSettings = lazyPage(() => import("./pages/freelancer/Settings.jsx"));
const FreelancerContracts = lazyPage(() => import("./pages/freelancer/Contracts.jsx"));
const FreelancerPendingPayments = lazyPage(() => import("./pages/freelancer/PendingPayments.jsx"));
const FreelancerBankDetails = lazyPage(() => import("./pages/freelancer/BankDetails.jsx"));
const FreelancerWorkspaceProjects = lazyPage(
  () => import("./pages/freelancer/WorkspaceProjects.jsx")
);

const AdminLogin = lazyPage(() => import("./pages/admin/Login.jsx"));
const AdminDashboard = lazyPage(() => import("./pages/admin/Dashboard.jsx"));
const AdminUsers = lazyPage(() => import("./pages/admin/Users.jsx"));
const AdminJobs = lazyPage(() => import("./pages/admin/Jobs.jsx"));
const AdminAssignments = lazyPage(() => import("./pages/admin/Assignments.jsx"));
const AdminProposals = lazyPage(() => import("./pages/admin/Proposals.jsx"));
const AdminProjects = lazyPage(() => import("./pages/admin/Projects.jsx"));
const AdminPayments = lazyPage(() => import("./pages/admin/Payments.jsx"));
const AdminDisputes = lazyPage(() => import("./pages/admin/Disputes.jsx"));
const AdminSettings = lazyPage(() => import("./pages/admin/Settings.jsx"));
const AdminContracts = lazyPage(() => import("./pages/admin/Contracts.jsx"));

const ProjectPage = lazyPage(() => import("./pages/shared/ProjectPage.jsx"));
const ContractWorkspace = lazyPage(() => import("./pages/shared/ContractWorkspace.jsx"));
const UserProfileView = lazyPage(() => import("./pages/shared/UserProfileView.jsx"));
const TablesModals = lazyPage(() => import("./pages/shared/TablesModals.jsx"));
const NotificationsHub = lazyPage(() => import("./pages/shared/NotificationsHub.jsx"));

export default function App() {
  const { user, profile } = useAuth();

  useEffect(() => {
    if (!user || !profile?.role) return undefined;

    const importsByRole = {
      client: [
        () => import("./pages/client/Dashboard.jsx"),
        () => import("./pages/client/CompanyProfile.jsx"),
        () => import("./pages/client/Jobs.jsx"),
        () => import("./pages/shared/NotificationsHub.jsx")
      ],
      freelancer: [
        () => import("./pages/freelancer/Dashboard.jsx"),
        () => import("./pages/freelancer/Profile.jsx"),
        () => import("./pages/freelancer/Jobs.jsx"),
        () => import("./pages/shared/NotificationsHub.jsx")
      ],
      admin: [
        () => import("./pages/admin/Dashboard.jsx"),
        () => import("./pages/admin/Users.jsx"),
        () => import("./pages/admin/Jobs.jsx"),
        () => import("./pages/shared/NotificationsHub.jsx")
      ]
    };

    const selected = importsByRole[profile.role] || [];
    if (selected.length === 0) return undefined;

    const warm = () => {
      void Promise.allSettled(selected.map((load) => load()));
    };

    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(warm, { timeout: 2500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timer = setTimeout(warm, 900);
    return () => clearTimeout(timer);
  }, [profile?.role, user]);

  return (
    <Suspense fallback={<LoadingScreen message="Loading workspace..." />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/choose-role" element={<ChooseRole />} />
        <Route path="/login" element={<Login />} />
        <Route path="/client/login" element={<Navigate to="/login?role=client" replace />} />
        <Route
          path="/freelancer/login"
          element={<Navigate to="/login?role=freelancer" replace />}
        />
        <Route path="/signin" element={<Navigate to="/login" replace />} />
        <Route path="/sign-in" element={<Navigate to="/login" replace />} />
        <Route path="/log-in" element={<Navigate to="/login" replace />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/client/signup" element={<Navigate to="/signup?role=client" replace />} />
        <Route
          path="/freelancer/signup"
          element={<Navigate to="/signup?role=freelancer" replace />}
        />
        <Route path="/register" element={<Navigate to="/choose-role" replace />} />
        <Route path="/sign-up" element={<Navigate to="/choose-role" replace />} />
        <Route path="/create-account" element={<Navigate to="/choose-role" replace />} />
        <Route path="/singup" element={<Navigate to="/choose-role" replace />} />
        <Route path="/access-denied" element={<AccessDenied />} />
        <Route path="/pending" element={<PendingApproval />} />
        <Route path="/pending-approval" element={<PendingApproval />} />

        <Route
          path="/client/dashboard"
          element={
            <ProtectedRoute allowedRoles={["client"]}>
              <ClientDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/client"
          element={
            <ProtectedRoute allowedRoles={["client"]}>
              <ClientDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/post-job"
          element={
            <ProtectedRoute
              allowedRoles={["client"]}
              requireApproved
              requireProfileComplete
            >
              <ClientPostJob />
            </ProtectedRoute>
          }
        />
        <Route
          path="/post-job"
          element={
            <ProtectedRoute
              allowedRoles={["client"]}
              requireApproved
              requireProfileComplete
            >
              <ClientPostJob />
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/jobs"
          element={
            <ProtectedRoute allowedRoles={["client"]}>
              <ClientJobs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/proposals/:jobId"
          element={
            <ProtectedRoute allowedRoles={["client"]}>
              <ClientJobs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/projects"
          element={
            <ProtectedRoute allowedRoles={["client"]}>
              <ClientProjects />
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/workspace/projects"
          element={
            <ProtectedRoute allowedRoles={["client"]}>
              <ClientWorkspaceProjects />
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/contracts"
          element={
            <ProtectedRoute allowedRoles={["client"]}>
              <ClientContracts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/payments"
          element={
            <ProtectedRoute allowedRoles={["client"]}>
              <ClientPayments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/messages"
          element={
            <ProtectedRoute allowedRoles={["client"]}>
              <ClientMessages />
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/notifications"
          element={
            <ProtectedRoute allowedRoles={["client"]}>
              <NotificationsHub />
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/company-profile"
          element={
            <ProtectedRoute allowedRoles={["client"]}>
              <ClientCompany />
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/settings"
          element={
            <ProtectedRoute allowedRoles={["client"]}>
              <ClientSettings />
            </ProtectedRoute>
          }
        />

        <Route
          path="/freelancer/dashboard"
          element={
            <ProtectedRoute allowedRoles={["freelancer"]}>
              <FreelancerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/freelancer"
          element={
            <ProtectedRoute allowedRoles={["freelancer"]}>
              <FreelancerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/freelancer/jobs"
          element={
            <ProtectedRoute allowedRoles={["freelancer"]}>
              <FreelancerJobs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs"
          element={
            <ProtectedRoute allowedRoles={["freelancer"]}>
              <FreelancerJobs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/freelancer/jobs/:jobId"
          element={
            <ProtectedRoute allowedRoles={["freelancer"]}>
              <FreelancerJobDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/job/:jobId"
          element={
            <ProtectedRoute allowedRoles={["freelancer"]}>
              <FreelancerJobDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/freelancer/proposals"
          element={
            <ProtectedRoute
              allowedRoles={["freelancer"]}
              requireApproved
              requireProfileComplete
              deniedMessage="Admin approval is required before submitting proposals."
            >
              <FreelancerProposals />
            </ProtectedRoute>
          }
        />
        <Route
          path="/freelancer/projects"
          element={
            <ProtectedRoute allowedRoles={["freelancer"]}>
              <FreelancerProjects />
            </ProtectedRoute>
          }
        />
        <Route
          path="/freelancer/workspace/projects"
          element={
            <ProtectedRoute allowedRoles={["freelancer"]}>
              <FreelancerWorkspaceProjects />
            </ProtectedRoute>
          }
        />
        <Route
          path="/freelancer/contracts"
          element={
            <ProtectedRoute allowedRoles={["freelancer"]}>
              <FreelancerContracts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/freelancer/pending-payments"
          element={
            <ProtectedRoute allowedRoles={["freelancer"]}>
              <FreelancerPendingPayments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/freelancer/earnings"
          element={
            <ProtectedRoute allowedRoles={["freelancer"]}>
              <FreelancerEarnings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/freelancer/bank-details"
          element={
            <ProtectedRoute allowedRoles={["freelancer"]}>
              <FreelancerBankDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/freelancer/analytics"
          element={
            <ProtectedRoute allowedRoles={["freelancer"]}>
              <FreelancerAnalytics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/freelancer/messages"
          element={
            <ProtectedRoute allowedRoles={["freelancer"]}>
              <FreelancerMessages />
            </ProtectedRoute>
          }
        />
        <Route
          path="/freelancer/notifications"
          element={
            <ProtectedRoute allowedRoles={["freelancer"]}>
              <NotificationsHub />
            </ProtectedRoute>
          }
        />
        <Route
          path="/freelancer/profile"
          element={
            <ProtectedRoute allowedRoles={["freelancer"]}>
              <FreelancerProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/freelancer/onboarding"
          element={<Navigate to="/freelancer/profile" replace />}
        />
        <Route
          path="/freelancer/settings"
          element={
            <ProtectedRoute allowedRoles={["freelancer"]}>
              <FreelancerSettings />
            </ProtectedRoute>
          }
        />

        <Route path="/secure-admin/login" element={<AdminLogin />} />
        <Route
          path="/secure-admin"
          element={<Navigate to="/secure-admin/login" replace />}
        />
        <Route
          path="/secure-admin/dashboard"
          element={
            <ProtectedRoute allowedRoles={["admin"]} redirectTo="/secure-admin/login">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/secure-admin/users"
          element={
            <ProtectedRoute allowedRoles={["admin"]} redirectTo="/secure-admin/login">
              <AdminUsers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/secure-admin/jobs"
          element={
            <ProtectedRoute allowedRoles={["admin"]} redirectTo="/secure-admin/login">
              <AdminJobs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/secure-admin/assignments"
          element={
            <ProtectedRoute allowedRoles={["admin"]} redirectTo="/secure-admin/login">
              <AdminAssignments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/secure-admin/proposals"
          element={
            <ProtectedRoute allowedRoles={["admin"]} redirectTo="/secure-admin/login">
              <AdminProposals />
            </ProtectedRoute>
          }
        />
        <Route
          path="/secure-admin/projects"
          element={
            <ProtectedRoute allowedRoles={["admin"]} redirectTo="/secure-admin/login">
              <AdminProjects />
            </ProtectedRoute>
          }
        />
        <Route
          path="/secure-admin/contracts"
          element={
            <ProtectedRoute allowedRoles={["admin"]} redirectTo="/secure-admin/login">
              <AdminContracts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/secure-admin/payments"
          element={
            <ProtectedRoute allowedRoles={["admin"]} redirectTo="/secure-admin/login">
              <AdminPayments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/secure-admin/disputes"
          element={
            <ProtectedRoute allowedRoles={["admin"]} redirectTo="/secure-admin/login">
              <AdminDisputes />
            </ProtectedRoute>
          }
        />
        <Route
          path="/secure-admin/notifications"
          element={
            <ProtectedRoute allowedRoles={["admin"]} redirectTo="/secure-admin/login">
              <NotificationsHub />
            </ProtectedRoute>
          }
        />
        <Route
          path="/secure-admin/settings"
          element={
            <ProtectedRoute allowedRoles={["admin"]} redirectTo="/secure-admin/login">
              <AdminSettings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["admin"]} redirectTo="/secure-admin/login">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/login"
          element={<Navigate to="/secure-admin/login" replace />}
        />
        <Route
          path="/admin-login"
          element={<Navigate to="/secure-admin/login" replace />}
        />
        <Route
          path="/admin/dashboard"
          element={<Navigate to="/secure-admin/dashboard" replace />}
        />
        <Route
          path="/admin/users"
          element={<Navigate to="/secure-admin/users" replace />}
        />
        <Route
          path="/admin/jobs"
          element={<Navigate to="/secure-admin/jobs" replace />}
        />
        <Route
          path="/admin/assignments"
          element={<Navigate to="/secure-admin/assignments" replace />}
        />
        <Route
          path="/admin/proposals"
          element={<Navigate to="/secure-admin/proposals" replace />}
        />
        <Route
          path="/admin/projects"
          element={<Navigate to="/secure-admin/projects" replace />}
        />
        <Route
          path="/admin/payments"
          element={<Navigate to="/secure-admin/payments" replace />}
        />
        <Route
          path="/admin/disputes"
          element={<Navigate to="/secure-admin/disputes" replace />}
        />
        <Route
          path="/admin/notifications"
          element={<Navigate to="/secure-admin/notifications" replace />}
        />
        <Route
          path="/admin/settings"
          element={<Navigate to="/secure-admin/settings" replace />}
        />

        <Route
          path="/project"
          element={
            <ProtectedRoute allowedRoles={["freelancer", "client", "admin"]}>
              <ProjectPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id"
          element={
            <ProtectedRoute allowedRoles={["freelancer", "client", "admin"]}>
              <ProjectPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workspace/project/:contractId"
          element={
            <ProtectedRoute allowedRoles={["freelancer", "client"]}>
              <ContractWorkspace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users/:userId"
          element={
            <ProtectedRoute allowedRoles={["freelancer", "client", "admin"]}>
              <UserProfileView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ui"
          element={
            <ProtectedRoute allowedRoles={["admin"]} redirectTo="/secure-admin/login">
              <TablesModals />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}
