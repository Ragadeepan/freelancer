import DashboardLayout from "../../components/DashboardLayout.jsx";
import ComingSoonPanel from "../../components/ComingSoonPanel.jsx";
import { clientNav } from "../../data/nav.js";

export default function ClientMessages() {
  return (
    <DashboardLayout
      title="Messages"
      sidebar={{ title: "Client Suite", subtitle: "Client", items: clientNav }}
    >
      <ComingSoonPanel
        title="Messages workspace"
        description="Direct messaging UI is temporarily parked."
        emptyDescription="Messages workspace is coming soon. For now, use project updates and notifications for project communication."
        primaryAction="Open Projects"
        primaryTo="/client/projects"
      />
    </DashboardLayout>
  );
}
