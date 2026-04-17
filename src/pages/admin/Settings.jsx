import { useEffect, useState } from "react";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Button from "../../components/Button.jsx";
import { adminNav } from "../../data/nav.js";
import { doc } from "firebase/firestore";
import { db } from "../../firebase/firebase.js";
import useFirestoreDoc from "../../hooks/useFirestoreDoc.js";
import { updateSettings } from "../../services/settingsService.js";

export default function AdminSettings() {
  const [form, setForm] = useState({
    commissionPercentage: "",
    escrowReleaseDelay: "",
    adminNotes: ""
  });
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const { data: settings } = useFirestoreDoc(
    () => doc(db, "settings", "global"),
    []
  );

  useEffect(() => {
    setForm({
      commissionPercentage: settings?.commissionPercentage ?? "",
      escrowReleaseDelay: settings?.escrowReleaseDelay ?? "",
      adminNotes: settings?.adminNotes ?? ""
    });
  }, [settings]);

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleSave = async () => {
    setStatus("");
    setLoading(true);
    try {
      await updateSettings({
        commissionPercentage: Number(form.commissionPercentage),
        escrowReleaseDelay: form.escrowReleaseDelay,
        adminNotes: form.adminNotes
      });
      setStatus("Settings updated.");
    } catch (err) {
      setStatus(err.message || "Failed to update settings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout
      title="Settings"
      sidebar={{ title: "Admin HQ", subtitle: "Admin", items: adminNav }}
    >
      <PageHeader
        title="Marketplace controls"
        description="Set commission percentages and approval thresholds."
        primaryAction="Save settings"
        onPrimaryAction={handleSave}
        primaryDisabled={loading}
      />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="glass-card rounded-2xl p-6">
          <div className="grid gap-4">
            <input
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
              placeholder="Commission percentage"
              name="commissionPercentage"
              value={form.commissionPercentage}
              onChange={handleChange}
            />
            <input
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
              placeholder="Escrow release delay"
              name="escrowReleaseDelay"
              value={form.escrowReleaseDelay}
              onChange={handleChange}
            />
            <textarea
              rows="4"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
              placeholder="Admin notes"
              name="adminNotes"
              value={form.adminNotes}
              onChange={handleChange}
            />
          </div>
          {status && <p className="mt-4 text-sm text-slate-300">{status}</p>}
          <Button className="mt-6" onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Update settings"}
          </Button>
        </div>
        <div className="glass-card rounded-2xl p-6">
          <h4 className="text-sm font-semibold text-white">
            Approval policies
          </h4>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            <li>User approvals are manual.</li>
            <li>Projects can be frozen at any stage.</li>
            <li>Payments release only after Admin approval.</li>
          </ul>
        </div>
      </div>
    </DashboardLayout>
  );
}
