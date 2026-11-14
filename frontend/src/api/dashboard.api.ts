import apiClient from './client';

/**
 * Dashboard Stats TypeScript Interfaces
 */

export interface CurrencyAmount {
  currency: string;
  amount: string;
}

export interface DashboardStats {
  totalUsers?: number;
  totalCourses?: number;
  activeStudents?: number;
  totalTeachers?: number;
  activeEnrollments?: number;
  pendingFees?: number;
  totalFeeAmount?: string; // Deprecated - kept for backward compatibility
  totalFeesByCurrency?: CurrencyAmount[]; // New field for multi-currency support
  paidFeesThisMonth?: number;
  paidFeesAmountThisMonth?: CurrencyAmount[];
  upcomingClasses?: number;
  /** Sudo on the Senior Campus: the Junior Campus can be shown too. */
  juniorCampusAvailable?: boolean;
  recentActivity?: {
    recentEnrollments: number;
    recentFees: number;
  };
  student?: {
    myEnrollments: number;
    myPendingFees: number;
    myTotalDue: string; // Deprecated - kept for backward compatibility
    myTotalDueByCurrency?: CurrencyAmount[]; // New field for multi-currency support
    upcomingClasses: number;
    projected1to1Fees?: CurrencyAmount[]; // Projected monthly fees from 1-to-1 enrollments
  };
  teacher?: {
    myCourses: number;
    myStudents: number;
    upcomingClasses: number;
  };
}

export type Campus = 'senior' | 'junior' | 'both';

/** Students and fees in one state (all / paid / pending / overdue) for a month */
export interface FeeGroup {
  students: number;
  fees: number;
  amounts: CurrencyAmount[];
}

export interface ClassFeeOverview {
  courseId: string;
  title: string;
  enrolled: number; // students enrolled in the class now
  paid: number;
  pending: number;
  overdue: number;
}

export interface TeacherFeeOverview extends Omit<ClassFeeOverview, 'courseId' | 'title'> {
  teacherId: string;
  name: string;
  campus?: 'senior' | 'junior';
  classes: ClassFeeOverview[];
}

/** Which number of the fee overview was clicked */
export type FeeOverviewStatus = 'total' | 'enrolled' | 'paid' | 'pending' | 'overdue' | 'nofee';

/** One student in one class, behind a number of the fee overview */
export interface FeeOverviewStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  courseId: string;
  classTitle: string;
  amount: string | null; // null = no fee owed that month
  currency: string | null;
  feeStatus: 'received' | 'pending' | 'overdue' | null;
  dueDate: string | null;
  campus?: 'senior' | 'junior';
}

/** Sudo: one month's fees overall and per teacher's class */
export interface FeeOverview {
  month: number;
  year: number;
  total: FeeGroup;
  paid: FeeGroup;
  pending: FeeGroup;
  overdue: FeeGroup;
  teachers: TeacherFeeOverview[];
}

/**
 * Dashboard API Methods
 */

export const dashboardApi = {
  /**
   * Get dashboard stats (role-based)
   */
  async getStats(campus: Campus = 'senior'): Promise<DashboardStats> {
    const response = await apiClient.get('/dashboard/stats', { params: campus === 'senior' ? {} : { campus } });
    return response.data;
  },

  /** The students behind one number of the fee overview (a teacher's / class's, or one of the four boxes) */
  async getFeeOverviewStudents(params: {
    month: number; year: number; status: FeeOverviewStatus; campus: Campus; teacherId?: string; courseId?: string;
  }): Promise<FeeOverviewStudent[]> {
    const response = await apiClient.get('/dashboard/fee-overview/students', { params });
    return response.data.students;
  },

  /** Admins and sudo. Leave month/year out for the current month. */
  async getFeeOverview(campus: Campus = 'senior', month?: number, year?: number): Promise<FeeOverview> {
    const response = await apiClient.get('/dashboard/fee-overview', {
      params: { ...(campus === 'senior' ? {} : { campus }), ...(month && year ? { month, year } : {}) },
    });
    return response.data;
  },
};

export default dashboardApi;
