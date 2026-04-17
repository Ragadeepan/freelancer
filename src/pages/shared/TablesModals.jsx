import { useState } from "react";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import Table from "../../components/Table.jsx";
import { SlideOver, ConfirmDialog } from "../../components/Modal.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Button from "../../components/Button.jsx";
import { adminNav } from "../../data/nav.js";
import { useToast } from "../../contexts/ToastContext.jsx";

const rows = [
  ["Kara Nolan", "client", { type: "status", value: "pending" }],
  ["Ben Rivera", "freelancer", { type: "status", value: "pending" }],
  ["June Park", "freelancer", { type: "status", value: "approved" }]
];

export default function TablesModals() {
  const toast = useToast();
  const [showApprovalDetail, setShowApprovalDetail] = useState(true);
  const [showFreezeConfirm, setShowFreezeConfirm] = useState(true);

  const handleApprove = () => {
    toast.success("Approved demo action.");
    setShowApprovalDetail(false);
  };

  const handleFreezeConfirm = () => {
    toast.success("Project freeze confirmed (demo).");
    setShowFreezeConfirm(false);
  };

  return (
    <DashboardLayout
      title="Table & Modal System"
      sidebar={{ title: "Admin HQ", subtitle: "Admin", items: adminNav }}
    >
      <PageHeader
        title="Reusable UI system"
        description="Tables, slide-overs, and confirmation dialogs."
      />
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Table columns={["Name", "Role", "Status"]} rows={rows} />
        <div className="space-y-6">
          {showApprovalDetail ? (
            <SlideOver
              title="Approval detail"
              onClose={() => setShowApprovalDetail(false)}
              onApprove={handleApprove}
            >
              Review submission metadata, files, and compliance notes.
            </SlideOver>
          ) : (
            <div className="glass-card rounded-2xl p-5 sm:p-6">
              <p className="text-sm text-slate-300">
                Approval detail panel closed.
              </p>
              <Button
                className="mt-4"
                variant="ghost"
                onClick={() => setShowApprovalDetail(true)}
              >
                Reopen approval panel
              </Button>
            </div>
          )}
          {showFreezeConfirm ? (
            <ConfirmDialog
              title="Freeze project?"
              description="Freezing stops work and pauses payments until resolved."
              onCancel={() => setShowFreezeConfirm(false)}
              onConfirm={handleFreezeConfirm}
            />
          ) : (
            <div className="glass-card rounded-2xl p-5 sm:p-6">
              <p className="text-sm text-slate-300">
                Freeze confirmation closed.
              </p>
              <Button
                className="mt-4"
                variant="ghost"
                onClick={() => setShowFreezeConfirm(true)}
              >
                Reopen freeze confirmation
              </Button>
            </div>
          )}
        </div>
      </section>
    </DashboardLayout>
  );
}
