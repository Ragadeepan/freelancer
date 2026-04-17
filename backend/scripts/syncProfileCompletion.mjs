import { adminDb } from "../src/config/firebaseAdmin.js";

const USERS_COLLECTION = "users";
const BATCH_LIMIT = 450;

const asText = (value) => String(value || "").trim();
const asLower = (value) => asText(value).toLowerCase();

const toPercent = (completedCount, total) => {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const safeCompleted = Math.max(0, Math.min(total, Number(completedCount) || 0));
  return Math.round((safeCompleted / total) * 100);
};

const isMeaningful = (value) => {
  const text = asLower(value);
  if (!text) return false;
  const compact = text.replace(/[^a-z0-9]/g, "");
  if (
    compact === "na" ||
    compact === "none" ||
    compact === "notprovided" ||
    compact === "naforindividual" ||
    compact === "nil" ||
    compact === "-"
  ) {
    return false;
  }
  return true;
};

const normalizeClientType = (profile = {}) => {
  const rawType = asLower(profile.clientType).replace(/[^a-z]/g, "");
  if (rawType === "company" || rawType === "business") return "company";
  if (rawType === "individual" || rawType === "person" || rawType === "solo") {
    return "individual";
  }

  const hasCompanyName = isMeaningful(profile.companyName);
  const hasCompanySignals = [profile.industry, profile.companySize, profile.companyWebsite].some(
    (entry) => isMeaningful(entry)
  );
  const hasWorkCategory = isMeaningful(profile.workCategory);

  if (hasCompanyName) return "company";
  if (hasCompanySignals) return "company";
  if (hasWorkCategory) return "individual";
  return "individual";
};

const getClientLocation = (profile = {}) => {
  const direct = asText(profile.location);
  if (direct) return direct;
  const city = asText(profile.city);
  const country = asText(profile.country);
  if (city && country) return `${city}, ${country}`;
  return city || country || "";
};

const getPhotoValue = (profile = {}) =>
  asText(
    profile.photoURL ||
      profile.profileImage ||
      profile.photoUrl ||
      profile.profilePhoto ||
      profile.profilePhotoUrl ||
      profile.profilePic ||
      profile.profilePicUrl ||
      profile.avatarUrl ||
      profile.avatar ||
      profile.imageUrl
  );

const getClientCompletion = (profile = {}) => {
  const clientType = normalizeClientType(profile);
  const required = {
    fullName: asText(profile.displayName || profile.name),
    phone: asText(profile.contactPhone || profile.phone),
    location: getClientLocation(profile),
    profileImage: getPhotoValue(profile),
    about: asText(profile.companyMission || profile.about),
    paymentMethod: asText(profile.paymentMethod),
    companyOrWork:
      clientType === "company" ? asText(profile.companyName) : asText(profile.workCategory)
  };

  const total = Object.keys(required).length;
  const completed = Object.values(required).filter((entry) => asText(entry) !== "").length;
  return { percent: toPercent(completed, total), clientType };
};

const normalizePortfolioLinks = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => asText(entry)).filter(Boolean);
  }
  const text = asText(value);
  if (!text) return [];
  return text
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const getFreelancerSkills = (profile = {}) => {
  if (Array.isArray(profile.primarySkills) && profile.primarySkills.length > 0) {
    return profile.primarySkills.map((skill) => asText(skill)).filter(Boolean);
  }
  const fallback = asText(profile.skill);
  return fallback ? [fallback] : [];
};

const hasResume = (profile = {}) => {
  const resumeObjectUrl = asText(profile.resume?.url);
  if (resumeObjectUrl) return true;
  const legacy = asText(profile.resumeUrl || profile.cvUrl || profile.resumeLink);
  return Boolean(legacy);
};

const getFreelancerCompletion = (profile = {}) => {
  const required = {
    fullName: asText(profile.name || profile.displayName || profile.fullName),
    phone: asText(profile.phone || profile.contactPhone || profile.mobile),
    profileImage: getPhotoValue(profile),
    primarySkills: getFreelancerSkills(profile).length >= 3 ? "ok" : "",
    experience: asText(profile.experience),
    portfolioLinks:
      normalizePortfolioLinks(profile.portfolioLinks || profile.portfolioLink || profile.portfolio)
        .length > 0
        ? "ok"
        : "",
    hourlyRate: asText(profile.hourlyRate),
    bio: asText(profile.bio || profile.about),
    resume: hasResume(profile) ? "ok" : ""
  };

  const total = Object.keys(required).length;
  const completed = Object.values(required).filter((entry) => asText(entry) !== "").length;
  return { percent: toPercent(completed, total) };
};

const cleanIndividualCompanyFields = (profile = {}) => {
  const updates = {};
  if (normalizeClientType(profile) !== "individual") {
    return updates;
  }

  const maybeClear = ["companyName", "companySize", "industry", "companyWebsite"];
  maybeClear.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(profile, key)) return;
    if (isMeaningful(profile[key])) return;
    if (asText(profile[key]) === "") return;
    updates[key] = "";
  });

  return updates;
};

async function run() {
  const snap = await adminDb.collection(USERS_COLLECTION).get();
  if (snap.empty) {
    console.log("No users found.");
    return;
  }

  let batch = adminDb.batch();
  let batchSize = 0;
  let updated = 0;

  const commitBatch = async () => {
    if (batchSize === 0) return;
    await batch.commit();
    batch = adminDb.batch();
    batchSize = 0;
  };

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const role = asLower(data.role);
    const photoURL = asText(data.photoURL);
    const profileImage = asText(data.profileImage);
    const updatePayload = {};

    if (photoURL && !profileImage) updatePayload.profileImage = photoURL;
    if (profileImage && !photoURL) updatePayload.photoURL = profileImage;

    if (role === "client") {
      const { percent } = getClientCompletion({ ...data, ...updatePayload });
      updatePayload.profileCompletion = percent;
      updatePayload.clientProfileCompletion = percent;
      updatePayload.clientProfileComplete = percent === 100;
      Object.assign(updatePayload, cleanIndividualCompanyFields({ ...data, ...updatePayload }));
    } else if (role === "freelancer") {
      const { percent } = getFreelancerCompletion({ ...data, ...updatePayload });
      updatePayload.profileCompletion = percent;
      updatePayload.freelancerProfileCompletion = percent;
      updatePayload.freelancerProfileCompleted = percent === 100;
    } else if (data.profileCompletion == null) {
      updatePayload.profileCompletion = 100;
    }

    if (Object.keys(updatePayload).length === 0) continue;

    batch.update(docSnap.ref, updatePayload);
    batchSize += 1;
    updated += 1;

    if (batchSize >= BATCH_LIMIT) {
      await commitBatch();
    }
  }

  await commitBatch();
  console.log(`Synced ${updated} user profile records.`);
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Sync failed:", error?.message || error);
    process.exit(1);
  });

