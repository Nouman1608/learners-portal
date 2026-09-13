import apiClient from './client';

/**
 * Financial Analytics Interfaces
 */
export interface RevenueDataPoint {
  date: string;
  revenue: number;
  transactionCount: number;
}

export interface PaymentMethodBreakdown {
  method: string;
  count: number;
  amount: number;
}

export interface OutstandingFeesAging {
  range: string;
  count: number;
  amount: number;
}

export interface CourseRevenue {
  courseId: string;
  courseTitle: string;
  revenue: number;
  studentCount: number;
}

export interface FinancialAnalytics {
  revenueOverTime: RevenueDataPoint[];
  paymentMethods: PaymentMethodBreakdown[];
  outstandingFees: OutstandingFeesAging[];
  courseRevenue: CourseRevenue[];
}

/**
 * Performance Analytics Interfaces
 */
export interface AssessmentDistribution {
  scoreRange: string;
  count: number;
  avgScore: number;
}

export interface StudentPerformanceTrend {
  assessmentId: string;
  assessmentTitle: string;
  courseTitle: string;
  scorePercentage: number;
  submittedAt: string;
}

export interface CoursePerformance {
  courseId: string;
  courseTitle: string;
  avgScore: number;
  studentCount: number;
  assessmentCount: number;
}

export interface TopPerformer {
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  avgScore: number;
  assessmentCount: number;
}

export interface PassFailRate {
  courseId?: string;
  courseTitle?: string;
  totalCount: number;
  passedCount: number;
  failedCount: number;
  passRate: number;
}

export interface PerformanceAnalytics {
  assessmentDistributions: AssessmentDistribution[];
  coursePerformanceComparison: CoursePerformance[];
  topPerformers: TopPerformer[];
  passFailRates: PassFailRate[];
  studentPerformanceTrends: StudentPerformanceTrend[] | null;
}

/**
 * Attendance Analytics Interfaces
 */
export interface AttendanceTrend {
  eventDate: string;
  totalStudents: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  attendanceRate: number;
}

export interface AttendanceStatusBreakdown {
  status: string;
  count: number;
  percentage: number;
}

export interface AttendanceAnalytics {
  attendanceTrends: AttendanceTrend[];
  attendanceByStatus: AttendanceStatusBreakdown[];
}

/**
 * Course Analytics Interfaces
 */
export interface CoursePopularity {
  courseId: string;
  courseTitle: string;
  activeEnrollments: number;
  totalEnrollments: number;
  completedEnrollments: number;
}

export interface EnrollmentTrend {
  month: string;
  enrollmentCount: number;
}

export interface CourseAnalytics {
  coursePopularity: CoursePopularity[];
  enrollmentTrends: EnrollmentTrend[];
}

/**
 * Teacher Analytics Interfaces
 */
export interface TeacherWorkload {
  teacherId: string;
  firstName: string;
  lastName: string;
  email: string;
  courseCount: number;
  classCount: number;
  studentCount: number;
}

export interface TeacherAnalytics {
  teacherWorkload: TeacherWorkload[];
}

/**
 * Analytics Query Parameters
 */
export interface AnalyticsQueryParams {
  startDate?: string;
  endDate?: string;
  courseId?: string;
  assessmentId?: string;
  teacherId?: string;
  studentId?: string;
  groupBy?: 'day' | 'week' | 'month';
  limit?: number;
}

/**
 * Analytics API
 */
export const analyticsApi = {
  /**
   * Get financial analytics
   */
  getFinancialAnalytics: async (params?: AnalyticsQueryParams): Promise<FinancialAnalytics> => {
    const response = await apiClient.get<FinancialAnalytics>('/analytics/financial', {
      params,
    });
    return response.data;
  },

  /**
   * Get performance analytics
   */
  getPerformanceAnalytics: async (params?: AnalyticsQueryParams): Promise<PerformanceAnalytics> => {
    const response = await apiClient.get<PerformanceAnalytics>('/analytics/performance', {
      params,
    });
    return response.data;
  },

  /**
   * Get attendance analytics
   */
  getAttendanceAnalytics: async (params?: AnalyticsQueryParams): Promise<AttendanceAnalytics> => {
    const response = await apiClient.get<AttendanceAnalytics>('/analytics/attendance', {
      params,
    });
    return response.data;
  },

  /**
   * Get course analytics
   */
  getCourseAnalytics: async (params?: AnalyticsQueryParams): Promise<CourseAnalytics> => {
    const response = await apiClient.get<CourseAnalytics>('/analytics/courses', {
      params,
    });
    return response.data;
  },

  /**
   * Get teacher analytics
   */
  getTeacherAnalytics: async (params?: AnalyticsQueryParams): Promise<TeacherAnalytics> => {
    const response = await apiClient.get<TeacherAnalytics>('/analytics/teachers', {
      params,
    });
    return response.data;
  },
};
