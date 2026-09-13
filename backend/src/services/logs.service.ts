import { db } from '../config/database';
import { activityLogs } from '../db/schema/users';
import { users } from '../db/schema/users';
import { eq, desc, and, ilike, sql } from 'drizzle-orm';

export interface GetLogsFilters {
  userId?: string;
  action?: string;
  resource?: string;
  search?: string; // Search in action, resource, or details
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

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

export const logsService = {
  /**
   * Get activity logs with filters and pagination
   */
  async getLogs(filters: GetLogsFilters = {}): Promise<{ logs: ActivityLog[]; total: number }> {
    const {
      userId,
      action,
      resource,
      search,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = filters;

    // Build WHERE conditions
    const conditions = [];

    if (userId) {
      conditions.push(eq(activityLogs.userId, userId));
    }

    if (action) {
      conditions.push(eq(activityLogs.action, action));
    }

    if (resource) {
      conditions.push(eq(activityLogs.resource, resource));
    }

    if (search) {
      conditions.push(
        sql`(
          ${activityLogs.action} ILIKE ${`%${search}%`} OR
          ${activityLogs.resource} ILIKE ${`%${search}%`} OR
          ${activityLogs.details} ILIKE ${`%${search}%`}
        )`
      );
    }

    if (startDate) {
      conditions.push(sql`${activityLogs.timestamp} >= ${startDate}`);
    }

    if (endDate) {
      conditions.push(sql`${activityLogs.timestamp} <= ${endDate}`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityLogs)
      .where(whereClause);

    const total = countResult[0]?.count || 0;

    // Get logs with user data
    const logs = await db
      .select({
        id: activityLogs.id,
        userId: activityLogs.userId,
        action: activityLogs.action,
        resource: activityLogs.resource,
        resourceId: activityLogs.resourceId,
        details: activityLogs.details,
        ipAddress: activityLogs.ipAddress,
        userAgent: activityLogs.userAgent,
        timestamp: activityLogs.timestamp,
        user: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
        },
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .where(whereClause)
      .orderBy(desc(activityLogs.timestamp))
      .limit(limit)
      .offset(offset);

    return {
      logs: logs as any,
      total,
    };
  },

  /**
   * Get unique actions (for filter dropdown)
   */
  async getUniqueActions(): Promise<string[]> {
    const result = await db
      .selectDistinct({ action: activityLogs.action })
      .from(activityLogs)
      .orderBy(activityLogs.action);

    return result.map((r) => r.action);
  },

  /**
   * Get unique resources (for filter dropdown)
   */
  async getUniqueResources(): Promise<string[]> {
    const result = await db
      .selectDistinct({ resource: activityLogs.resource })
      .from(activityLogs)
      .orderBy(activityLogs.resource);

    return result.map((r) => r.resource);
  },

  /**
   * Get log by ID
   */
  async getLogById(id: string): Promise<ActivityLog | null> {
    const [log] = await db
      .select({
        id: activityLogs.id,
        userId: activityLogs.userId,
        action: activityLogs.action,
        resource: activityLogs.resource,
        resourceId: activityLogs.resourceId,
        details: activityLogs.details,
        ipAddress: activityLogs.ipAddress,
        userAgent: activityLogs.userAgent,
        timestamp: activityLogs.timestamp,
        user: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
        },
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .where(eq(activityLogs.id, id));

    return log as any || null;
  },

  /**
   * Get activity stats
   */
  async getStats(days: number = 7): Promise<{
    totalActions: number;
    uniqueUsers: number;
    actionsByType: { action: string; count: number }[];
    recentActivity: ActivityLog[];
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Total actions in period
    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityLogs)
      .where(sql`${activityLogs.timestamp} >= ${startDate}`);

    const totalActions = totalResult[0]?.count || 0;

    // Unique users in period
    const uniqueUsersResult = await db
      .select({ count: sql<number>`count(DISTINCT ${activityLogs.userId})::int` })
      .from(activityLogs)
      .where(sql`${activityLogs.timestamp} >= ${startDate}`);

    const uniqueUsers = uniqueUsersResult[0]?.count || 0;

    // Actions by type
    const actionsByType = await db
      .select({
        action: activityLogs.action,
        count: sql<number>`count(*)::int`,
      })
      .from(activityLogs)
      .where(sql`${activityLogs.timestamp} >= ${startDate}`)
      .groupBy(activityLogs.action)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    // Recent activity
    const recentActivity = await db
      .select({
        id: activityLogs.id,
        userId: activityLogs.userId,
        action: activityLogs.action,
        resource: activityLogs.resource,
        resourceId: activityLogs.resourceId,
        details: activityLogs.details,
        ipAddress: activityLogs.ipAddress,
        userAgent: activityLogs.userAgent,
        timestamp: activityLogs.timestamp,
        user: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
        },
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .where(sql`${activityLogs.timestamp} >= ${startDate}`)
      .orderBy(desc(activityLogs.timestamp))
      .limit(10);

    return {
      totalActions,
      uniqueUsers,
      actionsByType: actionsByType as any,
      recentActivity: recentActivity as any,
    };
  },
};

export default logsService;
