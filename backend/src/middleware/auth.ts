import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../config/jwt';
import { db } from '../config/database';
import { sessions, users } from '../db/schema';
import { eq } from 'drizzle-orm';
import logger from '../utils/logger';

/**
 * The web app sends its token in an httpOnly cookie; the mobile app has no
 * cookie jar it can rely on, so it sends `Authorization: Bearer <token>`.
 */
export const getRequestToken = (req: Request): string | undefined => {
  if (req.cookies.token) return req.cookies.token;
  const header = req.get('Authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || undefined;
  return undefined;
};

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = getRequestToken(req);

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
      role: user.role as 'sudo' | 'admin' | 'teacher' | 'student' | 'staff',
    };

    // Staff (non-teaching employees) reach only their own account and pay: everything else is
    // closed to them here, so no route can leak by forgetting a role check. Outside /auth,
    // read-only (own invoices / salary slips and own advances).
    if (user.role === 'staff') {
      const path = req.baseUrl + req.path;
      const own = req.method === 'GET' && /^\/api\/(invoices(\/[0-9a-f-]{36}(\/download)?)?|salary-advances)\/?$/i.test(path);
      if (!own && !/^\/api\/auth(\/|$)/.test(path)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

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
    const token = getRequestToken(req);

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
            role: user.role as 'sudo' | 'admin' | 'teacher' | 'student' | 'staff',
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
