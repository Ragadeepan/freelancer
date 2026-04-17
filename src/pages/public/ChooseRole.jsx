import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "../../components/Button.jsx";
import clsx from "../../utils/clsx.js";
import { loginWithGoogle, logout, mapAuthError } from "../../services/authService.js";
import { getUserProfile } from "../../services/usersService.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";
import GoogleIcon from "../../components/icons/GoogleIcon.jsx";
import ClientRoleIcon from "../../components/icons/ClientRoleIcon.jsx";
import FreelancerRoleIcon from "../../components/icons/FreelancerRoleIcon.jsx";
import {
  getRoleProfileCompletion,
  isAccountApproved
} from "../../utils/accountStatus.js";
import BrandLogo from "../../components/BrandLogo.jsx";

const roles = [
  {
    id: "client",
    title: "I'm a Client",
    description: "I want to hire top-tier talent for a project."
  },
  {
    id: "freelancer",
    title: "I'm a Freelancer",
    description: "I want to apply for real client projects."
  }
];

export default function ChooseRole() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, profile, loading } = useAuth();
  const [role, setRole] = useState("client");
  const [processing, setProcessing] = useState(false);
  const adminPortalMessage = "Admin accounts use /secure-admin/login only.";

  useEffect(() => {
    if (loading) return;
    if (user && profile?.role) {
      if (profile.role === "admin") {
        void logout()
          .catch(() => null)
          .finally(() => {
            toast.permission(adminPortalMessage);
            navigate("/login", { replace: true });
          });
        return;
      }
      if (profile.role === "client") {
        const completion = getRoleProfileCompletion({ ...profile, role: "client" });
        if (!isAccountApproved(profile.status) || completion < 100) {
          navigate("/client/company-profile", { replace: true });
          return;
        }
        navigate("/client/dashboard", { replace: true });
      } else if (profile.role === "freelancer") {
        const completion = getRoleProfileCompletion({ ...profile, role: "freelancer" });
        if (isAccountApproved(profile.status) && completion === 100) {
          navigate("/freelancer/dashboard", { replace: true });
        } else {
          navigate("/freelancer/profile", { replace: true });
        }
      }
    }
  }, [adminPortalMessage, loading, navigate, profile, toast, user]);

  const handleContinue = () => {
    navigate(`/signup?role=${role}`);
  };

  const handleGoogleContinue = async () => {
    setProcessing(true);
    try {
      if (user) {
        if (profile?.role === "admin") {
          await logout();
          toast.permission(adminPortalMessage);
          navigate("/login");
          return;
        }
        navigate(`/signup?role=${role}&provider=google`);
        return;
      }
      const authUser = await loginWithGoogle();
      if (!authUser) {
        return;
      }
      const existingProfile = await getUserProfile(authUser.uid);
      if (existingProfile?.role === "admin") {
        await logout();
        toast.permission(adminPortalMessage);
        navigate("/login");
        return;
      }
      if (existingProfile?.role === "client") {
        const completion = getRoleProfileCompletion({ ...existingProfile, role: "client" });
        if (!isAccountApproved(existingProfile.status) || completion < 100) {
          navigate("/client/company-profile");
          return;
        }
        navigate("/client/dashboard");
        return;
      }
      if (existingProfile?.role === "freelancer") {
        const completion = getRoleProfileCompletion({
          ...existingProfile,
          role: "freelancer"
        });
        if (isAccountApproved(existingProfile.status) && completion === 100) {
          navigate("/freelancer/dashboard");
        } else {
          navigate("/freelancer/profile");
        }
        return;
      }
      navigate(`/signup?role=${role}&provider=google`);
    } catch (err) {
      const message = mapAuthError(err, "Google sign-in failed. Please try again.");
      toast.error(message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="public-shell auth-shell relative min-h-screen overflow-hidden px-4 py-12 sm:px-6 sm:py-16 lg:px-16">
      <div className="pointer-events-none absolute -top-24 left-1/4 h-72 w-72 -translate-x-1/2 rounded-full bg-glow-violet/25 blur-3xl float-slow" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 translate-x-1/3 rounded-full bg-glow-blue/20 blur-3xl float-slow float-delay" />
      <div className="pointer-events-none absolute top-1/2 right-1/4 h-56 w-56 rounded-full bg-glow-cyan/15 blur-3xl" />

      <div className="relative z-10 flex flex-wrap items-stretch justify-between gap-3 text-sm text-slate-300 reveal-up sm:items-center">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex h-11 min-w-[88px] items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-medium leading-none text-slate-200 transition hover:bg-white/10"
          >
            Back
          </button>
          <Link
            to="/"
            className="inline-flex h-11 min-w-[88px] items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-medium leading-none text-slate-200 transition hover:bg-white/10"
          >
            Home
          </Link>
        </div>
        <div className="flex w-full items-center gap-2 text-xs text-slate-400 sm:w-auto sm:text-sm">
          <span className="hidden sm:inline">Already have an account?</span>
          <Link to={`/${role}/login`} className="w-full sm:w-auto">
            <Button className="h-11 w-full sm:w-auto px-4" variant="ghost">
              Log in
            </Button>
          </Link>
        </div>
      </div>

      <div className="relative z-10 mt-10 grid gap-10 lg:mt-12 lg:grid-cols-2 lg:items-center reveal-up reveal-delay-1">
        <div>
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <BrandLogo
              name="Growlanzer"
              size="sm"
              textClassName="text-sm sm:text-base"
            />
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
              Marketplace
            </span>
          </div>
          <h1 className="mt-6 font-display text-3xl font-semibold text-white sm:text-5xl">
            Choose your account type
          </h1>
          <p className="mt-6 text-base text-slate-300 sm:text-lg">
            Use one account for hiring or one account for applying to jobs.
            You can switch flows later by creating another role account.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4 text-sm text-slate-400">
            <div className="flex -space-x-2">
              {["A", "B", "C"].map((letter) => (
                <span
                  key={letter}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10 text-xs"
                >
                  {letter}
                </span>
              ))}
            </div>
            Active teams and freelancers every day
          </div>
        </div>
        <div className="auth-panel rounded-2xl p-6 sm:p-8 reveal-up reveal-delay-2">
          <h2 className="font-display text-xl font-semibold text-white sm:text-2xl">
            Join as a...
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Select your role to customize your dashboard experience.
          </p>
          <div className="mt-6 grid gap-4">
            {roles.map((roleItem) => (
              <button
                key={roleItem.id}
                type="button"
                onClick={() => setRole(roleItem.id)}
                className={clsx(
                  "flex items-start gap-3 rounded-2xl border border-white/10 bg-night-800/60 p-4 text-left transition hover:border-white/25 hover:bg-white/10 sm:gap-4 sm:p-5",
                  role === roleItem.id && "glow-border border-glow-violet/40"
                )}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-sm text-glow-cyan">
                  {roleItem.id === "client" ? <ClientRoleIcon /> : <FreelancerRoleIcon />}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    {roleItem.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {roleItem.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <Button className="mt-6 w-full" onClick={handleContinue}>
            Continue with Email -&gt;
          </Button>
          <Button
            className="mt-3 w-full"
            variant="ghost"
            onClick={handleGoogleContinue}
            disabled={processing}
          >
            <GoogleIcon className="h-4 w-4" />
            {processing ? "Connecting..." : "Continue with Google"}
          </Button>
          <p className="mt-4 text-center text-xs text-slate-500">
            By creating an account, you agree to our Terms of Service and
            Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}


