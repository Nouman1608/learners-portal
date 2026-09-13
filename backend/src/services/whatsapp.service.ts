import crypto from 'crypto';
import axios from 'axios';
import { db } from '../config/database';
import { whatsappCredentials, leadMessages } from '../db/schema/leads';
import { eq } from 'drizzle-orm';
import env from '../config/env';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

/**
 * WhatsApp Service
 * Manages encrypted storage of Meta Cloud API credentials and WhatsApp message operations
 */
export const whatsappService = {
  /**
   * Encrypt a string using AES-256-GCM
   * @param text Plain text to encrypt
   */
  encrypt(text: string): string {
    if (!env.OAUTH_ENCRYPTION_KEY) {
      throw new AppError(500, 'OAuth encryption key not configured');
    }

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
   * Validate and normalize phone number to international format
   * @param phone Phone number to validate
   * @returns Normalized phone number with + prefix
   */
  validatePhoneNumber(phone: string): string {
    // Remove all non-digit characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // If doesn't start with +, assume Pakistan number and add +92
    if (!cleaned.startsWith('+')) {
      // Remove leading 0 if present (local Pakistan format)
      if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
      }
      cleaned = `+92${cleaned}`;
    }

    // Validate: must start with + followed by 7-15 digits (E.164 format)
    const phoneRegex = /^\+\d{7,15}$/;
    if (!phoneRegex.test(cleaned)) {
      throw new AppError(400, 'Invalid phone number format. Use international format with country code (e.g., +923001234567, +447911123456)');
    }

    return cleaned;
  },

  /**
   * Store WhatsApp Business API credentials
   * @param accessToken Meta Cloud API access token (permanent)
   * @param phoneNumberId WhatsApp Business Phone Number ID
   * @param businessAccountId Meta Business Account ID
   * @param webhookVerifyToken Token for webhook verification
   * @param createdBy User ID who created the credentials
   */
  async storeCredentials(
    accessToken: string,
    phoneNumberId: string,
    businessAccountId: string,
    webhookVerifyToken: string,
    createdBy: string
  ): Promise<void> {
    try {
      // Validate parameters
      if (!accessToken || typeof accessToken !== 'string') {
        throw new AppError(400, 'Invalid access token: must be a non-empty string');
      }
      if (!phoneNumberId || typeof phoneNumberId !== 'string') {
        throw new AppError(400, 'Invalid phone number ID: must be a non-empty string');
      }
      if (!businessAccountId || typeof businessAccountId !== 'string') {
        throw new AppError(400, 'Invalid business account ID: must be a non-empty string');
      }
      if (!webhookVerifyToken || typeof webhookVerifyToken !== 'string') {
        throw new AppError(400, 'Invalid webhook verify token: must be a non-empty string');
      }

      const encryptedAccessToken = this.encrypt(accessToken);
      const encryptedWebhookToken = this.encrypt(webhookVerifyToken);

      // Deactivate all existing credentials
      await db
        .update(whatsappCredentials)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(whatsappCredentials.isActive, true));

      // Insert new active credentials
      await db.insert(whatsappCredentials).values({
        accessToken: encryptedAccessToken,
        phoneNumberId,
        businessAccountId,
        webhookVerifyToken: encryptedWebhookToken,
        isActive: true,
        createdBy,
      });

      logger.info('Stored WhatsApp Business API credentials', { phoneNumberId, businessAccountId });
    } catch (error: any) {
      logger.error('Error storing WhatsApp credentials', {
        error: error.message,
        stack: error.stack,
      });
      throw new AppError(500, 'Failed to store WhatsApp credentials');
    }
  },

  /**
   * Get active WhatsApp credentials (decrypted)
   * @returns Decrypted credentials or null if not configured
   */
  async getCredentials(): Promise<{
    accessToken: string;
    phoneNumberId: string;
    businessAccountId: string;
    webhookVerifyToken: string;
  } | null> {
    try {
      const [credentials] = await db
        .select()
        .from(whatsappCredentials)
        .where(eq(whatsappCredentials.isActive, true))
        .limit(1);

      if (!credentials) {
        return null;
      }

      const accessToken = this.decrypt(credentials.accessToken);
      const webhookVerifyToken = this.decrypt(credentials.webhookVerifyToken || '');

      return {
        accessToken,
        phoneNumberId: credentials.phoneNumberId,
        businessAccountId: credentials.businessAccountId,
        webhookVerifyToken,
      };
    } catch (error) {
      logger.error('Error getting WhatsApp credentials', { error });
      throw new AppError(500, 'Failed to retrieve WhatsApp credentials');
    }
  },

  /**
   * Check if WhatsApp is configured
   */
  async isConfigured(): Promise<boolean> {
    try {
      const credentials = await this.getCredentials();
      return credentials !== null;
    } catch (error) {
      logger.error('Error checking WhatsApp configuration', { error });
      return false;
    }
  },

  /**
   * Send a template message via WhatsApp Business API
   * @param to Phone number in international format (+92XXXXXXXXXX)
   * @param templateName WhatsApp-approved template name
   * @param templateLanguage Template language code (default: 'en')
   * @param parameters Template parameters array (for {{1}}, {{2}}, etc.)
   * @returns WhatsApp message ID
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    templateLanguage: string = 'en',
    parameters: string[] = []
  ): Promise<string> {
    try {
      const credentials = await this.getCredentials();
      if (!credentials) {
        throw new AppError(500, 'WhatsApp not configured. Please configure WhatsApp credentials first.');
      }

      // Validate and normalize phone number
      const normalizedPhone = this.validatePhoneNumber(to);

      // Remove + prefix for WhatsApp API (it expects numbers without +)
      const phoneForApi = normalizedPhone.substring(1);

      // Build template component with parameters
      const components = [];
      if (parameters.length > 0) {
        components.push({
          type: 'body',
          parameters: parameters.map((param) => ({
            type: 'text',
            text: param,
          })),
        });
      }

      // Meta Cloud API endpoint
      const apiUrl = `https://graph.facebook.com/v18.0/${credentials.phoneNumberId}/messages`;

      const payload = {
        messaging_product: 'whatsapp',
        to: phoneForApi,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: templateLanguage,
          },
          ...(components.length > 0 && { components }),
        },
      };

      logger.info('Sending WhatsApp template message', {
        to: normalizedPhone,
        templateName,
        templateLanguage,
        parametersCount: parameters.length,
      });

      const response = await axios.post(apiUrl, payload, {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const messageId = response.data.messages[0].id;

      logger.info('WhatsApp template message sent successfully', {
        to: normalizedPhone,
        messageId,
        templateName,
      });

      return messageId;
    } catch (error: any) {
      logger.error('Error sending WhatsApp template message', {
        to,
        templateName,
        error: error.message,
        response: error.response?.data,
      });

      if (error.response?.data?.error) {
        const whatsappError = error.response.data.error;
        throw new AppError(
          error.response.status || 500,
          `WhatsApp API Error: ${whatsappError.message || 'Failed to send message'}`
        );
      }

      throw new AppError(500, 'Failed to send WhatsApp message');
    }
  },

  /**
   * Send a text message via WhatsApp Business API (ad-hoc, no template)
   * Note: This requires WhatsApp Business API approval for text messaging
   * @param to Phone number in international format (+92XXXXXXXXXX)
   * @param message Text message content
   * @returns WhatsApp message ID
   */
  async sendTextMessage(to: string, message: string): Promise<string> {
    try {
      const credentials = await this.getCredentials();
      if (!credentials) {
        throw new AppError(500, 'WhatsApp not configured. Please configure WhatsApp credentials first.');
      }

      // Validate and normalize phone number
      const normalizedPhone = this.validatePhoneNumber(to);

      // Remove + prefix for WhatsApp API
      const phoneForApi = normalizedPhone.substring(1);

      // Meta Cloud API endpoint
      const apiUrl = `https://graph.facebook.com/v18.0/${credentials.phoneNumberId}/messages`;

      const payload = {
        messaging_product: 'whatsapp',
        to: phoneForApi,
        type: 'text',
        text: {
          body: message,
        },
      };

      logger.info('Sending WhatsApp text message', {
        to: normalizedPhone,
        messageLength: message.length,
      });

      const response = await axios.post(apiUrl, payload, {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const messageId = response.data.messages[0].id;

      logger.info('WhatsApp text message sent successfully', {
        to: normalizedPhone,
        messageId,
      });

      return messageId;
    } catch (error: any) {
      logger.error('Error sending WhatsApp text message', {
        to,
        error: error.message,
        response: error.response?.data,
      });

      if (error.response?.data?.error) {
        const whatsappError = error.response.data.error;
        throw new AppError(
          error.response.status || 500,
          `WhatsApp API Error: ${whatsappError.message || 'Failed to send message'}`
        );
      }

      throw new AppError(500, 'Failed to send WhatsApp message');
    }
  },

  /**
   * Verify webhook request from Meta
   * @param mode Webhook mode
   * @param token Verification token from Meta
   * @param challenge Challenge string from Meta
   * @returns Challenge if verification succeeds
   */
  async verifyWebhook(mode: string, token: string, challenge: string): Promise<string> {
    try {
      const credentials = await this.getCredentials();
      if (!credentials) {
        throw new AppError(500, 'WhatsApp not configured');
      }

      if (mode === 'subscribe' && token === credentials.webhookVerifyToken) {
        logger.info('Webhook verified successfully');
        return challenge;
      }

      throw new AppError(403, 'Webhook verification failed');
    } catch (error) {
      logger.error('Error verifying webhook', { error });
      throw new AppError(403, 'Webhook verification failed');
    }
  },

  /**
   * Process incoming webhook events from WhatsApp
   * Updates message delivery status based on webhook notifications
   * @param webhookData Webhook payload from Meta
   */
  async processWebhook(webhookData: any): Promise<void> {
    try {
      logger.info('Processing WhatsApp webhook', { webhookData });

      // Webhook structure: { object, entry: [{ changes: [{ value: { statuses: [...] } }] }] }
      const entries = webhookData.entry || [];

      for (const entry of entries) {
        const changes = entry.changes || [];

        for (const change of changes) {
          const value = change.value;

          // Process message status updates
          if (value?.statuses) {
            for (const status of value.statuses) {
              await this.updateMessageStatus(status);
            }
          }

          // Process incoming messages (for opt-out handling, etc.)
          if (value?.messages) {
            for (const message of value.messages) {
              await this.handleIncomingMessage(message);
            }
          }
        }
      }

      logger.info('Webhook processing completed');
    } catch (error) {
      logger.error('Error processing webhook', { error, webhookData });
      // Don't throw - acknowledge webhook even if processing fails
    }
  },

  /**
   * Update message delivery status from webhook event
   * @param status Status object from webhook
   */
  async updateMessageStatus(status: any): Promise<void> {
    try {
      const { id: whatsappMessageId, status: deliveryStatus, timestamp } = status;

      if (!whatsappMessageId || !deliveryStatus) {
        logger.warn('Invalid status update - missing required fields', { status });
        return;
      }

      // Map WhatsApp status to our status values
      const statusMapping: { [key: string]: string } = {
        sent: 'sent',
        delivered: 'delivered',
        read: 'read',
        failed: 'failed',
      };

      const mappedStatus = statusMapping[deliveryStatus] || deliveryStatus;

      // Find message by WhatsApp message ID
      const [message] = await db
        .select()
        .from(leadMessages)
        .where(eq(leadMessages.whatsappMessageId, whatsappMessageId))
        .limit(1);

      if (!message) {
        logger.warn('Message not found for status update', { whatsappMessageId, deliveryStatus });
        return;
      }

      // Prepare update data
      const updateData: any = {
        deliveryStatus: mappedStatus,
      };

      // Set timestamp based on status
      const statusTime = new Date(parseInt(timestamp) * 1000);
      if (deliveryStatus === 'sent') {
        updateData.sentAt = statusTime;
      } else if (deliveryStatus === 'delivered') {
        updateData.deliveredAt = statusTime;
      } else if (deliveryStatus === 'read') {
        updateData.readAt = statusTime;
      }

      // Add error message if failed
      if (deliveryStatus === 'failed' && status.errors) {
        updateData.errorMessage = JSON.stringify(status.errors);
      }

      await db
        .update(leadMessages)
        .set(updateData)
        .where(eq(leadMessages.whatsappMessageId, whatsappMessageId));

      logger.info('Updated message status', {
        whatsappMessageId,
        deliveryStatus: mappedStatus,
      });
    } catch (error) {
      logger.error('Error updating message status', { error, status });
    }
  },

  /**
   * Handle incoming messages from webhook (e.g., opt-out requests)
   * @param message Message object from webhook
   */
  async handleIncomingMessage(message: any): Promise<void> {
    try {
      const { from, text, type } = message;

      if (type === 'text' && text?.body) {
        const messageText = text.body.toLowerCase().trim();

        // Check for opt-out keywords (STOP, UNSUBSCRIBE, etc.)
        const optOutKeywords = ['stop', 'unsubscribe', 'cancel', 'opt out', 'optout'];
        const isOptOut = optOutKeywords.some((keyword) => messageText.includes(keyword));

        if (isOptOut) {
          logger.info('Opt-out request received', { from, messageText });
          // TODO: Implement opt-out handling (update leads table)
          // This will be handled in the leads service
        }
      }
    } catch (error) {
      logger.error('Error handling incoming message', { error, message });
    }
  },
};

export default whatsappService;
