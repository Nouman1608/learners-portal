import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../config/database';
import { users, sessions, activityLogs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword, comparePassword } from '../utils/bcrypt';
import { generateToken } from '../config/jwt';
import { AppError } from '../middleware/errorHandler';
import { getRequestToken } from '../middleware/auth';
import logger from '../utils/logger';
import env from '../config/env';

// The mobile app identifies itself with this header. It gets its token in the
// response body (it sends it back as a Bearer header); the website uses a cookie.
// Both stay signed in for 30 days (owner's choice: no 15-minute timeout).
const MOBILE_CLIENT = 'learners-mobile';
const MOBILE_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const WEB_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const isMobileClient = (req: Request) => req.get('X-Client') === MOBILE_CLIENT;

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const updateProfileSchema = z.object({
  teamsUsername: z.string().max(100).optional().or(z.literal('')),
});

const setupAccountSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  teamsUsername: z.string().min(1, 'Teams username is required').max(100),
});

const changeSelfPasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

type UserRow = typeof users.$inferSelect;

const publicUser = (user: UserRow) => ({
  id: user.id,
  username: user.username,
  role: user.role,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  teamsUsername: user.teamsUsername,
  mustChangePassword: user.mustChangePassword,
});

/** Creates the session row and, for the web, the httpOnly cookie. Returns the token. */
async function startSession(res: Response, user: UserRow, mobile: boolean): Promise<string> {
  const token = generateToken(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
    },
    '30d'
  );

  const expiresAt = new Date(Date.now() + (mobile ? MOBILE_SESSION_MS : WEB_SESSION_MS));

  // Create session in database
  await db.insert(sessions).values({
    userId: user.id,
    token,
    expiresAt,
  });

  if (!mobile) {
    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: WEB_SESSION_MS,
    });
  }

  return token;
}

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = loginSchema.parse(req.body);

    // Find user by username
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!user) {
      logger.warn(`Login attempt with non-existent username: ${username}`);
      throw new AppError(401, 'Invalid username or password');
    }

    if (!user.isActive) {
      logger.warn(`Login attempt with inactive account: ${username}`);
      throw new AppError(401, 'Account is inactive');
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.passwordHash);

    if (!isPasswordValid) {
      logger.warn(`Failed login attempt for user: ${username}`);
      throw new AppError(401, 'Invalid username or password');
    }

    const mobile = isMobileClient(req);
    const token = await startSession(res, user, mobile);

    logger.info(`User logged in: ${username}${mobile ? ' (mobile app)' : ''}`);

    // Return user data without password
    return res.json({
      ...(mobile && { token }),
      user: publicUser(user),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    throw error;
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const token = getRequestToken(req);

    if (token) {
      // Delete session from database
      await db.delete(sessions).where(eq(sessions.token, token));
    }

    // Clear cookie
    res.clearCookie('token');

    logger.info(`User logged out: ${req.user?.username || 'unknown'}`);

    return res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', error);
    throw error;
  }
};

export const me = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'Not authenticated');
    }

    // Get fresh user data
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);

    if (!user) {
      throw new AppError(404, 'User not found');
    }

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        teamsUsername: user.teamsUsername,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    throw error;
  }
};

export const refresh = async (req: Request, res: Response) => {
  try {
    const oldToken = getRequestToken(req);
    const mobile = isMobileClient(req);

    if (!oldToken || !req.user) {
      throw new AppError(401, 'No valid session');
    }

    // Generate new token
    const newToken = generateToken(
      {
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
      },
      '30d'
    );

    const expiresAt = new Date(Date.now() + (mobile ? MOBILE_SESSION_MS : WEB_SESSION_MS));

    // Delete old session and create new one
    await db.delete(sessions).where(eq(sessions.token, oldToken));
    await db.insert(sessions).values({
      userId: req.user.id,
      token: newToken,
      expiresAt,
    });

    if (mobile) {
      logger.info(`Token refreshed for user: ${req.user.username} (mobile app)`);
      return res.json({ message: 'Token refreshed successfully', token: newToken });
    }

    res.cookie('token', newToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: WEB_SESSION_MS,
    });

    logger.info(`Token refreshed for user: ${req.user.username}`);

    return res.json({ message: 'Token refreshed successfully' });
  } catch (error) {
    throw error;
  }
};

export const changeSelfPassword = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'Not authenticated');
    }

    const { currentPassword, newPassword } = changeSelfPasswordSchema.parse(req.body);

    // Get user with password hash
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);

    if (!user) {
      throw new AppError(404, 'User not found');
    }

    // Verify current password
    const isPasswordValid = await comparePassword(currentPassword, user.passwordHash);

    if (!isPasswordValid) {
      logger.warn(`Failed password change attempt for user: ${user.username}`);
      throw new AppError(401, 'Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password and lastPasswordReset timestamp
    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        mustChangePassword: false,
        lastPasswordReset: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Log activity
    await db.insert(activityLogs).values({
      userId: user.id,
      action: 'change_password',
      resource: 'auth',
      details: JSON.stringify({ message: 'User changed their own password' }),
      timestamp: new Date(),
    });

    logger.info(`Password changed successfully for user: ${user.username}`);

    return res.json({ message: 'Password changed successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    throw error;
  }
};

export const setupAccount = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'Not authenticated');
    }

    if (req.user.role !== 'student') {
      throw new AppError(403, 'Only students can use this endpoint');
    }

    const { currentPassword, newPassword, teamsUsername } = setupAccountSchema.parse(req.body);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);

    if (!user) {
      throw new AppError(404, 'User not found');
    }

    const isPasswordValid = await comparePassword(currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError(401, 'Current password is incorrect');
    }

    const newPasswordHash = await hashPassword(newPassword);

    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        teamsUsername,
        mustChangePassword: false,
        lastPasswordReset: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await db.insert(activityLogs).values({
      userId: user.id,
      action: 'setup_account',
      resource: 'auth',
      details: JSON.stringify({ message: 'Student completed first-time account setup' }),
      timestamp: new Date(),
    });

    logger.info(`Account setup completed for student: ${user.username}`);

    return res.json({ message: 'Account setup completed successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    throw error;
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'Not authenticated');
    }

    const { teamsUsername } = updateProfileSchema.parse(req.body);

    await db
      .update(users)
      .set({
        teamsUsername: teamsUsername || null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.user.id));

    logger.info(`Profile updated for user: ${req.user.username}`);

    return res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    throw error;
  }
};

/*
 * One-click sign-in between the campus portals (sudo only).
 * The issuing portal signs a 60-second, single-use pass with CAMPUS_HANDOFF_SECRET whose
 * audience is the other portal's address; that portal accepts it only if the audience is one
 * of its own FRONTEND_URLs, and then starts an ordinary session for the same sudo username.
 * The pass travels in the URL fragment, which browsers never send to a server.
 */
const HANDOFF_PURPOSE = 'campus-handoff';
const usedHandoffs = new Map<string, number>(); // jti -> expiry (ms); single process per portal

const acceptHandoffSchema = z.object({
  token: z.string().min(1),
});

export const createCampusHandoff = async (req: Request, res: Response) => {
  if (req.user?.role !== 'sudo') {
    throw new AppError(403, 'Only sudo can switch campus portals');
  }
  if (!env.CAMPUS_HANDOFF_SECRET || !env.HANDOFF_TARGET_URL) {
    throw new AppError(400, 'One-click sign-in is not set up on this portal');
  }

  const target = new URL(env.HANDOFF_TARGET_URL).origin;
  const pass = jwt.sign(
    { purpose: HANDOFF_PURPOSE },
    env.CAMPUS_HANDOFF_SECRET,
    { subject: req.user.username, audience: target, expiresIn: '60s', jwtid: randomUUID() }
  );

  logger.info(`Campus handoff issued for ${req.user.username} to ${target}`);
  return res.json({ url: `${target}/sso#t=${encodeURIComponent(pass)}` });
};

export const acceptCampusHandoff = async (req: Request, res: Response) => {
  if (!env.CAMPUS_HANDOFF_SECRET) {
    throw new AppError(400, 'One-click sign-in is not set up on this portal');
  }
  const { token } = acceptHandoffSchema.parse(req.body);
  const ownOrigins = env.FRONTEND_URL.split(',').map(u => new URL(u.trim()).origin);

  let claims: jwt.JwtPayload;
  try {
    claims = jwt.verify(token, env.CAMPUS_HANDOFF_SECRET, {
      audience: ownOrigins as [string, ...string[]],
    }) as jwt.JwtPayload;
  } catch {
    throw new AppError(401, 'This sign-in link is invalid or has expired');
  }
  if (claims.purpose !== HANDOFF_PURPOSE || !claims.jti || !claims.sub || !claims.exp) {
    throw new AppError(401, 'This sign-in link is invalid or has expired');
  }

  const now = Date.now();
  for (const [jti, exp] of usedHandoffs) if (exp < now) usedHandoffs.delete(jti);
  if (usedHandoffs.has(claims.jti)) {
    throw new AppError(401, 'This sign-in link has already been used');
  }
  usedHandoffs.set(claims.jti, claims.exp * 1000);

  const [user] = await db.select().from(users).where(eq(users.username, claims.sub)).limit(1);
  if (!user || !user.isActive || user.role !== 'sudo') {
    logger.warn(`Campus handoff refused for ${claims.sub}`);
    throw new AppError(401, 'This account cannot use one-click sign-in here');
  }

  await startSession(res, user, false);
  logger.info(`User logged in via campus handoff: ${user.username}`);
  return res.json({ user: publicUser(user) });
};
