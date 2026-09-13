import cron from 'node-cron';
import attendanceService from '../services/attendance.service';
import logger from '../utils/logger';

/**
 * Attendance Sync Cron Job
 * Automatically syncs attendance from Teams meetings that have recently ended
 * Runs every 15 minutes
 */

export const startAttendanceSyncCron = () => {
  // Run every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    logger.info('Attendance sync cron job started');

    try {
      const result = await attendanceService.syncRecentMeetings();

      logger.info('Attendance sync cron job completed', {
        total: result.total,
        synced: result.synced,
        failed: result.failed,
      });

      if (result.failed > 0) {
        logger.warn(`${result.failed} events failed to sync in cron job`);
      }
    } catch (error: any) {
      logger.error('Attendance sync cron job encountered an error', {
        error: error.message,
        stack: error.stack,
      });
    }
  });

  logger.info('Attendance sync cron job registered (runs every 15 minutes)');
};
