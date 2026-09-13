import { Router } from 'express';
import * as invoicesController from '../controllers/invoices.controller';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get invoices - users see their own, admins see all
router.get('/', invoicesController.getInvoices);
router.get('/:id', invoicesController.getInvoiceById);

// Download invoice PDF - teachers and admins can download
router.get('/:id/download', invoicesController.downloadInvoice);

// Get 1-to-1 session data for a student/month - admin only
router.get('/student/:studentId/1to1-sessions', requireAdmin, invoicesController.get1to1Sessions);

// Generate invoices - admin only
router.post(
  '/generate/student',
  requireAdmin,
  logActivity('generate', 'student-invoice'),
  invoicesController.generateStudentInvoice
);
router.post(
  '/generate/teacher',
  requireAdmin,
  logActivity('generate', 'teacher-invoice'),
  invoicesController.generateTeacherInvoice
);
router.post(
  '/generate/monthly-students',
  requireAdmin,
  logActivity('generate', 'monthly-student-invoices'),
  invoicesController.generateMonthlyStudentInvoices
);
router.post(
  '/generate/monthly-teachers',
  requireAdmin,
  logActivity('generate', 'monthly-teacher-invoices'),
  invoicesController.generateMonthlyTeacherInvoices
);
router.post(
  '/generate/monthly',
  requireAdmin,
  logActivity('generate', 'monthly-invoices'),
  invoicesController.generateMonthlyInvoices
);
router.post(
  '/generate/previous-month',
  requireAdmin,
  logActivity('generate', 'previous-month-invoices'),
  invoicesController.generatePreviousMonthInvoices
);

// Email invoice - admin only
router.post('/:id/email', requireAdmin, logActivity('email', 'invoice'), invoicesController.emailInvoice);

export default router;
