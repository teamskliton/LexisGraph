/**
 * Document service for interacting with the FastAPI document endpoints.
 */

import { api } from "./api";
import { Organization } from "./api/organizations";
import { DocumentResponse, DocumentStatusResponse, UploadDocumentParams } from "@/types/document";

export const documentService = {
  /**
   * Fetch all organizations for the current user.
   */
  async getOrganizations(): Promise<Organization[]> {
    const response = await api.get<Organization[]>("/organizations/");
    return response.data;
  },

  /**
   * Fetch all documents for a specific organization.
   */
  async getDocuments(organizationId: string): Promise<DocumentResponse[]> {
    const response = await api.get<DocumentResponse[]>("/documents/", {
      params: { organization_id: organizationId },
    });
    return response.data;
  },

  /**
   * Fetch a single document by ID.
   */
  async getDocument(documentId: string): Promise<DocumentResponse> {
    const response = await api.get<DocumentResponse>(`/documents/${documentId}`);
    return response.data;
  },

  /**
   * Upload a document to an organization.
   * Uses multipart/form-data and tracks upload progress.
   */
  async uploadDocument(
    params: UploadDocumentParams
  ): Promise<DocumentResponse> {
    const formData = new FormData();
    formData.append("organization_id", params.organizationId);
    formData.append("document_type", params.documentType);
    formData.append("file", params.file);

    const response = await api.post<DocumentResponse>(
      "/documents/upload",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && params.onUploadProgress) {
            const progress = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            params.onUploadProgress(progress);
          }
        },
      }
    );

    return response.data;
  },

  /**
   * Delete a document by ID.
   */
  async deleteDocument(documentId: string): Promise<void> {
    await api.delete(`/documents/${documentId}`);
  },

  /**
   * Get the processing status of a document.
   * Returns progress (0-100), current step label, and error info.
   */
  async getDocumentStatus(documentId: string): Promise<DocumentStatusResponse> {
    const response = await api.get<DocumentStatusResponse>(
      `/documents/${documentId}/status`
    );
    return response.data;
  },

  /**
   * Retry processing a FAILED document.
   * Only the document owner can call this.
   * Returns 409 if the document is not in FAILED state.
   */
  async retryDocument(documentId: string): Promise<DocumentStatusResponse> {
    const response = await api.post<DocumentStatusResponse>(
      `/documents/${documentId}/retry`
    );
    return response.data;
  },
};

/**
 * File validation constants.
 */
export const FILE_VALIDATION = {
  MAX_SIZE_BYTES: 50 * 1024 * 1024, // 50 MB
  ALLOWED_MIME_TYPES: ["application/pdf"],
  ALLOWED_EXTENSIONS: [".pdf"],
};

/**
 * Validate a file for upload.
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (!FILE_VALIDATION.ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Only PDF files are allowed. Received: ${file.type || "unknown"}`,
    };
  }

  // Check file size
  if (file.size > FILE_VALIDATION.MAX_SIZE_BYTES) {
    const maxSizeMB = FILE_VALIDATION.MAX_SIZE_BYTES / (1024 * 1024);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File too large. Maximum size is ${maxSizeMB} MB. Received: ${fileSizeMB} MB`,
    };
  }

  return { valid: true };
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}