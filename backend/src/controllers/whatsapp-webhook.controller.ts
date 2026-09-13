import { Request, Response, NextFunction } from 'express';
import { whatsappService } from '../services/whatsapp.service';
import logger from '../utils/logger';

/**
 * Verify webhook request from Meta
 * GET /api/webhooks/whatsapp
 * Access: public (no auth)
 */
export const verifyWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;

    logger.info('Webhook verification request received', {
      mode,
      hasToken: !!token,
      hasChallenge: !!challenge,
    });

    if (!mode || !token || !challenge) {
      logger.warn('Webhook verification failed - missing parameters');
      return res.status(400).send('Bad Request');
    }

    const verifiedChallenge = await whatsappService.verifyWebhook(mode, token, challenge);
    res.status(200).send(verifiedChallenge);
  } catch (error: any) {
    logger.error('Webhook verification error', { error: error.message });
    res.status(403).send('Forbidden');
  }
};

/**
 * Handle incoming webhook events from WhatsApp
 * POST /api/webhooks/whatsapp
 * Access: public (no auth, verified via webhook token)
 */
export const handleWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('Webhook event received', {
      body: JSON.stringify(req.body),
    });

    // Process webhook asynchronously (don't block response)
    whatsappService.processWebhook(req.body).catch((error) => {
      logger.error('Error processing webhook', { error: error.message });
    });

    // Always acknowledge webhook immediately (required by Meta)
    res.status(200).send('OK');
  } catch (error: any) {
    logger.error('Webhook handling error', { error: error.message });
    // Still acknowledge even on error to prevent Meta from retrying
    res.status(200).send('OK');
  }
};
