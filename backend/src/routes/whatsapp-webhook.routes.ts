import { Router } from 'express';
import * as whatsappWebhookController from '../controllers/whatsapp-webhook.controller';

const router = Router();

// Webhook verification (GET) - Meta uses this to verify the webhook URL
router.get('/', whatsappWebhookController.verifyWebhook);

// Webhook events (POST) - Meta sends status updates and incoming messages here
router.post('/', whatsappWebhookController.handleWebhook);

export default router;
