import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { teacherDeductionsService } from '../services/teacherDeductions.service';
import { invoicesService } from '../services/invoices.service';
import logger from '../utils/logger';

const COUNT = z.coerce.number().int().min(0).max(31);

const saveSchema = z.object({
  teacherId: z.string().uuid(),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
  absences: COUNT,
  friMonAbsences: COUNT,
  lates: COUNT,
});

const listSchema = z.object({
  teacherId: z.string().uuid().optional(),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
});

const isAdmin = (req: Request) => req.user!.role === 'admin' || req.user!.role === 'sudo';

/** GET /api/teacher-attendance?month&year&teacherId - each teacher's monthly totals; teachers see their own */
export const listMonth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = listSchema.parse(req.query);
    const rows = await teacherDeductionsService.list({ ...q, teacherId: isAdmin(req) ? q.teacherId : req.user!.id });
    res.json({ rows });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/teacher-attendance - save a teacher's totals for a month (admin); an existing slip is recalculated */
export const saveMonth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = saveSchema.parse(req.body);
    const row = await teacherDeductionsService.setCounts(input, req.user!.id);
    await invoicesService.refreshTeacherInvoicePdfs(input.teacherId, input.month, input.year)
      .catch((error) => logger.error('[TEACHER PAY] Failed to refresh invoices', { ...input, error: error.message }));
    res.json({ row });
  } catch (error) {
    next(error);
  }
};
