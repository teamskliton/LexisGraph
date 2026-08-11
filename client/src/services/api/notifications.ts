import { api } from "../api";

export interface NotificationItem {
  id: string;
  user_id: string;
  organization_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  finding_id?: string | null;
  report_id?: string | null;
  created_at: string;
}

export interface UnreadCountResponse {
  unread_count: number;
}

export const notificationsService = {
  getNotifications: async (
    organizationId?: string,
    params?: { unread_only?: boolean; limit?: number; offset?: number }
  ): Promise<NotificationItem[]> => {
    const response = await api.get<NotificationItem[]>("/notifications", {
      params: { organization_id: organizationId, ...params },
    });
    return response.data;
  },

  getUnreadCount: async (organizationId?: string): Promise<number> => {
    const response = await api.get<UnreadCountResponse>("/notifications/unread-count", {
      params: { organization_id: organizationId },
    });
    return response.data.unread_count;
  },

  markAsRead: async (notificationId: string): Promise<NotificationItem> => {
    const response = await api.patch<NotificationItem>(`/notifications/${notificationId}/read`);
    return response.data;
  },

  markAllAsRead: async (organizationId?: string): Promise<void> => {
    await api.patch("/notifications/read-all", null, {
      params: { organization_id: organizationId },
    });
  },
};
