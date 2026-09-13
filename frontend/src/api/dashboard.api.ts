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

/**
 * Dashboard API Methods
 */

export const dashboardApi = {
  /**
   * Get dashboard stats (role-based)
   */
  async getStats(): Promise<DashboardStats> {
    const response = await apiClient.get('/dashboard/stats');
    return response.data;
  },
};

export default dashboardApi;
