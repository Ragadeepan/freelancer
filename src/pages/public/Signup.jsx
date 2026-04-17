import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Button from "../../components/Button.jsx";
import { logout, mapAuthError, signupWithEmail } from "../../services/authService.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { createUserProfile, getUserProfile } from "../../services/usersService.js";
import {
  getRoleProfileCompletion,
  isAccountApproved
} from "../../utils/accountStatus.js";
import AuthInputIcon from "../../components/icons/AuthInputIcon.jsx";
import BrandLogo from "../../components/BrandLogo.jsx";

const WORK_CATEGORIES = [
  "Website",
  "App",
  "Design",
  "Marketing",
  "Content",
  "Other"
];

const INDUSTRIES = [
  "Software & IT",
  "Ecommerce",
  "Finance & Fintech",
  "Healthcare",
  "Education",
  "Real Estate",
  "Marketing & Media",
  "Other"
];

const COMPANY_SIZES = ["1", "2-10", "11-50", "51-200", "201-500", "500+"];
const MIN_PASSWORD_LENGTH = 8;

const PASSWORD_STRENGTH_LEVELS = {
  weak: {
    label: "Weak",
    width: 34,
    labelClass: "password-strength__label--weak",
    fillClass: "password-strength__fill--weak"
  },
  medium: {
    label: "Medium",
    width: 67,
    labelClass: "password-strength__label--medium",
    fillClass: "password-strength__fill--medium"
  },
  strong: {
    label: "Strong",
    width: 100,
    labelClass: "password-strength__label--strong",
    fillClass: "password-strength__fill--strong"
  }
};

function evaluatePasswordStrength(password) {
  const value = String(password || "");
  const hasLetters = /[A-Za-z]/.test(value);
  const hasLowercase = /[a-z]/.test(value);
  const hasUppercase = /[A-Z]/.test(value);
  const hasNumbers = /\d/.test(value);
  const hasSpecial = /[^A-Za-z0-9]/.test(value);

  if (
    value.length >= MIN_PASSWORD_LENGTH &&
    hasLowercase &&
    hasUppercase &&
    hasNumbers &&
    hasSpecial
  ) {
    return PASSWORD_STRENGTH_LEVELS.strong;
  }

  if (value.length >= MIN_PASSWORD_LENGTH && hasLetters && hasNumbers) {
    return PASSWORD_STRENGTH_LEVELS.medium;
  }

  return PASSWORD_STRENGTH_LEVELS.weak;
}

function normalizePassword(value) {
  return String(value || "").trim();
}

export default function Signup() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, profile, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get("role");
  const provider = searchParams.get("provider");
  const isGoogle = provider === "google";
  const role =
    roleParam === "freelancer" || roleParam === "client" ? roleParam : null;
  const isClientRole = role === "client";
  const loginPath = role ? `/${role}/login` : "/login";
  const [clientStep, setClientStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    clientType: "individual",
    workCategory: "",
    industry: "",
    companyName: "",
    companySize: "",
    companyWebsite: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(
    PASSWORD_STRENGTH_LEVELS.weak
  );

  useEffect(() => {
    if (!role) {
      navigate("/choose-role", { replace: true });
    }
  }, [navigate, role]);

  useEffect(() => {
    if (isClientRole) {
      setClientStep(1);
    }
  }, [isClientRole]);

  useEffect(() => {
    if (!isGoogle || authLoading) return;
    if (!user) {
      navigate("/choose-role", { replace: true });
      return;
    }
    if (profile?.role) {
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
      } else if (profile.role === "admin") {
        void logout()
          .catch(() => null)
          .finally(() => {
            setError("Admin accounts use /secure-admin/login.");
            navigate("/login", { replace: true });
          });
      }
    }
  }, [authLoading, isGoogle, navigate, profile, user]);

  useEffect(() => {
    if (!isGoogle || !user) return;
    setForm((prev) => ({
      ...prev,
      name: prev.name || user.displayName || "",
      email: prev.email || user.email || ""
    }));
  }, [isGoogle, user]);

  useEffect(() => {
    if (isGoogle || (isClientRole && clientStep !== 1)) return undefined;
    const passwordInput = document.getElementById("password");
    if (!passwordInput) return undefined;

    const handlePasswordInput = (event) => {
      setPasswordStrength(evaluatePasswordStrength(event.target.value));
    };

    handlePasswordInput({ target: passwordInput });
    passwordInput.addEventListener("input", handlePasswordInput);

    return () => {
      passwordInput.removeEventListener("input", handlePasswordInput);
    };
  }, [clientStep, isClientRole, isGoogle]);

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const validateAccountFields = () => {
    const cleanName = form.name.trim();
    const cleanEmail = form.email.trim().toLowerCase();
    const normalizedPassword = normalizePassword(form.password);
    const normalizedConfirmPassword = normalizePassword(form.confirmPassword);
    if (!cleanName || !cleanEmail || (!isGoogle && (!form.password || !form.confirmPassword))) {
      return "Please complete all required fields.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return "Enter a valid email address.";
    }
    if (!isGoogle && normalizedPassword !== normalizedConfirmPassword) {
      return "Passwords do not match.";
    }
    if (!isGoogle && normalizedPassword.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    return "";
  };

  const validateClientFields = () => {
    if (!form.clientType) {
      return "Please choose client type.";
    }
    if (form.clientType === "individual" && !form.workCategory.trim()) {
      return "Work category is required for individual clients.";
    }
    if (
      form.clientType === "company" &&
      (!form.companyName.trim() ||
        !form.industry.trim() ||
        !form.companySize.trim() ||
        !form.companyWebsite.trim())
    ) {
      return "Please complete all company details.";
    }
    if (form.clientType === "company" && !/^https?:\/\/\S+$/i.test(form.companyWebsite.trim())) {
      return "Enter a valid website URL (https://...).";
    }
    return "";
  };

  const handleClientNext = () => {
    setError("");
    const accountError = validateAccountFields();
    if (accountError) {
      setError(accountError);
      return;
    }
    setClientStep(2);
  };

  const handleSignup = async () => {
    setError("");
    if (!role) {
      navigate("/choose-role", { replace: true });
      return;
    }
    const cleanName = form.name.trim();
    const cleanEmail = form.email.trim().toLowerCase();
    const normalizedPassword = normalizePassword(form.password);
    const accountError = validateAccountFields();
    if (accountError) {
      setError(accountError);
      return;
    }
    if (role === "client") {
      const clientError = validateClientFields();
      if (clientError) {
        setError(clientError);
        return;
      }
    }
    setLoading(true);
    try {
      if (isGoogle) {
        if (!user) {
          throw new Error("Google session missing. Please sign in again.");
        }
        const existingProfile = await getUserProfile(user.uid);
        if (existingProfile?.role && existingProfile.role !== role) {
          throw new Error(
            `This Google account is already registered as ${existingProfile.role}.`
          );
        }
        await createUserProfile(user.uid, {
          name: cleanName,
          email: cleanEmail,
          role,
          freelancerOnboardingSubmitted: role === "freelancer" ? false : null,
          freelancerProfileCompleted: role === "freelancer" ? false : null,
          freelancerOnboardingStep: role === "freelancer" ? 0 : null,
          clientType: role === "client" ? form.clientType : "",
          workCategory:
            role === "client" && form.clientType === "individual"
              ? form.workCategory.trim()
              : "",
          companyName:
            role === "client" && form.clientType === "company"
              ? form.companyName.trim()
              : "",
          industry:
            role === "client" && form.clientType === "company"
              ? form.industry.trim()
              : "",
          companySize:
            role === "client" && form.clientType === "company"
              ? form.companySize.trim()
              : "",
          companyWebsite:
            role === "client" && form.clientType === "company"
              ? form.companyWebsite.trim()
              : "",
          authProvider: "google"
        });
      } else {
        await signupWithEmail({
          name: cleanName,
          email: cleanEmail,
          password: normalizedPassword,
          role,
          freelancerOnboardingSubmitted: role === "freelancer" ? false : null,
          freelancerProfileCompleted: role === "freelancer" ? false : null,
          freelancerOnboardingStep: role === "freelancer" ? 0 : null,
          clientType: role === "client" ? form.clientType : "",
          workCategory:
            role === "client" && form.clientType === "individual"
              ? form.workCategory.trim()
              : "",
          companyName:
            role === "client" && form.clientType === "company"
              ? form.companyName.trim()
              : "",
          industry:
            role === "client" && form.clientType === "company"
              ? form.industry.trim()
              : "",
          companySize:
            role === "client" && form.clientType === "company"
              ? form.companySize.trim()
              : "",
          companyWebsite:
            role === "client" && form.clientType === "company"
              ? form.companyWebsite.trim()
              : ""
        });
      }
      toast.success("Account created. Complete your profile to request admin approval.");
      if (role === "freelancer") {
        navigate("/freelancer/profile");
      } else {
        navigate("/client/company-profile");
      }
    } catch (err) {
      const message = mapAuthError(err, err.message || "Signup failed. Please try again.");
      toast.error(message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="public-shell auth-shell relative min-h-screen overflow-hidden px-4 py-12 sm:px-6 sm:py-16 lg:px-16">
      <div className="pointer-events-none absolute -top-24 left-1/4 h-72 w-72 -translate-x-1/2 rounded-full bg-glow-violet/25 blur-3xl float-slow" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 translate-x-1/3 rounded-full bg-glow-cyan/20 blur-3xl float-slow float-delay" />
      <div className="pointer-events-none absolute top-1/2 right-1/3 h-56 w-56 rounded-full bg-glow-blue/15 blur-3xl" />
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
          <div className="flex w-full items-center gap-2 text-xs text-slate-400 sm:w-auto sm:text-sm">
            <span className="hidden sm:inline">Already onboarded?</span>
            <Link to={loginPath} className="w-full sm:w-auto">
              <Button className="h-11 w-full sm:w-auto px-4" variant="ghost">
                Log in
              </Button>
            </Link>
          </div>
        </div>
        <div className="mx-auto mt-10 grid max-w-6xl gap-10 lg:mt-12 lg:grid-cols-2 lg:items-center reveal-up reveal-delay-1">
          <div>
            <BrandLogo
              name="Growlanzer"
              size="sm"
              textClassName="text-sm sm:text-base"
            />
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
              Signup
            </p>
            <h1 className="mt-4 font-display text-3xl font-semibold text-white sm:text-5xl">
              Start your <span className="gradient-text">freelance journey</span>
            </h1>
            <p className="mt-6 text-base text-slate-300 sm:text-lg">
              Create your account in minutes. You can log in immediately and
              complete your profile to unlock full marketplace actions.
            </p>
          </div>
          <div className="auth-panel rounded-2xl p-6 sm:p-8 reveal-up reveal-delay-2">
            <h2 className="font-display text-xl font-semibold text-white">
              {isGoogle ? "Complete" : "Create"}{" "}
              {role === "freelancer" ? "freelancer" : "client"} account
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Role selected in <Link to="/choose-role" className="text-slate-200">role setup</Link>.
            </p>
            <form
              className="mt-6"
              onSubmit={(event) => {
                event.preventDefault();
                if (!loading) {
                  if (isClientRole && clientStep === 1) {
                    handleClientNext();
                  } else {
                    handleSignup();
                  }
                }
              }}
            >
              {isClientRole ? (
                <div className="mb-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                  <span>Step {clientStep} of 2</span>
                  <span className="text-slate-100">
                    {clientStep === 1 ? "Account details" : "Client details"}
                  </span>
                </div>
              ) : null}
              <div className="grid gap-4">
                {!isClientRole || clientStep === 1 ? (
                  <>
                    <div className="auth-input-wrap">
                      <span className="auth-input-icon">
                        <AuthInputIcon type="user" />
                      </span>
                      <input
                        className="auth-input"
                        placeholder="Full name"
                        autoComplete="name"
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                      />
                    </div>
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
                        disabled={isGoogle}
                        autoComplete="email"
                      />
                    </div>
                    {!isGoogle ? (
                      <>
                        <div className="auth-input-wrap">
                          <span className="auth-input-icon">
                            <AuthInputIcon type="password" />
                          </span>
                          <input
                            className="auth-input"
                            id="password"
                            placeholder="Password"
                            type="password"
                            name="password"
                            value={form.password}
                            onChange={handleChange}
                            minLength={MIN_PASSWORD_LENGTH}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            autoComplete="new-password"
                          />
                        </div>
                        <p className="text-xs text-slate-400">
                          Minimum {MIN_PASSWORD_LENGTH} characters required.
                        </p>
                        {form.password ? (
                          <div
                            className="password-strength"
                            role="status"
                            aria-live="polite"
                          >
                            <div className="password-strength__meta">
                              <span>Password strength</span>
                              <span
                                className={`password-strength__label ${passwordStrength.labelClass}`}
                              >
                                {passwordStrength.label}
                              </span>
                            </div>
                            <div className="password-strength__track" aria-hidden="true">
                              <span
                                className={`password-strength__fill ${passwordStrength.fillClass}`}
                                style={{ width: `${passwordStrength.width}%` }}
                              />
                            </div>
                          </div>
                        ) : null}
                        <div className="auth-input-wrap">
                          <span className="auth-input-icon">
                            <AuthInputIcon type="password" />
                          </span>
                          <input
                            className="auth-input"
                            placeholder="Confirm password"
                            type="password"
                            name="confirmPassword"
                            value={form.confirmPassword}
                            onChange={handleChange}
                            minLength={MIN_PASSWORD_LENGTH}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            autoComplete="new-password"
                          />
                        </div>
                      </>
                    ) : null}
                  </>
                ) : null}
                {isClientRole && clientStep === 2 ? (
                  <>
                    <div className="grid gap-3 rounded-2xl border border-white/10 bg-night-800/60 px-4 py-3 text-sm text-slate-200">
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                        Client Type
                      </p>
                      <div className="flex flex-wrap gap-4">
                        {["individual", "company"].map((type) => (
                          <label key={type} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="clientType"
                              value={type}
                              checked={form.clientType === type}
                              onChange={(event) =>
                                setForm((prev) => ({
                                  ...prev,
                                  clientType: event.target.value,
                                  workCategory:
                                    event.target.value === "individual"
                                      ? prev.workCategory
                                      : "",
                                  companyName:
                                    event.target.value === "company" ? prev.companyName : "",
                                  industry:
                                    event.target.value === "company" ? prev.industry : "",
                                  companySize:
                                    event.target.value === "company" ? prev.companySize : "",
                                  companyWebsite:
                                    event.target.value === "company" ? prev.companyWebsite : ""
                                }))
                              }
                            />
                            {type === "company" ? "Company" : "Individual"}
                          </label>
                        ))}
                      </div>
                    </div>
                    {form.clientType === "individual" ? (
                      <select
                        className="auth-input"
                        name="workCategory"
                        value={form.workCategory}
                        onChange={handleChange}
                      >
                        <option value="">Work category</option>
                        {WORK_CATEGORIES.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <input
                          className="auth-input"
                          placeholder="Company name"
                          name="companyName"
                          value={form.companyName}
                          onChange={handleChange}
                        />
                        <select
                          className="auth-input"
                          name="industry"
                          value={form.industry}
                          onChange={handleChange}
                        >
                          <option value="">Industry</option>
                          {INDUSTRIES.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                        <select
                          className="auth-input"
                          name="companySize"
                          value={form.companySize}
                          onChange={handleChange}
                        >
                          <option value="">Company size</option>
                          {COMPANY_SIZES.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                        <input
                          className="auth-input"
                          placeholder="Website link (https://...)"
                          name="companyWebsite"
                          value={form.companyWebsite}
                          onChange={handleChange}
                        />
                      </>
                    )}
                  </>
                ) : null}
              </div>
              {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
              {isClientRole && clientStep === 2 ? (
                <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
                  <Button
                    className="w-full"
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setError("");
                      setClientStep(1);
                    }}
                    disabled={loading}
                  >
                    Back
                  </Button>
                  <Button className="w-full" type="submit" disabled={loading}>
                    {loading ? "Creating..." : "Create Account ->"}
                  </Button>
                </div>
              ) : (
                <Button className="mt-6 w-full" type="submit" disabled={loading}>
                  {loading
                    ? "Creating..."
                    : isClientRole
                      ? "Next ->"
                      : "Create Account ->"}
                </Button>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
