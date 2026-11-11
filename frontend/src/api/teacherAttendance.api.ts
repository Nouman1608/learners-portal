import apiClient from './client';

export type MarkKind = 'absent' | 'late';

export interface TeacherMark {
  id: string;
  teacherId: string;
  teacherName: string;
  date: string; // YYYY-MM-DD
  kind: MarkKind;
  note: string | null;
  createdByName: string | null;
  days?: number; // days of pay deducted for this mark (0 = allowed)
  reason?: string; // e.g. "allowed (1 of 2)", "3rd absence", "Friday absence"
}

export interface TeacherMonthSummary {
  teacherId: string;
  teacherName: string;
  absences: number;
  lates: number;
  days: number; // total days of pay deducted
}

/** Absent/late deduction on one teacher invoice (returned with teacher invoices) */
export interface InvoiceDeduction {
  workingDays: number;
  dayPay: number;
  gross: number;
  absences: number;
  lates: number;
  days: number;
  total: number;
}

export const teacherAttendanceApi = {
  list: async (month: number, year: number, teacherId?: string): Promise<{ marks: TeacherMark[]; summary: TeacherMonthSummary[] }> => {
    const params = new URLSearchParams({ month: String(month), year: String(year) });
    if (teacherId) params.append('teacherId', teacherId);
    const response = await apiClient.get<{ marks: TeacherMark[]; summary: TeacherMonthSummary[] }>(`/teacher-attendance?${params.toString()}`);
    return response.data;
  },

  create: async (data: { teacherId: string; date: string; kind: MarkKind; note?: string }) => {
    const response = await apiClient.post('/teacher-attendance', data);
    return response.data;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/teacher-attendance/${id}`);
  },
};

export default teacherAttendanceApi;
