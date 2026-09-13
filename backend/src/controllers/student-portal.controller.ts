import { Request, Response, NextFunction } from 'express';
import { studentPortalService } from '../services/student-portal.service';
import logger from '../utils/logger';

/**
 * Student Portal Controller
 * Handles parent view of student data
 */

export const getStudentOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;

    // Students can only view their own data
    // Teachers and admins can view any student
    if (req.user?.role === 'student' && req.user.id !== studentId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    logger.info('Fetching student overview', {
      userId: req.user?.id,
      studentId,
    });

    const overview = await studentPortalService.getStudentOverview(studentId);

    res.json(overview);
  } catch (error) {
    next(error);
  }
};

export const getAcademicPerformance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;
    const { courseId } = req.query;

    // Students can only view their own data
    if (req.user?.role === 'student' && req.user.id !== studentId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    logger.info('Fetching academic performance', {
      userId: req.user?.id,
      studentId,
      courseId,
    });

    const performance = await studentPortalService.getAcademicPerformance(
      studentId,
      courseId as string | undefined
    );

    res.json({ results: performance });
  } catch (error) {
    next(error);
  }
};

export const getAttendanceHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;
    const { courseId } = req.query;

    // Students can only view their own data
    if (req.user?.role === 'student' && req.user.id !== studentId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    logger.info('Fetching attendance history', {
      userId: req.user?.id,
      studentId,
      courseId,
    });

    const attendance = await studentPortalService.getAttendanceHistory(
      studentId,
      courseId as string | undefined
    );

    res.json({ records: attendance });
  } catch (error) {
    next(error);
  }
};

export const getFeesHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;

    // Students can only view their own data
    if (req.user?.role === 'student' && req.user.id !== studentId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    logger.info('Fetching fees history', {
      userId: req.user?.id,
      studentId,
    });

    const fees = await studentPortalService.getFeesHistory(studentId);

    res.json({ fees });
  } catch (error) {
    next(error);
  }
};
