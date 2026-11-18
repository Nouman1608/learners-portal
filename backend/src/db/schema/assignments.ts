import { pgTable, uuid, varchar, text, timestamp, date, decimal, integer, unique, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { courses } from './courses';

/**
 * An assignment a teacher / admin posts: instructions and files, to one class (every student
 * enrolled in it now) or to chosen students. Students upload their answers; the teacher marks them.
 */
export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 200 }).notNull(),
  instructions: text('instructions'),
  // Set = posted to the whole class; null = posted to the students in assignment_students
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
  dueDate: date('due_date'),
  maxMarks: decimal('max_marks', { precision: 6, scale: 2 }), // null = not marked out of a number
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  courseIdx: index('assignments_course_idx').on(table.courseId),
}));

/** The chosen students of an assignment that was not posted to a class */
export const assignmentStudents = pgTable('assignment_students', {
  assignmentId: uuid('assignment_id').references(() => assignments.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
}, (table) => ({
  unique: unique().on(table.assignmentId, table.studentId),
  studentIdx: index('assignment_students_student_idx').on(table.studentId),
}));

/** Files the teacher attached to the assignment (the worksheet, a reading, ...) */
export const assignmentFiles = pgTable('assignment_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').references(() => assignments.id, { onDelete: 'cascade' }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(), // the name it was uploaded with
  fileUrl: varchar('file_url', { length: 500 }).notNull(), // /uploads/assignments/...
  mimeType: varchar('mime_type', { length: 100 }),
  sizeBytes: integer('size_bytes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/** A student's answer to an assignment, with the teacher's mark and feedback */
export const assignmentSubmissions = pgTable('assignment_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').references(() => assignments.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  note: text('note'),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  marks: decimal('marks', { precision: 6, scale: 2 }),
  feedback: text('feedback'),
  gradedBy: uuid('graded_by').references(() => users.id, { onDelete: 'set null' }),
  gradedAt: timestamp('graded_at'),
}, (table) => ({
  unique: unique().on(table.assignmentId, table.studentId),
}));

export const assignmentSubmissionFiles = pgTable('assignment_submission_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  submissionId: uuid('submission_id').references(() => assignmentSubmissions.id, { onDelete: 'cascade' }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileUrl: varchar('file_url', { length: 500 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }),
  sizeBytes: integer('size_bytes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
