import { useEffect, useState } from "react";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Button from "../../components/Button.jsx";
import { clientNav } from "../../data/nav.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { updateUserProfile } from "../../services/usersService.js";
import { logout } from "../../services/authService.js";
import { useToast } from "../../contexts/ToastContext.jsx";

export default function ClientSettings() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    emailNotifications: true,
    jobReviewAlerts: true,
    proposalAlerts: true,
    projectUpdateAlerts: true,
    paymentAlerts: true,
    accountReviewAlerts: true,
    weeklySummaries: true
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!profile) return;
    setForm({
      emailNotifications: profile.emailNotifications ?? true,
      jobReviewAlerts: profile.jobReviewAlerts ?? true,
      proposalAlerts: profile.proposalAlerts ?? true,
      projectUpdateAlerts: profile.projectUpdateAlerts ?? true,
      paymentAlerts: profile.paymentAlerts ?? true,
      accountReviewAlerts: profile.accountReviewAlerts ?? true,
      weeklySummaries: profile.weeklySummaries ?? true
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
        emailNotifications: form.emailNotifications,
        jobReviewAlerts: form.jobReviewAlerts,
        proposalAlerts: form.proposalAlerts,
        projectUpdateAlerts: form.projectUpdateAlerts,
        paymentAlerts: form.paymentAlerts,
        accountReviewAlerts: form.accountReviewAlerts,
        weeklySummaries: form.weeklySummaries
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
      sidebar={{ title: "Client Suite", subtitle: "Client", items: clientNav }}
    >
      <PageHeader
        title="Account settings"
        description="Control how your client account behaves across the marketplace."
        primaryAction="Save settings"
        onPrimaryAction={handleSave}
        primaryDisabled={loading}
      />
      <div className="glass-card rounded-2xl p-6">
        <div className="grid gap-4 text-sm text-slate-300">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-slate-100">Email notifications</p>
              <p className="mt-1 text-xs text-slate-400">
                Receive updates about proposals and projects.
              </p>
            </div>
            <input
              type="checkbox"
              name="emailNotifications"
              checked={form.emailNotifications}
              onChange={handleToggle}
              className="accent-glow-cyan"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-slate-100">Weekly summaries</p>
              <p className="mt-1 text-xs text-slate-400">
                Get a snapshot of activity every Monday.
              </p>
            </div>
            <input
              type="checkbox"
              name="weeklySummaries"
              checked={form.weeklySummaries}
              onChange={handleToggle}
              className="accent-glow-cyan"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-slate-100">Job review updates</p>
              <p className="mt-1 text-xs text-slate-400">
                Notify me when admin approves or rejects my jobs.
              </p>
            </div>
            <input
              type="checkbox"
              name="jobReviewAlerts"
              checked={form.jobReviewAlerts}
              onChange={handleToggle}
              className="accent-glow-cyan"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-slate-100">Proposal updates</p>
              <p className="mt-1 text-xs text-slate-400">
                Notify me when freelancers submit or admin reviews proposals.
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
                Notify me for project status and update requests.
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
                Notify me for escrow funding, release, and refund actions.
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
                Notify me when admin reviews my account profile.
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
            Your security settings are managed by Admin approval.
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
