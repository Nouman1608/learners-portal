import { Router } from 'express';
import * as assessmentsController from '../controllers/assessments.controller';
import { authenticate } from '../middleware/auth';
import { requireAdmin, requireTeacher, requireStudent } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';
import { uploadTeacherPdfs, uploadStudentPdf } from '../middleware/assessmentUpload';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Assessments - Teachers can create, update, delete their own assessments
router.get('/', requireStudent, assessmentsController.getAssessments);
router.get('/:id', requireStudent, assessmentsController.getAssessmentById);
router.post('/', requireTeacher, logActivity('create', 'assessment'), assessmentsController.createAssessment);
router.patch('/:id', requireTeacher, logActivity('update', 'assessment'), assessmentsController.updateAssessment);
router.delete('/:id', requireTeacher, logActivity('delete', 'assessment'), assessmentsController.deleteAssessment);

// Results - Students can submit, teachers can grade
router.post('/results/submit', requireStudent, logActivity('submit', 'assessment-result'), assessmentsController.submitResult);
router.post('/:assessmentId/grade', requireTeacher, logActivity('grade', 'assessment-result'), assessmentsController.gradeResult);
router.get('/:assessmentId/results', requireTeacher, assessmentsController.getAssessmentResults);

// Student results - Students can view their own, teachers can view all
router.get('/results/student/:studentId', requireTeacher, assessmentsController.getStudentResults);
router.get('/results/my-results', requireStudent, assessmentsController.getStudentResults);
router.get('/results/:id', requireStudent, assessmentsController.getResultById);

// Assessment files (teacher question papers)
router.post('/:assessmentId/files', requireTeacher, uploadTeacherPdfs(5), logActivity('upload', 'assessment-files'), assessmentsController.uploadAssessmentFiles);
router.get('/:assessmentId/files', requireStudent, assessmentsController.getAssessmentFiles);
router.delete('/files/:fileId', requireTeacher, logActivity('delete', 'assessment-file'), assessmentsController.deleteAssessmentFile);

// Student submission with PDF
router.post('/:assessmentId/submit', requireStudent, uploadStudentPdf(), logActivity('submit', 'assessment'), assessmentsController.submitAssessmentWithPdf);
router.get('/results/:resultId/submission', requireStudent, assessmentsController.getSubmissionFile);

// Annotations
router.post('/results/:resultId/annotations', requireTeacher, logActivity('annotate', 'assessment-result'), assessmentsController.saveAnnotations);
router.get('/results/:resultId/annotations', requireStudent, assessmentsController.getAnnotations);

// Access check
router.get('/:assessmentId/check-access', requireStudent, assessmentsController.checkAccess);

export default router;
