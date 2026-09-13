import { startAttendanceSyncCron } from './attendance-sync.cron';
import logger from '../utils/logger';

/**
 * Cron Jobs Registry
 * Initializes and starts all scheduled background jobs
 */

export const initializeCronJobs = () => {
  logger.info('Initializing cron jobs...');

  // Start attendance sync cron (runs every hour)
  startAttendanceSyncCron();

  logger.info('All cron jobs initialized successfully');
};
