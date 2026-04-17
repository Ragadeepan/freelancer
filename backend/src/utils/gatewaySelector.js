const INDIA_CODES = new Set(["IN", "IND", "INDIA"]);

export function normalizeCountry(country) {
  return String(country || "")
    .trim()
    .toUpperCase();
}

export function selectGateway(country) {
  const normalizedCountry = normalizeCountry(country);
  if (INDIA_CODES.has(normalizedCountry)) {
    return "razorpay";
  }
  return "stripe";
}
