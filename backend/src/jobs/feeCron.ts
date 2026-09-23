import cron from 'node-cron';
import { feesService } from '../services/fees.service';
import { calendarService } from '../services/calendar.service';
import { invoicesService } from '../services/invoices.service';
import logger from '../utils/logger';
import whatsappCron from './whatsappCron';

/**
 * Generate fees for all active enrollments
 * Runs DAILY at 00:01 (1 minute past midnight)
 * Catches any enrollment created outside the app's own immediate-fee step
 * (e.g. a backdated enrollment date edit) and keeps 1-to-1 usage fees in sync.
 */
export const dailyFeeGeneration = cron.schedule('1 0 * * *', async () => {
  try {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const year = now.getFullYear();

    logger.info(`[CRON] Starting daily fee generation for ${month}/${year}`);

    const result = await feesService.generateMonthlyFees(month, year, false);

    logger.info(`[CRON] Daily fee generation completed: ${result.regularFeesCreated} regular, ${result.usageFeesCreated} usage`);
  } catch (error: any) {
    logger.error('[CRON] Daily fee generation failed:', error);
  }
}, {
  scheduled: false, // Don't start automatically, will be started manually
  timezone: 'Asia/Karachi', // Pakistan timezone
});

/**
 * Mark overdue fees
 * Runs daily at 00:05 (5 minutes past midnight)
 */
export const overdueDetection = cron.schedule('5 0 * * *', async () => {
  try {
    logger.info('[CRON] Starting overdue fee detection');

    const result = await feesService.markOverdueFees();

    logger.info(`[CRON] Overdue detection completed: ${result.count} fees marked as overdue`);
  } catch (error: any) {
    logger.error('[CRON] Overdue detection failed:', error);
  }
}, {
  scheduled: false, // Don't start automatically
  timezone: 'Asia/Karachi',
});

/**
 * Generate calendar events from timeslots
 * Runs every Sunday at 00:10 (10 minutes past midnight)
 * Generates events for the next 30 days
 */
export const weeklyEventGeneration = cron.schedule('10 0 * * 0', async () => {
  try {
    logger.info('[CRON] Starting weekly event generation');

    const result = await calendarService.generateUpcomingEvents(30);

    logger.info(`[CRON] Event generation completed: ${result.count} events created`);
  } catch (error: any) {
    logger.error('[CRON] Event generation failed:', error);
  }
}, {
  scheduled: false,
  timezone: 'Asia/Karachi',
});

/**
 * Generate monthly invoices for all students and teachers
 * Runs on the 25th of each month at 23:00 (11 PM)
 */
export const monthlyInvoiceGeneration = cron.schedule('0 23 25 * *', async () => {
  try {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const year = now.getFullYear();

    logger.info(`[CRON] Starting monthly invoice generation for ${month}/${year}`);

    const result = await invoicesService.generateMonthlyInvoices(month, year);

    logger.info(`[CRON] Invoice generation completed: ${result.studentCount} student invoices, ${result.teacherCount} teacher invoices`);
  } catch (error: any) {
    logger.error('[CRON] Monthly invoice generation failed:', error);
  }
}, {
  scheduled: false,
  timezone: 'Asia/Karachi',
});

/**
 * Start all cron jobs
 */
export const startCronJobs = () => {
  logger.info('[CRON] Starting all cron jobs');

  dailyFeeGeneration.start();
  logger.info('[CRON] ✓ Daily fee generation job started (runs every day at 00:01 PKT)');

  overdueDetection.start();
  logger.info('[CRON] ✓ Overdue detection job started (runs daily at 00:05 PKT)');

  weeklyEventGeneration.start();
  logger.info('[CRON] ✓ Weekly event generation job started (runs every Sunday at 00:10 PKT)');

  monthlyInvoiceGeneration.start();
  logger.info('[CRON] ✓ Monthly invoice generation job started (runs on 25th of each month at 23:00 PKT)');

  // Start WhatsApp marketing cron jobs
  whatsappCron.startWhatsAppCronJobs();
};

/**
 * Stop all cron jobs
 */
export const stopCronJobs = () => {
  logger.info('[CRON] Stopping all cron jobs');

  dailyFeeGeneration.stop();
  overdueDetection.stop();
  weeklyEventGeneration.stop();
  monthlyInvoiceGeneration.stop();

  // Stop WhatsApp marketing cron jobs
  whatsappCron.stopWhatsAppCronJobs();

  logger.info('[CRON] All cron jobs stopped');
};

export default {
  startCronJobs,
  stopCronJobs,
  dailyFeeGeneration,
  overdueDetection,
  weeklyEventGeneration,
  monthlyInvoiceGeneration
};
