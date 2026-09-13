import apiClient from './client';

export interface AttendanceRecord {
  id: string;
  courseEventId: string;
  studentId: string;
  status: 'present' | 'absent' | 'late';
  joinedAt?: string;
  leftAt?: string;
  durationMinutes?: number;
  source: 'teams' | 'manual';
  role?: 'student' | 'teacher';
  syncedAt: string;
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface StudentAttendanceRecord {
  id: string;
  status: 'present' | 'absent' | 'late';
  joinedAt?: string;
  leftAt?: string;
  durationMinutes?: number;
  syncedAt: string;
  event: {
    id: string;
    eventDate: string;
    startTime: string;
    endTime: string;
    courseId: string;
  };
  course: {
    id: string;
    title: string;
    code: string;
  };
}

export interface AttendanceStats {
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  totalClasses: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  averageDuration: number;
  attendanceRate: number;
  onTimeRate: number;
}

export interface AttendanceRate {
  totalClasses: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  attendanceRate: number;
  onTimeRate: number;
}

export interface SyncLog {
  id: string;
  courseEventId: string;
  syncedAt: string;
  status: 'success' | 'failed' | 'no_meeting';
  participantCount?: number;
  errorMessage?: string;
  syncedBy: 'cron' | 'manual';
}

export interface SyncResponse {
  success: boolean;
  message: string;
  participantCount: number;
}

export const attendanceApi = {
  /**
   * Manually trigger attendance sync for an event
   */
  syncEventAttendance: async (eventId: string): Promise<SyncResponse> => {
    const response = await apiClient.post<SyncResponse>(
      `/attendance/events/${eventId}/sync`
    );
    return response.data;
  },

  /**
   * Get attendance for an event
   */
  getEventAttendance: async (eventId: string): Promise<AttendanceRecord[]> => {
    const response = await apiClient.get<AttendanceRecord[]>(
      `/attendance/events/${eventId}`
    );
    return response.data;
  },

  /**
   * Get student attendance history
   */
  getStudentAttendance: async (
    studentId: string,
    filters?: {
      courseId?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<StudentAttendanceRecord[]> => {
    const params = new URLSearchParams();
    if (filters?.courseId) params.append('courseId', filters.courseId);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);

    const response = await apiClient.get<StudentAttendanceRecord[]>(
      `/attendance/students/${studentId}?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Get student attendance rate for a course
   */
  getStudentAttendanceRate: async (
    studentId: string,
    courseId: string
  ): Promise<AttendanceRate> => {
    const response = await apiClient.get<AttendanceRate>(
      `/attendance/students/${studentId}/courses/${courseId}/rate`
    );
    return response.data;
  },

  /**
   * Get course attendance statistics
   */
  getCourseAttendanceStats: async (courseId: string): Promise<AttendanceStats[]> => {
    const response = await apiClient.get<AttendanceStats[]>(
      `/attendance/courses/${courseId}/stats`
    );
    return response.data;
  },

  /**
   * Get attendance sync logs (admin only)
   */
  getSyncLogs: async (limit: number = 50): Promise<SyncLog[]> => {
    const response = await apiClient.get<SyncLog[]>(
      `/attendance/sync-logs?limit=${limit}`
    );
    return response.data;
  },

  /**
   * Mark manual attendance for local students
   */
  markManualAttendance: async (
    eventId: string,
    attendance: Array<{ studentId: string; status: 'present' | 'absent' | 'late' }>
  ): Promise<{ success: boolean; message: string; recordCount: number }> => {
    const response = await apiClient.post(
      `/attendance/events/${eventId}/manual`,
      { attendance }
    );
    return response.data;
  },

  /**
   * Get enrolled students grouped by attendance mode
   */
  getStudentsByMode: async (
    eventId: string
  ): Promise<{
    local: Array<{ id: string; firstName: string; lastName: string; email: string }>;
    online: Array<{ id: string; firstName: string; lastName: string; email: string }>;
  }> => {
    const response = await apiClient.get(
      `/attendance/events/${eventId}/students-by-mode`
    );
    return response.data;
  },
};

export default attendanceApi;
