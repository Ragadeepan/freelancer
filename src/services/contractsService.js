import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  setDoc
} from "firebase/firestore";
import { db } from "../firebase/firebase.js";
import { logActivity } from "./activityLogsService.js";
import {
  createNotificationsBulk,
  listActiveAdminIds
} from "./notificationsService.js";
import { createEscrowPayment, releasePayment } from "./paymentsService.js";
import { recordContractActivity } from "./contractActivityService.js";
import {
  CONTRACT_STATUS,
  PAYMENT_STATUS,
  normalizeContractStatus
} from "../utils/contracts.js";

const asText = (value) => String(value || "").trim();
const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const getContractStatus = (contract) =>
  normalizeContractStatus(contract?.contractStatus ?? contract?.status);

const getRequirementDeadline = (contract) => {
  const raw = contract?.requirementDeadline ?? contract?.requirementDueAt;
  if (!raw) return null;
  if (typeof raw.toDate === "function") return raw.toDate();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export async function createContract({
  jobId,
  projectId,
  proposalId,
  clientId,
  freelancerId,
  clientName = "",
  freelancerName = "",
  amount,
  currency = "INR",
  title = "",
  jobTitle = "",
  budget = null,
  createdBy
}) {
  if (!clientId || !freelancerId) {
    throw new Error("Contract requires client and freelancer.");
  }
  const normalizedAmount = Math.max(0, toNumber(amount));
  if (!normalizedAmount) {
    throw new Error("Contract amount is required.");
  }

  const createdAt = serverTimestamp();
  const docRef = await addDoc(collection(db, "contracts"), {
    jobId: jobId || null,
    projectId: projectId || null,
    proposalId: proposalId || null,
    clientId,
    freelancerId,
    clientName: asText(clientName).slice(0, 160) || null,
    freelancerName: asText(freelancerName).slice(0, 160) || null,
    title: asText(title).slice(0, 160) || "Contract",
    jobTitle: asText(jobTitle || title).slice(0, 200) || "Project",
    amount: normalizedAmount,
    budget: Number.isFinite(Number(budget)) ? Number(budget) : normalizedAmount,
    currency: asText(currency).toUpperCase() || "INR",
    contractStatus: CONTRACT_STATUS.AWAITING_PAYMENT,
    paymentStatus: PAYMENT_STATUS.AWAITING_PAYMENT,
    paymentId: null,
    requirementDeadline: null,
    requirementUploadedAt: null,
    flowSubmittedAt: null,
    flowApprovedAt: null,
    developmentStartedAt: null,
    demoScheduledAt: null,
    demoDate: null,
    demoTime: null,
    meetingLink: null,
    feedbackUploadedAt: null,
    finalSubmittedAt: null,
    finalApprovedAt: null,
    createdBy: createdBy || clientId,
    createdAt,
    updatedAt: createdAt
  });

  await logActivity({
    actor: createdBy || clientId,
    action: "contract_created",
    targetId: docRef.id
  }).catch(() => null);

  const adminIds = await listActiveAdminIds().catch(() => []);
  await createNotificationsBulk(
    [
      ...adminIds.map((adminId) => ({
        recipientId: adminId,
        type: "contract_created",
        title: "New contract created",
        message: `Contract ${docRef.id} was created.`,
        actorId: createdBy || clientId,
        projectId: projectId || null,
        jobId: jobId || null
      })),
      {
        recipientId: freelancerId,
        type: "contract_created",
        title: "Contract created",
        message: "A new contract has been created. Await client payment.",
        actorId: createdBy || clientId,
        projectId: projectId || null,
        jobId: jobId || null
      }
    ]
  ).catch(() => null);

  await recordContractActivity({
    contractId: docRef.id,
    actorId: createdBy || clientId,
    actorRole: "client",
    action: "contract_created",
    message: "Contract created and awaiting payment."
  }).catch(() => null);

  return docRef;
}

export async function markContractPaid({
  contractId,
  clientId,
  commissionRate = 0
}) {
  const contractRef = doc(db, "contracts", contractId);
  const snap = await getDoc(contractRef);
  if (!snap.exists()) throw new Error("Contract not found.");
  const contract = snap.data();
  if (contract.clientId !== clientId) {
    throw new Error("Only the client can fund the contract.");
  }
  if (getContractStatus(contract) !== CONTRACT_STATUS.AWAITING_PAYMENT) {
    throw new Error("Contract is not ready for payment.");
  }

  const commission = (Number(contract.amount || 0) * Number(commissionRate || 0)) / 100;
  const paymentRef = await createEscrowPayment({
    projectId: contract.projectId,
    jobId: contract.jobId || null,
    amount: Number(contract.amount || 0),
    commission,
    clientId: contract.clientId,
    freelancerId: contract.freelancerId,
    installmentNumber: 1,
    totalInstallments: 1,
    reviewStatus: "pending",
    sourceFlow: "contract_full_payment"
  });

  await updateDoc(contractRef, {
    paymentId: paymentRef.id,
    paymentStatus: PAYMENT_STATUS.FUNDED,
    contractStatus: CONTRACT_STATUS.AWAITING_REQUIREMENTS,
    requirementDeadline: Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    updatedAt: serverTimestamp()
  });

  await logActivity({
    actor: clientId,
    action: "contract_paid",
    targetId: contractId
  }).catch(() => null);
  await recordContractActivity({
    contractId,
    actorId: clientId,
    actorRole: "client",
    action: "payment_funded",
    message: "Full payment funded. Awaiting requirements upload."
  }).catch(() => null);
}

export async function uploadRequirements({
  contractId,
  clientId,
  requirementFile
}) {
  const contractRef = doc(db, "contracts", contractId);
  const snap = await getDoc(contractRef);
  if (!snap.exists()) throw new Error("Contract not found.");
  const contract = snap.data();
  if (contract.clientId !== clientId) {
    throw new Error("Only the client can upload requirements.");
  }
  if (getContractStatus(contract) !== CONTRACT_STATUS.AWAITING_REQUIREMENTS) {
    throw new Error("Client payment is required before uploading requirements.");
  }
  const deadline = getRequirementDeadline(contract);
  if (deadline && Date.now() > deadline.getTime()) {
    throw new Error("Requirement upload window has expired.");
  }

  await updateDoc(contractRef, {
    requirementFile,
    requirementUploadedAt: new Date().toISOString(),
    contractStatus: CONTRACT_STATUS.REQUIREMENTS_UPLOADED,
    updatedAt: serverTimestamp()
  });
  await recordContractActivity({
    contractId,
    actorId: clientId,
    actorRole: "client",
    action: "requirements_uploaded",
    message: "Client uploaded requirement documents."
  }).catch(() => null);
}

export async function requestRequirementCancellation({ contractId, clientId }) {
  const contractRef = doc(db, "contracts", contractId);
  const snap = await getDoc(contractRef);
  if (!snap.exists()) throw new Error("Contract not found.");
  const contract = snap.data();
  if (contract.clientId !== clientId) {
    throw new Error("Only the client can request cancellation.");
  }
  if (getContractStatus(contract) !== CONTRACT_STATUS.AWAITING_REQUIREMENTS) {
    throw new Error("Cancellation can only be requested while awaiting requirements.");
  }
  const deadline = getRequirementDeadline(contract);
  if (!deadline || Date.now() <= deadline.getTime()) {
    throw new Error("Requirement deadline has not passed yet.");
  }

  await updateDoc(contractRef, {
    cancellationRequestedAt: serverTimestamp(),
    cancellationRequestedBy: clientId,
    updatedAt: serverTimestamp()
  });
  await recordContractActivity({
    contractId,
    actorId: clientId,
    actorRole: "client",
    action: "cancellation_requested",
    message: "Client requested cancellation after requirement deadline."
  }).catch(() => null);
}

export async function submitFlowDoc({
  contractId,
  freelancerId,
  flowDoc
}) {
  const contractRef = doc(db, "contracts", contractId);
  const snap = await getDoc(contractRef);
  if (!snap.exists()) throw new Error("Contract not found.");
  const contract = snap.data();
  if (contract.freelancerId !== freelancerId) {
    throw new Error("Only the freelancer can submit flow.");
  }
  if (
    ![
      CONTRACT_STATUS.REQUIREMENTS_UPLOADED,
      CONTRACT_STATUS.FLOW_REVISION
    ].includes(getContractStatus(contract))
  ) {
    throw new Error("Requirements must be uploaded before submitting flow.");
  }

  await updateDoc(contractRef, {
    flowDoc,
    flowSubmittedAt: new Date().toISOString(),
    contractStatus: CONTRACT_STATUS.FLOW_SUBMITTED,
    updatedAt: serverTimestamp()
  });
  await recordContractActivity({
    contractId,
    actorId: freelancerId,
    actorRole: "freelancer",
    action: "flow_submitted",
    message: "Freelancer submitted project flow document."
  }).catch(() => null);
}

export async function requestFlowRevision({
  contractId,
  clientId,
  reason = ""
}) {
  const contractRef = doc(db, "contracts", contractId);
  const snap = await getDoc(contractRef);
  if (!snap.exists()) throw new Error("Contract not found.");
  const contract = snap.data();
  if (contract.clientId !== clientId) {
    throw new Error("Only the client can request flow revision.");
  }
  if (getContractStatus(contract) !== CONTRACT_STATUS.FLOW_SUBMITTED) {
    throw new Error("Flow must be submitted before requesting revision.");
  }

  await updateDoc(contractRef, {
    flowRevisionRequestedAt: new Date().toISOString(),
    flowRevisionRequestedBy: clientId,
    flowRevisionReason: asText(reason).slice(0, 500),
    contractStatus: CONTRACT_STATUS.FLOW_REVISION,
    updatedAt: serverTimestamp()
  });
  await recordContractActivity({
    contractId,
    actorId: clientId,
    actorRole: "client",
    action: "flow_revision_requested",
    message: asText(reason) || "Client requested flow revision."
  }).catch(() => null);
}

export async function approveFlow({
  contractId,
  clientId
}) {
  const contractRef = doc(db, "contracts", contractId);
  const snap = await getDoc(contractRef);
  if (!snap.exists()) throw new Error("Contract not found.");
  const contract = snap.data();
  if (contract.clientId !== clientId) {
    throw new Error("Only the client can approve flow.");
  }
  if (getContractStatus(contract) !== CONTRACT_STATUS.FLOW_SUBMITTED) {
    throw new Error("Flow document must be submitted before approval.");
  }

  await updateDoc(contractRef, {
    flowApprovedAt: new Date().toISOString(),
    flowApprovedBy: clientId,
    contractStatus: CONTRACT_STATUS.DEVELOPMENT_READY,
    updatedAt: serverTimestamp()
  });
  await recordContractActivity({
    contractId,
    actorId: clientId,
    actorRole: "client",
    action: "flow_approved",
    message: "Client approved project flow."
  }).catch(() => null);
}

export async function startDevelopment({
  contractId,
  freelancerId
}) {
  const contractRef = doc(db, "contracts", contractId);
  const snap = await getDoc(contractRef);
  if (!snap.exists()) throw new Error("Contract not found.");
  const contract = snap.data();
  if (contract.freelancerId !== freelancerId) {
    throw new Error("Only the freelancer can start development.");
  }
  if (getContractStatus(contract) !== CONTRACT_STATUS.DEVELOPMENT_READY) {
    throw new Error("Client must approve flow before development starts.");
  }

  await updateDoc(contractRef, {
    developmentStartedAt: new Date().toISOString(),
    contractStatus: CONTRACT_STATUS.IN_PROGRESS,
    updatedAt: serverTimestamp()
  });
  await recordContractActivity({
    contractId,
    actorId: freelancerId,
    actorRole: "freelancer",
    action: "development_started",
    message: "Freelancer started development."
  }).catch(() => null);
}

export async function scheduleDemo({
  contractId,
  freelancerId,
  scheduledAt,
  demoDate,
  demoTime,
  meetingLink
}) {
  const contractRef = doc(db, "contracts", contractId);
  const snap = await getDoc(contractRef);
  if (!snap.exists()) throw new Error("Contract not found.");
  const contract = snap.data();
  if (contract.freelancerId !== freelancerId) {
    throw new Error("Only the freelancer can schedule a demo.");
  }
  if (getContractStatus(contract) !== CONTRACT_STATUS.IN_PROGRESS) {
    throw new Error("Development must start before scheduling demo.");
  }

  await updateDoc(contractRef, {
    demoScheduledAt: scheduledAt || new Date().toISOString(),
    demoDate: demoDate || null,
    demoTime: demoTime || null,
    meetingLink: asText(meetingLink),
    contractStatus: CONTRACT_STATUS.DEMO_SCHEDULED,
    updatedAt: serverTimestamp()
  });
  await recordContractActivity({
    contractId,
    actorId: freelancerId,
    actorRole: "freelancer",
    action: "demo_scheduled",
    message: "Freelancer scheduled demo.",
    metadata: {
      demoDate: demoDate || null,
      demoTime: demoTime || null
    }
  }).catch(() => null);
}

export async function uploadFeedback({
  contractId,
  clientId,
  feedbackDoc
}) {
  const contractRef = doc(db, "contracts", contractId);
  const snap = await getDoc(contractRef);
  if (!snap.exists()) throw new Error("Contract not found.");
  const contract = snap.data();
  if (contract.clientId !== clientId) {
    throw new Error("Only the client can upload feedback.");
  }
  if (getContractStatus(contract) !== CONTRACT_STATUS.DEMO_SCHEDULED) {
    throw new Error("Demo must be scheduled before uploading feedback.");
  }

  await updateDoc(contractRef, {
    feedbackDoc,
    feedbackUploadedAt: new Date().toISOString(),
    contractStatus: CONTRACT_STATUS.REVISION_REQUESTED,
    updatedAt: serverTimestamp()
  });
  await recordContractActivity({
    contractId,
    actorId: clientId,
    actorRole: "client",
    action: "feedback_uploaded",
    message: "Client uploaded demo feedback."
  }).catch(() => null);
}

export async function submitFinalProject({
  contractId,
  freelancerId,
  finalSubmission
}) {
  const contractRef = doc(db, "contracts", contractId);
  const snap = await getDoc(contractRef);
  if (!snap.exists()) throw new Error("Contract not found.");
  const contract = snap.data();
  if (contract.freelancerId !== freelancerId) {
    throw new Error("Only the freelancer can submit final project.");
  }
  const status = getContractStatus(contract);
  if (![CONTRACT_STATUS.REVISION_REQUESTED, CONTRACT_STATUS.IN_PROGRESS].includes(status)) {
    throw new Error("Client feedback must be uploaded before final submission.");
  }
  if (!finalSubmission?.sourceCode || !finalSubmission?.setupInstructions || !finalSubmission?.documentation) {
    throw new Error("Final submission must include source code, setup, and documentation.");
  }

  await updateDoc(contractRef, {
    finalSubmission,
    finalSubmittedAt: new Date().toISOString(),
    contractStatus: CONTRACT_STATUS.FINAL_SUBMITTED,
    updatedAt: serverTimestamp()
  });
  await recordContractActivity({
    contractId,
    actorId: freelancerId,
    actorRole: "freelancer",
    action: "final_submitted",
    message: "Freelancer submitted final project files."
  }).catch(() => null);
}

export async function approveFinalSubmission({
  contractId,
  clientId
}) {
  const contractRef = doc(db, "contracts", contractId);
  const snap = await getDoc(contractRef);
  if (!snap.exists()) throw new Error("Contract not found.");
  const contract = snap.data();
  if (contract.clientId !== clientId) {
    throw new Error("Only the client can approve final submission.");
  }
  if (getContractStatus(contract) !== CONTRACT_STATUS.FINAL_SUBMITTED) {
    throw new Error("Final submission must be completed first.");
  }

  const paymentId = contract.paymentId;
  await updateDoc(contractRef, {
    finalApprovedAt: new Date().toISOString(),
    finalApprovedBy: clientId,
    contractStatus: CONTRACT_STATUS.COMPLETED,
    paymentStatus: PAYMENT_STATUS.RELEASE_PENDING,
    updatedAt: serverTimestamp()
  });

  if (paymentId) {
    await updateDoc(doc(db, "payments", paymentId), {
      status: "release_pending",
      releaseRequestedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  const payoutSnap = await getDocs(
    query(collection(db, "payouts"), where("contractId", "==", contractId))
  );
  if (payoutSnap.empty) {
    await addDoc(collection(db, "payouts"), {
      contractId,
      freelancerId: contract.freelancerId,
      amount: Number(contract.amount || 0),
      status: "pending",
      releasedByAdminId: null,
      releasedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
  await recordContractActivity({
    contractId,
    actorId: clientId,
    actorRole: "client",
    action: "final_approved",
    message: "Client approved final submission. Payment moved to release pending."
  }).catch(() => null);
}

export async function verifyBankDetails({ freelancerId, adminId, verified }) {
  if (!freelancerId) throw new Error("Freelancer id is required.");
  const bankRef = doc(db, "bankDetails", freelancerId);
  const bankSnap = await getDoc(bankRef);
  if (!bankSnap.exists()) {
    throw new Error("Bank details not found.");
  }
  await updateDoc(bankRef, {
    status: verified ? "verified" : "pending",
    verifiedByAdminId: verified ? adminId || null : null,
    verifiedAt: verified ? serverTimestamp() : null,
    updatedAt: serverTimestamp()
  });
}

export async function updateFreelancerBankDetails(uid, bankDetails) {
  const hasDetails =
    asText(bankDetails?.accountName) &&
    asText(bankDetails?.accountNumber) &&
    asText(bankDetails?.ifsc) &&
    asText(bankDetails?.bankName);
  if (!hasDetails) {
    throw new Error("Complete bank details are required.");
  }
  const bankRef = doc(db, "bankDetails", uid);
  const existing = await getDoc(bankRef);
  const createdAt = existing.exists()
    ? existing.data()?.createdAt || serverTimestamp()
    : serverTimestamp();
  await setDoc(bankRef, {
    userId: uid,
    bankName: asText(bankDetails.bankName),
    accountHolder: asText(bankDetails.accountName),
    accountNumber: asText(bankDetails.accountNumber),
    ifsc: asText(bankDetails.ifsc),
    upi: asText(bankDetails.upi),
    pan: asText(bankDetails.pan),
    status: "pending",
    createdAt,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function ensureFreelancerBankVerified(uid) {
  const snap = await getDoc(doc(db, "bankDetails", uid));
  if (!snap.exists()) throw new Error("Freelancer profile not found.");
  const profile = snap.data();
  if (profile.status !== "verified") {
    throw new Error("Freelancer bank details must be verified by admin.");
  }
  return profile;
}

export async function getContractById(contractId) {
  const snap = await getDoc(doc(db, "contracts", contractId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function releaseContractPayout({ contractId, adminId }) {
  if (!contractId) throw new Error("Contract id is required.");
  const contractRef = doc(db, "contracts", contractId);
  const snap = await getDoc(contractRef);
  if (!snap.exists()) throw new Error("Contract not found.");
  const contract = snap.data();
  if (getContractStatus(contract) !== CONTRACT_STATUS.COMPLETED) {
    throw new Error("Contract must be completed before releasing payment.");
  }
  if ((contract.paymentStatus || "") !== PAYMENT_STATUS.RELEASE_PENDING) {
    throw new Error("Payment must be release pending before release.");
  }
  if (!contract.paymentId) {
    throw new Error("Contract is missing payment reference.");
  }

  await ensureFreelancerBankVerified(contract.freelancerId);

  const payoutSnap = await getDocs(
    query(collection(db, "payouts"), where("contractId", "==", contractId))
  );
  if (payoutSnap.empty) {
    throw new Error("Payout record not found.");
  }
  const payoutDoc = payoutSnap.docs[0];

  await releasePayment(contract.paymentId, adminId);

  await updateDoc(payoutDoc.ref, {
    status: "released",
    releasedByAdminId: adminId || null,
    releasedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await updateDoc(contractRef, {
    paymentStatus: PAYMENT_STATUS.PAID,
    contractStatus: CONTRACT_STATUS.CLOSED,
    updatedAt: serverTimestamp()
  });
  await recordContractActivity({
    contractId,
    actorId: adminId,
    actorRole: "admin",
    action: "payment_released",
    message: "Admin released payment and closed contract."
  }).catch(() => null);
}
