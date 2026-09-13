import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import env from '../config/env';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    logger.error(`AppError: ${err.message}`, {
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
      user: req.user?.username,
    });

    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  // Unexpected errors
  logger.error('Unexpected error:', {
    error: err,
    stack: err.stack,
    path: req.path,
    method: req.method,
    user: req.user?.username,
  });

  // Don't leak error details in production
  const message = env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  return res.status(500).json({
    error: message,
  });
};

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(404).json({
    error: 'Route not found',
  });
};
