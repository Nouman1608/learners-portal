import { Request, Response, NextFunction } from 'express';
import { dashboardService } from '../services/dashboard.service';

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

    // Admin/Sudo get general stats
    const stats = await dashboardService.getGeneralStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
};
