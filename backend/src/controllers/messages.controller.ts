import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { messagesService } from '../services/messages.service';
import { whatsappService } from '../services/whatsapp.service';

// Validation schemas
const sendMessageSchema = z.object({
  leadId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  messageType: z.enum(['re_engagement', 'course_info', 'follow_up', 'ad_hoc']),
  messageContent: z.string().max(4096).optional(),
  templateName: z.string().max(255).optional(),
  templateLanguage: z.string().max(10).optional(),
  templateParameters: z.array(z.string()).optional(),
  scheduledFor: z.string().datetime().optional(),
});

const sendBulkMessagesSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1),
  templateId: z.string().uuid(),
  templateName: z.string().max(255),
  templateLanguage: z.string().max(10).default('en'),
  templateParameters: z.array(z.string()).default([]),
  messageType: z.enum(['re_engagement', 'course_info', 'follow_up', 'ad_hoc']),
  messageContent: z.string().max(4096),
  scheduledFor: z.string().datetime().optional(),
});

const createMessageTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  templateType: z.enum(['re_engagement', 'course_info', 'follow_up', 'reminder']),
  whatsappTemplateName: z.string().max(255).optional(),
  whatsappTemplateLanguage: z.string().max(10).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(4096),
  approvalStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
  isActive: z.boolean().optional(),
});

const updateMessageTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  templateType: z.enum(['re_engagement', 'course_info', 'follow_up', 'reminder']).optional(),
  whatsappTemplateName: z.string().max(255).optional(),
  whatsappTemplateLanguage: z.string().max(10).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(4096).optional(),
  approvalStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
  isActive: z.boolean().optional(),
});

const storeWhatsAppCredentialsSchema = z.object({
  accessToken: z.string().min(1),
  phoneNumberId: z.string().min(1).max(255),
  businessAccountId: z.string().min(1).max(255),
  webhookVerifyToken: z.string().min(1).max(255),
});

/**
 * Send a message to a single lead
 * POST /api/messages/send
 * Access: sudo only
 */
export const sendMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = sendMessageSchema.parse(req.body);
    const message = await messagesService.sendMessage({
      ...validated,
      scheduledFor: validated.scheduledFor ? new Date(validated.scheduledFor) : null,
      sentBy: req.user!.id,
    });
    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
};

/**
 * Send bulk messages to multiple leads
 * POST /api/messages/send-bulk
 * Access: sudo only
 */
export const sendBulkMessages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = sendBulkMessagesSchema.parse(req.body);
    const results = await messagesService.sendBulkMessages(
      validated.leadIds,
      validated.templateId,
      validated.templateName,
      validated.templateLanguage,
      validated.templateParameters,
      validated.messageType,
      validated.messageContent,
      validated.scheduledFor ? new Date(validated.scheduledFor) : null,
      req.user!.id
    );
    res.status(201).json({ results });
  } catch (error) {
    next(error);
  }
};

/**
 * Schedule a message for later delivery
 * POST /api/messages/schedule
 * Access: sudo only
 */
export const scheduleMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = sendMessageSchema.parse(req.body);
    if (!validated.scheduledFor) {
      return res.status(400).json({ error: 'scheduledFor is required for scheduling messages' });
    }
    const message = await messagesService.scheduleMessage({
      ...validated,
      scheduledFor: new Date(validated.scheduledFor),
      sentBy: req.user!.id,
    });
    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
};

/**
 * Get message history for a lead
 * GET /api/messages/lead/:leadId
 * Access: sudo only
 */
export const getMessageHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const messages = await messagesService.getMessageHistory(req.params.leadId);
    res.json({ messages });
  } catch (error) {
    next(error);
  }
};

/**
 * Get message statistics
 * GET /api/messages/stats
 * Access: sudo only
 */
export const getMessageStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await messagesService.getMessageStats();
    res.json({ stats });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// MESSAGE TEMPLATES
// ============================================================================

/**
 * Get all message templates
 * GET /api/messages/templates
 * Access: sudo only
 */
export const getMessageTemplates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { activeOnly } = z.object({ activeOnly: z.string().optional() }).parse(req.query);
    const templates = await messagesService.getMessageTemplates(activeOnly === 'true');
    res.json({ templates });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single message template by ID
 * GET /api/messages/templates/:id
 * Access: sudo only
 */
export const getMessageTemplateById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await messagesService.getMessageTemplateById(req.params.id);
    res.json({ template });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a message template
 * POST /api/messages/templates
 * Access: sudo only
 */
export const createMessageTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createMessageTemplateSchema.parse(req.body);
    const template = await messagesService.createMessageTemplate({
      ...validated,
      createdBy: req.user!.id,
    });
    res.status(201).json({ template });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a message template
 * PUT /api/messages/templates/:id
 * Access: sudo only
 */
export const updateMessageTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = updateMessageTemplateSchema.parse(req.body);
    const template = await messagesService.updateMessageTemplate(req.params.id, validated);
    res.json({ template });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a message template
 * DELETE /api/messages/templates/:id
 * Access: sudo only
 */
export const deleteMessageTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await messagesService.deleteMessageTemplate(req.params.id);
    res.json({ message: 'Template deleted successfully', template });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// WHATSAPP CREDENTIALS
// ============================================================================

/**
 * Store WhatsApp Business API credentials
 * POST /api/messages/whatsapp-credentials
 * Access: sudo only
 */
export const storeWhatsAppCredentials = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = storeWhatsAppCredentialsSchema.parse(req.body);
    await whatsappService.storeCredentials(
      validated.accessToken,
      validated.phoneNumberId,
      validated.businessAccountId,
      validated.webhookVerifyToken,
      req.user!.id
    );
    res.json({ message: 'WhatsApp credentials stored successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Check if WhatsApp is configured
 * GET /api/messages/whatsapp-status
 * Access: sudo only
 */
export const getWhatsAppStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isConfigured = await whatsappService.isConfigured();
    res.json({ isConfigured });
  } catch (error) {
    next(error);
  }
};
