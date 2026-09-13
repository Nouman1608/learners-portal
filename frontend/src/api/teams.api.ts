import apiClient from './client';

export interface TeamsConnectionStatus {
  connected: boolean;
  email?: string;
  displayName?: string;
}

export interface TeamsAuthUrl {
  url: string;
}

export const teamsApi = {
  /**
   * Get OAuth authorization URL for teacher to connect Teams
   */
  getOAuthUrl: async (): Promise<string> => {
    const response = await apiClient.get<TeamsAuthUrl>('/teams/auth/initiate');
    return response.data.url;
  },

  /**
   * Get Teams connection status for current user
   */
  getConnectionStatus: async (): Promise<TeamsConnectionStatus> => {
    const response = await apiClient.get<TeamsConnectionStatus>('/teams/status');
    return response.data;
  },

  /**
   * Revoke Teams OAuth connection
   */
  revokeConnection: async (): Promise<void> => {
    await apiClient.delete('/teams/connection');
  },

  /**
   * Patch all existing Teams meetings to bypass the lobby
   */
  fixMeetingLobby: async (): Promise<{ updated: number; failed: number; message: string }> => {
    const response = await apiClient.post<{ updated: number; failed: number; message: string }>('/teams/fix-lobby');
    return response.data;
  },
};

export default teamsApi;
