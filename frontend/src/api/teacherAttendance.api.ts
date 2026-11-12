import apiClient from './client';

/** A teacher's absences / lates totals for one month (Junior portal) */
export interface TeacherMonthRow {
  teacherId: string;
  teacherName: string;
  absences: number; // Tuesday-Thursday
  friMonAbsences: number; // on a Friday or Monday
  lates: number;
  days: number; // days of pay deducted
}

export interface MonthCounts {
  absences: number;
  friMonAbsences: number;
  lates: number;
}

/** Days of pay deducted (same rules as the server): 2 absences and 2 lates free; Fri/Mon absence = 2 days */
export const deductionDays = (c: MonthCounts) =>
  Math.max(0, c.absences - 2) + 2 * c.friMonAbsences + 0.5 * Math.max(0, c.lates - 2);

/** Absent/late deduction on one teacher invoice (returned with teacher invoices) */
export interface InvoiceDeduction {
  workingDays: number;
  dayPay: number;
  gross: number;
  absences: number;
  friMonAbsences: number;
  lates: number;
  days: number;
  total: number;
}

export const teacherAttendanceApi = {
  list: async (month: number, year: number, teacherId?: string): Promise<TeacherMonthRow[]> => {
    const params = new URLSearchParams({ month: String(month), year: String(year) });
    if (teacherId) params.append('teacherId', teacherId);
    const response = await apiClient.get<{ rows: TeacherMonthRow[] }>(`/teacher-attendance?${params.toString()}`);
    return response.data.rows;
  },

  save: async (data: { teacherId: string; month: number; year: number } & MonthCounts) => {
    const response = await apiClient.put('/teacher-attendance', data);
    return response.data;
  },
};

export default teacherAttendanceApi;
