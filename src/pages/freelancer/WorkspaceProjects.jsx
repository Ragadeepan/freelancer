import DashboardLayout from "../../components/DashboardLayout.jsx";
import ComingSoonPanel from "../../components/ComingSoonPanel.jsx";
import { freelancerNav } from "../../data/nav.js";

export default function FreelancerWorkspaceProjects() {
  return (
    <DashboardLayout
      title="Workspace Projects"
      sidebar={{ title: "Growlanzer", subtitle: "Freelancer", items: freelancerNav }}
    >
      <ComingSoonPanel
        title="Workspace projects"
        description="This workspace list is temporarily parked."
        emptyDescription="Workspace projects page is coming soon. Until then, open active workspaces directly from Jobs or Projects."
        primaryAction="Open Projects"
        primaryTo="/freelancer/projects"
      />
    </DashboardLayout>
  );
}
