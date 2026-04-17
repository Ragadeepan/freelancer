const asText = (value) => String(value || "").trim();

export const isLoopbackHost = (host) => {
  const normalized = asText(host).toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
};

const getDefaultApiBaseUrl = () => {
  const configured = asText(import.meta.env.VITE_API_BASE_URL);
  if (configured) {
    if (typeof window === "undefined") {
      return configured.replace(/\/+$/, "");
    }
    try {
      const parsed = new URL(configured, window.location.origin);
      const currentHost = asText(window.location?.hostname).toLowerCase();
      if (isLoopbackHost(parsed.hostname) && !isLoopbackHost(currentHost)) {
        parsed.hostname = currentHost;
      }
      return parsed.toString().replace(/\/+$/, "");
    } catch (_err) {
      return configured.replace(/\/+$/, "");
    }
  }
  if (typeof window === "undefined") return "";

  const host = asText(window.location?.hostname).toLowerCase();
  const port = asText(window.location?.port);
  const protocol = asText(window.location?.protocol) || "http:";
  const origin = asText(window.location?.origin).replace(/\/+$/, "");

  if (isLoopbackHost(host)) return "http://localhost:4000";
  if (port === "5173" || port === "4173" || port === "3000") {
    return `${protocol}//${host}:4000`;
  }
  return origin;
};

const toUrl = (value, fallbackBase) => {
  try {
    return new URL(value, fallbackBase);
  } catch (_err) {
    return null;
  }
};

export const resolveFileUrl = (value, { apiBaseUrl } = {}) => {
  const raw = asText(value);
  if (!raw) return "";
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  if (typeof window === "undefined") return raw;

  const effectiveApiBase = asText(apiBaseUrl) || getDefaultApiBaseUrl();
  const apiUrl = toUrl(effectiveApiBase || window.location.origin, window.location.origin);
  const sourceUrl = toUrl(raw, window.location.origin);
  if (!sourceUrl) return raw;

  if (/^\/[^/]/.test(raw) && apiUrl) {
    return `${apiUrl.origin}${sourceUrl.pathname}${sourceUrl.search}${sourceUrl.hash}`;
  }

  const currentHost = asText(window.location?.hostname).toLowerCase();
  if (isLoopbackHost(sourceUrl.hostname) && !isLoopbackHost(currentHost) && apiUrl) {
    sourceUrl.protocol = apiUrl.protocol;
    sourceUrl.hostname = apiUrl.hostname;
    sourceUrl.port = apiUrl.port;
    return sourceUrl.toString();
  }

  return sourceUrl.toString();
};

export const resolveUserPhotoUrl = (profile) => {
  const candidates = [
    profile?.photoURL,
    profile?.photoUrl,
    profile?.profileImage,
    profile?.profilePhoto,
    profile?.profilePhotoUrl,
    profile?.profilePic,
    profile?.profilePicUrl,
    profile?.avatarUrl,
    profile?.avatar,
    profile?.imageUrl
  ];
  for (const candidate of candidates) {
    const resolved = resolveFileUrl(candidate);
    if (resolved) return resolved;
  }
  return "";
};
