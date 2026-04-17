import { resolveFileUrl, resolveUserPhotoUrl } from "./fileUrl.js";

const getValue = (data, key, fallbackKey) => {
  if (!data) return "";
  if (data[key] != null && String(data[key]).trim() !== "") return data[key];
  if (fallbackKey && data[fallbackKey] != null) return data[fallbackKey];
  return "";
};
const asText = (value) => String(value || "").trim();

const isMeaningfulValue = (value) => {
  const text = asText(value).toLowerCase();
  if (!text) return false;
  const compact = text.replace(/[^a-z0-9]/g, "");
  if (
    text === "n/a" ||
    text === "na" ||
    text === "none" ||
    text === "not provided" ||
    text === "n/a for individual" ||
    compact === "naforindividual" ||
    compact === "notprovided" ||
    compact === "none"
  ) {
    return false;
  }
  if (compact === "-" || compact === "--") return false;
  return true;
};

export const CLIENT_REQUIRED_FIELD_LABELS = {
  fullName: "Full Name",
  phone: "Phone",
  workCategory: "Work Category",
  companyName: "Company Name",
  location: "Location",
  profileImage: "Profile Image",
  about: "About",
  paymentMethod: "Payment Method"
};

const getClientGovIdUrl = (data) => {
  if (
    data?.clientGovIdProof &&
    typeof data.clientGovIdProof.url === "string" &&
    data.clientGovIdProof.url.trim() !== ""
  ) {
    return resolveFileUrl(data.clientGovIdProof.url);
  }
  if (
    data?.govIdProof &&
    typeof data.govIdProof.url === "string" &&
    data.govIdProof.url.trim() !== ""
  ) {
    return resolveFileUrl(data.govIdProof.url);
  }
  return resolveFileUrl(
    String(data?.clientGovIdProofUrl || "").trim() ||
    String(data?.govIdProofUrl || "").trim() ||
    ""
  );
};

export const getClientGovIdProof = (data) => {
  const url = getClientGovIdUrl(data);
  if (!url) return null;
  return {
    name:
      String(data?.clientGovIdProof?.name || "").trim() ||
      String(data?.govIdProof?.name || "").trim() ||
      "Client Government ID",
    url
  };
};

export const getClientDocuments = (data) => {
  const rawDocuments = Array.isArray(data?.clientDocuments) ? data.clientDocuments : [];
  return rawDocuments
    .map((entry, index) => {
      const url = resolveFileUrl(asText(entry?.url || entry?.link));
      if (!url) return null;
      return {
        name: asText(entry?.name) || `Document ${index + 1}`,
        url,
        uploadedAt: asText(entry?.uploadedAt)
      };
    })
    .filter(Boolean);
};

const getClientLocation = (data) => {
  const direct = asText(data?.location);
  if (direct) return direct;
  const city = asText(data?.city);
  const country = asText(data?.country);
  if (city && country) return `${city}, ${country}`;
  return city || country || "";
};

export const getNormalizedClientType = (data) => {
  const rawType = asText(data?.clientType).toLowerCase();
  const compactType = rawType.replace(/[^a-z]/g, "");
  if (compactType === "company" || compactType === "business") {
    return "company";
  }
  if (
    compactType === "individual" ||
    compactType === "person" ||
    compactType === "solo"
  ) {
    return "individual";
  }

  const hasCompanyName = isMeaningfulValue(data?.companyName);
  const hasCompanySignals = [
    data?.industry,
    data?.companySize,
    data?.companyWebsite
  ].some((value) => isMeaningfulValue(value));
  const hasWorkCategory = isMeaningfulValue(data?.workCategory);

  if (hasCompanyName) return "company";
  if (hasWorkCategory) return "individual";
  if (hasCompanySignals) return "company";
  return "individual";
};

export const getClientProfileRequiredFields = (data) => {
  const baseRequired = {
    fullName: getValue(data, "displayName", "name"),
    phone: getValue(data, "contactPhone", "phone"),
    location: getClientLocation(data),
    profileImage: resolveUserPhotoUrl(data) || getValue(data, "photoURL", "profileImage"),
    about: getValue(data, "companyMission", "about"),
    paymentMethod: getValue(data, "paymentMethod")
  };
  const clientType = getNormalizedClientType(data);
  if (clientType === "company") {
    return {
      ...baseRequired,
      companyName: getValue(data, "companyName")
    };
  }
  return {
    ...baseRequired,
    workCategory: getValue(data, "workCategory")
  };
};

export const getClientMissingRequiredFields = (data) => {
  const required = getClientProfileRequiredFields(data);
  return Object.entries(required)
    .filter(([, value]) => asText(value) === "")
    .map(([key]) => key);
};

export const isClientProfileComplete = (data) => {
  return getClientMissingRequiredFields(data).length === 0;
};

export const getClientProfileCompletion = (data) => {
  const required = getClientProfileRequiredFields(data);
  const missingFields = Object.entries(required)
    .filter(([, value]) => asText(value) === "")
    .map(([key]) => key);
  const total = Object.keys(required).length;
  const completedCount = Math.max(0, total - missingFields.length);
  const percent = total ? Math.round((completedCount / total) * 100) : 0;

  return {
    total,
    completedCount,
    percent,
    missingFields
  };
};
