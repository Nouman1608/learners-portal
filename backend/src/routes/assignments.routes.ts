import { Router } from 'express';
import * as controller from '../controllers/assignments.controller';
import { authenticate } from '../middleware/auth';
import { requireRole, requireTeacher } from '../middleware/rbac';
import { uploadAssignmentFiles } from '../middleware/assignmentUpload';

const router = Router();
router.use(authenticate);

// Students: their own assignments and hand-ins
const requireStudentOnly = requireRole(['student']);
router.get('/mine', requireStudentOnly, controller.listMine);
router.get('/mine/:id', requireStudentOnly, controller.getMine);
router.post('/mine/:id/submit', requireStudentOnly, uploadAssignmentFiles, controller.submitMine);

// Teachers, admins and sudo
router.get('/audience', requireTeacher, controller.getAudience);
router.get('/', requireTeacher, controller.listAssignments);
router.post('/', requireTeacher, uploadAssignmentFiles, controller.createAssignment);
router.get('/:id', requireTeacher, controller.getAssignment);
router.put('/:id', requireTeacher, uploadAssignmentFiles, controller.updateAssignment);
router.delete('/:id', requireTeacher, controller.deleteAssignment);
router.put('/:id/submissions/:studentId/grade', requireTeacher, controller.gradeSubmission);

export default router;
