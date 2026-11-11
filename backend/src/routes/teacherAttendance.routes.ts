import { Router } from 'express';
import * as controller from '../controllers/teacherAttendance.controller';
import { authenticate } from '../middleware/auth';
import { requireAdmin, requireTeacher } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';

const router = Router();

// Teacher absent / late marks (Junior portal): admins mark, teachers see their own
router.use(authenticate);

router.get('/', requireTeacher, controller.listMarks);
router.post('/', requireAdmin, logActivity('create', 'teacher-attendance-mark'), controller.createMark);
router.delete('/:id', requireAdmin, logActivity('delete', 'teacher-attendance-mark'), controller.deleteMark);

export default router;
