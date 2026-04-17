import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Button from "../../components/Button.jsx";
import {
  loginWithEmail,
  loginWithGoogle,
  logout,
  mapAuthError
} from "../../services/authService.js";
import { getUserProfile } from "../../services/usersService.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import GoogleIcon from "../../components/icons/GoogleIcon.jsx";
import AuthInputIcon from "../../components/icons/AuthInputIcon.jsx";
import {
  getRoleProfileCompletion,
  isAccountApproved,
  isAccountRejected,
  normalizeAccountStatus
} from "../../utils/accountStatus.js";
import BrandLogo from "../../components/BrandLogo.jsx";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const adminPortalMessage = "Admin accounts use /secure-admin/login only.";
  const roleParam = searchParams.get("role");
  const roleLabel =
    roleParam === "client"
      ? "client"
      : roleParam === "freelancer"
        ? "freelancer"
        : "";
  const roleTitle = roleLabel ? `${roleLabel[0].toUpperCase()}${roleLabel.slice(1)} ` : "";
  const signupPath = roleLabel ? `/signup?role=${roleLabel}` : "/choose-role";

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleLogin = async () => {
    setError("");
    if (!form.email.trim() || !form.password) {
      const message = "Enter email and password.";
      setError(message);
      toast.error(message);
      return;
    }
    setLoading(true);
    try {
      const user = await loginWithEmail(form);
      const profile = await getUserProfile(user.uid);
      if (!profile) {
        await logout();
        const message = "Profile not found. Contact Admin.";
        toast.error(message);
        setError(message);
        return;
      }
      const normalizedStatus = normalizeAccountStatus(profile.status);
      if (isAccountRejected(normalizedStatus)) {
        await logout();
        toast.permission("Your account is rejected. Contact Admin.");
        setError("Your account is rejected. Contact Admin.");
        return;
      }
      if (profile.role === "client") {
        const completion = getRoleProfileCompletion({ ...profile, role: "client" });
        if (!isAccountApproved(normalizedStatus) || completion < 100) {
          navigate("/client/company-profile");
          return;
        }
        navigate("/client/dashboard");
        return;
      }
      if (profile.role === "freelancer") {
        const completion = getRoleProfileCompletion({ ...profile, role: "freelancer" });
        if (!isAccountApproved(normalizedStatus) || completion < 100) {
          navigate("/freelancer/profile");
        } else {
          navigate("/freelancer/dashboard");
        }
        return;
      }
      if (profile.role === "admin") {
        await logout();
        toast.permission(adminPortalMessage);
        setError(adminPortalMessage);
        return;
      }
      await logout();
      const message = "Unknown account role. Contact Admin.";
      toast.error(message);
      setError(message);
    } catch (err) {
      const message = mapAuthError(err, "Login failed. Please try again.");
      toast.error(message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const user = await loginWithGoogle();
      if (!user) {
        return;
      }
      const profile = await getUserProfile(user.uid);
      if (!profile) {
        toast.permission("Select a role to complete your profile.");
        navigate("/choose-role");
        return;
      }
      const normalizedStatus = normalizeAccountStatus(profile.status);
      if (isAccountRejected(normalizedStatus)) {
        await logout();
        toast.permission("Your account is rejected. Contact Admin.");
        setError("Your account is rejected. Contact Admin.");
        return;
      }
      if (profile.role === "client") {
        const completion = getRoleProfileCompletion({ ...profile, role: "client" });
        if (!isAccountApproved(normalizedStatus) || completion < 100) {
          navigate("/client/company-profile");
          return;
        }
        navigate("/client/dashboard");
        return;
      }
      if (profile.role === "freelancer") {
        const completion = getRoleProfileCompletion({ ...profile, role: "freelancer" });
        if (!isAccountApproved(normalizedStatus) || completion < 100) {
          navigate("/freelancer/profile");
        } else {
          navigate("/freelancer/dashboard");
        }
        return;
      }
      if (profile.role === "admin") {
        await logout();
        toast.permission(adminPortalMessage);
        setError(adminPortalMessage);
        return;
      }
      await logout();
      const message = "Unknown account role. Contact Admin.";
      toast.error(message);
      setError(message);
    } catch (err) {
      console.error("Google login error:", err);
      const message = mapAuthError(err, "Google login failed. Please try again.");
      toast.error(message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="public-shell auth-shell relative min-h-screen overflow-hidden px-4 py-12 sm:px-6 sm:py-16 lg:px-16">
      <div className="pointer-events-none absolute -top-20 left-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-glow-blue/25 blur-3xl float-slow" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 translate-x-1/3 rounded-full bg-glow-violet/20 blur-3xl float-slow float-delay" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-glow-cyan/10 blur-3xl" />
      <div className="relative z-10">
        <div className="flex flex-wrap items-stretch justify-between gap-3 text-sm text-slate-300 reveal-up sm:items-center">
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
          <Link to="/choose-role" className="w-full sm:w-auto">
            <Button className="h-11 w-full sm:w-auto px-4" variant="ghost">
              Create account
            </Button>
          </Link>
        </div>
        <div className="mx-auto mt-10 grid max-w-5xl gap-10 lg:mt-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center reveal-up reveal-delay-1">
          <div>
            <BrandLogo
              name="Growlanzer"
              size="sm"
              textClassName="text-sm sm:text-base"
            />
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
              Login
            </p>
            <h1 className="mt-4 font-display text-3xl font-semibold text-white sm:text-5xl">
              Welcome back to{" "}
              <span className="gradient-text">Growlanzer</span>
            </h1>
            <p className="mt-6 text-base text-slate-300 sm:text-lg">
              Secure access is granted after account creation. You can log in
              immediately after signup.
            </p>
          </div>
          <div className="auth-panel rounded-2xl p-6 sm:p-8 reveal-up reveal-delay-2">
            <h1 className="font-display text-xl font-semibold text-white sm:text-2xl">
              {roleTitle}
              Secure login
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Access is granted after account creation.
            </p>
            <form
              className="mt-6 grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!loading) {
                  handleLogin();
                }
              }}
            >
              <div className="auth-input-wrap">
                <span className="auth-input-icon">
                  <AuthInputIcon type="email" />
                </span>
                <input
                  className="auth-input"
                  placeholder="Email address"
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  autoComplete="email"
                />
              </div>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">
                  <AuthInputIcon type="password" />
                </span>
                <input
                  className="auth-input"
                  placeholder="Password"
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  autoComplete="current-password"
                />
              </div>
            </form>
            {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
            <Button className="mt-6 w-full" onClick={handleLogin} disabled={loading}>
              {loading ? "Signing in..." : "Login"}
            </Button>
            <Button
              className="mt-3 w-full"
              variant="ghost"
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              <GoogleIcon className="h-4 w-4" />
              {loading ? "Connecting..." : "Continue with Google"}
            </Button>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-slate-300">
              New here?{" "}
              <Link
                to={signupPath}
                className="font-semibold text-slate-100 transition hover:text-white hover:underline underline-offset-4"
              >
                {roleLabel ? `Create ${roleLabel} account` : "Create account"}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


