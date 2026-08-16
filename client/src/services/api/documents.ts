import { api } from "../api";

export interface OrgDocumentItem {
  id: string;
  organization_id: string;
  original_filename: string;
  stored_filename?: string;
  file_size: number;
  mime_type: string;
  document_type: string;
  processing_status?: string;
  created_at: string;
  updated_at: string;
}

export const documentsService = {
  listDocuments: async (
    organizationId: string,
    documentType?: string
  ): Promise<OrgDocumentItem[]> => {
    const response = await api.get<OrgDocumentItem[]>("/documents", {
      params: {
        organization_id: organizationId,
        ...(documentType ? { document_type: documentType } : {}),
      },
    });
    return response.data;
  },

  getDocumentDownloadUrl: (documentId: string): string => {
    return `/api/v1/documents/${documentId}/download`;
  },
};
