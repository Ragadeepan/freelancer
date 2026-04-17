const RATING_WEIGHT = 0.5;
const COMPLETION_WEIGHT = 0.2;
const BID_WEIGHT = 0.15;
const DELIVERY_WEIGHT = 0.15;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const clean = String(value || "")
    .replace(/[, ]+/g, "")
    .replace(/[^\d.]/g, "");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
};

const toDeliveryDays = (value) => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  const numberMatch = text.match(/\d+(\.\d+)?/);
  if (!numberMatch) return null;
  const base = Number(numberMatch[0]);
  if (!Number.isFinite(base) || base <= 0) return null;
  if (text.includes("week")) return Math.round(base * 7);
  if (text.includes("month")) return Math.round(base * 30);
  if (text.includes("year")) return Math.round(base * 365);
  return Math.round(base);
};

const toRating = (proposal) => {
  const candidates = [proposal?.freelancerRating, proposal?.rating];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return Number(clamp(numeric, 0, 5).toFixed(2));
    }
  }
  return 0;
};

const toCompletedProjects = (proposal) => {
  const candidates = [
    proposal?.freelancerCompletedProjects,
    proposal?.completedProjects
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return Math.round(numeric);
    }
  }
  return 0;
};

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const getRange = (values) => {
  const filtered = values.filter((entry) => Number.isFinite(entry));
  if (filtered.length === 0) return { min: 0, max: 0 };
  return {
    min: Math.min(...filtered),
    max: Math.max(...filtered)
  };
};

const normalizeInverse = (value, range) => {
  if (!Number.isFinite(value)) return 0;
  const spread = range.max - range.min;
  if (spread <= 0) return 1;
  return clamp((range.max - value) / spread, 0, 1);
};

export function calculateProposalScore(proposal, _job, context = {}) {
  const rating = toRating(proposal);
  const completedProjects = toCompletedProjects(proposal);
  const bid = toNumber(proposal.price ?? proposal.bidAmount);
  const deliveryDays = toDeliveryDays(proposal.deliveryDays ?? proposal.deliveryTime);

  const bidRange = context.bidRange || { min: 0, max: 0 };
  const deliveryRange = context.deliveryRange || { min: 0, max: 0 };

  const ratingComponent = (rating / 5) * RATING_WEIGHT;
  const completionComponent = (clamp(completedProjects, 0, 100) / 100) * COMPLETION_WEIGHT;
  const bidComponent = normalizeInverse(bid, bidRange) * BID_WEIGHT;
  const deliveryComponent = normalizeInverse(deliveryDays, deliveryRange) * DELIVERY_WEIGHT;

  const score = Number(
    ((ratingComponent + completionComponent + bidComponent + deliveryComponent) * 100).toFixed(2)
  );

  return {
    score,
    bid: bid ?? null,
    deliveryDays: deliveryDays ?? null,
    rating,
    completedProjects,
    scoreBreakdown: {
      ratingWeight: Number((ratingComponent * 100).toFixed(2)),
      completionWeight: Number((completionComponent * 100).toFixed(2)),
      bidWeight: Number((bidComponent * 100).toFixed(2)),
      deliveryWeight: Number((deliveryComponent * 100).toFixed(2))
    }
  };
}

export function rankProposalsForJob({ proposals, job }) {
  const safeProposals = Array.isArray(proposals) ? proposals : [];
  const bidValues = safeProposals.map((proposal) =>
    toNumber(proposal?.price ?? proposal?.bidAmount)
  );
  const deliveryValues = safeProposals.map((proposal) =>
    toDeliveryDays(proposal?.deliveryDays ?? proposal?.deliveryTime)
  );
  const bidRange = getRange(bidValues);
  const deliveryRange = getRange(deliveryValues);

  const scored = safeProposals.map((proposal) => {
    const computed = calculateProposalScore(proposal, job, {
      bidRange,
      deliveryRange
    });
    return {
      ...proposal,
      score: computed.score,
      rating: computed.rating,
      completedProjects: computed.completedProjects,
      bidAmount:
        toNumber(proposal?.bidAmount) ?? computed.bid ?? proposal?.bidAmount ?? null,
      price: computed.bid ?? proposal?.price ?? null,
      deliveryDays: computed.deliveryDays ?? proposal?.deliveryDays ?? null,
      scoreBreakdown: computed.scoreBreakdown
    };
  });

  scored.sort((left, right) => {
    const rightRating = toRating(right);
    const leftRating = toRating(left);
    if (rightRating !== leftRating) return rightRating - leftRating;

    const rightCompleted = toCompletedProjects(right);
    const leftCompleted = toCompletedProjects(left);
    if (rightCompleted !== leftCompleted) return rightCompleted - leftCompleted;

    const leftBid = toNumber(left.price ?? left.bidAmount) ?? Number.POSITIVE_INFINITY;
    const rightBid = toNumber(right.price ?? right.bidAmount) ?? Number.POSITIVE_INFINITY;
    if (leftBid !== rightBid) return leftBid - rightBid;

    const leftDays = toDeliveryDays(left.deliveryDays ?? left.deliveryTime) ?? Number.POSITIVE_INFINITY;
    const rightDays = toDeliveryDays(right.deliveryDays ?? right.deliveryTime) ?? Number.POSITIVE_INFINITY;
    if (leftDays !== rightDays) return leftDays - rightDays;

    const leftTime = toMillis(left.createdAt);
    const rightTime = toMillis(right.createdAt);
    if (leftTime !== rightTime) return leftTime - rightTime;

    return String(left.id || "").localeCompare(String(right.id || ""));
  });

  return scored.map((proposal, index) => ({
    ...proposal,
    rank: index + 1,
    topRank: index < 3 ? index + 1 : null,
    isTop: index < 3
  }));
}
