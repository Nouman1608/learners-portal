import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { expensesService, Campus } from '../services/expenses.service';
import { EXPENSE_CATEGORIES } from '../db/schema/expenses';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const AMOUNT = z.union([z.string(), z.number()])
  .transform((v) => String(v).replace(/,/g, '').trim())
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0, 'Amount must be a positive number');

const expenseSchema = z.object({
  expenseDate: DATE,
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().max(255).optional(),
  paidTo: z.string().max(150).optional(),
  amount: AMOUNT,
  currency: z.enum(['PKR', 'USD', 'GBP', 'SAR']).optional(),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'card', 'cheque', 'other']).optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
});

const campusSchema = z.enum(['senior', 'junior', 'both']).optional();

const listSchema = z.object({
  startDate: DATE,
  endDate: DATE,
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  campus: campusSchema,
});

const summarySchema = z.object({
  year: z.string().regex(/^\d{4}$/),
  campus: campusSchema,
});

/** GET /api/expenses?startDate&endDate&category&campus - admins see their own campus only */
export const listExpenses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = listSchema.parse(req.query);
    const campus = req.user!.role === 'sudo' ? (q.campus || 'senior') : 'senior'; // 'senior' = this portal's own database
    const expenses = await expensesService.list(campus as Campus, q.startDate, q.endDate, q.category);
    res.json({ expenses });
  } catch (error) {
    next(error);
  }
};

/** GET /api/expenses/summary?year&campus - income, teacher pay, expenses and net per month (PKR) - sudo */
export const getSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = summarySchema.parse(req.query);
    const months = await expensesService.summary((q.campus || 'senior') as Campus, Number(q.year));
    res.json({ months });
  } catch (error) {
    next(error);
  }
};

/** POST /api/expenses - admin or sudo */
export const createExpense = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = expenseSchema.parse(req.body);
    const expense = await expensesService.create(input, req.user!.id);
    res.status(201).json({ expense });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/expenses/:id - sudo, or the admin who entered it */
export const updateExpense = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = expenseSchema.partial().parse(req.body);
    const expense = await expensesService.update(req.params.id, input, req.user!);
    res.json({ expense });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/expenses/:id - sudo, or the admin who entered it */
export const deleteExpense = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await expensesService.remove(req.params.id, req.user!);
    res.json({ message: 'Expense deleted' });
  } catch (error) {
    next(error);
  }
};
