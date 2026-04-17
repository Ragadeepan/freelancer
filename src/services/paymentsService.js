import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { db } from "../firebase/firebase.js";
import { logActivity } from "./activityLogsService.js";
import {
  createNotificationsBulk,
  listActiveAdminIds
} from "./notificationsService.js";
import {
  TOTAL_PROJECT_INSTALLMENTS,
  getInstallmentFundingState,
  getInstallmentLabel,
  getInstallmentStage,
  normalizeInstallmentNumber,
  toAmount
} from "../utils/paymentFlow.js";

export async function createEscrowPayment({
  projectId,
  amount,
  commission,
  clientId,
  freelancerId,
  installmentNumber = 1,
  totalInstallments = TOTAL_PROJECT_INSTALLMENTS,
  jobId = null,
  reviewStatus = "pending",
  sourceFlow = "client_to_admin_to_freelancer"
}) {
  if (!projectId) {
    throw new Error("Project id is required.");
  }
  const normalizedInstallment = normalizeInstallmentNumber(
    installmentNumber,
    totalInstallments || TOTAL_PROJECT_INSTALLMENTS
  );
  const normalizedAmount = toAmount(amount);
  const normalizedCommission = toAmount(commission);
  if (!normalizedAmount) {
    throw new Error("Escrow amount must be greater than zero.");
  }
  const netAmount = Math.max(0, normalizedAmount - normalizedCommission);
  const normalizedTotal = Number(totalInstallments) || TOTAL_PROJECT_INSTALLMENTS;

  const existingPaymentsSnap = await getDocs(
    query(collection(db, "payments"), where("projectId", "==", projectId))
  );
  const existingPayments = existingPaymentsSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
  const fundingState = getInstallmentFundingState(
    existingPayments,
    normalizedTotal
  );

  if (!fundingState.nextInstallment) {
    throw new Error(
      fundingState.reason || "Installment funding is currently locked."
    );
  }
  if (normalizedInstallment !== fundingState.nextInstallment) {
    throw new Error(
      `Invalid installment. Next allowed installment is ${fundingState.nextInstallment}.`
    );
  }

  const docRef = await addDoc(collection(db, "payments"), {
    projectId,
    jobId: jobId || null,
    amount: normalizedAmount,
    commission: normalizedCommission,
    netAmount,
    payerId: clientId || null,
    clientId: clientId || null,
    freelancerId: freelancerId || null,
    receiverType: "admin",
    currency: "INR",
    gateway: "internal_escrow",
    installmentNumber: normalizedInstallment,
    installmentLabel: getInstallmentLabel(normalizedInstallment),
    installmentStage: getInstallmentStage(normalizedInstallment),
    totalInstallments: normalizedTotal,
    sourceFlow,
    reviewStatus,
    reviewedBy: null,
    reviewedAt: null,
    reviewNotes: "",
    releasedBy: null,
    releasedAt: null,
    refundedBy: null,
    refundedAt: null,
    status: "escrow",
    createdAt: serverTimestamp()
  });
  await logActivity({
    actor: clientId,
    action: "payment_escrowed",
    targetId: docRef.id
  });
  const adminIds = await listActiveAdminIds().catch(() => []);
  await createNotificationsBulk([
    ...adminIds.map((adminId) => ({
      recipientId: adminId,
      type: "payment_escrowed",
      title: "Escrow funded",
      message: `${getInstallmentLabel(normalizedInstallment)} funded for project ${projectId}.`,
      actorId: clientId,
      projectId,
      jobId: jobId || null
    })),
    {
      recipientId: freelancerId || null,
      type: "payment_escrowed",
      title: "Escrow installment funded",
      message: `${getInstallmentLabel(normalizedInstallment)} is funded and awaiting admin review.`,
      actorId: clientId,
      projectId,
      jobId: jobId || null
    },
    {
      recipientId: clientId || null,
      type: "payment_escrowed",
      title: "Escrow funded successfully",
      message: `${getInstallmentLabel(normalizedInstallment)} was moved to escrow for review.`,
      actorId: clientId,
      projectId,
      jobId: jobId || null
    }
  ]).catch(() => null);
  return docRef;
}

export async function releasePayment(paymentId, adminId, options = {}) {
  const paymentRef = doc(db, "payments", paymentId);
  const paymentSnap = await getDoc(paymentRef);
  if (!paymentSnap.exists()) {
    throw new Error("Payment record not found.");
  }
  const payment = paymentSnap.data();
  if (payment.status !== "release_pending") {
    throw new Error("Payment must be in release_pending status before release.");
  }
  if (payment.freelancerId) {
    const bankSnap = await getDoc(doc(db, "bankDetails", payment.freelancerId));
    if (bankSnap.exists()) {
      if (bankSnap.data()?.status !== "verified") {
        throw new Error("Freelancer bank details must be verified before release.");
      }
    } else {
      const freelancerSnap = await getDoc(doc(db, "users", payment.freelancerId));
      if (!freelancerSnap.exists()) {
        throw new Error("Freelancer profile not found.");
      }
      if (!freelancerSnap.data()?.bankVerified) {
        throw new Error("Freelancer bank details must be verified before release.");
      }
    }
  }
  if (payment.status === "released") {
    throw new Error("Payment is already released.");
  }
  if (payment.status === "refunded") {
    throw new Error("Refunded payment cannot be released.");
  }

  await updateDoc(paymentRef, {
    status: "released",
    reviewStatus: "approved",
    reviewedBy: adminId || null,
    reviewedAt: serverTimestamp(),
    reviewNotes: String(options.reviewNotes || "").trim(),
    releasedBy: adminId || null,
    releasedAt: serverTimestamp()
  });
  await logActivity({
    actor: adminId,
    action: "payment_released",
    targetId: paymentId
  });
  await createNotificationsBulk([
    {
      recipientId: payment.freelancerId || null,
      type: "payment_released",
      title: "Payment released",
      message: `${payment.installmentLabel || "Installment"} payment was released to your account.`,
      actorId: adminId,
      projectId: payment.projectId || null,
      jobId: payment.jobId || null
    },
    {
      recipientId: payment.clientId || null,
      type: "payment_released",
      title: "Payment released to freelancer",
      message: `${payment.installmentLabel || "Installment"} payment was released after admin review.`,
      actorId: adminId,
      projectId: payment.projectId || null,
      jobId: payment.jobId || null
    }
  ]).catch(() => null);
}

export async function refundPayment(paymentId, adminId, options = {}) {
  const paymentRef = doc(db, "payments", paymentId);
  const paymentSnap = await getDoc(paymentRef);
  if (!paymentSnap.exists()) {
    throw new Error("Payment record not found.");
  }
  const payment = paymentSnap.data();
  if (payment.status === "refunded") {
    throw new Error("Payment is already refunded.");
  }
  if (payment.status === "released") {
    throw new Error("Released payment cannot be refunded.");
  }

  await updateDoc(paymentRef, {
    status: "refunded",
    reviewStatus: "rejected",
    reviewedBy: adminId || null,
    reviewedAt: serverTimestamp(),
    reviewNotes: String(options.reviewNotes || "").trim(),
    refundedBy: adminId || null,
    refundedAt: serverTimestamp()
  });
  await logActivity({
    actor: adminId,
    action: "payment_refunded",
    targetId: paymentId
  });
  await createNotificationsBulk([
    {
      recipientId: payment.clientId || null,
      type: "payment_refunded",
      title: "Payment refunded",
      message: `${payment.installmentLabel || "Installment"} payment was refunded by admin.`,
      actorId: adminId,
      projectId: payment.projectId || null,
      jobId: payment.jobId || null
    },
    {
      recipientId: payment.freelancerId || null,
      type: "payment_refunded",
      title: "Payment update",
      message: `${payment.installmentLabel || "Installment"} payment was refunded to client.`,
      actorId: adminId,
      projectId: payment.projectId || null,
      jobId: payment.jobId || null
    }
  ]).catch(() => null);
}

export async function listPaymentsForProject(projectId) {
  const snapshot = await getDocs(
    query(collection(db, "payments"), where("projectId", "==", projectId))
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function listPaymentsForClient(clientId) {
  const snapshot = await getDocs(
    query(collection(db, "payments"), where("clientId", "==", clientId))
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function listPaymentsForFreelancer(freelancerId) {
  const snapshot = await getDocs(
    query(collection(db, "payments"), where("freelancerId", "==", freelancerId))
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function listAllPayments() {
  const snapshot = await getDocs(collection(db, "payments"));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}
