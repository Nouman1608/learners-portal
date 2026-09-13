import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { ClientSecretCredential } from '@azure/identity';
import 'isomorphic-fetch';
import env from '../config/env';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

/**
 * Microsoft Graph Service
 * Handles Microsoft Teams API interactions for meeting creation and attendance tracking
 */
export const microsoftGraphService = {
  /**
   * Create authenticated Graph client for a user using delegated permissions
   * @param accessToken User's access token from OAuth
   */
  getClientWithUserToken(accessToken: string): Client {
    return Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });
  },

  /**
   * Create authenticated Graph client using app-only permissions (not used for delegated flow)
   */
  getClientWithAppToken(): Client {
    const credential = new ClientSecretCredential(
      env.MICROSOFT_TENANT_ID!,
      env.MICROSOFT_CLIENT_ID!,
      env.MICROSOFT_CLIENT_SECRET!
    );

    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });

    return Client.initWithMiddleware({
      authProvider,
    });
  },

  /**
   * Generate OAuth authorization URL for teacher to grant Teams access
   * @param userId Teacher's user ID (for state parameter)
   */
  getAuthUrl(userId: string): string {
    const scopes = [
      'OnlineMeetings.ReadWrite',
      'OnlineMeetingArtifact.Read.All',
      'User.Read',
      'offline_access', // Required to receive refresh token
    ];

    const authUrl = new URL('https://login.microsoftonline.com/' + env.MICROSOFT_TENANT_ID! + '/oauth2/v2.0/authorize');
    authUrl.searchParams.append('client_id', env.MICROSOFT_CLIENT_ID!);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', env.MICROSOFT_REDIRECT_URI!);
    authUrl.searchParams.append('response_mode', 'query');
    authUrl.searchParams.append('scope', scopes.join(' '));
    authUrl.searchParams.append('state', userId); // Pass userId to identify teacher after redirect

    return authUrl.toString();
  },

  /**
   * Exchange authorization code for access and refresh tokens
   * @param code Authorization code from OAuth callback
   */
  async exchangeCodeForTokens(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    scope: string;
  }> {
    try {
      const tokenUrl = `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;

      const params = new URLSearchParams();
      params.append('client_id', env.MICROSOFT_CLIENT_ID!);
      params.append('client_secret', env.MICROSOFT_CLIENT_SECRET!);
      params.append('code', code);
      params.append('redirect_uri', env.MICROSOFT_REDIRECT_URI!);
      params.append('grant_type', 'authorization_code');

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error('Failed to exchange code for tokens', { error });
        throw new AppError(500, 'Failed to authenticate with Microsoft Teams');
      }

      const data = await response.json() as { access_token: string; refresh_token: string; expires_in: number; scope: string };

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        scope: data.scope,
      };
    } catch (error) {
      logger.error('Error exchanging code for tokens', { error });
      throw new AppError(500, 'Failed to complete Microsoft Teams authentication');
    }
  },

  /**
   * Refresh expired access token using refresh token
   * @param refreshToken User's refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    try {
      const tokenUrl = `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID!}/oauth2/v2.0/token`;

      const params = new URLSearchParams();
      params.append('client_id', env.MICROSOFT_CLIENT_ID!);
      params.append('client_secret', env.MICROSOFT_CLIENT_SECRET!);
      params.append('refresh_token', refreshToken);
      params.append('grant_type', 'refresh_token');

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error('Failed to refresh access token', { error });
        throw new AppError(401, 'Microsoft Teams authentication expired. Please reconnect.');
      }

      const data = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken, // Some responses don't include new refresh token
        expiresIn: data.expires_in,
      };
    } catch (error) {
      logger.error('Error refreshing access token', { error });
      throw new AppError(401, 'Failed to refresh Microsoft Teams authentication');
    }
  },

  /**
   * Create a Teams online meeting
   * @param accessToken User's access token
   * @param subject Meeting subject/title
   * @param startTime Meeting start time (ISO 8601)
   * @param endTime Meeting end time (ISO 8601)
   */
  async createTeamsMeeting(
    accessToken: string,
    subject: string,
    startTime: string,
    endTime: string
  ): Promise<{
    meetingId: string;
    joinUrl: string;
  }> {
    try {
      const client = this.getClientWithUserToken(accessToken);

      const meeting = {
        subject,
        startDateTime: startTime,
        endDateTime: endTime,
        participants: {
          attendees: [],
        },
        lobbyBypassSettings: {
          scope: 'everyone',
          isDialInBypassEnabled: true,
        },
      };

      const response = await client.api('/me/onlineMeetings').post(meeting);

      return {
        meetingId: response.id,
        joinUrl: response.joinWebUrl,
      };
    } catch (error: any) {
      logger.error('Error creating Teams meeting', { error: error.message });
      throw new AppError(500, 'Failed to create Microsoft Teams meeting');
    }
  },

  /**
   * Get attendance report for a Teams meeting
   * @param accessToken User's access token
   * @param meetingId Teams meeting ID
   */
  async updateMeetingLobbySettings(
    accessToken: string,
    meetingId: string
  ): Promise<void> {
    try {
      const client = this.getClientWithUserToken(accessToken);
      await client.api(`/me/onlineMeetings/${meetingId}`).patch({
        lobbyBypassSettings: {
          scope: 'everyone',
          isDialInBypassEnabled: true,
        },
      });
    } catch (error: any) {
      logger.error('Error updating Teams meeting lobby settings', { meetingId, error: error.message });
      throw new AppError(500, `Failed to update lobby settings for meeting ${meetingId}`);
    }
  },

  async getMeetingAttendanceReport(
    accessToken: string,
    meetingId: string
  ): Promise<{
    participants: Array<{
      id: string;
      email: string;
      displayName: string;
      joinedAt: string;
      leftAt: string;
      durationInSeconds: number;
    }>;
  }> {
    try {
      const client = this.getClientWithUserToken(accessToken);

      // First, get the attendance reports for the meeting
      const reportsResponse = await client
        .api(`/me/onlineMeetings/${meetingId}/attendanceReports`)
        .get();

      if (!reportsResponse.value || reportsResponse.value.length === 0) {
        logger.warn('No attendance reports found for meeting', { meetingId });
        return { participants: [] };
      }

      // Get the most recent report (usually there's only one)
      const reportId = reportsResponse.value[0].id;

      // Get attendance records from the report
      const recordsResponse = await client
        .api(`/me/onlineMeetings/${meetingId}/attendanceReports/${reportId}/attendanceRecords`)
        .get();

      const participants = recordsResponse.value.map((record: any) => {
        // Join/leave times are in attendanceIntervals array
        const intervals = record.attendanceIntervals || [];
        const firstJoin = intervals.length > 0 ? intervals[0].joinDateTime : null;
        const lastLeave = intervals.length > 0 ? intervals[intervals.length - 1].leaveDateTime : null;

        return {
          id: record.identity?.id || '',
          email: record.emailAddress || '',
          displayName: record.identity?.displayName || '',
          joinedAt: firstJoin,
          leftAt: lastLeave,
          durationInSeconds: record.totalAttendanceInSeconds || 0,
        };
      });

      return { participants };
    } catch (error: any) {
      logger.error('Error fetching attendance report', {
        error: error.message,
        meetingId,
      });
      throw new AppError(500, 'Failed to fetch attendance from Microsoft Teams');
    }
  },

  /**
   * Extract meeting ID from Teams meeting URL
   * @param url Teams meeting URL
   */
  parseMeetingUrl(url: string): string | null {
    try {
      // Teams URLs typically contain the meeting ID in various formats
      // Example: https://teams.microsoft.com/l/meetup-join/...
      const urlObj = new URL(url);

      // Try to extract from thread ID parameter
      const threadId = urlObj.searchParams.get('threadId');
      if (threadId) {
        return threadId;
      }

      // Try to extract from message ID
      const messageId = urlObj.searchParams.get('messageId');
      if (messageId) {
        return messageId;
      }

      // If URL format is different, return null
      // In practice, we'll store the full URL and use it directly
      return null;
    } catch (error) {
      logger.error('Error parsing Teams meeting URL', { url, error });
      return null;
    }
  },

  /**
   * Get user profile from Microsoft Graph
   * @param accessToken User's access token
   */
  async getUserProfile(accessToken: string): Promise<{
    email: string;
    displayName: string;
  }> {
    try {
      const client = this.getClientWithUserToken(accessToken);

      const user = await client.api('/me').get();

      return {
        email: user.userPrincipalName || user.mail,
        displayName: user.displayName,
      };
    } catch (error: any) {
      logger.error('Error fetching user profile', { error: error.message });
      throw new AppError(500, 'Failed to fetch Microsoft user profile');
    }
  },

  /**
   * Get Teams meeting details and state
   * @param accessToken User's access token
   * @param meetingId Teams meeting ID
   */
  async getMeetingState(
    accessToken: string,
    meetingId: string
  ): Promise<{
    id: string;
    subject: string;
    startDateTime: string;
    endDateTime: string;
    joinUrl: string;
    participants: {
      organizer: { displayName: string; email: string } | null;
      attendees: Array<{ displayName: string; email: string }>;
    };
    rawResponse: any;
  }> {
    try {
      const client = this.getClientWithUserToken(accessToken);

      const meeting = await client.api(`/me/onlineMeetings/${meetingId}`).get();

      return {
        id: meeting.id,
        subject: meeting.subject,
        startDateTime: meeting.startDateTime,
        endDateTime: meeting.endDateTime,
        joinUrl: meeting.joinWebUrl,
        participants: {
          organizer: meeting.participants?.organizer?.identity?.user
            ? {
                displayName: meeting.participants.organizer.identity.user.displayName || '',
                email: meeting.participants.organizer.upn || '',
              }
            : null,
          attendees: (meeting.participants?.attendees || []).map((a: any) => ({
            displayName: a.identity?.user?.displayName || '',
            email: a.upn || '',
          })),
        },
        rawResponse: meeting,
      };
    } catch (error: any) {
      logger.error('Error fetching meeting state', {
        error: error.message,
        meetingId,
        code: error.code,
        statusCode: error.statusCode,
      });
      throw new AppError(500, `Failed to fetch Teams meeting state: ${error.message}`);
    }
  },
};

export default microsoftGraphService;
