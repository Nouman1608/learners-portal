import { Request, Response, NextFunction } from 'express';
import attendanceService from '../services/attendance.service';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { db } from '../config/database';
import { attendanceSyncLog } from '../db/schema/attendance';
import { desc } from 'drizzle-orm';

/**
 * Attendance Controller
 * Handles attendance syncing and viewing
 */

/**
 * Manually trigger attendance sync for an event
 * POST /api/attendance/events/:eventId/sync
 */
export const syncAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const { eventId } = req.params;

    logger.info('Manual attendance sync triggered', { eventId, userId: req.user.id });

    const result = await attendanceService.syncEventAttendance(eventId, 'manual');

    res.json({
      success: result.success,
      message: result.message,
      participantCount: result.participantCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get attendance for an event
 * GET /api/attendance/events/:eventId
 */
export const getEventAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const { eventId } = req.params;

    const attendance = await attendanceService.getEventAttendance(eventId);

    res.json(attendance);
  } catch (error) {
    next(error);
  }
};

/**
 * Get student attendance history
 * GET /api/attendance/students/:studentId
 * Query params: courseId, startDate, endDate
 */
export const getStudentAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const { studentId } = req.params;
    const { courseId, startDate, endDate } = req.query;

    // Students can only view their own attendance
    if (req.user.role === 'student' && req.user.id !== studentId) {
      throw new AppError(403, 'You can only view your own attendance');
    }

    let dateRange;
    if (startDate && endDate) {
      dateRange = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
      };
    }

    const attendance = await attendanceService.getStudentAttendance(
      studentId,
      courseId as string | undefined,
      dateRange
    );

    res.json(attendance);
  } catch (error) {
    next(error);
  }
};

/**
 * Get course attendance statistics
 * GET /api/attendance/courses/:courseId/stats
 */
export const getCourseAttendanceStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const { courseId } = req.params;

    const stats = await attendanceService.getCourseAttendanceStats(courseId);

    res.json(stats);
  } catch (error) {
    next(error);
  }
};

/**
 * Get attendance sync logs
 * GET /api/attendance/sync-logs
 * Query params: limit (default 50)
 */
export const getSyncLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const limit = parseInt(req.query.limit as string) || 50;

    const logs = await db
      .select()
      .from(attendanceSyncLog)
      .orderBy(desc(attendanceSyncLog.syncedAt))
      .limit(limit);

    res.json(logs);
  } catch (error) {
    next(error);
  }
};

/**
 * Get student attendance rate for a course
 * GET /api/attendance/students/:studentId/courses/:courseId/rate
 */
export const getStudentAttendanceRate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const { studentId, courseId } = req.params;

    // Students can only view their own rates
    if (req.user.role === 'student' && req.user.id !== studentId) {
      throw new AppError(403, 'You can only view your own attendance rate');
    }

    const rate = await attendanceService.getStudentAttendanceRate(studentId, courseId);

    res.json(rate);
  } catch (error) {
    next(error);
  }
};

/**
 * Mark manual attendance for local students
 * POST /api/attendance/events/:eventId/manual
 * Body: { attendance: [{ studentId, status }] }
 */
export const markManualAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const { eventId } = req.params;
    const { attendance } = req.body;

    if (!attendance || !Array.isArray(attendance)) {
      throw new AppError(400, 'Attendance data must be an array');
    }

    // Validate attendance records
    for (const record of attendance) {
      if (!record.studentId || !record.status) {
        throw new AppError(400, 'Each attendance record must have studentId and status');
      }
      if (!['present', 'absent', 'late'].includes(record.status)) {
        throw new AppError(400, 'Status must be present, absent, or late');
      }
    }

    logger.info('Manual attendance marking initiated', {
      eventId,
      teacherId: req.user.id,
      recordCount: attendance.length
    });

    await attendanceService.markManualAttendance(eventId, attendance);

    res.json({
      success: true,
      message: 'Attendance marked successfully',
      recordCount: attendance.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get enrolled students grouped by attendance mode
 * GET /api/attendance/events/:eventId/students-by-mode
 */
export const getStudentsByMode = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const { eventId } = req.params;

    const students = await attendanceService.getEnrolledStudentsByMode(eventId);

    res.json(students);
  } catch (error) {
    next(error);
  }
};
