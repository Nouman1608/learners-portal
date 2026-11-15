import apiClient from './client';
import type { FeeListRow } from '../components/fees/FeeListModal';

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

/**
 * One class's money over a period. Fees are counted by the month they are for, so:
 * revenue = invoiced + not invoiced, and invoiced = paid + not received.
 */
export interface ClassMoney {
  revenuePKR: number; // what comes in when every student has paid
  invoicedPKR: number; // fees whose date has arrived
  notInvoicedPKR: number; // fees dated later, and 1-to-1 classes not counted yet (expected)
  paidPKR: number;
  notReceivedPKR: number; // date arrived, not paid yet
  expectedProfitPKR: number; // revenue - teacher cost
  profitSoFarPKR: number; // paid - teacher cost
}

/** Course Profit tab (sudo): one class in one month */
export interface ClassProfit extends ClassMoney {
  courseId: string;
  title: string;
  teachers: string[];
  oneToOne: boolean;
  students: number;
  teacherPayPKR: number; // the expected salary slip's figure for this class
  estimatedPayPKR: number; // part of it with no slip made yet
  campus?: 'senior' | 'junior';
}

export interface ClassProfitReport {
  month: number;
  year: number;
  classes: ClassProfit[];
  /** Every teacher's pay for the month; unassignedPKR is salary tied to no class */
  teachers: { teacherId: string; name: string; payPKR: number; estimatedPKR: number; slipCount: number; unassignedPKR: number; campus?: 'senior' | 'junior' }[];
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

/** One teacher over the period: their classes' money against everything they are paid */
export interface TeacherProfitability extends ClassMoney {
  teacherId: string | null; // null = classes with no teacher assigned
  teacherName: string;
  classCount: number;
  studentCount: number;
  teacherCostPKR: number;
  estimatedCostPKR: number; // part of the pay with no slip made yet
  slipCount: number; // salary slips in the period
  marginPercent: number;
  campus?: 'senior' | 'junior'; // set when both campuses are shown together
}

export interface CourseProfitability extends ClassMoney {
  courseId: string;
  courseTitle: string;
  teachers: string[];
  oneToOne: boolean;
  studentCount: number;
  teacherCostPKR: number; // the expected salary slips' figure for this class
  estimatedCostPKR: number;
  marginPercent: number; // expected profit as a share of revenue
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
    revenuePKR: number; // when every student has paid
    invoicedPKR: number;
    notInvoicedPKR: number;
    paidPKR: number;
    notReceivedPKR: number;
    teacherCostPKR: number; // every teacher's expected pay in the period
    estimatedCostPKR: number;
    profitPKR: number; // expected profit: revenue - teacher cost
    profitSoFarPKR: number; // paid - teacher cost
    collectedPKR: number; // money that arrived in the period, by payment date (the chart)
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
  /** The fees behind a teacher's Received / Not received figure (teacherId null = classes with no teacher) */
  getProfitabilityFees: async (params: {
    startDate: string; endDate: string; group: 'received' | 'notReceived' | 'notInvoiced'; teacherId: string | null; campus?: 'senior' | 'junior';
  }): Promise<FeeListRow[]> => {
    const response = await apiClient.get('/analytics/profitability/fees', { params: { ...params, teacherId: params.teacherId ?? 'none' } });
    return response.data.fees;
  },

  /** Course and teacher profitability for a period (the Financial tab's month filter) */
  getProfitability: async (params: AnalyticsQueryParams): Promise<Pick<FinancialAnalytics, 'courseProfitability' | 'teacherProfitability'>> => {
    const response = await apiClient.get('/analytics/profitability', { params });
    return response.data;
  },

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
