import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';
import { logActivity } from '../middleware/requestLogger';

const router = Router();

router.post('/login', authRateLimiter, logActivity('login', 'auth'), authController.login);
router.post('/logout', authenticate, logActivity('logout', 'auth'), authController.logout);
router.get('/me', authenticate, authController.me);
router.post('/refresh', authenticate, authController.refresh);
router.post('/change-password', authenticate, logActivity('change_password', 'auth'), authController.changeSelfPassword);
router.post('/setup-account', authenticate, logActivity('setup_account', 'auth'), authController.setupAccount);
router.patch('/profile', authenticate, logActivity('update_profile', 'auth'), authController.updateProfile);

export default router;
