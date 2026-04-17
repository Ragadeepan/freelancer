import { useEffect, useState } from "react";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Button from "../../components/Button.jsx";
import { freelancerNav } from "../../data/nav.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { updateUserProfile } from "../../services/usersService.js";
import { logout } from "../../services/authService.js";
import { useToast } from "../../contexts/ToastContext.jsx";

export default function FreelancerSettings() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    jobAlerts: true,
    proposalAlerts: true,
    projectUpdateAlerts: true,
    paymentAlerts: true,
    accountReviewAlerts: true,
    clientMessages: true
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!profile) return;
    setForm({
      jobAlerts: profile.jobAlerts ?? true,
      proposalAlerts: profile.proposalAlerts ?? true,
      projectUpdateAlerts: profile.projectUpdateAlerts ?? true,
      paymentAlerts: profile.paymentAlerts ?? true,
      accountReviewAlerts: profile.accountReviewAlerts ?? true,
      clientMessages: profile.clientMessages ?? true
    });
  }, [profile]);

  const handleToggle = (event) => {
    const { name, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: checked }));
  };

  const handleSave = async () => {
    if (!user) return;
    setStatus("");
    setLoading(true);
    try {
      await updateUserProfile(user.uid, {
        jobAlerts: form.jobAlerts,
        proposalAlerts: form.proposalAlerts,
        projectUpdateAlerts: form.projectUpdateAlerts,
        paymentAlerts: form.paymentAlerts,
        accountReviewAlerts: form.accountReviewAlerts,
        clientMessages: form.clientMessages
      });
      setStatus("Settings updated.");
      toast.success("Settings updated.");
    } catch (err) {
      setStatus(err.message || "Failed to update settings.");
      toast.error("Failed to update settings.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!user) return;
    await logout();
  };

  return (
    <DashboardLayout
      title="Settings"
      sidebar={{
        title: "Growlanzer",
        subtitle: "Freelancer",
        items: freelancerNav
      }}
    >
      <PageHeader
        title="Account settings"
        description="Tune notifications and workspace preferences."
        primaryAction="Save settings"
        onPrimaryAction={handleSave}
        primaryDisabled={loading}
      />
      <div className="glass-card rounded-2xl p-6">
        <div className="grid gap-4 text-sm text-slate-300">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-slate-100">Job alerts</p>
              <p className="mt-1 text-xs text-slate-400">
                Get alerts for new matching projects.
              </p>
            </div>
            <input
              type="checkbox"
              name="jobAlerts"
              checked={form.jobAlerts}
              onChange={handleToggle}
              className="accent-glow-cyan"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-slate-100">Client messages</p>
              <p className="mt-1 text-xs text-slate-400">
                Notify me when a client replies.
              </p>
            </div>
            <input
              type="checkbox"
              name="clientMessages"
              checked={form.clientMessages}
              onChange={handleToggle}
              className="accent-glow-cyan"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-slate-100">Proposal updates</p>
              <p className="mt-1 text-xs text-slate-400">
                Notify me when admin reviews my proposals.
              </p>
            </div>
            <input
              type="checkbox"
              name="proposalAlerts"
              checked={form.proposalAlerts}
              onChange={handleToggle}
              className="accent-glow-cyan"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-slate-100">Project updates</p>
              <p className="mt-1 text-xs text-slate-400">
                Notify me when project status is changed.
              </p>
            </div>
            <input
              type="checkbox"
              name="projectUpdateAlerts"
              checked={form.projectUpdateAlerts}
              onChange={handleToggle}
              className="accent-glow-cyan"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-slate-100">Payments</p>
              <p className="mt-1 text-xs text-slate-400">
                Notify me for escrow, release, and refund updates.
              </p>
            </div>
            <input
              type="checkbox"
              name="paymentAlerts"
              checked={form.paymentAlerts}
              onChange={handleToggle}
              className="accent-glow-cyan"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-slate-100">Account review</p>
              <p className="mt-1 text-xs text-slate-400">
                Notify me when admin approves or blocks my account.
              </p>
            </div>
            <input
              type="checkbox"
              name="accountReviewAlerts"
              checked={form.accountReviewAlerts}
              onChange={handleToggle}
              className="accent-glow-cyan"
            />
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-400">
            Billing preferences are managed with Admin approval.
          </div>
        </div>
        {status && <p className="mt-4 text-sm text-slate-300">{status}</p>}
        <Button className="mt-6" onClick={handleSave} disabled={loading}>
          {loading ? "Saving..." : "Save settings"}
        </Button>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3">
          <div>
            <p className="text-sm text-rose-100">Sign out</p>
            <p className="mt-1 text-xs text-rose-200/70">
              Use this to safely log out of your account.
            </p>
          </div>
          <Button variant="danger" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}


