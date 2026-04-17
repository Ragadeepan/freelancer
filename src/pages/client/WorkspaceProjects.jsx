import DashboardLayout from "../../components/DashboardLayout.jsx";
import ComingSoonPanel from "../../components/ComingSoonPanel.jsx";
import { clientNav } from "../../data/nav.js";

export default function ClientWorkspaceProjects() {
  return (
    <DashboardLayout
      title="Workspace Projects"
      sidebar={{ title: "Client Suite", subtitle: "Client", items: clientNav }}
    >
      <ComingSoonPanel
        title="Workspace projects"
        description="This workspace list is temporarily parked."
        emptyDescription="Workspace projects page is coming soon. Until then, open active workspaces directly from My Jobs or Projects."
        primaryAction="Open My Jobs"
        primaryTo="/client/jobs"
      />
    </DashboardLayout>
  );
}
