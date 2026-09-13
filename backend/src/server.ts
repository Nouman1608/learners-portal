import app from './app';
import env from './config/env';
import logger from './utils/logger';
import { startCronJobs, stopCronJobs } from './jobs/feeCron';
import { initializeCronJobs } from './cron/index';
import { db } from './config/database';
import { sql } from 'drizzle-orm';

const PORT = parseInt(env.PORT);

// Warm up database connection pool before accepting requests
const warmupDatabase = async () => {
  try {
    await db.execute(sql`SELECT 1`);
    logger.info('Database connection pool warmed up');
  } catch (error) {
    logger.error('Failed to warm up database connection:', error);
  }
};

const server = app.listen(PORT, async () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📝 Environment: ${env.NODE_ENV}`);
  logger.info(`🔗 Frontend URL: ${env.FRONTEND_URL}`);

  // Warm up database connection pool
  await warmupDatabase();

  // Start cron jobs
  startCronJobs(); // Fee-related cron jobs
  initializeCronJobs(); // Attendance sync and other cron jobs
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  stopCronJobs();
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  stopCronJobs();
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export default server;
