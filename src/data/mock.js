export const mockJobs = [
  {
    id: "job-1",
    title: "Fintech onboarding flow redesign",
    budget: "₹4.8k",
    skills: ["Product", "Figma", "UX Research"],
    posted: "4h ago",
    status: "approved"
  },
  {
    id: "job-2",
    title: "Realtime dashboard for IoT fleet",
    budget: "₹7.2k",
    skills: ["React", "Data viz", "TypeScript"],
    posted: "1d ago",
    status: "approved"
  },
  {
    id: "job-3",
    title: "Brand system for AI security startup",
    budget: "₹3.5k",
    skills: ["Brand", "Identity", "Motion"],
    posted: "2d ago",
    status: "approved"
  }
];

export const mockProjects = [
  {
    id: "proj-1",
    name: "Nova Banking App",
    status: "in_progress",
    progress: 68,
    client: "Atlas Capital",
    freelancer: "Ava Morales"
  },
  {
    id: "proj-2",
    name: "Pulse Analytics Suite",
    status: "work_submitted",
    progress: 92,
    client: "Pulse Labs",
    freelancer: "Ethan Ross"
  }
];

export const mockProposals = [
  {
    id: "prop-1",
    jobTitle: "Fintech onboarding flow redesign",
    bidder: "Ava Morales",
    bidAmount: "₹4.6k",
    status: "approved"
  },
  {
    id: "prop-2",
    jobTitle: "Realtime dashboard for IoT fleet",
    bidder: "Ishaan Patel",
    bidAmount: "₹6.9k",
    status: "pending"
  }
];

export const mockUsers = [
  { id: "u1", name: "Kara Nolan", role: "client", status: "pending" },
  { id: "u2", name: "Ben Rivera", role: "freelancer", status: "pending" },
  { id: "u3", name: "June Park", role: "freelancer", status: "approved" }
];

export const mockPayments = [
  { id: "p1", project: "Nova Banking App", amount: "₹12.4k", status: "escrow" },
  { id: "p2", project: "Pulse Analytics Suite", amount: "₹8.1k", status: "released" }
];
