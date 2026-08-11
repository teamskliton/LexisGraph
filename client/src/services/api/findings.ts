import { api } from "../api";

export interface FindingAssignee {
  id: string;
  full_name: string;
  email: string;
}

export interface FindingComment {
  id: string;
  finding_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface FindingActivity {
  id: string;
  finding_id: string;
  user_name: string;
  event_type: string;
  title: string;
  description: string;
  created_at: string;
}

export interface FindingDetail {
  id: string;
  report_id: string;
  policy_clause_id?: string | null;
  regulation_clause_id?: string | null;
  status: string;
  lifecycle_status: string;
  confidence?: number;
  severity: string;
  reasoning?: string | null;
  recommendation?: string | null;
  citation?: string | null;
  matched_policy_text?: string | null;
  graph_path?: Record<string, unknown> | Array<unknown> | null;
  assigned_to?: string | null;
  assignee?: FindingAssignee | null;
  resolution_note?: string | null;
  reopen_reason?: string | null;
  remediation_due_date?: string | null;
  is_overdue?: boolean;
  comments_count?: number;
  created_at: string;
  updated_at: string;
}

export const findingsService = {
  getMyWork: async (
    organizationId?: string,
    params?: { lifecycle_status?: string; severity?: string; overdue_only?: boolean }
  ): Promise<FindingDetail[]> => {
    const response = await api.get<FindingDetail[]>("/findings/my-work", {
      params: { organization_id: organizationId, ...params },
    });
    return response.data;
  },

  updateRemediationDueDate: async (findingId: string, dueDate: string | null): Promise<FindingDetail> => {
    const response = await api.patch<FindingDetail>(`/findings/${findingId}/remediation`, {
      due_date: dueDate,
    });
    return response.data;
  },

  getFinding: async (findingId: string): Promise<FindingDetail> => {
    const response = await api.get<FindingDetail>(`/findings/${findingId}`);
    return response.data;
  },

  updateStatus: async (findingId: string, lifecycleStatus: string): Promise<FindingDetail> => {
    const response = await api.patch<FindingDetail>(`/findings/${findingId}/status`, {
      lifecycle_status: lifecycleStatus,
    });
    return response.data;
  },

  assignFinding: async (findingId: string, assigneeId: string | null): Promise<FindingDetail> => {
    const response = await api.post<FindingDetail>(`/findings/${findingId}/assign`, {
      assignee_id: assigneeId,
    });
    return response.data;
  },

  resolveFinding: async (findingId: string, resolutionNote?: string): Promise<FindingDetail> => {
    const response = await api.post<FindingDetail>(`/findings/${findingId}/resolve`, {
      resolution_note: resolutionNote,
    });
    return response.data;
  },

  reopenFinding: async (findingId: string, reopenReason?: string): Promise<FindingDetail> => {
    const response = await api.post<FindingDetail>(`/findings/${findingId}/reopen`, {
      reopen_reason: reopenReason,
    });
    return response.data;
  },

  getComments: async (findingId: string): Promise<FindingComment[]> => {
    const response = await api.get<FindingComment[]>(`/findings/${findingId}/comments`);
    return response.data;
  },

  addComment: async (findingId: string, content: string): Promise<FindingComment> => {
    const response = await api.post<FindingComment>(`/findings/${findingId}/comments`, { content });
    return response.data;
  },

  deleteComment: async (findingId: string, commentId: string): Promise<void> => {
    await api.delete(`/findings/${findingId}/comments/${commentId}`);
  },

  getActivity: async (findingId: string): Promise<FindingActivity[]> => {
    const response = await api.get<FindingActivity[]>(`/findings/${findingId}/activity`);
    return response.data;
  },
};
