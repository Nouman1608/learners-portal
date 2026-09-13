import apiClient from './client';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  status: 'new' | 'contacted' | 'interested' | 'enrolled' | 'lost';
  source: string;
  potentialJoinDate: string | null;
  nextMessageDate: string | null;
  originalEnrollmentId: string | null;
  tentativeReturnDate: string | null;
  optedOut: boolean;
  optedOutAt: Date | null;
  createdBy: string;
  convertedToStudentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLeadInput {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  status?: 'new' | 'contacted' | 'interested' | 'enrolled' | 'lost';
  source?: string;
  potentialJoinDate?: string; // YYYY-MM-DD
  nextMessageDate?: string; // YYYY-MM-DD
}

export interface UpdateLeadInput {
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  status?: 'new' | 'contacted' | 'interested' | 'enrolled' | 'lost';
  potentialJoinDate?: string; // YYYY-MM-DD
  nextMessageDate?: string; // YYYY-MM-DD
}

export interface LeadFilters {
  status?: string;
  source?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  nextMessageStartDate?: string; // YYYY-MM-DD
  nextMessageEndDate?: string; // YYYY-MM-DD
  search?: string;
}

export const leadsApi = {
  getLeads: async (filters?: LeadFilters): Promise<Lead[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.source) params.append('source', filters.source);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.nextMessageStartDate) params.append('nextMessageStartDate', filters.nextMessageStartDate);
    if (filters?.nextMessageEndDate) params.append('nextMessageEndDate', filters.nextMessageEndDate);
    if (filters?.search) params.append('search', filters.search);

    const response = await apiClient.get<{ leads: Lead[] }>(`/leads?${params.toString()}`);
    return response.data.leads;
  },

  getLeadById: async (id: string): Promise<Lead> => {
    const response = await apiClient.get<{ lead: Lead }>(`/leads/${id}`);
    return response.data.lead;
  },

  createLead: async (data: CreateLeadInput): Promise<Lead> => {
    const response = await apiClient.post<{ lead: Lead }>('/leads', data);
    return response.data.lead;
  },

  updateLead: async (id: string, data: UpdateLeadInput): Promise<Lead> => {
    const response = await apiClient.put<{ lead: Lead }>(`/leads/${id}`, data);
    return response.data.lead;
  },

  updateLeadStatus: async (id: string, status: 'new' | 'contacted' | 'interested' | 'enrolled' | 'lost'): Promise<Lead> => {
    const response = await apiClient.put<{ lead: Lead }>(`/leads/${id}/status`, { status });
    return response.data.lead;
  },

  deleteLead: async (id: string): Promise<void> => {
    await apiClient.delete(`/leads/${id}`);
  },

  optOutLead: async (id: string): Promise<Lead> => {
    const response = await apiClient.post<{ lead: Lead }>(`/leads/${id}/opt-out`);
    return response.data.lead;
  },

  optInLead: async (id: string): Promise<Lead> => {
    const response = await apiClient.post<{ lead: Lead }>(`/leads/${id}/opt-in`);
    return response.data.lead;
  },

  convertLeadToStudent: async (id: string, studentId: string): Promise<Lead> => {
    const response = await apiClient.post<{ lead: Lead }>(`/leads/${id}/convert`, { studentId });
    return response.data.lead;
  },

  getLeadsDueForMessage: async (date?: string): Promise<Lead[]> => {
    const params = new URLSearchParams();
    if (date) params.append('date', date);

    const response = await apiClient.get<{ leads: Lead[] }>(`/leads/due-for-message?${params.toString()}`);
    return response.data.leads;
  },
};

export default leadsApi;
