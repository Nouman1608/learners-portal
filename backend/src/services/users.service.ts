import { db, Database } from '../config/database';
import { users } from '../db/schema';
import { eq, ne, ilike, or, and, asc, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { hashPassword } from '../utils/bcrypt';
import { AppError } from '../middleware/errorHandler';
import { Role } from '../types';
import logger from '../utils/logger';

/**
 * Stand-in address for a student created without an email (email is required and unique in
 * the database). The .invalid domain can never receive mail.
 */
export const noEmailAddress = (username: string) => `${username.trim().toLowerCase()}@no-email.invalid`;

export interface CreateUserInput {
  username: string;
  password: string;
  role: Role;
  firstName: string;
  lastName: string;
  email?: string; // optional for students
  phone?: string;
  parentPhone?: string;
  studentCategory?: string;
  studentSubcategory?: string;
  whatsappGroupLink?: string;
  teamsUsername?: string;
  localStudentFeePercentage?: number;
  onlineStudentFixedAmountIg?: number;
  onlineStudentFixedAmountAlevel?: number;
  teacherPaymentType?: 'percentage_based' | 'salaried' | 'per_child';
  monthlySalary?: number;
  siblingOfId?: string; // students: link the new student to this student's family
  createdBy: string;
}

// What the portal shows about a brother or sister
const familyMemberColumns = {
  id: users.id,
  username: users.username,
  firstName: users.firstName,
  lastName: users.lastName,
  phone: users.phone,
  parentPhone: users.parentPhone,
  isActive: users.isActive,
};

/** Last 10 digits of a phone number, so "0300 1234567" and "+92 300 1234567" compare equal */
const phoneKey = (phone?: string | null) => {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : null;
};
const phoneKeySql = (column: typeof users.phone | typeof users.parentPhone) =>
  sql`right(regexp_replace(coalesce(${column}, ''), '\\D', '', 'g'), 10)`;

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
  teacherPaymentType?: 'percentage_based' | 'salaried' | 'per_child';
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

    if (!input.email) {
      if (input.role !== 'student') throw new AppError(400, 'Email is required');
      input = { ...input, email: noEmailAddress(input.username) };
    }

    // Check if email already exists
    const existingEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email!))
      .limit(1);

    if (existingEmail.length > 0) {
      throw new AppError(400, 'Email already exists');
    }

    // A sibling link is checked before the account is made, so a bad link leaves nothing half-created
    if (input.siblingOfId) {
      if (input.role !== 'student') throw new AppError(400, 'Only students can be linked as siblings');
      await this.requireStudent(input.siblingOfId);
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
        email: input.email!,
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

    if (input.siblingOfId) {
      newUser.familyId = await this.linkSiblings(newUser.id, input.siblingOfId);
    }

    // Return user without password
    const { passwordHash: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
  },

  async requireStudent(userId: string) {
    const [student] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!student) throw new AppError(404, 'Student not found');
    if (student.role !== 'student') throw new AppError(400, 'Only students can be linked as siblings');
    return student;
  },

  /**
   * Link two students as siblings. Siblings share one family_id: if either already has a
   * family the other joins it, and if both have one the two families become one.
   */
  async linkSiblings(userId: string, siblingId: string) {
    if (userId === siblingId) throw new AppError(400, 'A student cannot be their own sibling');
    const student = await this.requireStudent(userId);
    const sibling = await this.requireStudent(siblingId);

    const familyId = student.familyId || sibling.familyId || randomUUID();
    await db.transaction(async (tx) => {
      const joining = [eq(users.id, student.id), eq(users.id, sibling.id)];
      // Both already in (different) families: bring the sibling's whole family across
      if (sibling.familyId && sibling.familyId !== familyId) joining.push(eq(users.familyId, sibling.familyId));
      await tx.update(users).set({ familyId, updatedAt: new Date() }).where(or(...joining));
    });

    logger.info(`[FAMILY] Linked ${student.username} and ${sibling.username} (family ${familyId})`);
    return familyId;
  },

  /** Take a student out of their family. A family left with one child is cleared as well. */
  async unlinkFromFamily(userId: string) {
    const student = await this.requireStudent(userId);
    if (!student.familyId) return;
    const familyId = student.familyId;

    await db.transaction(async (tx) => {
      await tx.update(users).set({ familyId: null, updatedAt: new Date() }).where(eq(users.id, userId));
      const left = await tx.select({ id: users.id }).from(users).where(eq(users.familyId, familyId));
      if (left.length === 1) {
        await tx.update(users).set({ familyId: null, updatedAt: new Date() }).where(eq(users.id, left[0].id));
      }
    });
    logger.info(`[FAMILY] Unlinked ${student.username} from family ${familyId}`);
  },

  /**
   * A student's linked siblings, plus suggestions: other students who share one of this
   * student's phone numbers but are not linked yet.
   */
  async getFamily(userId: string) {
    const student = await this.getUserById(userId);

    const siblings = student.familyId
      ? await db.select(familyMemberColumns).from(users)
          .where(and(eq(users.familyId, student.familyId), ne(users.id, userId)))
          .orderBy(asc(users.firstName))
      : [];

    const keys = [...new Set([phoneKey(student.phone), phoneKey(student.parentPhone)].filter((k): k is string => !!k))];
    const linked = new Set(siblings.map((s) => s.id));
    const suggestions = keys.length
      ? (await db.select(familyMemberColumns).from(users)
          .where(and(
            eq(users.role, 'student'),
            ne(users.id, userId),
            or(...keys.flatMap((key) => [
              sql`${phoneKeySql(users.phone)} = ${key}`,
              sql`${phoneKeySql(users.parentPhone)} = ${key}`,
            ])),
          ))
          .orderBy(asc(users.firstName))).filter((s) => !linked.has(s.id))
      : [];

    return { familyId: student.familyId, siblings, suggestions };
  },

  /** `database` lets the Senior portal's sudo read the Junior Campus users (read-only connection) */
  async getUsers(filter: UsersFilter = {}, database: Database = db) {
    let query = database.select().from(users).$dynamic();

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
          sql`${users.firstName} || ' ' || ${users.lastName} ILIKE ${`%${filter.search}%`}`,
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

    // A family left with one child is no longer a family
    if (user.familyId) {
      const left = await db.select({ id: users.id }).from(users).where(eq(users.familyId, user.familyId));
      if (left.length === 1) await db.update(users).set({ familyId: null }).where(eq(users.id, left[0].id));
    }

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
