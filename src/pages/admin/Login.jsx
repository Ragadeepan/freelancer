import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "../../components/Button.jsx";
import { loginWithEmail, logout, mapAuthError } from "../../services/authService.js";
import { getUserProfile } from "../../services/usersService.js";
import { useToast } from "../../contexts/ToastContext.jsx";

export default function AdminLogin() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);


  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleAdminLogin = async () => {
    setError("");
    if (!form.email.trim() || !form.password) {
      const message = "Enter admin email and password.";
      setError(message);
      toast.error(message);
      return;
    }
    setLoading(true);
    try {
      const user = await loginWithEmail(form);
      const profile = await getUserProfile(user.uid);
      if (!profile || profile.role !== "admin") {
        await logout();
        const message = "Admin access denied for this account.";
        toast.permission(message);
        setError(message);
        return;
      }
      navigate("/secure-admin/dashboard");
    } catch (err) {
      const message = mapAuthError(err, "Login failed. Please try again.");
      toast.error(message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-6 py-16 lg:px-16">
      <div className="mx-auto flex max-w-2xl flex-wrap items-stretch justify-between gap-3 text-sm text-slate-300 sm:items-center">
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
      <div className="mx-auto mt-8 max-w-2xl glass-card rounded-2xl p-8">
        <h1 className="font-display text-3xl font-semibold text-white">
          Admin control center
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Admin accounts are provisioned manually in Firestore.
        </p>
        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!loading) {
              handleAdminLogin();
            }
          }}
        >
          <div className="grid gap-4">
            <input
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
              placeholder="Admin email"
              name="email"
              value={form.email}
              onChange={handleChange}
            />
            <input
              type="password"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
              placeholder="Password"
              name="password"
              value={form.password}
              onChange={handleChange}
            />
          </div>
          {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
          <Button className="mt-6 w-full" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Login as admin"}
          </Button>
        </form>
      </div>
    </div>
  );
}
