import { pgTable, uuid, date, varchar, text, timestamp, unique, index, integer } from 'drizzle-orm/pg-core';
import { users } from './users';

// ============================================================================
// TEACHER ABSENCES / LATES PER MONTH (Junior portal) - admins enter each teacher's
// monthly totals; the pay deduction is worked out from them (teacherDeductions.service)
// and taken off that month's salary slip.
// ============================================================================

export const teacherMonthlyAttendance = pgTable('teacher_monthly_attendance', {
  id: uuid('id').primaryKey().defaultRandom(),
  teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  month: integer('month').notNull(),
  year: integer('year').notNull(),
  absences: integer('absences').default(0).notNull(), // absences on Tuesday-Thursday
  friMonAbsences: integer('fri_mon_absences').default(0).notNull(), // absences on a Friday or Monday
  lates: integer('lates').default(0).notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  oneRowPerMonth: unique('teacher_monthly_attendance_teacher_month').on(table.teacherId, table.year, table.month),
}));

// Superseded by teacher_monthly_attendance (2026-11-12): per-day marks, no longer used.

export const teacherAttendanceMarks = pgTable('teacher_attendance_marks', {
  id: uuid('id').primaryKey().defaultRandom(),
  teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  date: date('date').notNull(), // a Monday-Friday working day
  kind: varchar('kind', { length: 10 }).notNull(), // 'absent' | 'late'
  note: text('note'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  oneMarkPerDay: unique('teacher_attendance_marks_teacher_date').on(table.teacherId, table.date),
  teacherDateIdx: index('teacher_attendance_marks_teacher_date_idx').on(table.teacherId, table.date),
}));
