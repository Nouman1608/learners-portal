import { Router } from 'express';
import * as enrollmentsController from '../controllers/enrollments.controller';
import { authenticate } from '../middleware/auth';
import { requireAdmin, requireTeacher, requireStudent } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Fees
router.get('/', requireTeacher, enrollmentsController.getFees);
router.get('/overdue', requireAdmin, enrollmentsController.getOverdueFees);
router.get('/student/:studentId', requireTeacher, enrollmentsController.getStudentFees);
router.get('/:id', requireTeacher, enrollmentsController.getFeeById);
router.post('/', requireAdmin, logActivity('create', 'fee'), enrollmentsController.createFee);
router.post('/generate/manual', requireAdmin, logActivity('generate-fees-manual', 'fee'), enrollmentsController.generateFeesManually);
router.patch('/:id/status', requireAdmin, logActivity('update-fee-status', 'fee'), enrollmentsController.updateFeeStatus);
router.patch('/:id/sessions', requireAdmin, logActivity('update-fee-sessions', 'fee'), enrollmentsController.updateFeeSessions);
router.patch('/:id/received', requireAdmin, logActivity('mark-received', 'fee'), enrollmentsController.markFeeAsReceived);

// Payments (students can create, admins/teachers can view)
router.get('/:id/payments', requireTeacher, enrollmentsController.getPayments);
router.post('/payments', requireStudent, logActivity('submit-payment', 'payment'), enrollmentsController.createPayment);
router.get('/payments/:id', requireTeacher, enrollmentsController.getPaymentById);
router.get('/payments/student/:studentId', requireTeacher, enrollmentsController.getStudentPayments);

export default router;
