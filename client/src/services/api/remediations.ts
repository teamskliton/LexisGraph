import { api } from "../api";

export interface RemediationUserItem {
  id: string;
  full_name: string;
  email: string;
}

export interface RemediationEvidenceItem {
  id: string;
  remediation_id: string;
  finding_id: string;
  organization_id: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  description?: string | null;
  uploaded_by: string;
  uploaded_at: string;
  uploader?: RemediationUserItem | null;
}

export interface RemediationDetail {
  id: string;
  finding_id: string;
  organization_id: string;
  title: string;
  description?: string | null;
  assigned_to?: string | null;
  assignee?: RemediationUserItem | null;
  due_date?: string | null;
  is_overdue: boolean;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "READY_FOR_REVIEW" | "VERIFIED" | "APPROVED" | "REJECTED" | "OVERDUE" | string;
  created_by: string;
  creator?: RemediationUserItem | null;
  created_at: string;
  updated_at: string;
  verified_by?: string | null;
  verifier?: RemediationUserItem | null;
  verified_at?: string | null;
  verification_note?: string | null;
  admin_approved_by?: string | null;
  admin_approver?: RemediationUserItem | null;
  admin_approved_at?: string | null;
  admin_note?: string | null;
  evidence: RemediationEvidenceItem[];
}

export interface RemediationCreatePayload {
  title?: string;
  description?: string;
  assigned_to?: string | null;
  due_date?: string | null;
  priority?: string;
}

export interface RemediationUpdatePayload {
  title?: string;
  description?: string;
  assigned_to?: string | null;
  due_date?: string | null;
  priority?: string;
  status?: string;
}

export const remediationsService = {
  getRemediation: async (findingId: string): Promise<RemediationDetail | null> => {
    try {
      const response = await api.get<RemediationDetail | null>(`/findings/${findingId}/remediation`);
      return response.data;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return null;
      }
      throw err;
    }
  },

  createRemediation: async (
    findingId: string,
    data?: RemediationCreatePayload
  ): Promise<RemediationDetail> => {
    const response = await api.post<RemediationDetail>(`/findings/${findingId}/remediation`, data || {});
    return response.data;
  },

  updateRemediation: async (
    findingId: string,
    data: RemediationUpdatePayload
  ): Promise<RemediationDetail> => {
    const response = await api.patch<RemediationDetail>(`/findings/${findingId}/remediation`, data);
    return response.data;
  },

  startRemediation: async (findingId: string): Promise<RemediationDetail> => {
    const response = await api.post<RemediationDetail>(`/findings/${findingId}/remediation/start`);
    return response.data;
  },

  submitForReview: async (findingId: string): Promise<RemediationDetail> => {
    const response = await api.post<RemediationDetail>(`/findings/${findingId}/remediation/submit`);
    return response.data;
  },

  verifyRemediation: async (
    findingId: string,
    verificationNote?: string
  ): Promise<RemediationDetail> => {
    const response = await api.post<RemediationDetail>(`/findings/${findingId}/remediation/verify`, {
      verification_note: verificationNote,
    });
    return response.data;
  },

  rejectRemediation: async (
    findingId: string,
    rejectionReason?: string
  ): Promise<RemediationDetail> => {
    const response = await api.post<RemediationDetail>(`/findings/${findingId}/remediation/reject`, {
      rejection_reason: rejectionReason,
    });
    return response.data;
  },

  approveRemediation: async (
    findingId: string,
    adminNote?: string
  ): Promise<RemediationDetail> => {
    const response = await api.post<RemediationDetail>(`/findings/${findingId}/remediation/approve`, {
      admin_note: adminNote,
    });
    return response.data;
  },

  returnRemediation: async (
    findingId: string,
    returnReason?: string
  ): Promise<RemediationDetail> => {
    const response = await api.post<RemediationDetail>(`/findings/${findingId}/remediation/return`, {
      return_reason: returnReason,
    });
    return response.data;
  },

  uploadEvidence: async (
    findingId: string,
    file: File,
    description?: string
  ): Promise<RemediationEvidenceItem> => {
    const formData = new FormData();
    formData.append("file", file);
    if (description) {
      formData.append("description", description);
    }

    const response = await api.post<RemediationEvidenceItem>(
      `/findings/${findingId}/remediation/evidence`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      }
    );
    return response.data;
  },

  deleteEvidence: async (findingId: string, evidenceId: string): Promise<void> => {
    await api.delete(`/findings/${findingId}/remediation/evidence/${evidenceId}`);
  },

  downloadEvidence: async (findingId: string, evidenceId: string): Promise<Blob> => {
    const response = await api.get(
      `/findings/${findingId}/remediation/evidence/${evidenceId}/download`,
      { responseType: "blob" }
    );
    return response.data;
  },

  getEvidenceDownloadUrl: (findingId: string, evidenceId: string): string => {
    return `/api/v1/findings/${findingId}/remediation/evidence/${evidenceId}/download`;
  },
};
