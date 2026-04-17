import { useEffect, useState } from "react";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Button from "../../components/Button.jsx";
import { clientNav } from "../../data/nav.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { requestAdminApproval, updateUserProfile } from "../../services/usersService.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import {
  CLIENT_REQUIRED_FIELD_LABELS,
  getClientDocuments,
  getClientGovIdProof,
  getClientProfileCompletion
} from "../../utils/clientProfile.js";
import {
  getStorageUploadErrorMessage,
  uploadClientGovId,
  uploadClientDocument,
  uploadProfilePicture
} from "../../services/storageService.js";
import AvatarUpload from "../../components/AvatarUpload.jsx";
import {
  ACCOUNT_STATUS,
  canRequestAdminApproval,
  normalizeAccountStatus
} from "../../utils/accountStatus.js";

const COUNTRIES = {
  India: ["Chennai", "Bengaluru", "Hyderabad", "Mumbai", "Delhi", "Coimbatore"],
  USA: ["New York", "San Francisco", "Seattle", "Austin", "Chicago"],
  UK: ["London", "Manchester", "Birmingham"],
  Canada: ["Toronto", "Vancouver", "Montreal"],
  Australia: ["Sydney", "Melbourne", "Brisbane"],
  Singapore: ["Singapore"],
  UAE: ["Dubai", "Abu Dhabi"],
  Other: ["Other"]
};

const WORK_CATEGORIES = [
  "Website",
  "App",
  "Design",
  "Marketing",
  "Content",
  "Data & AI",
  "Other"
];

const INDUSTRIES = [
  "Software & IT",
  "Design & Creative",
  "Marketing & Growth",
  "Ecommerce",
  "Finance & Fintech",
  "Education",
  "Healthcare",
  "Real Estate",
  "Media & Entertainment",
  "Consulting",
  "Manufacturing",
  "Nonprofit",
  "Other"
];

const COMPANY_SIZES = ["Solo", "2-10", "11-50", "51-200", "201-500", "500+"];

const GOV_ID_TYPES = [
  "Aadhaar",
  "PAN",
  "Passport",
  "Driving License",
  "Voter ID",
  "Tax Certificate",
  "Business Registration",
  "Other Government ID"
];

const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

const isValidUrl = (value) => /^https?:\/\/\S+$/i.test(String(value || "").trim());
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

const REQUIRED_FIELD_TO_FORM_KEY = {
  fullName: "displayName",
  phone: "contactPhone",
  companyName: "companyName",
  location: "city",
  profileImage: "photoURL",
  about: "companyMission",
  paymentMethod: "paymentMethod"
};

export default function CompanyProfile() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    clientType: "individual",
    displayName: "",
    workCategory: "",
    industry: "",
    companyName: "",
    companySize: "",
    companyWebsite: "",
    companyMission: "",
    country: "India",
    city: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    paymentMethod: "",
    linkedin: "",
    clientGovIdType: "",
    clientGovIdProof: null,
    clientDocuments: [],
    photoURL: ""
  });
  const [loading, setLoading] = useState(false);
  const [uploadingGovId, setUploadingGovId] = useState(false);
  const [govIdUploadProgress, setGovIdUploadProgress] = useState(0);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [documentUploadProgress, setDocumentUploadProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [missingFields, setMissingFields] = useState(new Set());

  const { total, completedCount, percent, missingFields: profileMissingFields } =
    getClientProfileCompletion(form);
  const normalizedStatus = normalizeAccountStatus(profile?.status);
  const isPendingApproval = normalizedStatus === ACCOUNT_STATUS.PENDING_APPROVAL;
  const isApproved = normalizedStatus === ACCOUNT_STATUS.APPROVED;
  const canRequestApproval =
    percent === 100 &&
    canRequestAdminApproval({
      ...(profile || {}),
      role: "client",
      profileCompletion: percent
    });

  const cityOptions = COUNTRIES[form.country] || ["Other"];
  const isMissing = (field) => missingFields.has(field);
  const fieldClass = (field, base) =>
    `${base} ${isMissing(field)
      ? "border-rose-400/60 focus:ring-rose-400/30 focus:border-rose-300"
      : ""
    }`;

  const clearFieldError = (field) => {
    setMissingFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  useEffect(() => {
    if (!profile && !user) return;
    setForm((prev) => ({
      ...prev,
      clientType: profile?.clientType || "individual",
      displayName: profile?.displayName || profile?.name || user?.displayName || "",
      workCategory: profile?.workCategory || "",
      industry: profile?.industry || "",
      companyName: profile?.companyName || "",
      companySize: profile?.companySize || "",
      companyWebsite: profile?.companyWebsite || profile?.website || "",
      companyMission: profile?.companyMission || profile?.mission || "",
      country: profile?.country || "India",
      city: profile?.city || "",
      contactName: profile?.contactName || profile?.name || "",
      contactEmail: profile?.contactEmail || profile?.email || user?.email || "",
      contactPhone: profile?.contactPhone || profile?.phone || "",
      paymentMethod: profile?.paymentMethod || "",
      linkedin: profile?.linkedin || "",
      clientGovIdType: profile?.clientGovIdType || profile?.govIdType || "",
      clientGovIdProof: getClientGovIdProof(profile),
      clientDocuments: getClientDocuments(profile),
      photoURL: profile?.photoURL || profile?.profileImage || ""
    }));
  }, [profile, user]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    clearFieldError(name);
  };


  const handleCountryChange = (event) => {
    const { value } = event.target;
    setForm((prev) => ({ ...prev, country: value, city: "" }));
    setMissingFields((prev) => {
      const next = new Set(prev);
      next.delete("country");
      next.add("city");
      return next;
    });
  };

  const handleClientTypeChange = (event) => {
    const { value } = event.target;
    setForm((prev) => ({
      ...prev,
      clientType: value,
      workCategory: value === "individual" ? prev.workCategory : "",
      companyName: value === "company" ? prev.companyName : "",
      companySize: value === "company" ? prev.companySize : "",
      companyWebsite: value === "company" ? prev.companyWebsite : ""
    }));
    setMissingFields((prev) => {
      const next = new Set(prev);
      next.delete("clientType");
      if (value === "individual") {
        next.delete("companyName");
        next.delete("industry");
        next.delete("companySize");
        next.delete("companyWebsite");
      } else {
        next.delete("workCategory");
      }
      return next;
    });
  };

  const handleGovIdUpload = async (event) => {
    if (!user) {
      const message = "Sign in again before uploading files.";
      setStatus(message);
      toast.error(message);
      event.target.value = "";
      return;
    }
    if (uploadingGovId || uploadingDocument) {
      const message = "Wait for the current upload to finish.";
      setStatus(message);
      toast.error(message);
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) {
      setStatus("");
      return;
    }
    setStatus("");
    const validMime = [
      "application/pdf",
      "image/jpg",
      "image/pjpeg",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
      "image/bmp"
    ];
    const validImageMime = ["image/heic", "image/heif"];
    const ext = file.name.split(".").pop()?.toLowerCase();
    const validExt = [
      "pdf",
      "jpg",
      "jpeg",
      "jfif",
      "png",
      "webp",
      "avif",
      "bmp",
      "heic",
      "heif"
    ];
    if (
      !validMime.includes(file.type) &&
      !validImageMime.includes(file.type) &&
      !validExt.includes(ext)
    ) {
      const message = "Upload PDF, JPG, JFIF, PNG, WEBP, AVIF, BMP, HEIC, or HEIF format.";
      setStatus(message);
      toast.error(message);
      event.target.value = "";
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      const message = "Government ID file must be 20MB or smaller.";
      setStatus(message);
      toast.error(message);
      event.target.value = "";
      return;
    }
    setUploadingGovId(true);
    setGovIdUploadProgress(0);
    setStatus("Uploading Government ID...");
    try {
      const url = await uploadClientGovId({
        uid: user.uid,
        file,
        onProgress: (percent) => setGovIdUploadProgress(percent)
      });
      setForm((prev) => ({
        ...prev,
        clientGovIdProof: { name: file.name, url }
      }));
      clearFieldError("clientGovIdProof");
      setStatus("Government ID uploaded.");
      toast.success("Government ID uploaded.");
    } catch (err) {
      const baseMessage = getStorageUploadErrorMessage(
        err,
        "Failed to upload Government ID."
      );
      const code = String(err?.code || "").trim();
      const message =
        code && !baseMessage.includes(code) ? `${baseMessage} (${code})` : baseMessage;
      setStatus(message);
      toast.error(message);
    } finally {
      setUploadingGovId(false);
      setGovIdUploadProgress(0);
      event.target.value = "";
    }
  };

  const handleRemoveGovId = () => {
    setForm((prev) => ({ ...prev, clientGovIdProof: null }));
    clearFieldError("clientGovIdProof");
  };

  const handleDocumentUpload = async (event) => {
    if (!user) {
      const message = "Sign in again before uploading files.";
      setStatus(message);
      toast.error(message);
      event.target.value = "";
      return;
    }
    if (uploadingGovId || uploadingDocument) {
      const message = "Wait for the current upload to finish.";
      setStatus(message);
      toast.error(message);
      event.target.value = "";
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      setStatus("");
      return;
    }

    setStatus("");
    const validMime = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpg",
      "image/pjpeg",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
      "image/bmp",
      "image/heic",
      "image/heif"
    ];
    const ext = file.name.split(".").pop()?.toLowerCase();
    const validExt = [
      "pdf",
      "doc",
      "docx",
      "jpg",
      "jpeg",
      "jfif",
      "png",
      "webp",
      "avif",
      "bmp",
      "heic",
      "heif"
    ];
    if (!validMime.includes(file.type) && !validExt.includes(ext)) {
      const message =
        "Upload PDF, DOC, DOCX, JPG, JFIF, PNG, WEBP, AVIF, BMP, HEIC, or HEIF format.";
      setStatus(message);
      toast.error(message);
      event.target.value = "";
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      const message = "Document must be 20MB or smaller.";
      setStatus(message);
      toast.error(message);
      event.target.value = "";
      return;
    }

    setUploadingDocument(true);
    setDocumentUploadProgress(0);
    setStatus("Uploading document...");
    try {
      const url = await uploadClientDocument({
        uid: user.uid,
        file,
        onProgress: (percent) => setDocumentUploadProgress(percent)
      });
      setForm((prev) => ({
        ...prev,
        clientDocuments: [
          {
            name: file.name,
            url,
            uploadedAt: new Date().toISOString()
          },
          ...prev.clientDocuments
        ].slice(0, 10)
      }));
      setStatus("Document uploaded.");
      toast.success("Document uploaded.");
    } catch (err) {
      const baseMessage = getStorageUploadErrorMessage(err, "Failed to upload document.");
      const code = String(err?.code || "").trim();
      const message =
        code && !baseMessage.includes(code) ? `${baseMessage} (${code})` : baseMessage;
      setStatus(message);
      toast.error(message);
    } finally {
      setUploadingDocument(false);
      setDocumentUploadProgress(0);
      event.target.value = "";
    }
  };

  const handleRemoveDocument = (targetUrl) => {
    const url = String(targetUrl || "").trim();
    if (!url) return;
    setForm((prev) => ({
      ...prev,
      clientDocuments: prev.clientDocuments.filter((entry) => entry.url !== url)
    }));
  };

  const persistProfile = async ({ showSuccessToast = true } = {}) => {
    if (!user) return;
    if (uploadingGovId || uploadingDocument) {
      const message = "Please wait for file uploads to finish before saving.";
      setStatus(message);
      toast.error(message);
      return false;
    }
    setStatus("");

    const { missingFields: requiredMissing, percent: completionPercent } =
      getClientProfileCompletion(form);
    const invalidFields = requiredMissing.map(
      (key) => REQUIRED_FIELD_TO_FORM_KEY[key] || key
    );
    const errors = [];

    if (form.companyWebsite.trim() && !isValidUrl(form.companyWebsite)) {
      invalidFields.push("companyWebsite");
      errors.push("Company website must be a valid URL (https://...).");
    }
    if (form.contactEmail.trim() && !isValidEmail(form.contactEmail)) {
      invalidFields.push("contactEmail");
      errors.push("Enter a valid contact email.");
    }
    if (form.linkedin.trim() && !isValidUrl(form.linkedin)) {
      invalidFields.push("linkedin");
      errors.push("LinkedIn must be a valid URL (https://...).");
    }

    if (invalidFields.length > 0) {
      setMissingFields(new Set(invalidFields));
      const message = errors[0] || "Please complete all required fields.";
      setStatus(message);
      toast.error(message);
      return false;
    }

    setLoading(true);
    try {
      await updateUserProfile(user.uid, {
        clientType: form.clientType,
        displayName: form.displayName.trim(),
        workCategory:
          form.clientType === "individual" ? form.workCategory.trim() : "",
        industry: form.clientType === "company" ? form.industry.trim() : "",
        companyName: form.clientType === "company" ? form.companyName.trim() : "",
        companySize: form.clientType === "company" ? form.companySize.trim() : "",
        companyWebsite:
          form.clientType === "company" ? form.companyWebsite.trim() : "",
        companyMission: form.companyMission.trim(),
        country: form.country.trim(),
        city: form.city.trim(),
        contactName: form.contactName.trim(),
        contactEmail: form.contactEmail.trim().toLowerCase(),
        contactPhone: form.contactPhone.trim(),
        phone: form.contactPhone.trim(),
        paymentMethod: form.paymentMethod.trim(),
        linkedin: form.linkedin.trim(),
        clientGovIdType: form.clientGovIdType.trim(),
        clientGovIdProof: form.clientGovIdProof
          ? {
            name: form.clientGovIdProof.name,
            url: form.clientGovIdProof.url
          }
          : null,
        clientGovIdProofUrl: form.clientGovIdProof?.url || "",
        photoURL: form.photoURL,
        clientDocuments: (form.clientDocuments || [])
          .filter((entry) => String(entry?.url || "").trim())
          .map((entry, index) => ({
            name: String(entry?.name || "").trim() || `Document ${index + 1}`,
            url: String(entry?.url || "").trim(),
            uploadedAt: String(entry?.uploadedAt || "").trim() || new Date().toISOString()
          })),
        clientProfileCompletion: completionPercent,
        clientProfileComplete: completionPercent === 100
      });
      setMissingFields(new Set());
      setStatus("Client profile updated.");
      if (showSuccessToast) {
        toast.success("Client profile updated.");
      }
      return true;
    } catch (err) {
      setStatus(err.message || "Failed to update profile.");
      toast.error("Failed to update profile.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    await persistProfile({ showSuccessToast: true });
  };

  const handleRequestApproval = async () => {
    if (!user) return;
    const saved = await persistProfile({ showSuccessToast: false });
    if (!saved) return;
    if (percent < 100) {
      const message =
        "⚠️ Complete 100% profile details to request admin approval and post a job.";
      setStatus(message);
      toast.permission(message);
      return;
    }
    setLoading(true);
    try {
      await requestAdminApproval(user.uid);
      const message =
        "⏳ Your profile is under admin review. You can post jobs only after approval.";
      setStatus(message);
      toast.success("Approval request sent to admin.");
    } catch (err) {
      const message = err?.message || "Failed to request admin approval.";
      setStatus(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout
      title="Profile"
      sidebar={{ title: "Client Suite", subtitle: "Client", items: clientNav }}
    >
      <PageHeader
        title="Client profile"
        description="Complete identity and contact details for admin review and job posting."
        primaryAction="Save updates"
        onPrimaryAction={handleSave}
        primaryDisabled={loading || uploadingGovId || uploadingDocument}
      />
      {percent < 100 ? (
        <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          ⚠️ Complete 100% profile details to request admin approval and post a job.
        </div>
      ) : null}
      {canRequestApproval ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>Profile is 100% complete. Request admin approval to unlock posting jobs.</p>
            <Button
              onClick={handleRequestApproval}
              disabled={loading || uploadingGovId || uploadingDocument}
              title="Request admin approval"
            >
              Request Admin Approval
            </Button>
          </div>
        </div>
      ) : null}
      {isPendingApproval ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          ⏳ Your profile is under admin review. You can post jobs only after approval.
        </div>
      ) : null}
      {isApproved ? (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Account approved. Job posting is unlocked.
        </div>
      ) : null}
      <div className="glass-card rounded-2xl p-6">
        <div className="mb-8">
          <AvatarUpload
            currentPhotoURL={form.photoURL}
            onUploadSuccess={async (url) => {
              setForm((prev) => ({ ...prev, photoURL: url }));
              clearFieldError("photoURL");
              clearFieldError("profileImage");
              await updateUserProfile(user.uid, { photoURL: url, profileImage: url });
            }}
            initial={form.displayName?.[0]?.toUpperCase() || profile?.name?.[0]?.toUpperCase() || "C"}
          />
        </div>

        <div className="flex items-center justify-between text-sm text-slate-300">
          <span>Profile completion</span>
          <span className="text-slate-100">{percent}%</span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-white/10">
          <div
            className="h-2 rounded-full bg-emerald-400"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {completedCount} of {total} fields complete
        </p>
      </div>

      <div className="space-y-6">
        <div className="glass-card rounded-2xl p-6">
          <h4 className="text-sm font-semibold text-white">Client basics</h4>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className={fieldClass("clientType", "form-surface px-4 py-3")}>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Client type *
              </p>
              <div className="mt-2 flex gap-4 text-sm text-slate-200">
                {[
                  { value: "individual", label: "Individual" },
                  { value: "company", label: "Company" }
                ].map((type) => (
                  <label key={type.value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="clientType"
                      value={type.value}
                      checked={form.clientType === type.value}
                      onChange={handleClientTypeChange}
                    />
                    {type.label}
                  </label>
                ))}
              </div>
            </div>
            <input
              className={fieldClass("displayName", "form-input")}
              placeholder="Display name *"
              name="displayName"
              value={form.displayName}
              onChange={handleChange}
            />
            {form.clientType === "individual" ? (
              <select
                className={fieldClass("workCategory", "form-select")}
                name="workCategory"
                value={form.workCategory}
                onChange={handleChange}
              >
                <option value="">Work category *</option>
                {WORK_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={fieldClass("companyName", "form-input")}
                placeholder="Company name *"
                name="companyName"
                value={form.companyName}
                onChange={handleChange}
              />
            )}
            {form.clientType === "company" ? (
              <>
                <select
                  className={fieldClass("industry", "form-select")}
                  name="industry"
                  value={form.industry}
                  onChange={handleChange}
                >
                  <option value="">Industry *</option>
                  {INDUSTRIES.map((industry) => (
                    <option key={industry} value={industry}>
                      {industry}
                    </option>
                  ))}
                </select>
                <select
                  className={fieldClass("companySize", "form-select")}
                  name="companySize"
                  value={form.companySize}
                  onChange={handleChange}
                >
                  <option value="">Company size *</option>
                  {COMPANY_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <input
                  className={fieldClass("companyWebsite", "form-input")}
                  placeholder="Company website * (https://...)"
                  name="companyWebsite"
                  value={form.companyWebsite}
                  onChange={handleChange}
                />
              </>
            ) : null}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h4 className="text-sm font-semibold text-white">Brand details</h4>
          <div className="mt-4 grid gap-4">
            <input
              className={fieldClass("linkedin", "form-input")}
              placeholder="LinkedIn URL *"
              name="linkedin"
              value={form.linkedin}
              onChange={handleChange}
            />
            <textarea
              rows="5"
              className={fieldClass("companyMission", "form-textarea")}
              placeholder="Business overview / mission *"
              name="companyMission"
              value={form.companyMission}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h4 className="text-sm font-semibold text-white">Location and contact</h4>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <select
              className={fieldClass("country", "form-select")}
              name="country"
              value={form.country}
              onChange={handleCountryChange}
            >
              {Object.keys(COUNTRIES).map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
            <select
              className={fieldClass("city", "form-select")}
              name="city"
              value={form.city}
              onChange={handleChange}
            >
              <option value="">Select city *</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            <input
              className={fieldClass("contactName", "form-input")}
              placeholder="Primary contact name *"
              name="contactName"
              value={form.contactName}
              onChange={handleChange}
            />
            <input
              className={fieldClass("contactEmail", "form-input")}
              placeholder="Contact email *"
              name="contactEmail"
              value={form.contactEmail}
              onChange={handleChange}
            />
            <input
              className={fieldClass("contactPhone", "form-input")}
              placeholder="Contact phone *"
              name="contactPhone"
              value={form.contactPhone}
              onChange={handleChange}
            />
            <select
              className={fieldClass("paymentMethod", "form-select")}
              name="paymentMethod"
              value={form.paymentMethod}
              onChange={handleChange}
            >
              <option value="">Preferred payment method *</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="upi">UPI</option>
              <option value="card">Debit/Credit card</option>
              <option value="paypal">PayPal</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h4 className="text-sm font-semibold text-white">
            Government ID verification
          </h4>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <select
              className={fieldClass("clientGovIdType", "form-select")}
              name="clientGovIdType"
              value={form.clientGovIdType}
              onChange={handleChange}
            >
              <option value="">Government ID type (optional)</option>
              {GOV_ID_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <div
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
            >
              <span>{uploadingGovId ? "Uploading..." : "Upload ID proof (optional)"}</span>
              <label className="cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10">
                Choose file
                <input
                  type="file"
                  className="sr-only"
                  accept=".pdf,.jpg,.jpeg,.jfif,.png,.webp,.avif,.bmp,.heic,.heif"
                  onChange={handleGovIdUpload}
                  disabled={uploadingGovId || uploadingDocument}
                />
              </label>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Allowed formats: PDF, JPG, JFIF, PNG, WEBP, AVIF, BMP, HEIC, HEIF. Maximum size: 20MB.
          </p>
          {uploadingGovId ? (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-slate-300">
                Uploading Government ID: {govIdUploadProgress}%
              </p>
              <div className="h-2 rounded-full bg-white/10">
                <div
                  className="h-2 rounded-full bg-glow-cyan transition-all"
                  style={{ width: `${govIdUploadProgress}%` }}
                />
              </div>
            </div>
          ) : null}
          {form.clientGovIdProof ? (
            <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              <p>Uploaded: {form.clientGovIdProof.name || "Client Government ID"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={form.clientGovIdProof.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-emerald-300/40 bg-emerald-500/20 px-3 py-1 text-xs"
                >
                  View file
                </a>
                <Button type="button" variant="ghost" onClick={handleRemoveGovId}>
                  Remove
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-6 border-t border-white/10 pt-5">
            <h5 className="text-sm font-semibold text-white">Additional documents</h5>
            <p className="mt-2 text-xs text-slate-400">
              Optional supporting files for faster admin review. Max 10 files.
            </p>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              <span>{uploadingDocument ? "Uploading document..." : "Upload document"}</span>
              <label className="cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10">
                Choose file
                <input
                  type="file"
                  className="sr-only"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.jfif,.png,.webp,.avif,.bmp,.heic,.heif"
                  onChange={handleDocumentUpload}
                  disabled={uploadingDocument || uploadingGovId}
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Allowed formats: PDF, DOC, DOCX, JPG, JFIF, PNG, WEBP, AVIF, BMP, HEIC, HEIF. Maximum size: 20MB.
            </p>
            {uploadingDocument ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-slate-300">
                  Uploading document: {documentUploadProgress}%
                </p>
                <div className="h-2 rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full bg-glow-cyan transition-all"
                    style={{ width: `${documentUploadProgress}%` }}
                  />
                </div>
              </div>
            ) : null}
            {form.clientDocuments.length > 0 ? (
              <div className="mt-4 grid gap-2">
                {form.clientDocuments.map((entry, index) => (
                  <div
                    key={`${entry.url}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200"
                  >
                    <span className="truncate">
                      {entry.name || `Document ${index + 1}`}
                    </span>
                    <div className="flex items-center gap-2">
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-sky-300/30 bg-sky-500/15 px-2 py-1 text-[11px] text-sky-100"
                      >
                        View
                      </a>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => handleRemoveDocument(entry.url)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">No additional documents uploaded.</p>
            )}
          </div>
        </div>
      </div>

      {profileMissingFields.length > 0 ? (
        <p className="mt-4 text-xs text-slate-400">
          Missing required fields:{" "}
          {profileMissingFields
            .map((key) => CLIENT_REQUIRED_FIELD_LABELS[key] || key)
            .join(", ")}
        </p>
      ) : null}
      {status ? <p className="mt-4 text-sm text-slate-300">{status}</p> : null}
      <Button
        className="mt-6"
        onClick={handleSave}
        disabled={loading || uploadingGovId || uploadingDocument}
      >
        {loading ? "Saving..." : "Save updates"}
      </Button>
    </DashboardLayout>
  );
}
