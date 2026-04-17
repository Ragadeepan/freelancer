export const clientNav = [
  { label: "Overview", to: "/client/dashboard", icon: "◈" },
  {
    label: "Post Job",
    to: "/client/post-job",
    icon: "＋",
    requiresClientProfileComplete: true,
    requiresClientApproval: true
  },
  { label: "Contracts", to: "/client/contracts", icon: "▥" },
  { label: "My Jobs", to: "/client/jobs", icon: "▣" },
  { label: "Workspace", to: "/client/workspace/projects", icon: "▤" },
  { label: "Projects", to: "/client/projects", icon: "▦" },
  { label: "Payments", to: "/client/payments", icon: "◎" },
  { label: "Messages", to: "/client/messages", icon: "✉" },
  { label: "Notifications", to: "/client/notifications", icon: "◉" },
  { label: "Profile", to: "/client/company-profile", icon: "◐" },
  { label: "Settings", to: "/client/settings", icon: "⚙" }
];

export const freelancerNav = [
  { label: "Overview", to: "/freelancer/dashboard", icon: "◈" },
  { label: "My Contracts", to: "/freelancer/contracts", icon: "▥" },
  { label: "Pending Payments", to: "/freelancer/pending-payments", icon: "◍" },
  { label: "Jobs", to: "/freelancer/jobs", icon: "▣" },
  { label: "Workspace", to: "/freelancer/workspace/projects", icon: "▤" },
  { label: "Projects", to: "/freelancer/projects", icon: "▦" },
  { label: "Earnings", to: "/freelancer/earnings", icon: "◎" },
  { label: "Bank Details", to: "/freelancer/bank-details", icon: "◑" },
  { label: "Analytics", to: "/freelancer/analytics", icon: "◑" },
  { label: "Messages", to: "/freelancer/messages", icon: "✉" },
  { label: "Notifications", to: "/freelancer/notifications", icon: "◉" },
  { label: "Profile", to: "/freelancer/profile", icon: "◐" },
  { label: "Settings", to: "/freelancer/settings", icon: "⚙" }
];

export const adminNav = [
  { label: "Dashboard", to: "/secure-admin/dashboard", icon: "◈" },
  { label: "Users", to: "/secure-admin/users", icon: "◐" },
  { label: "Contracts", to: "/secure-admin/contracts", icon: "▥" },
  { label: "Jobs", to: "/secure-admin/jobs", icon: "▣" },
  { label: "Assignments", to: "/secure-admin/assignments", icon: "◍" },
  { label: "Proposals", to: "/secure-admin/proposals", icon: "▦" },
  { label: "Projects", to: "/secure-admin/projects", icon: "◔" },
  { label: "Payments", to: "/secure-admin/payments", icon: "◎" },
  { label: "Disputes", to: "/secure-admin/disputes", icon: "⚑" },
  { label: "Notifications", to: "/secure-admin/notifications", icon: "◉" },
  { label: "Settings", to: "/secure-admin/settings", icon: "⚙" }
];
