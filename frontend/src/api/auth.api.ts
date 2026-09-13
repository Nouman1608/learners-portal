import apiClient from './client';
import { User, LoginCredentials, AuthResponse } from '../types';

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<User> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    return response.data.user;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  getMe: async (): Promise<User> => {
    const response = await apiClient.get<AuthResponse>('/auth/me');
    return response.data.user;
  },

  refresh: async (): Promise<void> => {
    await apiClient.post('/auth/refresh');
  },

  changeSelfPassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await apiClient.post('/auth/change-password', { currentPassword, newPassword });
  },

  updateProfile: async (data: { teamsUsername?: string }): Promise<void> => {
    await apiClient.patch('/auth/profile', data);
  },

  setupAccount: async (data: { currentPassword: string; newPassword: string; teamsUsername: string }): Promise<void> => {
    await apiClient.post('/auth/setup-account', data);
  },
};

export default authApi;
