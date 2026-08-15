import { api } from "../api";

export interface Organization {
  id: string;
  name: string;
  description?: string;
  industry?: string;
  website?: string;
  logo_url?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationCreate {
  name: string;
  description?: string;
  industry?: string;
  website?: string;
  logo_url?: string;
}

export interface OrganizationUpdate {
  name?: string;
  description?: string;
  industry?: string;
  website?: string;
  logo_url?: string;
}

export interface InvitationDetailsResponse {
  token: string;
  organization_id: string;
  organization_name: string;
  role: string;
  email?: string | null;
  is_email_bound: boolean;
  inviter_name: string;
  expires_at: string;
  is_valid: boolean;
}

export interface CreateInvitationResponse {
  message: string;
  token: string;
  expires_at: string;
  invite_link: string;
}

export interface AcceptInvitationResponse {
  message: string;
  organization_id: string;
  organization_name: string;
  role?: string;
}

export const organizationsService = {
  getOrganizations: async (): Promise<Organization[]> => {
    const response = await api.get("/organizations/");
    return response.data;
  },

  getOrganizationById: async (id: string): Promise<Organization> => {
    const response = await api.get(`/organizations/${id}`);
    return response.data;
  },

  createOrganization: async (data: OrganizationCreate): Promise<Organization> => {
    const response = await api.post("/organizations/", data);
    return response.data;
  },

  updateOrganization: async (id: string, data: OrganizationUpdate): Promise<Organization> => {
    const response = await api.put(`/organizations/${id}`, data);
    return response.data;
  },

  deleteOrganization: async (id: string): Promise<void> => {
    await api.delete(`/organizations/${id}`);
  },

  createInvitation: async (
    organizationId: string,
    data: { email?: string; role: string }
  ): Promise<CreateInvitationResponse> => {
    const response = await api.post<CreateInvitationResponse>(
      `/organizations/${organizationId}/invitations`,
      data
    );
    return response.data;
  },

  getInvitationDetails: async (token: string): Promise<InvitationDetailsResponse> => {
    const response = await api.get<InvitationDetailsResponse>(`/organizations/invitations/token/${token}`);
    return response.data;
  },

  acceptInvitation: async (token: string): Promise<AcceptInvitationResponse> => {
    const response = await api.post<AcceptInvitationResponse>("/organizations/invitations/accept", { token });
    return response.data;
  },

  getMembers: async (organizationId: string): Promise<OrganizationMember[]> => {
    const response = await api.get<OrganizationMember[]>(`/organizations/${organizationId}/members`);
    return response.data;
  },
};

export interface OrganizationMember {
  id: string;
  user_id: string;
  username?: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  joined_at: string;
  last_active: string;
}

