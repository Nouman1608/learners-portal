import { db } from '../config/database';
import { users } from '../db/schema';
import { eq, ilike, or, and, desc, sql } from 'drizzle-orm';
import { hashPassword } from '../utils/bcrypt';
import { AppError } from '../middleware/errorHandler';
import { Role } from '../types';
import logger from '../utils/logger';

export interface CreateUserInput {
  username: string;
  password: string;
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  parentPhone?: string;
  studentCategory?: string;
  studentSubcategory?: string;
  whatsappGroupLink?: string;
  teamsUsername?: string;
  localStudentFeePercentage?: number;
  onlineStudentFixedAmountIg?: number;
  onlineStudentFixedAmountAlevel?: number;
  teacherPaymentType?: 'percentage_based' | 'salaried';
  monthlySalary?: number;
  createdBy: string;
}

export interface UpdateUserInput {
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  parentPhone?: string;
  studentCategory?: string;
  studentSubcategory?: string;
  whatsappGroupLink?: string;
  teamsUsername?: string;
  isActive?: boolean;
  role?: Role;
  // null clears a numeric field (e.g. on payment-type switch)
  localStudentFeePercentage?: number | null;
  onlineStudentFixedAmountIg?: number | null;
  onlineStudentFixedAmountAlevel?: number | null;
  teacherPaymentType?: 'percentage_based' | 'salaried';
  monthlySalary?: number | null;
}

export interface UsersFilter {
  role?: Role;
  search?: string;
  isActive?: boolean;
  studentCategory?: string;
  studentSubcategory?: string;
  limit?: number;
  offset?: number;
}

export const usersService = {
  async createUser(input: CreateUserInput) {
    // Check if username already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.username, input.username))
      .limit(1);

    if (existingUser.length > 0) {
      throw new AppError(400, 'Username already exists');
    }

    // Check if email already exists
    const existingEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (existingEmail.length > 0) {
      throw new AppError(400, 'Email already exists');
    }

    // Hash password
    const passwordHash = await hashPassword(input.password);

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        username: input.username,
        passwordHash,
        role: input.role,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone || null,
        parentPhone: input.parentPhone || null,
        studentCategory: input.studentCategory || null,
        studentSubcategory: input.studentSubcategory || null,
        whatsappGroupLink: input.whatsappGroupLink || null,
        teamsUsername: input.teamsUsername || null,
        localStudentFeePercentage: input.localStudentFeePercentage?.toString() || null,
        onlineStudentFixedAmountIg: input.onlineStudentFixedAmountIg?.toString() || null,
        onlineStudentFixedAmountAlevel: input.onlineStudentFixedAmountAlevel?.toString() || null,
        teacherPaymentType: input.teacherPaymentType || 'percentage_based',
        monthlySalary: input.monthlySalary?.toString() || null,
        isActive: true,
        mustChangePassword: true,
        createdBy: input.createdBy,
      })
      .returning();

    // Return user without password
    const { passwordHash: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
  },

  async getUsers(filter: UsersFilter = {}) {
    let query = db.select().from(users).$dynamic();

    // Apply filters
    const conditions = [];

    if (filter.role) {
      conditions.push(eq(users.role, filter.role));
    }

    if (filter.isActive !== undefined) {
      conditions.push(eq(users.isActive, filter.isActive));
    }

    if (filter.studentCategory) {
      conditions.push(eq(users.studentCategory, filter.studentCategory));
    }

    if (filter.studentSubcategory) {
      conditions.push(eq(users.studentSubcategory, filter.studentSubcategory));
    }

    if (filter.search) {
      conditions.push(
        or(
          ilike(users.username, `%${filter.search}%`),
          ilike(users.firstName, `%${filter.search}%`),
          ilike(users.lastName, `%${filter.search}%`),
          // Match full names like "Harmeen Azmat" that span both columns
          ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, `%${filter.search}%`),
          ilike(users.email, `%${filter.search}%`),
          ilike(users.phone, `%${filter.search}%`),
          ilike(users.parentPhone, `%${filter.search}%`)
        )
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Order by creation date (newest first)
    query = query.orderBy(desc(users.createdAt));

    // Apply pagination
    if (filter.limit) {
      query = query.limit(filter.limit);
    }
    if (filter.offset) {
      query = query.offset(filter.offset);
    }

    const allUsers = await query;

    // Remove password hashes
    return allUsers.map(({ passwordHash, ...user }) => user);
  },

  async getUserById(userId: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new AppError(404, 'User not found');
    }

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  },

  async updateUser(userId: string, input: UpdateUserInput) {
    // Check if user exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (existingUser.length === 0) {
      throw new AppError(404, 'User not found');
    }

    // If username is being updated, check if it's already taken
    if (input.username && input.username !== existingUser[0].username) {
      const usernameExists = await db
        .select()
        .from(users)
        .where(eq(users.username, input.username))
        .limit(1);

      if (usernameExists.length > 0) {
        throw new AppError(400, 'Username already exists');
      }
    }

    // If email is being updated, check if it's already taken
    if (input.email && input.email !== existingUser[0].email) {
      const emailExists = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (emailExists.length > 0) {
        throw new AppError(400, 'Email already exists');
      }
    }

    // Update user
    const updateData: any = {
      ...input,
      updatedAt: new Date(),
    };

    // Optional text fields: '' means "clear" — store null instead of empty string
    const clearableStrings = [
      'phone', 'parentPhone', 'studentCategory', 'studentSubcategory',
      'whatsappGroupLink', 'teamsUsername',
    ] as const;
    for (const field of clearableStrings) {
      if (input[field] !== undefined) {
        updateData[field] = input[field] || null;
      }
    }

    // Convert numeric fee fields to strings for decimal columns (null clears)
    const decimalFields = [
      'localStudentFeePercentage', 'onlineStudentFixedAmountIg',
      'onlineStudentFixedAmountAlevel', 'monthlySalary',
    ] as const;
    for (const field of decimalFields) {
      if (input[field] !== undefined) {
        updateData[field] = input[field] === null ? null : input[field]!.toString();
      }
    }

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    const { passwordHash: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  },

  async deleteUser(userId: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new AppError(404, 'User not found');
    }

    // Permanent delete — FK constraints handle cascading
    await db
      .delete(users)
      .where(eq(users.id, userId));

    logger.info(`[USER DELETE] Permanently deleted user ${userId} (${user.username}, role: ${user.role})`);

    return { message: 'User deleted permanently' };
  },

  async changePassword(userId: string, newPassword: string) {
    const passwordHash = await hashPassword(newPassword);

    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return { message: 'Password changed successfully' };
  },

  async resetPassword(userId: string, newPassword: string) {
    // Check if user exists
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new AppError(404, 'User not found');
    }

    const passwordHash = await hashPassword(newPassword);

    await db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: true,
        lastPasswordReset: new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    return {
      message: 'Password reset successfully',
      temporaryPassword: newPassword
    };
  },

  async getUsersByRole(role: Role) {
    const allUsers = await db
      .select()
      .from(users)
      .where(and(eq(users.role, role), eq(users.isActive, true)))
      .orderBy(desc(users.createdAt));

    return allUsers.map(({ passwordHash, ...user }) => user);
  },
};

export default usersService;
