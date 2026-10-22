import { Router } from 'express';
import * as expensesController from '../controllers/expenses.controller';
import { authenticate } from '../middleware/auth';
import { requireSudo } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';

const router = Router();

// Expenses are sudo only
router.use(authenticate);
router.use(requireSudo);

router.get('/', expensesController.listExpenses);
router.get('/summary', expensesController.getSummary);
router.post('/', logActivity('create', 'expense'), expensesController.createExpense);
router.put('/:id', logActivity('update', 'expense'), expensesController.updateExpense);
router.delete('/:id', logActivity('delete', 'expense'), expensesController.deleteExpense);

export default router;
