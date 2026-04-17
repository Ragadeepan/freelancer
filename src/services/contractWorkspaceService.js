import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/firebase.js";
import {
  CONTRACT_STATUS,
  normalizeContractStatus
} from "../utils/contracts.js";
import {
  getWorkspaceFileTypeLabel,
  isWorkspaceFileAllowed,
  normalizeWorkspaceUploadCategory
} from "../utils/workspaceFiles.js";
import {
  uploadWorkspaceClientFile,
  uploadWorkspaceFreelancerFile,
  uploadWorkspaceRequirementFile
} from "./storageService.js";
import { uploadRequirements } from "./contractsService.js";
import { recordContractActivity } from "./contractActivityService.js";

const asText = (value) => String(value || "").trim();

const getContractStatus = (contract) =>
  normalizeContractStatus(contract?.contractStatus || contract?.status);

async function getContract(contractId) {
  const safeContractId = asText(contractId);
  if (!safeContractId) {
    throw new Error("Contract id is required.");
  }
  const contractRef = doc(db, "contracts", safeContractId);
  const contractSnap = await getDoc(contractRef);
  if (!contractSnap.exists()) {
    throw new Error("Contract not found.");
  }
  return { id: contractSnap.id, ...contractSnap.data() };
}

const toFileMetadata = ({
  contractId,
  file,
  url,
  uploadedBy,
  role,
  category,
  uploaderName = ""
}) => {
  const safeCategory = normalizeWorkspaceUploadCategory(category);
  return {
    contractId,
    uploadedBy,
    role,
    uploaderName: asText(uploaderName) || null,
    fileName: asText(file?.name) || "File",
    fileUrl: asText(url),
    fileType: getWorkspaceFileTypeLabel(file?.name, file?.type),
    mimeType: asText(file?.type).toLowerCase() || null,
    category: safeCategory,
    uploadedAt: serverTimestamp()
  };
};

export async function uploadClientWorkspaceFile({
  contractId,
  clientId,
  file,
  category = "references",
  onProgress = null
}) {
  const validation = isWorkspaceFileAllowed(file);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const safeClientId = asText(clientId);
  const contract = await getContract(contractId);
  if (contract.clientId !== safeClientId) {
    throw new Error("Only the contract client can upload files.");
  }

  const status = getContractStatus(contract);
  const safeCategory = normalizeWorkspaceUploadCategory(category);

  if (status === CONTRACT_STATUS.AWAITING_PAYMENT) {
    throw new Error("Client payment is required before uploading files.");
  }

  const requirementUpload = safeCategory === "requirements";
  if (
    requirementUpload &&
    ![
      CONTRACT_STATUS.AWAITING_REQUIREMENTS,
      CONTRACT_STATUS.REQUIREMENTS_UPLOADED
    ].includes(status)
  ) {
    throw new Error("Requirement upload is not allowed at this contract stage.");
  }

  const url = requirementUpload
    ? await uploadWorkspaceRequirementFile({
      contractId,
      file,
      onProgress
    })
    : await uploadWorkspaceClientFile({
      contractId,
      file,
      onProgress
    });

  if (requirementUpload && status === CONTRACT_STATUS.AWAITING_REQUIREMENTS) {
    await uploadRequirements({
      contractId,
      clientId: safeClientId,
      requirementFile: { name: file.name, url }
    });
  }

  const metadata = toFileMetadata({
    contractId,
    file,
    url,
    uploadedBy: safeClientId,
    role: "client",
    category: safeCategory,
    uploaderName: contract.clientName || "Client"
  });

  const fileRef = await addDoc(collection(db, "contractFiles"), metadata);

  await recordContractActivity({
    contractId,
    actorId: safeClientId,
    actorRole: "client",
    action: "client_file_uploaded",
    message: `${metadata.fileName} uploaded (${metadata.fileType}).`,
    metadata: {
      fileId: fileRef.id,
      category: metadata.category
    }
  }).catch(() => null);

  return { id: fileRef.id, ...metadata, fileUrl: url };
}

export async function uploadFreelancerWorkspaceFile({
  contractId,
  freelancerId,
  file,
  category = "freelancer",
  onProgress = null
}) {
  const validation = isWorkspaceFileAllowed(file);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const safeFreelancerId = asText(freelancerId);
  const contract = await getContract(contractId);
  if (contract.freelancerId !== safeFreelancerId) {
    throw new Error("Only the selected freelancer can upload project files.");
  }

  const status = getContractStatus(contract);
  if (
    [
      CONTRACT_STATUS.AWAITING_PAYMENT,
      CONTRACT_STATUS.AWAITING_REQUIREMENTS
    ].includes(status)
  ) {
    throw new Error("Requirements must be uploaded before freelancer file uploads.");
  }

  const url = await uploadWorkspaceFreelancerFile({
    contractId,
    file,
    onProgress
  });

  const metadata = toFileMetadata({
    contractId,
    file,
    url,
    uploadedBy: safeFreelancerId,
    role: "freelancer",
    category,
    uploaderName: contract.freelancerName || "Freelancer"
  });

  const fileRef = await addDoc(collection(db, "contractFiles"), metadata);

  await recordContractActivity({
    contractId,
    actorId: safeFreelancerId,
    actorRole: "freelancer",
    action: "freelancer_file_uploaded",
    message: `${metadata.fileName} uploaded (${metadata.fileType}).`,
    metadata: {
      fileId: fileRef.id,
      category: metadata.category
    }
  }).catch(() => null);

  return { id: fileRef.id, ...metadata, fileUrl: url };
}
