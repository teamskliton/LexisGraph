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
};
