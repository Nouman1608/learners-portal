import crypto from 'crypto';
import { db } from '../config/database';
import { teamsOAuth } from '../db/schema/attendance';
import { eq } from 'drizzle-orm';
import env from '../config/env';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import microsoftGraphService from './microsoft-graph.service';

/**
 * Teams OAuth Service
 * Manages encrypted storage and retrieval of Microsoft Teams OAuth credentials
 */
export const teamsOAuthService = {
  /**
   * Encrypt a string using AES-256-GCM
   * @param text Plain text to encrypt
   */
  encrypt(text: string): string {
    if (!env.OAUTH_ENCRYPTION_KEY) {
      throw new AppError(500, 'OAuth encryption key not configured');
    }

    // Validate input
    if (typeof text !== 'string') {
      logger.error('encrypt() received non-string input', { type: typeof text, value: text });
      throw new TypeError(`encrypt() requires a string, got ${typeof text}`);
    }

    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(env.OAUTH_ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  },

  /**
   * Decrypt a string encrypted with AES-256-GCM
   * @param encryptedText Encrypted text with format iv:authTag:encryptedData
   */
  decrypt(encryptedText: string): string {
    if (!env.OAUTH_ENCRYPTION_KEY) {
      throw new AppError(500, 'OAuth encryption key not configured');
    }

    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(env.OAUTH_ENCRYPTION_KEY, 'hex');

    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new AppError(500, 'Invalid encrypted token format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  },

  /**
   * Store Teams OAuth credentials for a user
   * @param userId User ID
   * @param accessToken OAuth access token
   * @param refreshToken OAuth refresh token
   * @param expiresIn Token expiration time in seconds
   * @param scope OAuth scopes granted
   */
  async storeTeamsCredentials(
    userId: string,
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    scope: string
  ): Promise<void> {
    try {
      // Validate all required parameters
      if (!accessToken || typeof accessToken !== 'string') {
        logger.error('Invalid accessToken parameter', { type: typeof accessToken, value: accessToken });
        throw new Error('Invalid accessToken: must be a non-empty string');
      }
      if (!refreshToken || typeof refreshToken !== 'string') {
        logger.error('Invalid refreshToken parameter', { type: typeof refreshToken, value: refreshToken });
        throw new Error('Invalid refreshToken: must be a non-empty string');
      }
      if (!expiresIn || typeof expiresIn !== 'number') {
        logger.error('Invalid expiresIn parameter', { type: typeof expiresIn, value: expiresIn });
        throw new Error('Invalid expiresIn: must be a number');
      }
      if (!scope || typeof scope !== 'string') {
        logger.error('Invalid scope parameter', { type: typeof scope, value: scope });
        throw new Error('Invalid scope: must be a non-empty string');
      }

      const encryptedAccessToken = this.encrypt(accessToken);
      const encryptedRefreshToken = this.encrypt(refreshToken);
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      // Check if credentials already exist
      const [existing] = await db
        .select()
        .from(teamsOAuth)
        .where(eq(teamsOAuth.userId, userId));

      if (existing) {
        // Update existing credentials
        await db
          .update(teamsOAuth)
          .set({
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            expiresAt,
            scope,
            updatedAt: new Date(),
          })
          .where(eq(teamsOAuth.userId, userId));

        logger.info('Updated Teams OAuth credentials', { userId });
      } else {
        // Insert new credentials
        await db.insert(teamsOAuth).values({
          userId,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt,
          scope,
        });

        logger.info('Stored Teams OAuth credentials', { userId });
      }
    } catch (error: any) {
      logger.error('Error storing Teams OAuth credentials', {
        userId,
        error: error.message,
        stack: error.stack,
        code: error.code,
        detail: error.detail,
        constraint: error.constraint,
      });
      throw new AppError(500, 'Failed to store Microsoft Teams credentials');
    }
  },

  /**
   * Get Teams OAuth credentials for a user (decrypted)
   * @param userId User ID
   */
  async getTeamsCredentials(
    userId: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    scope: string;
  } | null> {
    try {
      const [credentials] = await db
        .select()
        .from(teamsOAuth)
        .where(eq(teamsOAuth.userId, userId));

      if (!credentials) {
        return null;
      }

      const accessToken = this.decrypt(credentials.accessToken);
      const refreshToken = this.decrypt(credentials.refreshToken);

      return {
        accessToken,
        refreshToken,
        expiresAt: credentials.expiresAt,
        scope: credentials.scope,
      };
    } catch (error) {
      logger.error('Error getting Teams OAuth credentials', { userId, error });
      throw new AppError(500, 'Failed to retrieve Microsoft Teams credentials');
    }
  },

  /**
   * Check if user has valid Teams OAuth connection
   * @param userId User ID
   */
  async isTeamsConnected(userId: string): Promise<boolean> {
    try {
      const [credentials] = await db
        .select()
        .from(teamsOAuth)
        .where(eq(teamsOAuth.userId, userId));

      return !!credentials;
    } catch (error) {
      logger.error('Error checking Teams connection status', { userId, error });
      return false;
    }
  },

  /**
   * Revoke Teams OAuth connection for a user
   * @param userId User ID
   */
  async revokeTeamsConnection(userId: string): Promise<void> {
    try {
      await db.delete(teamsOAuth).where(eq(teamsOAuth.userId, userId));
      logger.info('Revoked Teams OAuth connection', { userId });
    } catch (error) {
      logger.error('Error revoking Teams connection', { userId, error });
      throw new AppError(500, 'Failed to disconnect Microsoft Teams');
    }
  },

  /**
   * Ensure user has a valid access token, refreshing if expired
   * @param userId User ID
   * @returns Valid access token
   */
  async ensureValidToken(userId: string): Promise<string> {
    try {
      const credentials = await this.getTeamsCredentials(userId);

      if (!credentials) {
        throw new AppError(401, 'Microsoft Teams not connected. Please connect your account.');
      }

      // Check if token is expired (with 5-minute buffer)
      const now = new Date();
      const expiryBuffer = new Date(credentials.expiresAt.getTime() - 5 * 60 * 1000);

      if (now < expiryBuffer) {
        // Token is still valid
        return credentials.accessToken;
      }

      // Token is expired or about to expire, refresh it
      logger.info('Refreshing expired Teams access token', { userId });

      const refreshed = await microsoftGraphService.refreshAccessToken(credentials.refreshToken);

      // Store new tokens
      await this.storeTeamsCredentials(
        userId,
        refreshed.accessToken,
        refreshed.refreshToken,
        refreshed.expiresIn,
        credentials.scope
      );

      return refreshed.accessToken;
    } catch (error: any) {
      logger.error('Error ensuring valid token', { userId, error: error.message });

      if (error.statusCode === 401) {
        // Refresh token is invalid, revoke connection
        await this.revokeTeamsConnection(userId);
        throw new AppError(401, 'Microsoft Teams authentication expired. Please reconnect your account.');
      }

      throw error;
    }
  },
};

export default teamsOAuthService;
