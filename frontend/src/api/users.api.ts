import apiClient from './client';

/** Stand-in address the portal gives a student created without an email (see users.service). */
export const isNoEmailAddress = (email?: string | null) => !!email && email.endsWith('@no-email.invalid');
import { User } from '../types';

// Re-export User type for convenience
export type { User };

export interface CreateUserInput {
  username: string;
  password: string;
  role: 'admin' | 'teacher' | 'student';
  firstName: string;
  lastName: string;
  email?: string; // optional for students
  phone?: string;
  parentPhone?: string;
  studentCategory?: string; // 'junior' or 'senior'
  studentSubcategory?: string; // 'aitchison', 'preschool', 'summer_camp', 'academy', 'local', 'online'
  whatsappGroupLink?: string;
  teamsUsername?: string;
  teacherPaymentType?: 'percentage_based' | 'salaried' | 'per_child';
  localStudentFeePercentage?: number;
  onlineStudentFixedAmountIg?: number;
  onlineStudentFixedAmountAlevel?: number;
  monthlySalary?: number;
  siblingOfId?: string; // students: a brother or sister already in the portal
}

/** A brother or sister, as shown on the student form */
export interface FamilyMember {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  parentPhone: string | null;
  isActive: boolean;
}

export interface Family {
  familyId: string | null;
  siblings: FamilyMember[]; // linked
  suggestions: FamilyMember[]; // share a phone number but are not linked yet
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
  teacherPaymentType?: 'percentage_based' | 'salaried' | 'per_child';
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
  campus?: 'junior' | 'both'; // sudo on the Senior portal: Junior Campus users (read only)
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
    if (filter?.campus) params.append('campus', filter.campus);

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

  // Siblings: students linked as one family (their invoices can be made as one family invoice)
  getFamily: async (id: string): Promise<Family> => (await apiClient.get<Family>(`/users/${id}/family`)).data,

  linkSibling: async (id: string, siblingId: string): Promise<Family> =>
    (await apiClient.post<Family>(`/users/${id}/family`, { siblingId })).data,

  unlinkFamily: async (id: string): Promise<Family> => (await apiClient.delete<Family>(`/users/${id}/family`)).data,
};

export default usersApi;
