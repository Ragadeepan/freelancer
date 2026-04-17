import {
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  linkWithPhoneNumber,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase/firebase.js";
import { logActivity } from "./activityLogsService.js";
import {
  createNotificationsBulk,
  listActiveAdminIds
} from "./notificationsService.js";
import { getClientProfileCompletion } from "../utils/clientProfile.js";
import { getFreelancerProfileCompletion } from "../utils/freelancerOnboarding.js";
import { ACCOUNT_STATUS } from "../utils/accountStatus.js";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const GOOGLE_HOST_MIGRATION_CODES = new Set([
  "auth/unauthorized-domain",
  "auth/operation-not-supported-in-this-environment"
]);

const getSignupProfileCompletion = (role, seedData = {}) => {
  if (role === "client") {
    return getClientProfileCompletion(seedData).percent;
  }
  if (role === "freelancer") {
    return getFreelancerProfileCompletion(seedData).percent;
  }
  return 100;
};

function redirectToLocalhostForGoogleAuth() {
  if (typeof window === "undefined") return false;
  if (window.location.hostname !== "127.0.0.1") return false;
  const next = new URL(window.location.href);
  next.hostname = "localhost";
  window.location.assign(next.toString());
  return true;
}

export function mapAuthError(error, fallbackMessage = "Authentication failed.") {
  const code = error?.code || "";
  const messages = {
    "auth/invalid-email": "Enter a valid email address.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/user-disabled": "This account is disabled. Contact Admin.",
    "auth/email-already-in-use": "This email is already registered. Please login.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/popup-closed-by-user": "Google sign-in was closed before completion.",
    "auth/cancelled-popup-request": "Google sign-in request was cancelled. Please try again.",
    "auth/popup-blocked": "Popup blocked by browser. Allow popups and try again.",
    "auth/operation-not-supported-in-this-environment":
      "Google sign-in is not supported in this browser context. Open this site in a regular browser window.",
    "auth/unauthorized-domain":
      "Google sign-in domain is not authorized. Use localhost for local testing or add this domain in Firebase Auth settings.",
    "auth/account-exists-with-different-credential":
      "This email is already linked with another sign-in method. Try email/password login first.",
    "auth/invalid-api-key": "Invalid Firebase API key. Check .env configuration.",
    "auth/app-not-authorized":
      "Firebase app is not authorized for this auth operation. Verify Firebase project settings.",
    "auth/network-request-failed": "Network issue. Check your connection and retry.",
    "auth/too-many-requests": "Too many attempts. Try again after some time.",
    "auth/internal-error": "Authentication service returned an internal error. Please try again."
  };

  if (messages[code]) {
    return messages[code];
  }

  return fallbackMessage;
}

export async function signupWithEmail({
  name,
  email,
  password,
  role,
  skill,
  experience,
  portfolio,
  freelancerOnboardingSubmitted,
  freelancerProfileCompleted,
  freelancerOnboardingStep,
  clientType,
  workCategory,
  companyName,
  industry,
  companySize,
  companyWebsite
}) {
  const cleanEmail = normalizeEmail(email);
  const cleanName = String(name || "").trim();
  const seedProfile = {
    role,
    name: cleanName,
    email: cleanEmail,
    displayName: cleanName,
    companyName: companyName || "",
    workCategory: workCategory || "",
    experience: experience || "",
    skill: skill || "",
    portfolio: portfolio || ""
  };
  const profileCompletion = getSignupProfileCompletion(role, seedProfile);
  const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  await credential.user.getIdToken(true);
  await sendEmailVerification(credential.user);
  await setDoc(
    doc(db, "users", credential.user.uid),
    {
      id: credential.user.uid,
      name: cleanName,
      email: cleanEmail,
      role,
      status: ACCOUNT_STATUS.INCOMPLETE,
      profileCompletion,
      phone: "",
      rating: 0,
      verified: false,
      completedProjects: 0,
      skill: skill || "",
      experience: experience || "",
      portfolio: portfolio || "",
      freelancerOnboardingSubmitted:
        role === "freelancer" ? Boolean(freelancerOnboardingSubmitted) : null,
      freelancerProfileCompleted:
        role === "freelancer" ? Boolean(freelancerProfileCompleted) : null,
      freelancerOnboardingStep:
        role === "freelancer"
          ? Number.isFinite(Number(freelancerOnboardingStep))
            ? Number(freelancerOnboardingStep)
            : 0
          : null,
      clientType: clientType || "",
      workCategory: workCategory || "",
      companyName: companyName || "",
      industry: industry || "",
      companySize: companySize || "",
      companyWebsite: companyWebsite || "",
      createdAt: serverTimestamp()
    },
    { merge: true }
  );
  await logActivity({
    actor: credential.user.uid,
    action: "user_submitted",
    targetId: credential.user.uid
  });
  const adminIds = await listActiveAdminIds().catch(() => []);
  await createNotificationsBulk(
    adminIds.map((adminId) => ({
      recipientId: adminId,
      type: "user_submitted",
      title: "New user signup",
      message: `${cleanName || cleanEmail} signed up as ${role || "user"}.`,
      actorId: credential.user.uid
    }))
  ).catch(() => null);
  return credential.user;
}

export async function sendPhoneOtp({ phone, recaptchaId, user }) {
  const verifier = new RecaptchaVerifier(auth, recaptchaId, {
    size: "invisible"
  });
  await verifier.render();
  return linkWithPhoneNumber(user, phone, verifier);
}

export async function confirmPhoneOtp({ confirmationResult, code, phone, uid }) {
  const result = await confirmationResult.confirm(code);
  if (uid) {
    await setDoc(
      doc(db, "users", uid),
      { phone, phoneVerified: true },
      { merge: true }
    );
  }
  return result.user;
}

export async function loginWithEmail({ email, password }) {
  const credential = await signInWithEmailAndPassword(
    auth,
    normalizeEmail(email),
    password
  );
  await credential.user.getIdToken(true);
  return credential.user;
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    const credential = await signInWithPopup(auth, provider);
    await credential.user.getIdToken(true);
    return credential.user;
  } catch (error) {
    if (GOOGLE_HOST_MIGRATION_CODES.has(error?.code) && redirectToLocalhostForGoogleAuth()) {
      return null;
    }
    throw error;
  }
}

export async function logout() {
  return signOut(auth);
}
