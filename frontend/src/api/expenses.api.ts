import apiClient from './client';

export const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'Rent' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'salaries', label: 'Salaries' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'transport', label: 'Transport' },
  { value: 'taxes', label: 'Taxes & fees' },
  { value: 'other', label: 'Other' },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['value'];
export type ExpenseCampus = 'senior' | 'junior' | 'both';

export interface Expense {
  id: string;
  expenseDate: string; // YYYY-MM-DD
  category: ExpenseCategory;
  description: string | null;
  paidTo: string | null;
  amount: string;
  currency: string;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: string;
  createdByName: string | null;
  campus: 'senior' | 'junior';
}

export interface ExpenseInput {
  expenseDate: string;
  category: ExpenseCategory;
  description?: string;
  paidTo?: string;
  amount: string;
  currency?: string;
  paymentMethod?: string;
  notes?: string;
}

export interface MonthSummary {
  month: number;
  incomePKR: number;
  teacherPayPKR: number;
  expensesPKR: number;
  byCategory: Record<string, number>;
  netPKR: number;
}

export const expensesApi = {
  list: async (startDate: string, endDate: string, campus?: ExpenseCampus, category?: string): Promise<Expense[]> => {
    const params = new URLSearchParams({ startDate, endDate });
    if (campus && campus !== 'senior') params.append('campus', campus);
    if (category) params.append('category', category);
    const response = await apiClient.get<{ expenses: Expense[] }>(`/expenses?${params.toString()}`);
    return response.data.expenses;
  },

  summary: async (year: number, campus?: ExpenseCampus): Promise<MonthSummary[]> => {
    const params = new URLSearchParams({ year: String(year) });
    if (campus && campus !== 'senior') params.append('campus', campus);
    const response = await apiClient.get<{ months: MonthSummary[] }>(`/expenses/summary?${params.toString()}`);
    return response.data.months;
  },

  create: async (data: ExpenseInput): Promise<Expense> => {
    const response = await apiClient.post<{ expense: Expense }>('/expenses', data);
    return response.data.expense;
  },

  update: async (id: string, data: Partial<ExpenseInput>): Promise<Expense> => {
    const response = await apiClient.put<{ expense: Expense }>(`/expenses/${id}`, data);
    return response.data.expense;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/expenses/${id}`);
  },
};
