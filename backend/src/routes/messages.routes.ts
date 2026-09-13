import { Router } from 'express';
import * as messagesController from '../controllers/messages.controller';
import { authenticate } from '../middleware/auth';
import { requireSudo } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';

const router = Router();

// All routes require authentication and sudo role
router.use(authenticate);
router.use(requireSudo);

// Message sending (sudo only)
router.post('/send', logActivity('send', 'message'), messagesController.sendMessage);
router.post('/send-bulk', logActivity('send-bulk', 'message'), messagesController.sendBulkMessages);
router.post('/schedule', logActivity('schedule', 'message'), messagesController.scheduleMessage);

// Message history and stats
router.get('/lead/:leadId', messagesController.getMessageHistory);
router.get('/stats', messagesController.getMessageStats);

// Message templates
router.get('/templates', messagesController.getMessageTemplates);
router.get('/templates/:id', messagesController.getMessageTemplateById);
router.post('/templates', logActivity('create', 'message-template'), messagesController.createMessageTemplate);
router.put('/templates/:id', logActivity('update', 'message-template'), messagesController.updateMessageTemplate);
router.delete('/templates/:id', logActivity('delete', 'message-template'), messagesController.deleteMessageTemplate);

// WhatsApp credentials management
router.post('/whatsapp-credentials', logActivity('store', 'whatsapp-credentials'), messagesController.storeWhatsAppCredentials);
router.get('/whatsapp-status', messagesController.getWhatsAppStatus);

export default router;
