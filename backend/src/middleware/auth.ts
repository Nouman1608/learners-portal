import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../config/jwt';
import { db } from '../config/database';
import { sessions, users } from '../db/schema';
import { eq } from 'drizzle-orm';
import logger from '../utils/logger';

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get token from cookie
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify JWT token
    const payload = verifyToken(token);

    // Check if session exists in database
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token))
      .limit(1);

    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    // Check if session is expired
    if (new Date() > session.expiresAt) {
      // Delete expired session
      await db.delete(sessions).where(eq(sessions.id, session.id));
      return res.status(401).json({ error: 'Session expired' });
    }

    // Get full user details
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      userId: user.id,
      username: user.username,
      role: user.role as 'sudo' | 'admin' | 'teacher' | 'student',
    };

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies.token;

    if (token) {
      const payload = verifyToken(token);
      const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.token, token))
        .limit(1);

      if (session && new Date() <= session.expiresAt) {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, payload.userId))
          .limit(1);

        if (user && user.isActive) {
          req.user = {
            id: user.id,
            userId: user.id,
            username: user.username,
            role: user.role as 'sudo' | 'admin' | 'teacher' | 'student',
          };
        }
      }
    }
  } catch (error) {
    // Silently fail for optional auth
    logger.debug('Optional auth failed:', error);
  }

  next();
};
