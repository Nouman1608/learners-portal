import apiClient from './client';
import { User } from '../types';

// Re-export User type for convenience
export type { User };

export interface CreateUserInput {
  username: string;
  password: string;
  role: 'admin' | 'teacher' | 'student';
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  parentPhone?: string;
  studentCategory?: string; // 'junior' or 'senior'
  studentSubcategory?: string; // 'aitchison', 'preschool', 'summer_camp', 'academy', 'local', 'online'
  whatsappGroupLink?: string;
  teamsUsername?: string;
  teacherPaymentType?: 'percentage_based' | 'salaried';
  localStudentFeePercentage?: number;
  onlineStudentFixedAmountIg?: number;
  onlineStudentFixedAmountAlevel?: number;
  monthlySalary?: number;
}

export interface UpdateUserInput {
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  parentPhone?: string;
  studentCategory?: string; // 'junior' or 'senior'
  studentSubcategory?: string; // 'aitchison', 'preschool', 'summer_camp', 'academy', 'local', 'online'
  whatsappGroupLink?: string;
  teamsUsername?: string;
  isActive?: boolean;
  role?: 'admin' | 'teacher' | 'student';
  teacherPaymentType?: 'percentage_based' | 'salaried';
  // null clears the field (e.g. when switching payment type)
  localStudentFeePercentage?: number | null;
  onlineStudentFixedAmountIg?: number | null;
  onlineStudentFixedAmountAlevel?: number | null;
  monthlySalary?: number | null;
}

export interface UsersFilter {
  role?: string;
  search?: string;
  isActive?: boolean;
  studentCategory?: string;
  studentSubcategory?: string;
  limit?: number;
  offset?: number;
}

export const usersApi = {
  getUsers: async (filter?: UsersFilter): Promise<User[]> => {
    const params = new URLSearchParams();
    if (filter?.role) params.append('role', filter.role);
    if (filter?.search) params.append('search', filter.search);
    if (filter?.isActive !== undefined) params.append('isActive', String(filter.isActive));
    if (filter?.studentCategory) params.append('studentCategory', filter.studentCategory);
    if (filter?.studentSubcategory) params.append('studentSubcategory', filter.studentSubcategory);
    if (filter?.limit) params.append('limit', String(filter.limit));
    if (filter?.offset) params.append('offset', String(filter.offset));

    const response = await apiClient.get<{ users: User[] }>(`/users?${params.toString()}`);
    return response.data.users;
  },

  getUserById: async (id: string): Promise<User> => {
    const response = await apiClient.get<{ user: User }>(`/users/${id}`);
    return response.data.user;
  },

  getUsersByRole: async (role: 'admin' | 'teacher' | 'student'): Promise<User[]> => {
    const response = await apiClient.get<{ users: User[] }>(`/users/role/${role}`);
    return response.data.users;
  },

  createUser: async (data: CreateUserInput): Promise<User> => {
    const response = await apiClient.post<{ user: User }>('/users', data);
    return response.data.user;
  },

  updateUser: async (id: string, data: UpdateUserInput): Promise<User> => {
    const response = await apiClient.patch<{ user: User }>(`/users/${id}`, data);
    return response.data.user;
  },

  deleteUser: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${id}`);
  },

  changePassword: async (id: string, newPassword: string): Promise<void> => {
    await apiClient.patch(`/users/${id}/password`, { newPassword });
  },

  resetPassword: async (id: string, newPassword?: string): Promise<{ temporaryPassword: string }> => {
    const response = await apiClient.post<{ message: string; temporaryPassword: string }>(
      `/users/${id}/reset-password`,
      { newPassword }
    );
    return { temporaryPassword: response.data.temporaryPassword };
  },
};

export default usersApi;
