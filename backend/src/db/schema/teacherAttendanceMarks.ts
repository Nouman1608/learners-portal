import { pgTable, uuid, date, varchar, text, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { users } from './users';

// ============================================================================
// TEACHER ABSENT / LATE MARKS (Junior portal) - admins mark the days a teacher was
// absent or late. The pay deduction for a month is worked out from these marks
// (see teacherDeductions.service) and taken off that month's teacher invoice.
// ============================================================================

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
