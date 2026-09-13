import { Router } from 'express';
import * as usersController from '../controllers/users.controller';
import { authenticate } from '../middleware/auth';
import { requireAdmin, requireTeacher } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get all users (with optional filters) - teachers can access this to get teacher list
router.get('/', requireTeacher, usersController.getUsers);

// Get users by role - teachers can access
router.get('/role/:role', requireTeacher, usersController.getUsersByRole);

// Get single user - teachers can access
router.get('/:id', requireTeacher, usersController.getUserById);

// Create new user (admin only)
router.post('/', requireAdmin, logActivity('create', 'user'), usersController.createUser);

// Update user (admin only)
router.patch('/:id', requireAdmin, logActivity('update', 'user'), usersController.updateUser);

// Delete user (admin only - soft delete)
router.delete('/:id', requireAdmin, logActivity('delete', 'user'), usersController.deleteUser);

// Change user password (admin only)
router.patch('/:id/password', requireAdmin, logActivity('change-password', 'user'), usersController.changePassword);

// Reset user password (admin only)
router.post('/:id/reset-password', requireAdmin, logActivity('reset-password', 'user'), usersController.resetPassword);

export default router;
