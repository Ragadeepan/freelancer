import Stripe from "stripe";
import { HttpError } from "../utils/httpError.js";
import { normalizeCurrency, toMinorUnits } from "../utils/currency.js";

let stripeClient = null;

function mapMetadata(metadata = {}) {
  const output = {};
  Object.entries(metadata).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    output[String(key)] = String(value);
  });
  return output;
}

function getStripeClient() {
  if (stripeClient) {
    return stripeClient;
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new HttpError(500, "Stripe secret key is not configured.");
  }
  stripeClient = new Stripe(secretKey);
  return stripeClient;
}

export async function createStripePaymentIntent({
  amount,
  currency = "USD",
  metadata = {},
  idempotencyKey
}) {
  const stripe = getStripeClient();
  const normalizedCurrency = normalizeCurrency(currency, "USD").toLowerCase();
  const intentAmount = toMinorUnits(amount, normalizedCurrency);
  if (!intentAmount) {
    throw new HttpError(400, "Payment amount must be greater than zero.");
  }

  return stripe.paymentIntents.create(
    {
      amount: intentAmount,
      currency: normalizedCurrency,
      automatic_payment_methods: { enabled: true },
      metadata: mapMetadata(metadata)
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );
}

export async function retrieveStripePaymentIntent(paymentIntentId) {
  const stripe = getStripeClient();
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

export function verifyStripeWebhookEvent(rawBodyBuffer, signature) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new HttpError(500, "Stripe webhook secret is not configured.");
  }
  if (!signature) {
    throw new HttpError(400, "Missing Stripe signature header.");
  }
  return stripe.webhooks.constructEvent(rawBodyBuffer, signature, webhookSecret);
}

export async function createStripeRefund({
  paymentIntentId,
  amount,
  currency = "USD",
  reason = "requested_by_customer",
  metadata = {}
}) {
  const stripe = getStripeClient();
  const refundAmount = amount ? toMinorUnits(amount, currency) : undefined;
  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    ...(refundAmount ? { amount: refundAmount } : {}),
    reason,
    metadata: mapMetadata(metadata)
  });
}

export async function createStripeTransfer({
  destinationAccountId,
  amount,
  currency = "USD",
  transferGroup,
  metadata = {}
}) {
  const stripe = getStripeClient();
  if (!destinationAccountId) {
    throw new HttpError(400, "Stripe destination account id is required.");
  }
  const transferAmount = toMinorUnits(amount, currency);
  if (!transferAmount) {
    throw new HttpError(400, "Payout amount must be greater than zero.");
  }

  return stripe.transfers.create({
    amount: transferAmount,
    currency: normalizeCurrency(currency, "USD").toLowerCase(),
    destination: destinationAccountId,
    transfer_group: transferGroup || undefined,
    metadata: mapMetadata(metadata)
  });
}
