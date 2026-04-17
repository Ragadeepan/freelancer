const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF"
]);

export function normalizeCurrency(currency, fallback = "INR") {
  const raw = String(currency || fallback || "INR").trim();
  return raw ? raw.toUpperCase() : "INR";
}

export function toMinorUnits(amount, currency = "INR") {
  const normalizedCurrency = normalizeCurrency(currency);
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency)) {
    return Math.round(value);
  }
  return Math.round(value * 100);
}

export function fromMinorUnits(amount, currency = "INR") {
  const normalizedCurrency = normalizeCurrency(currency);
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency)) {
    return value;
  }
  return value / 100;
}
