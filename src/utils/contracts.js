export const CONTRACT_STATUS = {
  AWAITING_PAYMENT: "awaiting_payment",
  AWAITING_REQUIREMENTS: "awaiting_requirements",
  REQUIREMENTS_UPLOADED: "requirements_uploaded",
  FLOW_SUBMITTED: "flow_submitted",
  FLOW_REVISION: "flow_revision",
  DEVELOPMENT_READY: "development_ready",
  IN_PROGRESS: "in_progress",
  DEMO_SCHEDULED: "demo_scheduled",
  REVISION_REQUESTED: "revision_requested",
  FINAL_SUBMITTED: "final_submitted",
  COMPLETED: "completed",
  CLOSED: "closed"
};

export const PAYMENT_STATUS = {
  AWAITING_PAYMENT: "awaiting_payment",
  FUNDED: "funded",
  RELEASE_PENDING: "release_pending",
  PAID: "paid"
};

export const CONTRACT_STATUS_LABELS = {
  [CONTRACT_STATUS.AWAITING_PAYMENT]: "Awaiting payment",
  [CONTRACT_STATUS.AWAITING_REQUIREMENTS]: "Awaiting requirements",
  [CONTRACT_STATUS.REQUIREMENTS_UPLOADED]: "Requirements uploaded",
  [CONTRACT_STATUS.FLOW_SUBMITTED]: "Flow submitted",
  [CONTRACT_STATUS.FLOW_REVISION]: "Flow revision",
  [CONTRACT_STATUS.DEVELOPMENT_READY]: "Development ready",
  [CONTRACT_STATUS.IN_PROGRESS]: "In progress",
  [CONTRACT_STATUS.DEMO_SCHEDULED]: "Demo scheduled",
  [CONTRACT_STATUS.REVISION_REQUESTED]: "Revision requested",
  [CONTRACT_STATUS.FINAL_SUBMITTED]: "Final submitted",
  [CONTRACT_STATUS.COMPLETED]: "Completed",
  [CONTRACT_STATUS.CLOSED]: "Closed"
};

export const CONTRACT_FLOW = [
  CONTRACT_STATUS.AWAITING_PAYMENT,
  CONTRACT_STATUS.AWAITING_REQUIREMENTS,
  CONTRACT_STATUS.REQUIREMENTS_UPLOADED,
  CONTRACT_STATUS.FLOW_SUBMITTED,
  CONTRACT_STATUS.FLOW_REVISION,
  CONTRACT_STATUS.DEVELOPMENT_READY,
  CONTRACT_STATUS.IN_PROGRESS,
  CONTRACT_STATUS.DEMO_SCHEDULED,
  CONTRACT_STATUS.REVISION_REQUESTED,
  CONTRACT_STATUS.FINAL_SUBMITTED,
  CONTRACT_STATUS.COMPLETED,
  CONTRACT_STATUS.CLOSED
];

export const normalizeContractStatus = (value) => {
  const text = String(value || "").trim().toLowerCase();
  const legacyToNew = {
    contract_created: CONTRACT_STATUS.AWAITING_PAYMENT,
    client_paid: CONTRACT_STATUS.AWAITING_REQUIREMENTS,
    requirements_uploaded: CONTRACT_STATUS.REQUIREMENTS_UPLOADED,
    flow_submitted: CONTRACT_STATUS.FLOW_SUBMITTED,
    flow_approved: CONTRACT_STATUS.DEVELOPMENT_READY,
    development_started: CONTRACT_STATUS.IN_PROGRESS,
    demo_scheduled: CONTRACT_STATUS.DEMO_SCHEDULED,
    feedback_uploaded: CONTRACT_STATUS.REVISION_REQUESTED,
    final_submitted: CONTRACT_STATUS.FINAL_SUBMITTED,
    final_approved: CONTRACT_STATUS.COMPLETED,
    release_pending: CONTRACT_STATUS.COMPLETED,
    released: CONTRACT_STATUS.CLOSED
  };
  if (legacyToNew[text]) return legacyToNew[text];
  return CONTRACT_FLOW.includes(text) ? text : CONTRACT_STATUS.AWAITING_PAYMENT;
};

export const normalizePaymentStatus = (value) => {
  const text = String(value || "").trim().toLowerCase();
  const legacyToNew = {
    escrow: PAYMENT_STATUS.FUNDED,
    held: PAYMENT_STATUS.FUNDED,
    release_pending: PAYMENT_STATUS.RELEASE_PENDING,
    released: PAYMENT_STATUS.PAID,
    paid: PAYMENT_STATUS.PAID
  };
  if (legacyToNew[text]) return legacyToNew[text];
  return Object.values(PAYMENT_STATUS).includes(text)
    ? text
    : PAYMENT_STATUS.AWAITING_PAYMENT;
};

export const isContractCompleted = (status) =>
  normalizeContractStatus(status) === CONTRACT_STATUS.CLOSED;
