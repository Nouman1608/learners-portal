import { Request, Response, NextFunction } from 'express';
import microsoftGraphService from '../services/microsoft-graph.service';
import teamsOAuthService from '../services/teams-oauth.service';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { db } from '../config/database';
import { courseTimeslots } from '../db/schema';
import { isNotNull, sql } from 'drizzle-orm';

/**
 * Teams OAuth Controller
 * Handles Microsoft Teams OAuth flow for teachers
 */

/**
 * Initiate OAuth flow - Generate Microsoft authorization URL
 * GET /api/teams/auth/initiate
 */
export const initiateOAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    // Generate OAuth URL with user ID in state parameter
    const authUrl = microsoftGraphService.getAuthUrl(req.user.id);

    logger.info('Generated Teams OAuth URL', { userId: req.user.id });

    res.json({ url: authUrl });
  } catch (error) {
    next(error);
  }
};

/**
 * Handle OAuth callback from Microsoft
 * GET /api/teams/auth/callback?code=xxx&state=userId
 */
export const handleOAuthCallback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      logger.error('OAuth callback error', { error, error_description });
      const baseUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
      return res.redirect(`${baseUrl}/oauth-success.html?error=${encodeURIComponent(error as string)}&error_description=${encodeURIComponent(error_description as string || '')}`);
    }

    if (!code || !state) {
      throw new AppError(400, 'Missing authorization code or state');
    }

    const userId = state as string;

    // Exchange authorization code for tokens
    const tokens = await microsoftGraphService.exchangeCodeForTokens(code as string);

    // Log token structure for debugging
    logger.info('Received tokens from Microsoft', {
      userId,
      hasAccessToken: !!tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      expiresInType: typeof tokens.expiresIn,
      scope: tokens.scope,
      scopeType: typeof tokens.scope,
    });

    // Store encrypted tokens in database
    await teamsOAuthService.storeTeamsCredentials(
      userId,
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresIn,
      tokens.scope
    );

    logger.info('Successfully stored Teams OAuth credentials', { userId });

    // Redirect to OAuth success page (popup will auto-close)
    const baseUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
    res.redirect(`${baseUrl}/oauth-success.html?success=true`);
  } catch (error) {
    logger.error('Error handling OAuth callback', { error });
    next(error);
  }
};

/**
 * Get Teams connection status for current user
 * GET /api/teams/status
 */
export const getConnectionStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const isConnected = await teamsOAuthService.isTeamsConnected(req.user.id);

    let userProfile = null;

    if (isConnected) {
      try {
        // Get valid access token
        const accessToken = await teamsOAuthService.ensureValidToken(req.user.id);

        // Fetch user profile from Microsoft Graph
        userProfile = await microsoftGraphService.getUserProfile(accessToken);
      } catch (error) {
        logger.warn('Failed to fetch Teams user profile', { userId: req.user.id, error });
        // Connection exists but may be invalid, still return connected = true
      }
    }

    res.json({
      connected: isConnected,
      email: userProfile?.email,
      displayName: userProfile?.displayName,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Revoke Teams OAuth connection
 * DELETE /api/teams/connection
 */
export const revokeConnection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    await teamsOAuthService.revokeTeamsConnection(req.user.id);

    logger.info('Revoked Teams connection', { userId: req.user.id });

    res.json({ message: 'Microsoft Teams connection revoked successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Patch all existing Teams meetings to bypass the lobby (admit everyone directly)
 * POST /api/teams/fix-lobby
 */
export const fixMeetingLobby = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Find all timeslots that have a Teams meeting
    const timeslotsWithMeetings = await db
      .select({
        teamsMeetingId: courseTimeslots.teamsMeetingId,
        teamsCreatedBy: courseTimeslots.teamsCreatedBy,
      })
      .from(courseTimeslots)
      .where(
        sql`${courseTimeslots.teamsMeetingId} IS NOT NULL AND ${courseTimeslots.teamsCreatedBy} IS NOT NULL`
      );

    if (timeslotsWithMeetings.length === 0) {
      return res.json({ updated: 0, failed: 0, message: 'No Teams meetings found to update.' });
    }

    // Group meetings by teacher to avoid redundant token fetches
    const byTeacher = new Map<string, string[]>();
    for (const ts of timeslotsWithMeetings) {
      const teacherId = ts.teamsCreatedBy!;
      const meetingId = ts.teamsMeetingId!;
      if (!byTeacher.has(teacherId)) byTeacher.set(teacherId, []);
      byTeacher.get(teacherId)!.push(meetingId);
    }

    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const [teacherId, meetingIds] of byTeacher) {
      let accessToken: string;
      try {
        accessToken = await teamsOAuthService.ensureValidToken(teacherId);
      } catch {
        logger.warn(`[LOBBY FIX] Could not get token for teacher ${teacherId}, skipping ${meetingIds.length} meeting(s)`);
        failed += meetingIds.length;
        errors.push(`Teacher ${teacherId}: token unavailable`);
        continue;
      }

      for (const meetingId of meetingIds) {
        try {
          await microsoftGraphService.updateMeetingLobbySettings(accessToken, meetingId);
          updated++;
        } catch (err: any) {
          logger.warn(`[LOBBY FIX] Failed to update meeting ${meetingId}`, { error: err.message });
          failed++;
          errors.push(`Meeting ${meetingId}: ${err.message}`);
        }
      }
    }

    logger.info(`[LOBBY FIX] Done: ${updated} updated, ${failed} failed`);

    res.json({
      updated,
      failed,
      message: `Updated ${updated} meeting(s).${failed > 0 ? ` ${failed} failed.` : ''}`,
      ...(errors.length > 0 && { errors }),
    });
  } catch (error) {
    next(error);
  }
};
