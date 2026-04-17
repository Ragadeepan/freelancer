const resolveApiBaseUrl = () => {
  const configured = String(import.meta.env.VITE_API_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (typeof window === "undefined") return "http://localhost:4000";
  const host = String(window.location.hostname || "").toLowerCase();
  const isLoopback = host === "localhost" || host === "127.0.0.1";
  return isLoopback ? "http://localhost:4000" : "";
};

const API_BASE_URL = resolveApiBaseUrl();

async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    return text ? { message: text } : {};
  }
  return response.json();
}

async function request(path, user, options = {}) {
  if (!user) {
    throw new Error("Authentication required.");
  }
  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(payload?.message || "Request failed.");
  }
  if (!contentType.includes("application/json")) {
    throw new Error(
      "Payments API is unavailable. Configure VITE_API_BASE_URL or deploy the API."
    );
  }
  return payload;
}

export async function fetchAdminPaymentPanel(user) {
  const [summaryResponse, historyResponse, escrowResponse] = await Promise.all([
    request("/api/payments/admin/summary", user),
    request("/api/payments/admin/history?limit=200", user),
    request("/api/payments/admin/escrow?limit=200", user)
  ]);

  return {
    summary: summaryResponse?.summary || {
      totalFundsHeld: 0,
      totalReleased: 0,
      pendingPayments: 0,
      commissionEarned: 0
    },
    history: historyResponse?.history || [],
    escrow: escrowResponse?.escrow || []
  };
}

export async function releaseProjectEscrow(user, projectId, payload = {}) {
  return request(`/api/payments/projects/${projectId}/release`, user, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function refundProjectEscrow(user, projectId, payload = {}) {
  return request(`/api/payments/projects/${projectId}/refund`, user, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function markProjectCompletedByAdmin(user, projectId) {
  return request(`/api/payments/projects/${projectId}/completed`, user, {
    method: "POST"
  });
}
