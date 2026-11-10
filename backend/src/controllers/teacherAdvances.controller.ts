import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { teacherAdvancesService } from '../services/teacherAdvances.service';
import { invoicesService } from '../services/invoices.service';
import logger from '../utils/logger';

const AMOUNT = z.union([z.string(), z.number()])
  .transform((v) => String(v).replace(/,/g, '').trim())
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0, 'Amount must be a positive number');

const createSchema = z.object({
  teacherId: z.string().uuid(),
  amount: AMOUNT,
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'other']).optional().or(z.literal('')),
  note: z.string().max(1000).optional(),
});

const listSchema = z.object({
  teacherId: z.string().uuid().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().optional(),
});

/** Existing invoice PDFs from that month on are re-drawn so the advance shows (never blocks the request) */
const refreshPdfs = (teacherId: string, month: number, year: number) =>
  invoicesService.refreshTeacherInvoicePdfs(teacherId, month, year)
    .catch((error) => logger.error('[ADVANCES] Failed to refresh invoice PDFs', { teacherId, month, year, error: error.message }));

/** GET /api/salary-advances?teacherId&month&year - admins see all, teachers only their own */
export const listAdvances = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = listSchema.parse(req.query);
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'sudo';
    const advances = await teacherAdvancesService.list({ ...q, teacherId: isAdmin ? q.teacherId : req.user!.id });
    res.json({ advances });
  } catch (error) {
    next(error);
  }
};

/** POST /api/salary-advances - admin */
export const createAdvance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body);
    const advance = await teacherAdvancesService.create({ ...input, paymentMethod: input.paymentMethod || undefined }, req.user!.id);
    await refreshPdfs(advance.teacherId, advance.month, advance.year);
    res.status(201).json({ advance });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/salary-advances/:id - admin */
export const deleteAdvance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const advance = await teacherAdvancesService.remove(req.params.id);
    await refreshPdfs(advance.teacherId, advance.month, advance.year);
    res.json({ message: 'Advance deleted' });
  } catch (error) {
    next(error);
  }
};
