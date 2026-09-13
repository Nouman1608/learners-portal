import { db } from '../config/database';
import { leadMessages, messageTemplates, leads } from '../db/schema';
import { eq, and, desc, lte, sql } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import whatsappService from './whatsapp.service';
import leadsService from './leads.service';

export interface SendMessageInput {
  leadId: string;
  templateId?: string;
  messageType: 're_engagement' | 'course_info' | 'follow_up' | 'ad_hoc';
  messageContent?: string; // For ad-hoc messages or filled template
  templateName?: string; // WhatsApp template name
  templateLanguage?: string;
  templateParameters?: string[];
  scheduledFor?: Date | null;
  sentBy: string;
}

export interface CreateMessageTemplateInput {
  name: string;
  templateType: 're_engagement' | 'course_info' | 'follow_up' | 'reminder';
  whatsappTemplateName?: string;
  whatsappTemplateLanguage?: string;
  subject?: string;
  body: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  isActive?: boolean;
  createdBy: string;
}

export interface UpdateMessageTemplateInput {
  name?: string;
  templateType?: 're_engagement' | 'course_info' | 'follow_up' | 'reminder';
  whatsappTemplateName?: string;
  whatsappTemplateLanguage?: string;
  subject?: string;
  body?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  isActive?: boolean;
}

export const messagesService = {
  /**
   * Send a message to a single lead
   */
  async sendMessage(input: SendMessageInput) {
    try {
      // Verify lead exists and is not opted out
      const lead = await leadsService.getLeadById(input.leadId);

      if (lead.optedOut) {
        throw new AppError(400, 'Cannot send message to opted-out lead');
      }

      let whatsappMessageId: string | null = null;
      let deliveryStatus: 'pending' | 'sent' | 'failed' = 'pending';
      let errorMessage: string | null = null;

      // If scheduled for future, don't send immediately
      const shouldSendNow = !input.scheduledFor || new Date(input.scheduledFor) <= new Date();

      if (shouldSendNow) {
        try {
          // Send via WhatsApp
          if (input.templateName) {
            // Send template message
            whatsappMessageId = await whatsappService.sendTemplateMessage(
              lead.phone,
              input.templateName,
              input.templateLanguage || 'en',
              input.templateParameters || []
            );
          } else {
            // Send text message (ad-hoc)
            if (!input.messageContent) {
              throw new AppError(400, 'Message content is required for ad-hoc messages');
            }
            whatsappMessageId = await whatsappService.sendTextMessage(lead.phone, input.messageContent);
          }

          deliveryStatus = 'sent';
          logger.info('WhatsApp message sent successfully', {
            leadId: input.leadId,
            whatsappMessageId,
            messageType: input.messageType,
          });
        } catch (error: any) {
          // Message send failed
          deliveryStatus = 'failed';
          errorMessage = error.message;
          logger.error('Failed to send WhatsApp message', {
            leadId: input.leadId,
            error: error.message,
          });
        }
      }

      // Create message record
      const [message] = await db
        .insert(leadMessages)
        .values({
          leadId: input.leadId,
          templateId: input.templateId || null,
          messageType: input.messageType,
          messageContent: input.messageContent || '',
          whatsappMessageId: whatsappMessageId || null,
          deliveryStatus,
          scheduledFor: input.scheduledFor || null,
          sentAt: shouldSendNow && deliveryStatus === 'sent' ? new Date() : null,
          errorMessage,
          sentBy: input.sentBy,
        })
        .returning();

      logger.info('Message record created', {
        messageId: message.id,
        leadId: input.leadId,
        deliveryStatus,
        scheduledFor: input.scheduledFor,
      });

      return message;
    } catch (error: any) {
      logger.error('Error sending message', { error: error.message, input });
      throw error;
    }
  },

  /**
   * Send bulk messages to multiple leads
   */
  async sendBulkMessages(
    leadIds: string[],
    templateId: string,
    templateName: string,
    templateLanguage: string,
    templateParameters: string[],
    messageType: 're_engagement' | 'course_info' | 'follow_up' | 'ad_hoc',
    messageContent: string,
    scheduledFor: Date | null,
    sentBy: string
  ) {
    try {
      const results = {
        success: 0,
        failed: 0,
        errors: [] as any[],
      };

      for (const leadId of leadIds) {
        try {
          await this.sendMessage({
            leadId,
            templateId,
            messageType,
            messageContent,
            templateName,
            templateLanguage,
            templateParameters,
            scheduledFor,
            sentBy,
          });
          results.success++;
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            leadId,
            error: error.message,
          });
          logger.error('Failed to send bulk message to lead', { leadId, error: error.message });
        }
      }

      logger.info('Bulk message operation completed', {
        totalLeads: leadIds.length,
        success: results.success,
        failed: results.failed,
      });

      return results;
    } catch (error: any) {
      logger.error('Error sending bulk messages', { error: error.message, leadIds });
      throw new AppError(500, 'Failed to send bulk messages');
    }
  },

  /**
   * Schedule a message for later delivery
   */
  async scheduleMessage(input: SendMessageInput) {
    if (!input.scheduledFor) {
      throw new AppError(400, 'Scheduled time is required');
    }

    const scheduledTime = new Date(input.scheduledFor);
    if (scheduledTime <= new Date()) {
      throw new AppError(400, 'Scheduled time must be in the future');
    }

    return await this.sendMessage(input);
  },

  /**
   * Process pending scheduled messages (for cron job)
   */
  async processPendingScheduledMessages() {
    try {
      const now = new Date();

      // Find pending scheduled messages due for sending
      const pendingMessages = await db
        .select()
        .from(leadMessages)
        .where(and(eq(leadMessages.deliveryStatus, 'pending'), lte(leadMessages.scheduledFor, now)))
        .limit(100); // Process in batches

      logger.info('Processing pending scheduled messages', {
        count: pendingMessages.length,
      });

      let processed = 0;
      let failed = 0;

      for (const message of pendingMessages) {
        try {
          // Get lead info
          const lead = await leadsService.getLeadById(message.leadId);

          // Skip if opted out
          if (lead.optedOut) {
            await db
              .update(leadMessages)
              .set({
                deliveryStatus: 'failed',
                errorMessage: 'Lead has opted out',
              })
              .where(eq(leadMessages.id, message.id));
            failed++;
            continue;
          }

          // Send message via WhatsApp
          let whatsappMessageId: string;
          try {
            whatsappMessageId = await whatsappService.sendTextMessage(lead.phone, message.messageContent);

            await db
              .update(leadMessages)
              .set({
                deliveryStatus: 'sent',
                whatsappMessageId,
                sentAt: new Date(),
              })
              .where(eq(leadMessages.id, message.id));

            processed++;
            logger.info('Scheduled message sent successfully', {
              messageId: message.id,
              leadId: message.leadId,
              whatsappMessageId,
            });
          } catch (error: any) {
            // Update as failed
            await db
              .update(leadMessages)
              .set({
                deliveryStatus: 'failed',
                errorMessage: error.message,
                retryCount: sql`${leadMessages.retryCount} + 1`,
              })
              .where(eq(leadMessages.id, message.id));

            failed++;
            logger.error('Failed to send scheduled message', {
              messageId: message.id,
              leadId: message.leadId,
              error: error.message,
            });
          }
        } catch (error: any) {
          failed++;
          logger.error('Error processing scheduled message', {
            messageId: message.id,
            error: error.message,
          });
        }
      }

      logger.info('Scheduled messages processing completed', {
        total: pendingMessages.length,
        processed,
        failed,
      });

      return { total: pendingMessages.length, processed, failed };
    } catch (error: any) {
      logger.error('Error processing pending scheduled messages', { error: error.message });
      throw new AppError(500, 'Failed to process scheduled messages');
    }
  },

  /**
   * Create a message template
   */
  async createMessageTemplate(input: CreateMessageTemplateInput) {
    try {
      // Check if template name already exists
      const [existing] = await db
        .select()
        .from(messageTemplates)
        .where(eq(messageTemplates.name, input.name))
        .limit(1);

      if (existing) {
        throw new AppError(400, 'A template with this name already exists');
      }

      const [template] = await db
        .insert(messageTemplates)
        .values({
          name: input.name,
          templateType: input.templateType,
          whatsappTemplateName: input.whatsappTemplateName || null,
          whatsappTemplateLanguage: input.whatsappTemplateLanguage || 'en',
          subject: input.subject || null,
          body: input.body,
          approvalStatus: input.approvalStatus || 'pending',
          isActive: input.isActive ?? true,
          createdBy: input.createdBy,
        })
        .returning();

      logger.info('Message template created', {
        templateId: template.id,
        name: template.name,
        templateType: template.templateType,
      });

      return template;
    } catch (error: any) {
      logger.error('Error creating message template', { error: error.message, input });
      throw error;
    }
  },

  /**
   * Get all message templates
   */
  async getMessageTemplates(activeOnly: boolean = false) {
    try {
      const templates = activeOnly
        ? await db.select().from(messageTemplates).where(eq(messageTemplates.isActive, true)).orderBy(desc(messageTemplates.createdAt))
        : await db.select().from(messageTemplates).orderBy(desc(messageTemplates.createdAt));

      return templates;
    } catch (error: any) {
      logger.error('Error getting message templates', { error: error.message });
      throw new AppError(500, 'Failed to retrieve message templates');
    }
  },

  /**
   * Get a single template by ID
   */
  async getMessageTemplateById(templateId: string) {
    try {
      const [template] = await db
        .select()
        .from(messageTemplates)
        .where(eq(messageTemplates.id, templateId))
        .limit(1);

      if (!template) {
        throw new AppError(404, 'Message template not found');
      }

      return template;
    } catch (error: any) {
      logger.error('Error getting message template', { error: error.message, templateId });
      throw error;
    }
  },

  /**
   * Update a message template
   */
  async updateMessageTemplate(templateId: string, input: UpdateMessageTemplateInput) {
    try {
      // Verify template exists
      await this.getMessageTemplateById(templateId);

      const updateData: any = {
        updatedAt: new Date(),
      };

      // Check if new name conflicts with another template
      if (input.name) {
        const [existing] = await db
          .select()
          .from(messageTemplates)
          .where(and(eq(messageTemplates.name, input.name), sql`${messageTemplates.id} != ${templateId}`))
          .limit(1);

        if (existing) {
          throw new AppError(400, 'A template with this name already exists');
        }
        updateData.name = input.name;
      }

      // Update other fields ('' clears the nullable ones)
      if (input.templateType !== undefined) updateData.templateType = input.templateType;
      if (input.whatsappTemplateName !== undefined) updateData.whatsappTemplateName = input.whatsappTemplateName || null;
      if (input.whatsappTemplateLanguage !== undefined)
        updateData.whatsappTemplateLanguage = input.whatsappTemplateLanguage;
      if (input.subject !== undefined) updateData.subject = input.subject || null;
      if (input.body !== undefined) updateData.body = input.body;
      if (input.approvalStatus !== undefined) updateData.approvalStatus = input.approvalStatus;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;

      const [updatedTemplate] = await db
        .update(messageTemplates)
        .set(updateData)
        .where(eq(messageTemplates.id, templateId))
        .returning();

      logger.info('Message template updated', {
        templateId,
        updates: Object.keys(updateData),
      });

      return updatedTemplate;
    } catch (error: any) {
      logger.error('Error updating message template', { error: error.message, templateId, input });
      throw error;
    }
  },

  /**
   * Delete a message template
   */
  async deleteMessageTemplate(templateId: string) {
    try {
      const [deletedTemplate] = await db
        .delete(messageTemplates)
        .where(eq(messageTemplates.id, templateId))
        .returning();

      if (!deletedTemplate) {
        throw new AppError(404, 'Message template not found');
      }

      logger.info('Message template deleted', {
        templateId,
        name: deletedTemplate.name,
      });

      return deletedTemplate;
    } catch (error: any) {
      logger.error('Error deleting message template', { error: error.message, templateId });
      throw error;
    }
  },

  /**
   * Get message history for a lead
   */
  async getMessageHistory(leadId: string) {
    try {
      const messages = await db
        .select()
        .from(leadMessages)
        .where(eq(leadMessages.leadId, leadId))
        .orderBy(desc(leadMessages.createdAt));

      return messages;
    } catch (error: any) {
      logger.error('Error getting message history', { error: error.message, leadId });
      throw new AppError(500, 'Failed to retrieve message history');
    }
  },

  /**
   * Get message statistics
   */
  async getMessageStats() {
    try {
      const stats = await db
        .select({
          total: sql<number>`count(*)`,
          sent: sql<number>`count(*) filter (where ${leadMessages.deliveryStatus} = 'sent')`,
          delivered: sql<number>`count(*) filter (where ${leadMessages.deliveryStatus} = 'delivered')`,
          read: sql<number>`count(*) filter (where ${leadMessages.deliveryStatus} = 'read')`,
          failed: sql<number>`count(*) filter (where ${leadMessages.deliveryStatus} = 'failed')`,
          pending: sql<number>`count(*) filter (where ${leadMessages.deliveryStatus} = 'pending')`,
        })
        .from(leadMessages);

      return stats[0];
    } catch (error: any) {
      logger.error('Error getting message stats', { error: error.message });
      throw new AppError(500, 'Failed to retrieve message statistics');
    }
  },
};

export default messagesService;
