import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { teacherDeductionsService, deductionDays, MarkKind } from '../services/teacherDeductions.service';
import { invoicesService } from '../services/invoices.service';
import logger from '../utils/logger';

const createSchema = z.object({
  teacherId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(['absent', 'late']),
  note: z.string().max(500).optional(),
});

const listSchema = z.object({
  teacherId: z.string().uuid().optional(),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
});

const isAdmin = (req: Request) => req.user!.role === 'admin' || req.user!.role === 'sudo';

/** An existing invoice for that month (and later, for advance carry-over) is recalculated */
const refreshInvoices = (teacherId: string, date: string) => {
  const [year, month] = date.split('-').map(Number);
  return invoicesService.refreshTeacherInvoicePdfs(teacherId, month, year)
    .catch((error) => logger.error('[TEACHER PAY] Failed to refresh invoices', { teacherId, date, error: error.message }));
};

/** GET /api/teacher-attendance?month&year&teacherId - marks plus each teacher's days deducted; teachers see their own */
export const listMarks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = listSchema.parse(req.query);
    const marks = await teacherDeductionsService.list({ ...q, teacherId: isAdmin(req) ? q.teacherId : req.user!.id });

    const byTeacher = new Map<string, { teacherId: string; teacherName: string; marks: { date: string; kind: MarkKind }[] }>();
    for (const m of marks) {
      const t = byTeacher.get(m.teacherId) || { teacherId: m.teacherId, teacherName: m.teacherName, marks: [] };
      t.marks.push({ date: m.date, kind: m.kind as MarkKind });
      byTeacher.set(m.teacherId, t);
    }
    const daysByDate = new Map<string, { days: number; reason: string }>();
    const summary = [...byTeacher.values()].map((t) => {
      const items = deductionDays(t.marks);
      for (const i of items) daysByDate.set(`${t.teacherId}|${i.date}`, { days: i.days, reason: i.reason });
      return {
        teacherId: t.teacherId,
        teacherName: t.teacherName,
        absences: items.filter((i) => i.kind === 'absent').length,
        lates: items.filter((i) => i.kind === 'late').length,
        days: items.reduce((s, i) => s + i.days, 0),
      };
    }).sort((a, b) => a.teacherName.localeCompare(b.teacherName));

    res.json({
      marks: marks.map((m) => ({ ...m, ...daysByDate.get(`${m.teacherId}|${m.date}`) })),
      summary,
    });
  } catch (error) {
    next(error);
  }
};

/** POST /api/teacher-attendance - admin */
export const createMark = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body);
    const mark = await teacherDeductionsService.create(input, req.user!.id);
    await refreshInvoices(mark.teacherId, mark.date);
    res.status(201).json({ mark });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/teacher-attendance/:id - admin */
export const deleteMark = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mark = await teacherDeductionsService.remove(req.params.id);
    await refreshInvoices(mark.teacherId, mark.date);
    res.json({ message: 'Mark deleted' });
  } catch (error) {
    next(error);
  }
};
