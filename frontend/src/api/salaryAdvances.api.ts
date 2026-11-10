import apiClient from './client';

export interface SalaryAdvance {
  id: string;
  teacherId: string;
  teacherName: string;
  amount: string; // PKR
  paidOn: string; // YYYY-MM-DD
  month: number; // invoice month it comes off
  year: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'other' | null;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
}

export interface SalaryAdvanceInput {
  teacherId: string;
  amount: string;
  paidOn: string;
  month: number;
  year: number;
  paymentMethod?: string;
  note?: string;
}

/** Advances on one teacher invoice (returned with teacher invoices) */
export interface InvoiceAdvance {
  broughtForward: number;
  advances: { paidOn: string; amount: number; paymentMethod: string | null; note: string | null }[];
  deducted: number;
  balance: number;
  carryForward: number;
}

export const salaryAdvancesApi = {
  list: async (filters: { teacherId?: string; month?: number; year?: number } = {}): Promise<SalaryAdvance[]> => {
    const params = new URLSearchParams();
    if (filters.teacherId) params.append('teacherId', filters.teacherId);
    if (filters.month) params.append('month', String(filters.month));
    if (filters.year) params.append('year', String(filters.year));
    const response = await apiClient.get<{ advances: SalaryAdvance[] }>(`/salary-advances?${params.toString()}`);
    return response.data.advances;
  },

  create: async (data: SalaryAdvanceInput): Promise<SalaryAdvance> => {
    const response = await apiClient.post<{ advance: SalaryAdvance }>('/salary-advances', data);
    return response.data.advance;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/salary-advances/${id}`);
  },
};

export default salaryAdvancesApi;
