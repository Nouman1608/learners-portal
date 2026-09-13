import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { db } from '../config/database';
import { activityLogs } from '../db/schema';

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path}`, {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      user: req.user?.username || 'anonymous',
      ip: req.ip,
    });
  });

  next();
};

// Activity logging for sensitive operations
export const logActivity = (action: string, resource: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original send function
    const originalSend = res.send;

    // Override send to log only on successful responses
    res.send = function (data) {
      // Only log if the response is successful (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        // Don't await - log asynchronously
        db.insert(activityLogs)
          .values({
            userId: req.user.id,
            action,
            resource,
            resourceId: req.params.id || null,
            details: JSON.stringify({
              method: req.method,
              body: req.body,
              query: req.query,
              params: req.params,
            }),
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'] || null,
          })
          .catch((err) => {
            logger.error('Failed to log activity:', err);
          });
      }

      // Call original send
      return originalSend.call(this, data);
    };

    next();
  };
};
