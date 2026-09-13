import { pgTable, uuid, varchar, boolean, timestamp, text, decimal, AnyPgColumn } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(), // 'sudo', 'admin', 'teacher', 'student'
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone: varchar('phone', { length: 20 }),
  parentPhone: varchar('parent_phone', { length: 20 }),
  studentCategory: varchar('student_category', { length: 20 }), // 'junior', 'senior' (only for students)
  studentSubcategory: varchar('student_subcategory', { length: 30 }), // 'aitchison', 'preschool', 'summer_camp', 'academy', 'local', 'online'
  whatsappGroupLink: text('whatsapp_group_link'), // WhatsApp group link for student
  teamsUsername: varchar('teams_username', { length: 100 }), // Microsoft Teams display name for attendance sync
  isActive: boolean('is_active').default(true).notNull(),
  mustChangePassword: boolean('must_change_password').default(false).notNull(),
  lastPasswordReset: timestamp('last_password_reset'),
  // Teacher fee configuration
  localStudentFeePercentage: decimal('local_student_fee_percentage', { precision: 5, scale: 2 }), // e.g., 75.50 means teacher gets 75.50% of fee
  onlineStudentFixedAmountIg: decimal('online_student_fixed_amount_ig', { precision: 10, scale: 2 }), // Fixed amount per online student for IG courses
  onlineStudentFixedAmountAlevel: decimal('online_student_fixed_amount_alevel', { precision: 10, scale: 2 }), // Fixed amount per online student for A Level courses
  teacherPaymentType: varchar('teacher_payment_type', { length: 20 }).default('percentage_based'), // 'percentage_based' or 'salaried'
  monthlySalary: decimal('monthly_salary', { precision: 10, scale: 2 }), // Fixed monthly salary for salaried teachers
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: uuid('created_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  token: varchar('token', { length: 500 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const activityLogs = pgTable('activity_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  resource: varchar('resource', { length: 100 }).notNull(),
  resourceId: uuid('resource_id'),
  details: text('details'), // JSON string
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});
