import { Router } from 'express';
import * as coursesController from '../controllers/courses.controller';
import { authenticate } from '../middleware/auth';
import { requireAdmin, requireTeacher } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Room CRUD
router.get('/', requireTeacher, coursesController.getRooms);
router.get('/:id', requireTeacher, coursesController.getRoomById);
router.post('/', requireAdmin, logActivity('create', 'room'), coursesController.createRoom);
router.patch('/:id', requireAdmin, logActivity('update', 'room'), coursesController.updateRoom);
router.delete('/:id', requireAdmin, logActivity('delete', 'room'), coursesController.deleteRoom);

export default router;
