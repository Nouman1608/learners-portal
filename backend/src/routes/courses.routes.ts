import { Router } from 'express';
import * as coursesController from '../controllers/courses.controller';
import { authenticate } from '../middleware/auth';
import { requireAdmin, requireTeacher, requireSudo } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Course CRUD
router.get('/', requireTeacher, coursesController.getCourses);
router.get('/:id', requireTeacher, coursesController.getCourseById);
router.post('/', requireTeacher, logActivity('create', 'course'), coursesController.createCourse);
router.patch('/:id', requireTeacher, logActivity('update', 'course'), coursesController.updateCourse);
// Hard delete must come before soft delete due to route matching
router.delete('/:id/hard', requireAdmin, logActivity('hard-delete', 'course'), coursesController.hardDeleteCourse);
router.delete('/:id', requireAdmin, logActivity('delete', 'course'), coursesController.deleteCourse);
router.post('/:id/end', requireAdmin, logActivity('end-course', 'course'), coursesController.endCourse);

// Teacher assignments
router.get('/:id/teachers', requireTeacher, coursesController.getCourseTeachers);
router.post('/:id/teachers', requireTeacher, logActivity('assign-teacher', 'course'), coursesController.assignTeacher); // Teachers can assign themselves
router.patch('/:id/teachers/:teacherId', requireAdmin, logActivity('update-teacher', 'course'), coursesController.updateTeacherAssignment);
router.delete('/:id/teachers/:teacherId', requireAdmin, logActivity('remove-teacher', 'course'), coursesController.removeTeacher);

// Timeslots
router.get('/:id/timeslots', requireTeacher, coursesController.getCourseTimeslots);
router.post('/:id/timeslots', requireTeacher, logActivity('create-timeslot', 'course'), coursesController.createTimeslot);
router.patch('/:id/timeslots/:timeslotId', requireTeacher, logActivity('update-timeslot', 'course'), coursesController.updateTimeslot);
router.delete('/:id/timeslots/:timeslotId', requireTeacher, logActivity('delete-timeslot', 'course'), coursesController.deleteTimeslot);

// Download enrolled students CSV (admin only)
router.get('/:id/students/csv', requireAdmin, logActivity('download-students-csv', 'course'), coursesController.downloadEnrolledStudentsCSV);

// Teams meeting state (sudo testing endpoint)
router.get('/:id/teams-meeting-state', requireSudo, coursesController.getTeamsMeetingState);

export default router;
