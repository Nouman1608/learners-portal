import apiClient from './client';

/**
 * Money is reported in the currency the student was billed in, alongside a PKR
 * equivalent so mixed-currency figures can be totalled and compared.
 */
export interface CurrencyAmount {
  currency: string;
  amount: number;
  amountPKR: number;
  count?: number;
}

export interface CurrencyRevenue {
  currency: string;
  revenue: number;
  revenuePKR: number;
  transactionCount?: number;
}

export interface Comparison {
  current: number;
  previous: number;
  changePercent: number | null;
}

/** Class profit (sudo): one class in one month */
export interface ClassProfit {
  courseId: string;
  title: string;
  teachers: string[];
  students: number;
  due: { currency: string; amount: number }[]; // fees for the month, in the billing currency
  received: { currency: string; amount: number }[];
  duePKR: number;
  receivedPKR: number;
  teacherPayPKR: number;
  payEstimated: boolean; // the teacher's salary slip is not made yet
  profitPKR: number; // received - teacher pay
  expectedProfitPKR: number; // due - teacher pay
  campus?: 'senior' | 'junior';
}

export interface ClassProfitReport {
  month: number;
  year: number;
  classes: ClassProfit[];
  /** Salaried staff who teach no class: their pay belongs to no class */
  unassigned: { teacherId: string; name: string; payPKR: number; estimated: boolean; campus?: 'senior' | 'junior' }[];
}

/**
 * Financial Analytics Interfaces
 */
export interface RevenueDataPoint {
  date: string;
  byCurrency: CurrencyRevenue[];
  revenuePKR: number;
  transactionCount: number;
}

export interface PaymentMethodBreakdown {
  method: string;
  byCurrency: CurrencyAmount[];
  amountPKR: number;
  count: number;
}

export interface OutstandingFeesAging {
  range: string;
  byCurrency: CurrencyAmount[];
  amountPKR: number;
  count: number;
}

export interface CourseRevenue {
  courseId: string;
  courseTitle: string;
  byCurrency: CurrencyRevenue[];
  revenuePKR: number;
  studentCount: number;
}

export interface CollectionRateByCurrency {
  currency: string;
  billed: number;
  collected: number;
  outstanding: number;
  billedPKR: number;
  collectedPKR: number;
  collectionRate: number;
  feeCount: number;
  paidCount: number;
}

export interface CollectionRate {
  byCurrency: CollectionRateByCurrency[];
  billedPKR: number;
  collectedPKR: number;
  outstandingPKR: number;
  collectionRate: number;
  feeCount: number;
  paidCount: number;
}

/** One teacher over the period: fees collected from their classes less what they were paid */
export interface TeacherProfitability {
  teacherId: string | null; // null = classes with no teacher assigned
  teacherName: string;
  classCount: number;
  studentCount: number;
  revenuePKR: number;
  teacherCostPKR: number;
  slipCount: number; // salary slips in the period
  profitPKR: number;
  marginPercent: number;
}

export interface CourseProfitability {
  courseId: string;
  courseTitle: string;
  teachers?: string[];
  oneToOne?: boolean; // 1-to-1 class: revenue is the invoice figure, not money collected
  expectedRevenuePKR?: number; // part of revenue that is this month's expected invoice (classes not counted yet)
  expectedCostPKR?: number; // teacher pay expected for those same classes
  billedPKR?: number; // fees billed for the months of the period, paid or not
  profitIfAllPaidPKR?: number; // billed - teacher cost
  revenuePKR: number;
  teacherCostPKR: number;
  profitPKR: number;
  marginPercent: number;
  studentCount: number;
  revenuePerStudentPKR: number;
}

export interface FinancialAnalytics {
  revenueOverTime: RevenueDataPoint[];
  paymentMethods: PaymentMethodBreakdown[];
  outstandingFees: OutstandingFeesAging[];
  courseRevenue: CourseRevenue[];
  collectionRate: CollectionRate;
  courseProfitability: CourseProfitability[];
  teacherProfitability: TeacherProfitability[];
  totals: {
    revenuePKR: number;
    teacherCostPKR: number;
    profitPKR: number;
    transactionCount: number;
  };
  comparison: {
    period: { start: string; end: string };
    previousPeriod: { start: string; end: string };
    revenuePKR: Comparison;
    collectionRate: Comparison;
  };
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
  totalAssessments: number;
  passedCount: number;
  failedCount: number;
  passRate: number;
}

export interface AtRiskStudent {
  studentId: string;
  studentName: string;
  email: string;
  attendanceRate: number | null;
  avgScore: number | null;
  overdueCount: number;
  overduePKR: number;
  riskScore: number;
  reasons: string[];
}

export interface PerformanceAnalytics {
  assessmentDistributions: AssessmentDistribution[];
  coursePerformanceComparison: CoursePerformance[];
  topPerformers: TopPerformer[];
  passFailRates: PassFailRate;
  atRiskStudents: AtRiskStudent[];
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
  droppedEnrollments: number;
}

export interface EnrollmentTrend {
  month: string;
  enrollmentCount: number;
}

export interface RetentionMetrics {
  active: number;
  completed: number;
  dropped: number;
  total: number;
  churnRate: number;
  retentionRate: number;
  dropTrend: { month: string; dropped: number; enrolled: number }[];
  dropByCourse: { courseId: string; courseTitle: string; dropped: number; total: number }[];
}

export interface CourseAnalytics {
  coursePopularity: CoursePopularity[];
  enrollmentTrends: EnrollmentTrend[];
  retention: RetentionMetrics;
}

/**
 * Growth Analytics Interfaces
 */
export interface LeadConversion {
  totalLeads: number;
  totalConverted: number;
  conversionRate: number;
  byStatus: { status: string; count: number }[];
  bySource: { source: string; total: number; converted: number; conversionRate: number }[];
  trend: { month: string; total: number; converted: number }[];
}

export interface GrowthAnalytics {
  leadConversion: LeadConversion;
  retention: RetentionMetrics;
  comparison: {
    previousPeriod: { start: string; end: string };
    totalLeads: Comparison;
    conversionRate: Comparison;
  };
}

/**
 * Teacher Analytics Interfaces
 */
export interface TeacherWorkload {
  teacherId: string;
  teacherName: string;
  email: string;
  courseCount: number;
  totalClasses: number;
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
  /** Sudo on the Senior Campus portal only. Omitted means this portal's own campus. */
  campus?: 'senior' | 'junior' | 'both';
}

/**
 * Analytics API
 */
export const analyticsApi = {
  /** Sudo: fees, teacher pay and profit per class for a month (leave month/year out for this month) */
  getClassProfit: async (campus: 'senior' | 'junior' | 'both' = 'senior', month?: number, year?: number): Promise<ClassProfitReport> => {
    const response = await apiClient.get<ClassProfitReport>('/analytics/class-profit', {
      params: { ...(campus === 'senior' ? {} : { campus }), ...(month && year ? { month, year } : {}) },
    });
    return response.data;
  },

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
   * Get growth analytics (leads and retention)
   */
  getGrowthAnalytics: async (params?: AnalyticsQueryParams): Promise<GrowthAnalytics> => {
    const response = await apiClient.get<GrowthAnalytics>('/analytics/growth', {
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
