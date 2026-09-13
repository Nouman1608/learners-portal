import { pgTable, uuid, text, timestamp, varchar, integer, boolean, unique, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { courseEvents } from './courses';

/**
 * Teams OAuth credentials for teachers
 * Stores encrypted OAuth tokens for Microsoft Teams integration
 */
export const teamsOAuth = pgTable('teams_oauth', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(), // One Teams connection per user
  accessToken: text('access_token').notNull(), // Encrypted OAuth access token
  refreshToken: text('refresh_token').notNull(), // Encrypted OAuth refresh token
  expiresAt: timestamp('expires_at').notNull(), // When access token expires
  scope: text('scope').notNull(), // OAuth scopes granted
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Attendance records synced from Microsoft Teams meetings
 * Tracks student presence in each class session
 */
export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseEventId: uuid('course_event_id')
      .references(() => courseEvents.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    status: varchar('status', { length: 20 }).notNull(), // 'present', 'absent', 'late'
    joinedAt: timestamp('joined_at'), // When student joined the Teams meeting
    leftAt: timestamp('left_at'), // When student left the Teams meeting
    durationMinutes: integer('duration_minutes'), // Total attendance time in minutes
    source: varchar('source', { length: 20 }).default('teams').notNull(), // 'teams' (auto-sync), 'manual' (teacher-marked)
    role: varchar('role', { length: 20 }).default('student').notNull(), // 'student' or 'teacher'
    syncedAt: timestamp('synced_at').defaultNow(), // When pulled from Teams API
    teamsParticipantId: text('teams_participant_id'), // Teams user ID for reference
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Ensure one attendance record per student per event
    uniqueAttendance: unique().on(table.courseEventId, table.studentId),
    // Indexes for efficient queries
    eventIndex: index('attendance_event_idx').on(table.courseEventId),
    studentIndex: index('attendance_student_idx').on(table.studentId),
    syncedIndex: index('attendance_synced_idx').on(table.syncedAt),
  })
);

/**
 * Attendance sync log
 * Tracks sync history for debugging and monitoring
 */
export const attendanceSyncLog = pgTable('attendance_sync_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseEventId: uuid('course_event_id')
    .references(() => courseEvents.id, { onDelete: 'cascade' })
    .notNull(),
  syncedAt: timestamp('synced_at').defaultNow().notNull(),
  status: varchar('status', { length: 20 }).notNull(), // 'success', 'failed', 'no_meeting'
  participantCount: integer('participant_count'), // Number of participants found in Teams
  errorMessage: text('error_message'), // Error details if sync failed
  syncedBy: varchar('synced_by', { length: 20 }).default('cron'), // 'cron' or 'manual'
});
