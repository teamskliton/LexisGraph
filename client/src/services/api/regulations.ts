import { api } from '../api';

export interface GlobalRegulation {
  id: string;
  title: string;
  act_name?: string;
  version?: string;
  act_year?: number;
  jurisdiction?: string;
  issuing_authority?: string;
  document_hash: string;
  original_filename: string;
  file_size: number;
  processing_status: string;
  is_linked?: boolean;
}

export const regulationsApi = {
  listRegulations: async (organizationId?: string, search?: string): Promise<GlobalRegulation[]> => {
    const params: Record<string, string> = {};
    if (organizationId) params.organization_id = organizationId;
    if (search) params.search = search;
    const response = await api.get('/regulations', { params });
    return response.data;
  },

  searchRegulations: async (query: string, organizationId?: string): Promise<GlobalRegulation[]> => {
    const params: Record<string, string> = { q: query };
    if (organizationId) params.organization_id = organizationId;
    const response = await api.get('/regulations/search', { params });
    return response.data;
  },

  linkRegulation: async (organizationId: string, regulationId: string): Promise<any> => {
    const response = await api.post('/regulations/link', {
      organization_id: organizationId,
      regulation_id: regulationId,
    });
    return response.data;
  },

  unlinkRegulation: async (organizationId: string, regulationId: string): Promise<any> => {
    const response = await api.delete('/regulations/unlink', {
      data: {
        organization_id: organizationId,
        regulation_id: regulationId,
      },
    });
    return response.data;
  },
};
