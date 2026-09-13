import apiClient from './client';

export interface Event {
  id: string;
  timeslotId: string;
  courseId: string;
  roomId?: string;
  teacherId?: string;
  eventDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  classType: 'online' | 'local' | 'hybrid' | '1-to-1';
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  recordingUrl?: string;
  notes?: string;
  teamsMeetingId?: string;
  teamsMeetingUrl?: string;
  teamsCreatedBy?: string;
  attendanceSynced?: boolean;
  title?: string;
  course: {
    id: string;
    title: string;
    subject?: string | null;
    courseCategory?: string | null;
  };
  room?: {
    id: string;
    name: string;
    capacity: number;
  };
  teacher?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface CreateEventInput {
  timeslotId: string;
  courseId: string;
  roomId?: string;
  teacherId?: string;
  eventDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  classType?: 'local' | 'online' | 'hybrid' | '1-to-1';
  notes?: string;
  autoCreateTeamsMeeting?: boolean;
  teamsMeetingUrl?: string;
}

export interface UpdateEventInput {
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  roomId?: string;
  teacherId?: string;
  status?: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  notes?: string;
}

export interface ConflictCheckInput {
  eventDate: string;
  startTime: string;
  endTime: string;
  teacherId?: string;
  roomId?: string;
  excludeEventId?: string;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflicts: Array<{
    type: 'teacher' | 'room';
    message: string;
    events: Event[];
  }>;
}

export const calendarApi = {
  // Get events with optional filters
  getEvents: async (filters?: {
    courseId?: string;
    teacherId?: string;
    roomId?: string;
    studentId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Promise<Event[]> => {
    const params = new URLSearchParams();
    if (filters?.courseId) params.append('courseId', filters.courseId);
    if (filters?.teacherId) params.append('teacherId', filters.teacherId);
    if (filters?.roomId) params.append('roomId', filters.roomId);
    if (filters?.studentId) params.append('studentId', filters.studentId);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.status) params.append('status', filters.status);

    const response = await apiClient.get<{ events: Event[] }>(
      `/calendar?${params.toString()}`
    );
    return response.data.events;
  },

  // Get single event by ID
  getEventById: async (id: string): Promise<Event> => {
    const response = await apiClient.get<{ event: Event }>(`/calendar/${id}`);
    return response.data.event;
  },

  // Create a new event
  createEvent: async (data: CreateEventInput): Promise<Event> => {
    const response = await apiClient.post<{ event: Event }>('/calendar', data);
    return response.data.event;
  },

  // Update an event (reschedule)
  updateEvent: async (id: string, data: UpdateEventInput): Promise<Event> => {
    const response = await apiClient.patch<{ event: Event }>(`/calendar/${id}`, data);
    return response.data.event;
  },

  // Cancel an event
  cancelEvent: async (id: string): Promise<Event> => {
    const response = await apiClient.patch<{ event: Event }>(`/calendar/${id}/cancel`);
    return response.data.event;
  },

  // Mark event as completed
  completeEvent: async (id: string): Promise<Event> => {
    const response = await apiClient.patch<{ event: Event }>(`/calendar/${id}/complete`);
    return response.data.event;
  },

  // Check for scheduling conflicts
  checkConflicts: async (data: ConflictCheckInput): Promise<ConflictResult> => {
    const response = await apiClient.post<ConflictResult>('/calendar/check-conflicts', data);
    return response.data;
  },

  // Generate upcoming events (admin only)
  generateUpcomingEvents: async (daysAhead?: number): Promise<{ message: string; count: number }> => {
    const params = new URLSearchParams();
    if (daysAhead) params.append('daysAhead', daysAhead.toString());

    const response = await apiClient.post<{ message: string; count: number }>(
      `/calendar/generate?${params.toString()}`
    );
    return response.data;
  },

  // Delete a single event (sudo only)
  deleteEvent: async (id: string): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(`/calendar/${id}`);
    return response.data;
  },

  // Delete all recurring events (sudo only)
  deleteRecurringEvents: async (id: string): Promise<{ message: string; deletedCount: number }> => {
    const response = await apiClient.delete<{ message: string; deletedCount: number }>(
      `/calendar/${id}/recurring`
    );
    return response.data;
  },
};

export default calendarApi;
