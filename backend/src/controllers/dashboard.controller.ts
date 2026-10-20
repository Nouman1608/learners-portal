import { Request, Response, NextFunction } from 'express';
import { dashboardService } from '../services/dashboard.service';
import { juniorDb } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export const getStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;

    // Role-based stats
    if (user.role === 'student') {
      const stats = await dashboardService.getStudentStats(user.id);
      return res.json(stats);
    }

    if (user.role === 'teacher') {
      const stats = await dashboardService.getTeacherStats(user.id);
      return res.json(stats);
    }

    // Sudo on the Senior Campus can also see the Junior Campus (?campus=junior|both)
    const campus = typeof req.query.campus === 'string' ? req.query.campus : 'senior';
    if (campus === 'junior' || campus === 'both') {
      if (user.role !== 'sudo') throw new AppError(403, 'Only sudo can view other campuses');
      if (!juniorDb) throw new AppError(400, 'Junior Campus is not connected to this portal');
      const stats = campus === 'junior'
        ? await dashboardService.getGeneralStats(juniorDb)
        : await dashboardService.getCombinedStats(juniorDb);
      return res.json(stats);
    }

    // Admin/Sudo get general stats
    const stats = await dashboardService.getGeneralStats();
    res.json({ ...stats, juniorCampusAvailable: user.role === 'sudo' && !!juniorDb });
  } catch (error) {
    next(error);
  }
};
