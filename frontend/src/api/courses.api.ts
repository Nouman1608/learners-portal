import apiClient from './client';

export interface Course {
  id: string;
  title: string;
  description?: string;
  duration: number;
  courseCategory?: 'senior' | 'junior';
  courseLevel?: 'ig' | 'alevel';
  subject?: string;
  teacherName?: string;
  studentName?: string;
  whatsappGroupLink?: string;
  isActive: boolean;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
  teachers?: CourseTeacher[];
  teacherCount?: number;
  studentCount?: number;
  timeslots?: Timeslot[];
  teamsLink?: string;
}

export interface CourseTeacher {
  id: string;
  teacherId: string;
  percentageCut: string;
  assignedAt: string;
  teacher: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface Timeslot {
  id: string;
  roomId?: string;
  teacherId?: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  recurrenceType: 'weekly' | 'biweekly' | 'monthly';
  startDate: string;
  endDate?: string;
  classType: 'online' | 'local' | 'hybrid' | '1-to-1';
  isActive: boolean;
  teamsMeetingId?: string;
  teamsMeetingUrl?: string;
  room?: {
    id: string;
    name: string;
    capacity: number;
  };
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  isActive: boolean;
  createdAt: string;
}

export interface CreateCourseInput {
  courseCategory: 'senior' | 'junior';
  courseLevel?: 'ig' | 'alevel';
  subject?: string;
  teacherName: string;
  studentName?: string;
  description?: string;
  duration: number;
  whatsappGroupLink?: string;
}

export interface UpdateCourseInput {
  courseCategory?: 'senior' | 'junior';
  courseLevel?: 'ig' | 'alevel' | ''; // '' clears
  subject?: string; // '' clears
  teacherName?: string;
  studentName?: string; // '' clears
  description?: string; // '' clears
  duration?: number;
  whatsappGroupLink?: string; // '' clears
  isActive?: boolean;
}

export interface AssignTeacherInput {
  teacherId: string;
  percentageCut: string;
}

export interface CreateTimeslotInput {
  classType: 'online' | 'local' | 'hybrid' | '1-to-1';
  teacherId?: string;
  roomId?: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  recurrenceType: 'weekly' | 'biweekly' | 'monthly';
  startDate: string;
  endDate?: string;
}

export interface CreateRoomInput {
  name: string;
  capacity: number;
}

export interface UpdateRoomInput {
  name?: string;
  capacity?: number;
  isActive?: boolean;
}

export const coursesApi = {
  // Courses
  getCourses: async (options: boolean | { isActive?: boolean } = false): Promise<Course[]> => {
    const activeOnly = typeof options === 'boolean' ? options : options.isActive === true;
    const params = activeOnly ? '?activeOnly=true' : '';
    const response = await apiClient.get<{ courses: Course[] }>(`/courses${params}`);
    return response.data.courses;
  },

  getCourseById: async (id: string): Promise<Course> => {
    const response = await apiClient.get<{ course: Course }>(`/courses/${id}`);
    return response.data.course;
  },

  createCourse: async (data: CreateCourseInput): Promise<Course> => {
    const response = await apiClient.post<{ course: Course }>('/courses', data);
    return response.data.course;
  },

  updateCourse: async (id: string, data: UpdateCourseInput): Promise<Course> => {
    const response = await apiClient.patch<{ course: Course }>(`/courses/${id}`, data);
    return response.data.course;
  },

  deleteCourse: async (id: string): Promise<void> => {
    await apiClient.delete(`/courses/${id}`);
  },

  hardDeleteCourse: async (id: string): Promise<{ message: string; deletedEnrollments: number }> => {
    const response = await apiClient.delete(`/courses/${id}/hard`);
    return response.data;
  },

  toggleCourseStatus: async (id: string, isActive: boolean): Promise<Course> => {
    const response = await apiClient.patch<{ course: Course }>(`/courses/${id}`, { isActive });
    return response.data.course;
  },

  endCourse: async (id: string, endDate: string): Promise<{ affectedEnrollments: number }> => {
    const response = await apiClient.post<{ affectedEnrollments: number }>(`/courses/${id}/end`, { endDate });
    return response.data;
  },

  // Teacher assignments
  getCourseTeachers: async (courseId: string): Promise<CourseTeacher[]> => {
    const response = await apiClient.get<{ teachers: CourseTeacher[] }>(`/courses/${courseId}/teachers`);
    return response.data.teachers;
  },

  assignTeacher: async (courseId: string, data: AssignTeacherInput): Promise<CourseTeacher> => {
    const response = await apiClient.post<{ assignment: CourseTeacher }>(`/courses/${courseId}/teachers`, data);
    return response.data.assignment;
  },

  updateTeacherAssignment: async (courseId: string, teacherId: string, percentageCut: string): Promise<CourseTeacher> => {
    const response = await apiClient.patch<{ assignment: CourseTeacher }>(`/courses/${courseId}/teachers/${teacherId}`, { percentageCut });
    return response.data.assignment;
  },

  removeTeacher: async (courseId: string, teacherId: string): Promise<void> => {
    await apiClient.delete(`/courses/${courseId}/teachers/${teacherId}`);
  },

  // Timeslots
  getCourseTimeslots: async (courseId: string): Promise<Timeslot[]> => {
    const response = await apiClient.get<{ timeslots: Timeslot[] }>(`/courses/${courseId}/timeslots`);
    return response.data.timeslots;
  },

  createTimeslot: async (courseId: string, data: CreateTimeslotInput): Promise<Timeslot> => {
    const response = await apiClient.post<{ timeslot: Timeslot }>(`/courses/${courseId}/timeslots`, data);
    return response.data.timeslot;
  },

  updateTimeslot: async (courseId: string, timeslotId: string, data: Partial<CreateTimeslotInput>): Promise<Timeslot> => {
    const response = await apiClient.patch<{ timeslot: Timeslot }>(`/courses/${courseId}/timeslots/${timeslotId}`, data);
    return response.data.timeslot;
  },

  deleteTimeslot: async (courseId: string, timeslotId: string): Promise<void> => {
    await apiClient.delete(`/courses/${courseId}/timeslots/${timeslotId}`);
  },

  // Get Teams meeting state (sudo only)
  getTeamsMeetingState: async (courseId: string): Promise<any> => {
    const response = await apiClient.get(`/courses/${courseId}/teams-meeting-state`);
    return response.data;
  },

  // Download enrolled students CSV
  downloadEnrolledStudentsCSV: async (courseId: string, resetPasswords: boolean = false): Promise<void> => {
    const params = resetPasswords ? '?resetPasswords=true' : '';
    const response = await apiClient.get(`/courses/${courseId}/students/csv${params}`, {
      responseType: 'blob',
    });

    // Create a blob from the response
    const blob = new Blob([response.data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);

    // Extract filename from Content-Disposition header or use default
    const contentDisposition = response.headers['content-disposition'];
    let filename = `students_${courseId}_${new Date().toISOString().split('T')[0]}.csv`;

    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].replace(/['"]/g, '');
      }
    }

    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};

export const roomsApi = {
  getRooms: async (activeOnly: boolean = false): Promise<Room[]> => {
    const params = activeOnly ? '?activeOnly=true' : '';
    const response = await apiClient.get<{ rooms: Room[] }>(`/rooms${params}`);
    return response.data.rooms;
  },

  getRoomById: async (id: string): Promise<Room> => {
    const response = await apiClient.get<{ room: Room }>(`/rooms/${id}`);
    return response.data.room;
  },

  createRoom: async (data: CreateRoomInput): Promise<Room> => {
    const response = await apiClient.post<{ room: Room }>('/rooms', data);
    return response.data.room;
  },

  updateRoom: async (id: string, data: UpdateRoomInput): Promise<Room> => {
    const response = await apiClient.patch<{ room: Room }>(`/rooms/${id}`, data);
    return response.data.room;
  },

  deleteRoom: async (id: string): Promise<void> => {
    await apiClient.delete(`/rooms/${id}`);
  },
};

export default { coursesApi, roomsApi };
