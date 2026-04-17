export const TOTAL_PROJECT_INSTALLMENTS = 3;

const INSTALLMENT_STAGE = {
  1: "advance",
  2: "milestone_2",
  3: "final"
};

const INSTALLMENT_LABEL = {
  1: "Advance",
  2: "Milestone 2",
  3: "Final"
};

const INSTALLMENT_DESCRIPTION = {
  1: "Client funds advance to admin escrow.",
  2: "Second milestone payment held in escrow.",
  3: "Final milestone payment held in escrow."
};

export const toAmount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
};

export const parseAmountFromText = (value) => {
  const cleaned = String(value || "")
    .replace(/[^0-9.]/g, "")
    .trim();
  return toAmount(cleaned);
};

export const normalizeInstallmentNumber = (
  value,
  total = TOTAL_PROJECT_INSTALLMENTS
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(Math.floor(parsed), 1), total);
};

export const getInstallmentStage = (installmentNumber) => {
  return INSTALLMENT_STAGE[
    normalizeInstallmentNumber(installmentNumber, TOTAL_PROJECT_INSTALLMENTS)
  ];
};

export const getInstallmentLabel = (installmentNumber) => {
  return INSTALLMENT_LABEL[
    normalizeInstallmentNumber(installmentNumber, TOTAL_PROJECT_INSTALLMENTS)
  ];
};

export const getInstallmentDescription = (installmentNumber) => {
  return INSTALLMENT_DESCRIPTION[
    normalizeInstallmentNumber(installmentNumber, TOTAL_PROJECT_INSTALLMENTS)
  ];
};

const extractNumbers = (value) => {
  return String(value || "")
    .match(/\d+(\.\d+)?/g)
    ?.map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0) || [];
};

export const inferJobBudgetAmount = (job) => {
  if (!job) return 0;
  const min = toAmount(job.budgetMin);
  const max = toAmount(job.budgetMax);
  if (min && max) return Math.max(max, min);
  if (max) return max;
  if (min) return min;

  const directBudget = toAmount(job.budget);
  if (directBudget) return directBudget;

  const fromText = extractNumbers(job.budget);
  if (fromText.length > 0) return fromText[fromText.length - 1];

  return 0;
};

export const inferAdvanceAmount = (job) => {
  const explicitAdvance = toAmount(job?.escrowAmount);
  if (explicitAdvance) return explicitAdvance;
  const budget = inferJobBudgetAmount(job);
  if (!budget) return 0;
  return budget / TOTAL_PROJECT_INSTALLMENTS;
};

export const suggestInstallmentAmount = (job, installmentNumber) => {
  const step = normalizeInstallmentNumber(installmentNumber);
  const budget = inferJobBudgetAmount(job);
  const advance = inferAdvanceAmount(job);

  if (step === 1) return advance || (budget ? budget / TOTAL_PROJECT_INSTALLMENTS : 0);
  if (!budget) return advance || 0;

  const remaining = Math.max(0, budget - (advance || 0));
  const remainingSlots = Math.max(1, TOTAL_PROJECT_INSTALLMENTS - 1);
  return remaining / remainingSlots;
};

export const getLatestPaymentsByInstallment = (
  payments = [],
  total = TOTAL_PROJECT_INSTALLMENTS
) => {
  const map = new Map();
  payments.forEach((payment) => {
    const installment = normalizeInstallmentNumber(payment.installmentNumber || 1, total);
    const current = map.get(installment);
    if (!current) {
      map.set(installment, payment);
      return;
    }
    const currentTime = current?.createdAt?.toDate
      ? current.createdAt.toDate().getTime()
      : 0;
    const nextTime = payment?.createdAt?.toDate
      ? payment.createdAt.toDate().getTime()
      : 0;
    if (nextTime >= currentTime) {
      map.set(installment, payment);
    }
  });
  return map;
};

export const getNextInstallmentNumber = (
  payments = [],
  total = TOTAL_PROJECT_INSTALLMENTS
) => {
  const latestByInstallment = getLatestPaymentsByInstallment(payments, total);
  for (let index = 1; index <= total; index += 1) {
    const latest = latestByInstallment.get(index);
    if (!latest) return index;
    if (latest.status === "refunded") return index;
  }
  return null;
};

export const getInstallmentFundingState = (
  payments = [],
  total = TOTAL_PROJECT_INSTALLMENTS
) => {
  const latestByInstallment = getLatestPaymentsByInstallment(payments, total);
  for (let index = 1; index <= total; index += 1) {
    const latest = latestByInstallment.get(index);
    const previous = latestByInstallment.get(index - 1);

    if (!latest || latest.status === "refunded") {
      if (index === 1) {
        return {
          nextInstallment: 1,
          blocked: false,
          completed: false,
          reason: ""
        };
      }
      if (previous?.status === "released") {
        return {
          nextInstallment: index,
          blocked: false,
          completed: false,
          reason: ""
        };
      }
      return {
        nextInstallment: null,
        blocked: true,
        completed: false,
        reason: `Installment ${index - 1} must be released by admin before funding installment ${index}.`
      };
    }

    if (latest.status === "escrow") {
      return {
        nextInstallment: null,
        blocked: true,
        completed: false,
        reason: `Installment ${index} is in admin escrow review. Wait for admin release or refund.`
      };
    }

    if (latest.status === "released") {
      continue;
    }

    return {
      nextInstallment: null,
      blocked: true,
      completed: false,
      reason: `Installment ${index} is in ${latest.status} status.`
    };
  }

  return {
    nextInstallment: null,
    blocked: false,
    completed: true,
    reason: `All ${total} installments are completed.`
  };
};

export const buildInstallmentProgress = (
  payments = [],
  total = TOTAL_PROJECT_INSTALLMENTS
) => {
  const latestByInstallment = getLatestPaymentsByInstallment(payments, total);
  const list = [];
  for (let index = 1; index <= total; index += 1) {
    const latest = latestByInstallment.get(index) || null;
    list.push({
      installmentNumber: index,
      label: getInstallmentLabel(index),
      stage: getInstallmentStage(index),
      description: getInstallmentDescription(index),
      latestPayment: latest,
      status: latest?.status || "not_funded",
      amount: toAmount(latest?.amount)
    });
  }
  return list;
};
