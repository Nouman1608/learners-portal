import apiClient from './client';

/**
 * Student Portal Interfaces
 */
export interface CourseTimeslot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  classType: string;
  teamsMeetingUrl?: string | null;
}

export interface StudentOverview {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  courses: Array<{
    courseId: string;
    courseTitle: string;
    courseSubject?: string | null;
    teamsLink?: string | null;
    whatsappGroupLink?: string | null;
    status: string;
    enrolledAt: string;
    timeslots: CourseTimeslot[];
  }>;
  academic: {
    totalAssessments: number;
    averageScore: number;
    passedCount: number;
    failedCount: number;
    passRate: number;
  };
  attendance: {
    totalClasses: number;
    presentCount: number;
    lateCount: number;
    absentCount: number;
    attendanceRate: number;
  };
  fees: {
    totalFees: number;
    totalPaid: number;
    totalOutstanding: number;
    pendingCount: number;
  };
}

export interface AcademicResult {
  assessmentId: string;
  assessmentTitle: string;
  assessmentType: string;
  courseTitle: string;
    courseSubject?: string | null;
  maxScore: string;
  score: string;
  scorePercentage: number;
  feedback?: string;
  submittedAt?: string;
  gradedAt?: string;
}

export interface AttendanceRecord {
  id: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  courseTitle: string;
    courseSubject?: string | null;
  status: 'present' | 'absent' | 'late';
  joinedAt?: string;
  leftAt?: string;
  durationMinutes?: number;
}

export interface FeeRecord {
  feeId: string;
  courseTitle: string;
    courseSubject?: string | null;
  month: number;
  year: number;
  amount: string;
  currency: 'PKR' | 'USD' | 'GBP' | 'SAR';
  dueDate: string;
  status: string;
  receivedAt?: string;
  payments: Array<{
    id: string;
    amount: string;
    paymentMethod: string;
    paymentDate: string;
    transactionId?: string;
  }>;
}

/**
 * Student Portal API
 */
export const studentPortalApi = {
  /**
   * Get student overview
   */
  getStudentOverview: async (studentId: string): Promise<StudentOverview> => {
    const response = await apiClient.get<StudentOverview>(
      `/student-portal/${studentId}/overview`
    );
    return response.data;
  },

  /**
   * Get academic performance
   */
  getAcademicPerformance: async (
    studentId: string,
    courseId?: string
  ): Promise<AcademicResult[]> => {
    const response = await apiClient.get<{ results: AcademicResult[] }>(
      `/student-portal/${studentId}/academic`,
      { params: { courseId } }
    );
    return response.data.results;
  },

  /**
   * Get attendance history
   */
  getAttendanceHistory: async (
    studentId: string,
    courseId?: string
  ): Promise<AttendanceRecord[]> => {
    const response = await apiClient.get<{ records: AttendanceRecord[] }>(
      `/student-portal/${studentId}/attendance`,
      { params: { courseId } }
    );
    return response.data.records;
  },

  /**
   * Get fees history
   */
  getFeesHistory: async (studentId: string): Promise<FeeRecord[]> => {
    const response = await apiClient.get<{ fees: FeeRecord[] }>(
      `/student-portal/${studentId}/fees`
    );
    return response.data.fees;
  },
};
