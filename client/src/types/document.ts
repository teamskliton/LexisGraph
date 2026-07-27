/**
 * Document-related TypeScript types for the LexisGraph client.
 */

export type DocumentType = "REGULATION" | "POLICY";

export type ProcessingStatus = "UPLOADED" | "PROCESSING" | "PROCESSED" | "FAILED";

export interface DocumentResponse {
  id: string;
  organization_id: string;
  uploaded_by: string;
  original_filename: string;
  stored_filename: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  checksum: string;
  document_type: DocumentType;
  processing_status: ProcessingStatus;
  progress: number;
  current_step: string | null;
  processing_started_at: string | null;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** Returned by GET /documents/{id}/status */
export interface DocumentStatusResponse {
  document_id: string;
  status: ProcessingStatus;
  progress: number;
  current_step: string | null;
  error_message: string | null;
  processing_started_at: string | null;
  processed_at: string | null;
}

export interface UploadDocumentParams {
  organizationId: string;
  documentType: DocumentType;
  file: File;
  onUploadProgress?: (progress: number) => void;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}