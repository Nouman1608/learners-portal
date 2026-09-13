import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTeacher, requireAdmin } from '../middleware/rbac';
import {
  initiateOAuth,
  handleOAuthCallback,
  getConnectionStatus,
  revokeConnection,
  fixMeetingLobby,
} from '../controllers/teams-oauth.controller';

const router = Router();

/**
 * Teams OAuth Routes
 * Handles Microsoft Teams integration for teachers
 */

// Initiate OAuth flow - requires authentication
router.get('/auth/initiate', authenticate, requireTeacher, initiateOAuth);

// OAuth callback - public endpoint (Microsoft redirects here)
router.get('/auth/callback', handleOAuthCallback);

// Get connection status - requires authentication
router.get('/status', authenticate, getConnectionStatus);

// Revoke connection - requires authentication
router.delete('/connection', authenticate, revokeConnection);

// Fix lobby settings on all existing meetings (admin only)
router.post('/fix-lobby', authenticate, requireAdmin, fixMeetingLobby);

export default router;
