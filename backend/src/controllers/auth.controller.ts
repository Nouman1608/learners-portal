import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { users, sessions, activityLogs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword, comparePassword } from '../utils/bcrypt';
import { generateToken } from '../config/jwt';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import env from '../config/env';

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

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    // Calculate expiration time (15 minutes from now)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Create session in database
    await db.insert(sessions).values({
      userId: user.id,
      token,
      expiresAt,
    });

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    logger.info(`User logged in: ${username}`);

    // Return user data without password
    return res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        teamsUsername: user.teamsUsername,
        mustChangePassword: user.mustChangePassword,
      },
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
    const token = req.cookies.token;

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
    const oldToken = req.cookies.token;

    if (!oldToken || !req.user) {
      throw new AppError(401, 'No valid session');
    }

    // Generate new token
    const newToken = generateToken({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Delete old session and create new one
    await db.delete(sessions).where(eq(sessions.token, oldToken));
    await db.insert(sessions).values({
      userId: req.user.id,
      token: newToken,
      expiresAt,
    });

    // Set new cookie
    res.cookie('token', newToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
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
