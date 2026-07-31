/**
 * Document service for interacting with FastAPI document, clause, and knowledge graph endpoints.
 */

import { api } from "./api";
import { Organization } from "./api/organizations";
import { DocumentResponse, DocumentStatusResponse, UploadDocumentParams } from "@/types/document";

export interface ClauseDetailPayload {
  clause_id: string;
  document_id: string;
  clause_number?: string;
  section?: string;
  title?: string;
  text: string;
  page_number?: number;
  metadata?: Record<string, any>;
}

export interface DocumentViewerPayload {
  document_id: string;
  title: string;
  document_type?: string;
  pdf_url?: string;
  page_number?: number;
  highlight_coordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ClauseGraphPayload {
  clause_id: string;
  neighbors?: Array<{
    id: string;
    label?: string;
    text?: string;
    relation_type?: string;
  }>;
  entities?: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  relationships?: Array<{
    from: string;
    to: string;
    type: string;
  }>;
  summary?: string;
}

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
   * Get PDF viewer details, page number, and highlight coordinates.
   */
  async getDocumentViewer(documentId: string): Promise<DocumentViewerPayload> {
    const response = await api.get<DocumentViewerPayload>(`/documents/${documentId}/viewer`);
    return response.data;
  },

  /**
   * Fetch clause content, section, page number, and metadata.
   */
  async getClauseDetail(clauseId: string): Promise<ClauseDetailPayload> {
    const response = await api.get<ClauseDetailPayload>(`/clauses/${clauseId}`);
    return response.data;
  },

  /**
   * Fetch connected Neo4j knowledge graph neighbors for a clause.
   */
  async getClauseGraph(clauseId: string): Promise<ClauseGraphPayload> {
    try {
      const response = await api.get<ClauseGraphPayload>(`/graph/clause/${clauseId}`);
      return response.data;
    } catch (err) {
      console.warn(`getClauseGraph notice for ${clauseId}:`, err);
      return {
        clause_id: clauseId,
        neighbors: [],
        entities: [],
      };
    }
  },

  /**
   * Upload a document to an organization.
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
   */
  async getDocumentStatus(documentId: string): Promise<DocumentStatusResponse> {
    const response = await api.get<DocumentStatusResponse>(
      `/documents/${documentId}/status`
    );
    return response.data;
  },

  /**
   * Retry processing a FAILED document.
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
  if (!FILE_VALIDATION.ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Only PDF files are allowed. Received: ${file.type || "unknown"}`,
    };
  }

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