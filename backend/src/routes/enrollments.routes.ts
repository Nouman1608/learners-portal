import { Router } from 'express';
import * as enrollmentsController from '../controllers/enrollments.controller';
import { authenticate } from '../middleware/auth';
import { requireAdmin, requireSudo, requireTeacher, requireStudent } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Enrollments
router.get('/', requireTeacher, enrollmentsController.getEnrollments);
router.get('/:id', requireTeacher, enrollmentsController.getEnrollmentById);
router.get('/student/:studentId', requireTeacher, enrollmentsController.getStudentEnrollments);
router.get('/course/:courseId', requireTeacher, enrollmentsController.getCourseEnrollments);
router.post('/', requireAdmin, logActivity('create', 'enrollment'), enrollmentsController.createEnrollment);
router.patch('/:id', requireAdmin, logActivity('update', 'enrollment'), enrollmentsController.updateEnrollment);
router.patch('/:id/fee', requireAdmin, logActivity('update-fee', 'enrollment'), enrollmentsController.updateEnrollmentFee);
router.delete('/:id', requireAdmin, logActivity('delete', 'enrollment'), enrollmentsController.deleteEnrollment);
router.delete('/:id/hard', requireAdmin, logActivity('hard-delete', 'enrollment'), enrollmentsController.hardDeleteEnrollment);

export default router;
