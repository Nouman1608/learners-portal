import { pgTable, uuid, varchar, text, decimal, timestamp, boolean, unique, integer, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users';
import { courses } from './courses';

export const assessments = pgTable('assessments', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  maxScore: decimal('max_score', { precision: 5, scale: 2 }).notNull(),
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const assessmentResults = pgTable('assessment_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  assessmentId: uuid('assessment_id').references(() => assessments.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  score: decimal('score', { precision: 5, scale: 2 }),
  feedback: text('feedback'),
  submittedAt: timestamp('submitted_at'),
  gradedAt: timestamp('graded_at'),
  gradedBy: uuid('graded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  uniqueResult: unique().on(table.assessmentId, table.studentId),
}));

export const assessmentFiles = pgTable('assessment_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  assessmentId: uuid('assessment_id').references(() => assessments.id, { onDelete: 'cascade' }).notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  fileUrl: varchar('file_url', { length: 500 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  fileSize: integer('file_size').notNull(),
  fileType: varchar('file_type', { length: 50 }).default('question_paper').notNull(),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  displayOrder: integer('display_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const submissionFiles = pgTable('submission_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  resultId: uuid('result_id').references(() => assessmentResults.id, { onDelete: 'cascade' }).notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  fileUrl: varchar('file_url', { length: 500 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  fileSize: integer('file_size').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueSubmission: unique().on(table.resultId),
}));

export const pdfAnnotations = pgTable('pdf_annotations', {
  id: uuid('id').primaryKey().defaultRandom(),
  resultId: uuid('result_id').references(() => assessmentResults.id, { onDelete: 'cascade' }).notNull(),
  teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'cascade' }),
  pageNumber: integer('page_number').notNull(),
  annotationType: varchar('annotation_type', { length: 50 }).notNull(),
  annotationData: jsonb('annotation_data').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
