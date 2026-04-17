import DashboardLayout from "../../components/DashboardLayout.jsx";
import ComingSoonPanel from "../../components/ComingSoonPanel.jsx";
import { freelancerNav } from "../../data/nav.js";

export default function FreelancerMessages() {
  return (
    <DashboardLayout
      title="Messages"
      sidebar={{
        title: "Growlanzer",
        subtitle: "Freelancer",
        items: freelancerNav
      }}
    >
      <ComingSoonPanel
        title="Messages workspace"
        description="Direct messaging UI is temporarily parked."
        emptyDescription="Messages workspace is coming soon. For now, use project updates and notifications for project communication."
        primaryAction="Open Projects"
        primaryTo="/freelancer/projects"
      />
    </DashboardLayout>
  );
}
