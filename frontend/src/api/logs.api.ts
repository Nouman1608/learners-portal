import apiClient from './client';

/**
 * Activity Log TypeScript Interfaces
 */

export interface ActivityLog {
  id: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: Date;
  user: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
}

export interface GetLogsFilters {
  userId?: string;
  action?: string;
  resource?: string;
  search?: string;
  startDate?: string; // ISO datetime string
  endDate?: string; // ISO datetime string
  limit?: number;
  offset?: number;
}

export interface GetLogsResult {
  logs: ActivityLog[];
  total: number;
}

export interface LogStats {
  totalActions: number;
  uniqueUsers: number;
  actionsByType: { action: string; count: number }[];
  recentActivity: ActivityLog[];
}

/**
 * Logs API Methods (Sudo Only)
 */

export const logsApi = {
  /**
   * Get activity logs with filters and pagination
   */
  async getLogs(filters?: GetLogsFilters): Promise<GetLogsResult> {
    const params = new URLSearchParams();
    if (filters?.userId) params.append('userId', filters.userId);
    if (filters?.action) params.append('action', filters.action);
    if (filters?.resource) params.append('resource', filters.resource);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    const response = await apiClient.get(`/logs?${params.toString()}`);
    return response.data;
  },

  /**
   * Get log by ID
   */
  async getLogById(id: string): Promise<ActivityLog> {
    const response = await apiClient.get(`/logs/${id}`);
    return response.data.log;
  },

  /**
   * Get unique actions (for filter dropdown)
   */
  async getUniqueActions(): Promise<string[]> {
    const response = await apiClient.get('/logs/meta/actions');
    return response.data.actions;
  },

  /**
   * Get unique resources (for filter dropdown)
   */
  async getUniqueResources(): Promise<string[]> {
    const response = await apiClient.get('/logs/meta/resources');
    return response.data.resources;
  },

  /**
   * Get activity stats
   */
  async getStats(days?: number): Promise<LogStats> {
    const params = new URLSearchParams();
    if (days) params.append('days', days.toString());

    const response = await apiClient.get(`/logs/stats/overview?${params.toString()}`);
    return response.data;
  },
};

export default logsApi;
