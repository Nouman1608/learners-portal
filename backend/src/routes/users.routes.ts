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

// The other campus's students, for linking siblings across campuses (admin only; before /:id)
router.get('/other-campus/students', requireAdmin, usersController.getOtherCampusStudents);

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

// Siblings (admin only): students linked as one family get a combined family invoice
router.get('/:id/family', requireAdmin, usersController.getFamily);
router.post('/:id/family', requireAdmin, logActivity('link-sibling', 'user'), usersController.linkSibling);
router.delete('/:id/family', requireAdmin, logActivity('unlink-sibling', 'user'), usersController.unlinkFamily);

export default router;
