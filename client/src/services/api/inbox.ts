import { api } from "../api";

export interface InboxItem {
  id: string;
  organization_id: string;
  recipient_user_id: string;
  entity_type: string;
  entity_id: string;
  action_type: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | string;
  status: "PENDING" | "COMPLETED" | "DISMISSED" | string;
  title: string;
  description: string;
  is_read: boolean;
  due_at?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface InboxCounts {
  action_required_count: number;
  mentions_count: number;
  updates_count: number;
  total_pending_count: number;
}

export interface NotificationPreferences {
  id?: string;
  user_id: string;
  organization_id?: string | null;
  finding_assignments_in_app: boolean;
  finding_assignments_email: boolean;
  review_requests_in_app: boolean;
  review_requests_email: boolean;
  mentions_replies_in_app: boolean;
  mentions_replies_email: boolean;
  deadlines_in_app: boolean;
  deadlines_email: boolean;
  analysis_results_in_app: boolean;
  analysis_results_email: boolean;
  workspace_activity_in_app: boolean;
  workspace_activity_email: boolean;
}

export const inboxService = {
  getInboxItems: async (
    organizationId?: string,
    params?: { tab?: string; limit?: number; offset?: number }
  ): Promise<InboxItem[]> => {
    const response = await api.get<InboxItem[]>("/inbox", {
      params: { organization_id: organizationId, ...params },
    });
    return response.data;
  },

  getInboxCounts: async (organizationId?: string): Promise<InboxCounts> => {
    const response = await api.get<InboxCounts>("/inbox/counts", {
      params: { organization_id: organizationId },
    });
    return response.data;
  },

  completeItem: async (itemId: string): Promise<InboxItem> => {
    const response = await api.patch<InboxItem>(`/inbox/${itemId}/complete`);
    return response.data;
  },

  dismissItem: async (itemId: string): Promise<InboxItem> => {
    const response = await api.patch<InboxItem>(`/inbox/${itemId}/dismiss`);
    return response.data;
  },

  markAsRead: async (itemId: string): Promise<InboxItem> => {
    const response = await api.patch<InboxItem>(`/inbox/${itemId}/read`);
    return response.data;
  },

  getPreferences: async (organizationId?: string): Promise<NotificationPreferences> => {
    const response = await api.get<NotificationPreferences>("/inbox/preferences", {
      params: { organization_id: organizationId },
    });
    return response.data;
  },

  updatePreferences: async (
    organizationId?: string,
    data?: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> => {
    const response = await api.put<NotificationPreferences>("/inbox/preferences", data, {
      params: { organization_id: organizationId },
    });
    return response.data;
  },
};
