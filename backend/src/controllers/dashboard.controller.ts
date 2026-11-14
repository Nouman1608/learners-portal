import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { dashboardService, FeeGroup } from '../services/dashboard.service';
import { juniorDb } from '../config/database';
import { AppError } from '../middleware/errorHandler';

const feeOverviewStudentsQuery = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
  status: z.enum(['total', 'enrolled', 'paid', 'pending', 'overdue', 'nofee']),
  teacherId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  campus: z.enum(['senior', 'junior', 'both']).default('senior'),
});

/**
 * GET /api/dashboard/fee-overview/students — the students behind one number of the overview
 * (admins and sudo; other campuses sudo only). With teacherId (and courseId) it is that
 * teacher's enrolled students; without, it is one of the month's four boxes.
 */
export const getFeeOverviewStudents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = feeOverviewStudentsQuery.safeParse(req.query);
    if (!parsed.success) throw new AppError(400, 'Invalid request');
    const { campus, ...filter } = parsed.data;

    if (campus === 'senior') {
      return res.json({ students: await dashboardService.getFeeOverviewStudents(filter) });
    }
    if (req.user!.role !== 'sudo') throw new AppError(403, 'Only sudo can view other campuses');
    if (!juniorDb) throw new AppError(400, 'Junior Campus is not connected to this portal');

    const junior = (await dashboardService.getFeeOverviewStudents(filter, juniorDb)).map((s) => ({ ...s, campus: 'junior' as const }));
    if (campus === 'junior') return res.json({ students: junior });
    const senior = (await dashboardService.getFeeOverviewStudents(filter)).map((s) => ({ ...s, campus: 'senior' as const }));
    res.json({ students: [...senior, ...junior] });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/dashboard/fee-overview?month=&year=&campus= (admins and sudo; other campuses sudo only)
 * One month's fees: students / fees paid, pending and overdue, and the same per teacher's class.
 */
export const getFeeOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // "This month" is the month in Pakistan, whatever the server's clock zone
    const [nowYear, nowMonth] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()).split('-').map(Number);
    const month = Number(req.query.month) || nowMonth;
    const year = Number(req.query.year) || nowYear;
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2020 || year > 2100) {
      throw new AppError(400, 'Invalid month or year');
    }

    const campus = typeof req.query.campus === 'string' ? req.query.campus : 'senior';
    if (campus !== 'junior' && campus !== 'both') {
      return res.json(await dashboardService.getFeeOverview(month, year));
    }
    // Admins see their own campus only; the other campus is for sudo
    if (req.user!.role !== 'sudo') throw new AppError(403, 'Only sudo can view other campuses');
    if (!juniorDb) throw new AppError(400, 'Junior Campus is not connected to this portal');

    const junior = await dashboardService.getFeeOverview(month, year, juniorDb);
    if (campus === 'junior') return res.json(junior);

    // Both: counts are added; money is added per currency only
    const senior = await dashboardService.getFeeOverview(month, year);
    const add = (a: FeeGroup, b: FeeGroup): FeeGroup => {
      const perCurrency = new Map<string, number>();
      for (const row of [...a.amounts, ...b.amounts]) perCurrency.set(row.currency, (perCurrency.get(row.currency) || 0) + parseFloat(row.amount));
      return {
        students: a.students + b.students,
        fees: a.fees + b.fees,
        amounts: [...perCurrency].map(([currency, amount]) => ({ currency, amount: amount.toFixed(2) })),
      };
    };
    res.json({
      month,
      year,
      total: add(senior.total, junior.total),
      paid: add(senior.paid, junior.paid),
      pending: add(senior.pending, junior.pending),
      overdue: add(senior.overdue, junior.overdue),
      teachers: [
        ...senior.teachers.map((t) => ({ ...t, campus: 'senior' as const })),
        ...junior.teachers.map((t) => ({ ...t, campus: 'junior' as const })),
      ],
    });
  } catch (error) {
    next(error);
  }
};

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
