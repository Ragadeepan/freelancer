import { HttpError } from "../utils/httpError.js";
import { normalizeCurrency } from "../utils/currency.js";
import { createRazorpayPayout } from "./razorpay.service.js";
import { createStripeTransfer } from "./stripe.service.js";

export async function sendPayoutToFreelancer({
  gateway,
  amount,
  currency,
  destinationAccountId,
  referenceId,
  metadata = {}
}) {
  const normalizedGateway = String(gateway || "").toLowerCase();
  const payoutAmount = Number(amount);
  if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
    throw new HttpError(400, "Freelancer payout amount must be greater than zero.");
  }

  if (normalizedGateway === "stripe") {
    const transfer = await createStripeTransfer({
      destinationAccountId,
      amount: payoutAmount,
      currency: normalizeCurrency(currency, "USD"),
      transferGroup: referenceId,
      metadata
    });
    return {
      gateway: "stripe",
      payoutId: transfer.id,
      status: transfer.reversed ? "reversed" : "paid",
      raw: transfer
    };
  }

  if (normalizedGateway === "razorpay") {
    const payout = await createRazorpayPayout({
      destinationAccountId,
      amount: payoutAmount,
      currency: normalizeCurrency(currency, "INR"),
      referenceId,
      notes: metadata
    });
    return {
      gateway: "razorpay",
      payoutId: payout.id,
      status: payout.status || "processing",
      raw: payout
    };
  }

  throw new HttpError(400, "Unsupported payout gateway.");
}
