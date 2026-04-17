import crypto from "node:crypto";
import Razorpay from "razorpay";
import { HttpError } from "../utils/httpError.js";
import { normalizeCurrency, toMinorUnits } from "../utils/currency.js";

let razorpayClient = null;

function getRazorpayClient() {
  if (razorpayClient) {
    return razorpayClient;
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new HttpError(500, "Razorpay credentials are not configured.");
  }

  razorpayClient = new Razorpay({
    key_id: keyId,
    key_secret: keySecret
  });
  return razorpayClient;
}

export async function createRazorpayOrder({
  amount,
  currency = "INR",
  receipt,
  notes = {}
}) {
  const client = getRazorpayClient();
  const normalizedCurrency = normalizeCurrency(currency, "INR");
  const orderAmount = toMinorUnits(amount, normalizedCurrency);
  if (!orderAmount) {
    throw new HttpError(400, "Payment amount must be greater than zero.");
  }
  const order = await client.orders.create({
    amount: orderAmount,
    currency: normalizedCurrency,
    receipt: String(receipt || `rcpt_${Date.now()}`).slice(0, 40),
    notes
  });
  return order;
}

export function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    throw new HttpError(500, "Razorpay secret key is missing.");
  }
  const payload = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(payload)
    .digest("hex");
  return expected === signature;
}

export async function fetchRazorpayPayment(paymentId) {
  const client = getRazorpayClient();
  return client.payments.fetch(paymentId);
}

export async function createRazorpayRefund({
  paymentId,
  amount,
  currency = "INR",
  notes = {}
}) {
  const client = getRazorpayClient();
  const refundAmount = amount ? toMinorUnits(amount, currency) : undefined;
  return client.payments.refund(paymentId, {
    ...(refundAmount ? { amount: refundAmount } : {}),
    notes
  });
}

export async function createRazorpayPayout({
  destinationAccountId,
  amount,
  currency = "INR",
  referenceId,
  narration,
  notes = {}
}) {
  const client = getRazorpayClient();
  const accountNumber = process.env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER;
  if (!accountNumber) {
    throw new HttpError(500, "Razorpay payout account number is not configured.");
  }
  if (!destinationAccountId) {
    throw new HttpError(400, "Razorpay fund account id is required for payout.");
  }
  if (!client.payouts?.create) {
    throw new HttpError(500, "Razorpay payouts API is unavailable on this account.");
  }

  const payoutAmount = toMinorUnits(amount, currency);
  if (!payoutAmount) {
    throw new HttpError(400, "Payout amount must be greater than zero.");
  }

  return client.payouts.create({
    account_number: accountNumber,
    fund_account_id: destinationAccountId,
    amount: payoutAmount,
    currency: normalizeCurrency(currency, "INR"),
    mode: "IMPS",
    purpose: "payout",
    queue_if_low_balance: true,
    reference_id: String(referenceId || `payout_${Date.now()}`).slice(0, 40),
    narration: String(narration || "Freelancer payout").slice(0, 30),
    notes
  });
}
