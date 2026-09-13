import { pgTable, uuid, varchar, text, integer, decimal, boolean, timestamp, date, time, unique } from 'drizzle-orm/pg-core';
import { users } from './users';

export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  duration: integer('duration').notNull(), // Duration in months
  courseCategory: varchar('course_category', { length: 10 }), // 'senior' or 'junior'
  courseLevel: varchar('course_level', { length: 20 }), // 'ig' or 'alevel' (optional for junior)
  subject: varchar('subject', { length: 100 }), // e.g., Physics, Maths (optional for junior)
  teacherName: varchar('teacher_name', { length: 100 }), // e.g., Sir Ahmad
  studentName: varchar('student_name', { length: 100 }), // For 1-to-1 courses only
  whatsappGroupLink: text('whatsapp_group_link'), // WhatsApp group invite link
  isActive: boolean('is_active').default(true).notNull(),
  endDate: date('end_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
});

export const courseTeachers = pgTable('course_teachers', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  percentageCut: decimal('percentage_cut', { precision: 5, scale: 2 }).notNull(), // Teacher's cut (0-100)
  assignedAt: timestamp('assigned_at').defaultNow().notNull(),
}, (table) => ({
  uniqueCourseTeacher: unique().on(table.courseId, table.teacherId),
}));

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  capacity: integer('capacity').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const courseTimeslots = pgTable('course_timeslots', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'restrict' }),
  teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'set null' }), // Assigned teacher for this timeslot
  daysOfWeek: integer('days_of_week').array().notNull(), // Array of 0-6 (Sunday-Saturday)
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  recurrenceType: varchar('recurrence_type', { length: 20 }).notNull(), // 'weekly', 'biweekly', 'monthly'
  startDate: date('start_date').notNull(),
  endDate: date('end_date'), // Null for ongoing
  classType: varchar('class_type', { length: 20 }).notNull().default('local'), // 'online', 'local', 'hybrid', '1-to-1'
  // Teams meeting fields (for online and hybrid classes)
  teamsMeetingId: text('teams_meeting_id'), // Persistent Teams meeting ID for this timeslot
  teamsMeetingUrl: text('teams_meeting_url'), // Persistent Teams join URL for this timeslot
  teamsCreatedBy: uuid('teams_created_by').references(() => users.id, { onDelete: 'set null' }), // Teacher who created the Teams meeting
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const courseEvents = pgTable('course_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  timeslotId: uuid('timeslot_id').references(() => courseTimeslots.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'restrict' }),
  teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'set null' }),
  eventDate: date('event_date').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  status: varchar('status', { length: 20 }).default('scheduled').notNull(), // 'scheduled', 'completed', 'cancelled', 'rescheduled'
  classType: varchar('class_type', { length: 20 }).notNull().default('local'), // 'online', 'local', 'hybrid', '1-to-1'
  notes: text('notes'),
  recordingUrl: varchar('recording_url', { length: 500 }),
  // Microsoft Teams integration fields (for online classes)
  teamsMeetingId: text('teams_meeting_id'), // Microsoft Teams meeting ID
  teamsMeetingUrl: text('teams_meeting_url'), // Teams join URL
  teamsCreatedBy: uuid('teams_created_by').references(() => users.id, { onDelete: 'set null' }), // Teacher who created via OAuth
  attendanceSynced: boolean('attendance_synced').default(false), // Has attendance been pulled from Teams?
  isOverridden: boolean('is_overridden').default(false), // If true, this event was manually modified and won't be synced from timeslot
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  uniqueEvent: unique().on(table.courseId, table.eventDate, table.startTime),
}));
