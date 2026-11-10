import { Router } from 'express';
import * as expensesController from '../controllers/expenses.controller';
import { authenticate } from '../middleware/auth';
import { requireAdmin, requireSudo } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';

const router = Router();

// Admins enter expenses for their own campus (and edit/delete only their own entries);
// sudo sees everything, including the income vs expenses summary.
router.use(authenticate);
router.use(requireAdmin);

router.get('/', expensesController.listExpenses);
router.get('/summary', requireSudo, expensesController.getSummary);
router.post('/', logActivity('create', 'expense'), expensesController.createExpense);
router.put('/:id', logActivity('update', 'expense'), expensesController.updateExpense);
router.delete('/:id', logActivity('delete', 'expense'), expensesController.deleteExpense);

export default router;
