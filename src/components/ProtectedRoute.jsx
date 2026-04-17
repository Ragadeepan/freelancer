import { useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useToast } from "../contexts/ToastContext.jsx";
import LoadingScreen from "./LoadingScreen.jsx";
import AccessDenied from "../pages/shared/AccessDenied.jsx";
import {
  isAccountApproved,
  isAccountRejected,
  isRoleProfileComplete,
  normalizeAccountStatus
} from "../utils/accountStatus.js";

export default function ProtectedRoute({
  children,
  allowedRoles,
  redirectTo = "/login",
  requireApproved = false,
  requireProfileComplete = false,
  deniedMessage = ""
}) {
  const { user, profile, loading } = useAuth();
  const toast = useToast();
  const warnedRef = useRef(false);
  const deniedRef = useRef(false);
  const unauthorizedRole =
    !loading && user && profile && allowedRoles
      ? !allowedRoles.includes(profile.role)
      : false;
  const normalizedStatus = normalizeAccountStatus(profile?.status);
  const hasRejectedStatus = isAccountRejected(normalizedStatus);
  const lacksApproval = requireApproved && !isAccountApproved(normalizedStatus);
  const lacksCompletion = requireProfileComplete && !isRoleProfileComplete(profile);

  useEffect(() => {
    if (!unauthorizedRole || warnedRef.current) return;
    warnedRef.current = true;
    toast.permission("Permission denied for this workspace.");
  }, [toast, unauthorizedRole]);

  useEffect(() => {
    if ((!lacksApproval && !lacksCompletion) || deniedRef.current) return;
    deniedRef.current = true;
    if (deniedMessage) {
      toast.permission(deniedMessage);
      return;
    }
    if (lacksCompletion) {
      toast.permission("Complete your profile to 100% to access this page.");
      return;
    }
    if (lacksApproval) {
      toast.permission("Admin approval is required to access this page.");
    }
  }, [deniedMessage, lacksApproval, lacksCompletion, toast]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to={redirectTo} replace />;
  }

  if (!profile) {
    return <AccessDenied />;
  }

  if (hasRejectedStatus) {
    return <AccessDenied />;
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <AccessDenied />;
  }

  if (lacksCompletion || lacksApproval) {
    return <AccessDenied />;
  }

  return children;
}
