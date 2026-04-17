import { useEffect, useState } from "react";
import { doc } from "firebase/firestore";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Button from "../../components/Button.jsx";
import { freelancerNav } from "../../data/nav.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { updateFreelancerBankDetails } from "../../services/contractsService.js";
import { db } from "../../firebase/firebase.js";
import useFirestoreQuery from "../../hooks/useFirestoreQuery.js";

export default function FreelancerBankDetails() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: bankProfile } = useFirestoreQuery(
    () => (user?.uid ? doc(db, "bankDetails", user.uid) : null),
    [user],
    null
  );
  const [form, setForm] = useState({
    accountName: "",
    accountNumber: "",
    ifsc: "",
    bankName: "",
    upi: "",
    pan: ""
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      accountName: bankProfile?.accountHolder || "",
      accountNumber: bankProfile?.accountNumber || "",
      ifsc: bankProfile?.ifsc || "",
      bankName: bankProfile?.bankName || "",
      upi: bankProfile?.upi || "",
      pan: bankProfile?.pan || ""
    });
  }, [bankProfile]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      await updateFreelancerBankDetails(user.uid, form);
      toast.success("Bank details saved. Await admin verification.");
    } catch (err) {
      toast.error(err?.message || "Failed to save bank details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      title="Bank Details"
      sidebar={{ title: "Growlanzer", subtitle: "Freelancer", items: freelancerNav }}
    >
      <PageHeader
        title="Bank Details"
        description="Admin must verify your bank details before payment release."
        primaryAction="Save"
        onPrimaryAction={handleSave}
        primaryDisabled={saving}
      />

      <div className="glass-card rounded-2xl p-6 space-y-4">
        <input
          className="form-input"
          placeholder="Account holder name"
          name="accountName"
          value={form.accountName}
          onChange={handleChange}
        />
        <input
          className="form-input"
          placeholder="Account number"
          name="accountNumber"
          value={form.accountNumber}
          onChange={handleChange}
        />
        <input
          className="form-input"
          placeholder="IFSC code"
          name="ifsc"
          value={form.ifsc}
          onChange={handleChange}
        />
        <input
          className="form-input"
          placeholder="Bank name"
          name="bankName"
          value={form.bankName}
          onChange={handleChange}
        />
        <input
          className="form-input"
          placeholder="UPI (optional)"
          name="upi"
          value={form.upi}
          onChange={handleChange}
        />
        <input
          className="form-input"
          placeholder="PAN"
          name="pan"
          value={form.pan}
          onChange={handleChange}
        />
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save bank details"}
        </Button>
      </div>
    </DashboardLayout>
  );
}
