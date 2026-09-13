import cron from 'node-cron';
import { messagesService } from '../services/messages.service';
import { leadsService } from '../services/leads.service';
import logger from '../utils/logger';

/**
 * Process pending scheduled WhatsApp messages
 * Runs HOURLY at :00 (on the hour, every hour)
 * Checks for messages scheduled for delivery and sends them via WhatsApp API
 */
export const hourlyScheduledMessageProcessor = cron.schedule('0 * * * *', async () => {
  try {
    logger.info('[CRON] Starting scheduled WhatsApp message processing');

    const result = await messagesService.processPendingScheduledMessages();

    logger.info(`[CRON] Scheduled message processing completed: ${result.processed} sent, ${result.failed} failed out of ${result.total} pending`);
  } catch (error: any) {
    logger.error('[CRON] Scheduled message processing failed:', error);
  }
}, {
  scheduled: false, // Don't start automatically, will be started manually
  timezone: 'Asia/Karachi', // Pakistan timezone
});

/**
 * Check for leads due for marketing messages
 * Runs DAILY at 09:00 (9 AM)
 * Identifies leads with nextMessageDate = today and logs them for review
 * Sudo users can then decide whether to send messages manually or schedule them
 */
export const dailyLeadMessageCheck = cron.schedule('0 9 * * *', async () => {
  try {
    logger.info('[CRON] Starting daily lead message check');

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const leadsDue = await leadsService.getLeadsDueForMessage(today);

    if (leadsDue.length > 0) {
      logger.info(`[CRON] Found ${leadsDue.length} leads due for messaging today:`, {
        leads: leadsDue.map(lead => ({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          status: lead.status,
          source: lead.source,
          nextMessageDate: lead.nextMessageDate,
        })),
      });

      // Note: We don't auto-send messages here
      // Sudo users should review and send messages manually via the portal
      logger.info('[CRON] Lead message check completed - sudo users should review leads in the portal');
    } else {
      logger.info('[CRON] No leads due for messaging today');
    }
  } catch (error: any) {
    logger.error('[CRON] Daily lead message check failed:', error);
  }
}, {
  scheduled: false,
  timezone: 'Asia/Karachi',
});

/**
 * Start all WhatsApp cron jobs
 */
export const startWhatsAppCronJobs = () => {
  logger.info('[CRON] Starting WhatsApp marketing cron jobs');

  hourlyScheduledMessageProcessor.start();
  logger.info('[CRON] ✓ Hourly scheduled message processor started (runs every hour at :00 PKT)');

  dailyLeadMessageCheck.start();
  logger.info('[CRON] ✓ Daily lead message check started (runs daily at 09:00 PKT)');
};

/**
 * Stop all WhatsApp cron jobs
 */
export const stopWhatsAppCronJobs = () => {
  logger.info('[CRON] Stopping WhatsApp marketing cron jobs');

  hourlyScheduledMessageProcessor.stop();
  dailyLeadMessageCheck.stop();

  logger.info('[CRON] WhatsApp cron jobs stopped');
};

export default {
  startWhatsAppCronJobs,
  stopWhatsAppCronJobs,
  hourlyScheduledMessageProcessor,
  dailyLeadMessageCheck,
};
