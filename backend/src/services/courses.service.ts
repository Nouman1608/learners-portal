import { db } from '../config/database';
import { courses, courseTeachers, users, courseTimeslots, courseEvents, rooms, enrollments } from '../db/schema';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import teamsOAuthService from './teams-oauth.service';
import microsoftGraphService from './microsoft-graph.service';
import logger from '../utils/logger';
import { calendarService } from './calendar.service';
import { addDays } from 'date-fns';
import usersService from './users.service';
import crypto from 'crypto';

export interface CreateCourseInput {
  courseCategory: 'senior' | 'junior';
  courseLevel?: 'ig' | 'alevel';
  subject?: string;
  teacherName: string;
  studentName?: string;
  description?: string;
  duration: number; // months
  whatsappGroupLink?: string;
  createdBy: string;
}

export interface UpdateCourseInput {
  courseCategory?: 'senior' | 'junior';
  courseLevel?: 'ig' | 'alevel';
  subject?: string;
  teacherName?: string;
  studentName?: string;
  description?: string;
  duration?: number;
  whatsappGroupLink?: string;
  isActive?: boolean;
}

function buildCourseTitle(parts: { courseCategory?: string; courseLevel?: string; subject?: string; teacherName?: string; studentName?: string }): string {
  const categoryMap: Record<string, string> = { senior: 'S', junior: 'J' };
  const levelMap: Record<string, string> = { ig: 'IG', alevel: 'A Level' };
  return [
    parts.courseCategory ? categoryMap[parts.courseCategory] || parts.courseCategory : '',
    parts.courseLevel ? levelMap[parts.courseLevel] || parts.courseLevel : '',
    parts.subject || '',
    parts.teacherName || '',
    parts.studentName || '',
  ].filter(Boolean).join(' ');
}

export interface AssignTeacherInput {
  teacherId: string;
  percentageCut: string; // decimal as string (0-100)
}

export interface CreateTimeslotInput {
  courseId: string;
  teacherId?: string; // Required for online and hybrid classes
  roomId?: string; // Optional for all classes
  daysOfWeek: number[]; // Array of 0-6 (Sunday-Saturday)
  startTime: string; // HH:MM format
  endTime: string;
  recurrenceType: 'weekly' | 'biweekly' | 'monthly';
  startDate: string; // YYYY-MM-DD
  endDate?: string;
  classType: 'online' | 'local' | 'hybrid' | '1-to-1'; // Class delivery type
  // Teams meeting fields (for online and hybrid classes)
  teamsMeetingId?: string;
  teamsMeetingUrl?: string;
  teamsCreatedBy?: string;
}

export const coursesService = {
  async createCourse(input: CreateCourseInput) {
    const [newCourse] = await db
      .insert(courses)
      .values({
        title: buildCourseTitle(input),
        courseCategory: input.courseCategory,
        courseLevel: input.courseLevel || null,
        subject: input.subject || null,
        teacherName: input.teacherName,
        studentName: input.studentName || null,
        description: input.description || null,
        duration: input.duration,
        whatsappGroupLink: input.whatsappGroupLink || null,
        isActive: true,
        createdBy: input.createdBy,
      })
      .returning();

    return newCourse;
  },

  async getCourses(activeOnly: boolean = false) {
    let query = db.select().from(courses);

    if (activeOnly) {
      query = query.where(eq(courses.isActive, true)) as any;
    }

    const allCourses = await query.orderBy(desc(courses.createdAt));

    // For each course, get assigned teachers and student count
    const coursesWithTeachersAndStudents = await Promise.all(
      allCourses.map(async (course) => {
        const teachers = await this.getCourseTeachers(course.id);

        // Get active enrollments count for this course
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(enrollments)
          .where(
            and(
              eq(enrollments.courseId, course.id),
              eq(enrollments.status, 'active')
            )
          );

        // Get first active timeslot with a Teams meeting URL
        const [timeslotWithTeams] = await db
          .select({ teamsMeetingUrl: courseTimeslots.teamsMeetingUrl })
          .from(courseTimeslots)
          .where(
            and(
              eq(courseTimeslots.courseId, course.id),
              eq(courseTimeslots.isActive, true),
              sql`${courseTimeslots.teamsMeetingUrl} IS NOT NULL`
            )
          )
          .limit(1);

        return {
          ...course,
          teachers,
          teacherCount: teachers.length,
          studentCount: count || 0,
          teamsLink: timeslotWithTeams?.teamsMeetingUrl || null,
        };
      })
    );

    return coursesWithTeachersAndStudents;
  },

  async getCourseById(courseId: string) {
    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new AppError(404, 'Course not found');
    }

    // Get assigned teachers
    const teachers = await this.getCourseTeachers(courseId);

    // Get timeslots
    const timeslots = await this.getCourseTimeslots(courseId);

    return {
      ...course,
      teachers,
      timeslots,
    };
  },

  async updateCourse(courseId: string, input: UpdateCourseInput) {
    const existingCourse = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (existingCourse.length === 0) {
      throw new AppError(404, 'Course not found');
    }

    // Field semantics: undefined = not sent (keep existing), '' = clear, value = replace
    const resolve = (incoming: string | undefined, existing: string | null) =>
      incoming !== undefined ? (incoming || undefined) : (existing || undefined);

    // merged: resolved values for building the course title (undefined = part absent)
    const merged = {
      courseCategory: input.courseCategory || existingCourse[0].courseCategory || undefined,
      courseLevel: resolve(input.courseLevel, existingCourse[0].courseLevel),
      subject: resolve(input.subject, existingCourse[0].subject),
      teacherName: input.teacherName || existingCourse[0].teacherName || undefined,
      studentName: resolve(input.studentName, existingCourse[0].studentName),
    };

    // DB write: '' becomes null (clear); undefined keys are skipped by Drizzle (keep existing)
    const toDb = (v: string | undefined) => (v === undefined ? undefined : v || null);

    const [updatedCourse] = await db
      .update(courses)
      .set({
        ...input,
        courseCategory: merged.courseCategory,
        teacherName: merged.teacherName,
        courseLevel: toDb(input.courseLevel),
        subject: toDb(input.subject),
        studentName: toDb(input.studentName),
        whatsappGroupLink: toDb(input.whatsappGroupLink),
        description: toDb(input.description),
        title: buildCourseTitle(merged),
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId))
      .returning();

    return updatedCourse;
  },

  async deleteCourse(courseId: string) {
    await this.updateCourse(courseId, { isActive: false });
    return { message: 'Course deactivated successfully' };
  },

  async hardDeleteCourse(courseId: string) {
    // Verify course exists
    const course = await this.getCourseById(courseId);

    logger.info(`[HARD DELETE] Starting hard delete for course ${courseId} (${course.title})`);

    // STEP 1: Delete invoice line items that reference this course
    const { invoiceLineItems } = await import('../db/schema/invoices');

    const deletedLineItems = await db
      .delete(invoiceLineItems)
      .where(eq(invoiceLineItems.courseId, courseId))
      .returning();

    logger.info(`[HARD DELETE] Deleted ${deletedLineItems.length} invoice line items`);

    // STEP 2: Get all enrollments for this course
    const courseEnrollments = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.courseId, courseId));

    logger.info(`[HARD DELETE] Found ${courseEnrollments.length} enrollments to delete`);

    if (courseEnrollments.length > 0) {
      const enrollmentIds = courseEnrollments.map(e => e.id);

      // STEP 3: Delete fees (payments will cascade delete automatically)
      const { fees } = await import('../db/schema/enrollments');

      const deletedFees = await db
        .delete(fees)
        .where(inArray(fees.enrollmentId, enrollmentIds))
        .returning();

      logger.info(`[HARD DELETE] Deleted ${deletedFees.length} fees (payments cascade deleted)`);

      // STEP 4: Delete enrollments
      const deletedEnrollments = await db
        .delete(enrollments)
        .where(inArray(enrollments.id, enrollmentIds))
        .returning();

      logger.info(`[HARD DELETE] Deleted ${deletedEnrollments.length} enrollments`);
    }

    // STEP 5: Delete the course (will cascade delete courseTeachers, courseTimeslots, courseEvents)
    await db
      .delete(courses)
      .where(eq(courses.id, courseId));

    logger.info(`[HARD DELETE] Course ${courseId} and all related data deleted successfully`);

    return {
      message: 'Course and all related data permanently deleted',
      deletedEnrollments: courseEnrollments.length,
    };
  },

  // Teacher assignment methods
  async assignTeacher(courseId: string, input: AssignTeacherInput) {
    // Verify course exists
    await this.getCourseById(courseId);

    // Verify teacher exists and is a teacher
    const [teacher] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, input.teacherId), eq(users.role, 'teacher')))
      .limit(1);

    if (!teacher) {
      throw new AppError(404, 'Teacher not found');
    }

    // Check if already assigned
    const existing = await db
      .select()
      .from(courseTeachers)
      .where(
        and(
          eq(courseTeachers.courseId, courseId),
          eq(courseTeachers.teacherId, input.teacherId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new AppError(400, 'Teacher already assigned to this course');
    }

    // Validate percentage
    const percentage = parseFloat(input.percentageCut);
    if (percentage < 0 || percentage > 100) {
      throw new AppError(400, 'Percentage must be between 0 and 100');
    }

    // Assign teacher
    const [assignment] = await db
      .insert(courseTeachers)
      .values({
        courseId,
        teacherId: input.teacherId,
        percentageCut: input.percentageCut,
      })
      .returning();

    return assignment;
  },

  async updateTeacherAssignment(
    courseId: string,
    teacherId: string,
    percentageCut: string
  ) {
    const percentage = parseFloat(percentageCut);
    if (percentage < 0 || percentage > 100) {
      throw new AppError(400, 'Percentage must be between 0 and 100');
    }

    const [updated] = await db
      .update(courseTeachers)
      .set({ percentageCut })
      .where(
        and(
          eq(courseTeachers.courseId, courseId),
          eq(courseTeachers.teacherId, teacherId)
        )
      )
      .returning();

    if (!updated) {
      throw new AppError(404, 'Teacher assignment not found');
    }

    return updated;
  },

  async removeTeacher(courseId: string, teacherId: string) {
    await db
      .delete(courseTeachers)
      .where(
        and(
          eq(courseTeachers.courseId, courseId),
          eq(courseTeachers.teacherId, teacherId)
        )
      );

    return { message: 'Teacher removed from course' };
  },

  async getCourseTeachers(courseId: string) {
    const assignments = await db
      .select({
        id: courseTeachers.id,
        teacherId: courseTeachers.teacherId,
        percentageCut: courseTeachers.percentageCut,
        assignedAt: courseTeachers.assignedAt,
        teacher: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(courseTeachers)
      .innerJoin(users, eq(courseTeachers.teacherId, users.id))
      .where(eq(courseTeachers.courseId, courseId));

    return assignments;
  },

  // Timeslot methods
  async createTimeslot(input: CreateTimeslotInput) {
    // Verify course exists
    const course = await this.getCourseById(input.courseId);

    // Validate class type requirements
    if (input.classType === 'online' || input.classType === 'hybrid' || input.classType === '1-to-1') {
      // Online, hybrid, and 1-to-1 classes require a teacher
      if (!input.teacherId) {
        throw new AppError(400, 'Teacher is required for online, hybrid, and 1-to-1 classes');
      }

      // Verify teacher exists
      const [teacher] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, input.teacherId), eq(users.role, 'teacher')))
        .limit(1);

      if (!teacher) {
        throw new AppError(404, 'Teacher not found');
      }

      // Verify teacher has Teams connected
      const isConnected = await teamsOAuthService.isTeamsConnected(input.teacherId);
      if (!isConnected) {
        throw new AppError(400, 'Teacher must connect Microsoft Teams before creating online, hybrid, or 1-to-1 classes');
      }
    }

    // Room validation - now optional for all class types
    if (input.roomId) {
      const [room] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, input.roomId))
        .limit(1);

      if (!room) {
        throw new AppError(404, 'Room not found');
      }
    }

    // Validate days of week
    if (!input.daysOfWeek || input.daysOfWeek.length === 0) {
      throw new AppError(400, 'At least one day of week must be selected');
    }
    if (input.daysOfWeek.some(day => day < 0 || day > 6)) {
      throw new AppError(400, 'Each day of week must be between 0 (Sunday) and 6 (Saturday)');
    }

    // Auto-generate Teams meeting for online, hybrid, and 1-to-1 classes
    let teamsMeetingId: string | null = null;
    let teamsMeetingUrl: string | null = null;

    if ((input.classType === 'online' || input.classType === 'hybrid' || input.classType === '1-to-1') && input.teacherId) {
      try {
        // Get valid access token for teacher
        const accessToken = await teamsOAuthService.ensureValidToken(input.teacherId);

        // Generate meeting title
        const daysOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayNames = input.daysOfWeek.map(day => daysOfWeekNames[day]).join(', ');
        const classTypeLabel = input.classType === 'hybrid' ? 'Hybrid' : input.classType === '1-to-1' ? '1-to-1' : 'Online';
        const meetingTitle = `${course.title} - ${classTypeLabel} - ${dayNames} ${input.startTime}-${input.endTime}`;

        // Create a sample start/end time for the meeting (using startDate + time)
        const startDateTime = new Date(`${input.startDate}T${input.startTime}:00`);
        const endDateTime = new Date(`${input.startDate}T${input.endTime}:00`);

        // Create persistent Teams meeting
        const meeting = await microsoftGraphService.createTeamsMeeting(
          accessToken,
          meetingTitle,
          startDateTime.toISOString(),
          endDateTime.toISOString()
        );

        teamsMeetingId = meeting.meetingId;
        teamsMeetingUrl = meeting.joinUrl;

        logger.info('Created Teams meeting for timeslot', {
          courseId: input.courseId,
          teacherId: input.teacherId,
          classType: input.classType,
          meetingId: teamsMeetingId,
        });
      } catch (error: any) {
        logger.error('Failed to create Teams meeting for timeslot', {
          error: error.message,
          teacherId: input.teacherId,
        });
        throw new AppError(500, 'Failed to create Microsoft Teams meeting. Please try again.');
      }
    }

    const [timeslot] = await db
      .insert(courseTimeslots)
      .values({
        courseId: input.courseId,
        teacherId: input.teacherId || null,
        roomId: input.roomId || null,
        daysOfWeek: input.daysOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        recurrenceType: input.recurrenceType,
        startDate: input.startDate,
        endDate: input.endDate || null,
        classType: input.classType,
        teamsMeetingId,
        teamsMeetingUrl,
        teamsCreatedBy: (input.classType === 'online' || input.classType === 'hybrid' || input.classType === '1-to-1') ? input.teacherId : null,
        isActive: true,
      })
      .returning();

    // Auto-generate events for the next 30 days
    try {
      const startDate = new Date(input.startDate);
      const endDate = input.endDate ? new Date(input.endDate) : addDays(new Date(), 90); // 90 days or until endDate
      const limitDate = addDays(new Date(), 90); // Don't generate more than 90 days ahead
      const finalEndDate = endDate < limitDate ? endDate : limitDate;

      await calendarService.generateEventsFromTimeslot(timeslot.id, startDate, finalEndDate);

      logger.info('Auto-generated events for new timeslot', {
        timeslotId: timeslot.id,
        courseId: input.courseId,
        daysOfWeek: input.daysOfWeek,
      });
    } catch (error: any) {
      logger.error('Failed to auto-generate events for timeslot', {
        timeslotId: timeslot.id,
        error: error.message,
      });
      // Don't fail the timeslot creation if event generation fails
    }

    return timeslot;
  },

  async getCourseTimeslots(courseId: string) {
    const timeslots = await db
      .select({
        id: courseTimeslots.id,
        roomId: courseTimeslots.roomId,
        daysOfWeek: courseTimeslots.daysOfWeek,
        startTime: courseTimeslots.startTime,
        endTime: courseTimeslots.endTime,
        recurrenceType: courseTimeslots.recurrenceType,
        startDate: courseTimeslots.startDate,
        endDate: courseTimeslots.endDate,
        isActive: courseTimeslots.isActive,
        classType: courseTimeslots.classType,
        teamsMeetingId: courseTimeslots.teamsMeetingId,
        teamsMeetingUrl: courseTimeslots.teamsMeetingUrl,
        teamsCreatedBy: courseTimeslots.teamsCreatedBy,
        teacherId: courseTimeslots.teacherId,
        room: {
          id: rooms.id,
          name: rooms.name,
          capacity: rooms.capacity,
        },
      })
      .from(courseTimeslots)
      .leftJoin(rooms, eq(courseTimeslots.roomId, rooms.id))
      .where(and(
        eq(courseTimeslots.courseId, courseId),
        eq(courseTimeslots.isActive, true)
      ));

    return timeslots;
  },

  async updateTimeslot(timeslotId: string, input: Partial<CreateTimeslotInput>) {
    const [updated] = await db
      .update(courseTimeslots)
      .set(input)
      .where(eq(courseTimeslots.id, timeslotId))
      .returning();

    if (!updated) {
      throw new AppError(404, 'Timeslot not found');
    }

    // Check if schedule-affecting fields changed (requires regeneration)
    // startTime is included because it's part of the unique constraint (courseId, eventDate, startTime)
    const scheduleChanged =
      input.daysOfWeek !== undefined ||
      input.recurrenceType !== undefined ||
      input.startDate !== undefined ||
      input.endDate !== undefined ||
      input.startTime !== undefined;

    if (scheduleChanged) {
      // Delete future scheduled events and regenerate
      await db
        .delete(courseEvents)
        .where(
          and(
            eq(courseEvents.timeslotId, timeslotId),
            sql`${courseEvents.eventDate} >= CURRENT_DATE`,
            eq(courseEvents.status, 'scheduled')
          )
        );

      // Regenerate events for next 90 days
      const today = new Date();
      const futureDate = addDays(today, 90);
      await calendarService.generateEventsFromTimeslot(timeslotId, today, futureDate);

      logger.info(`[TIMESLOT] Regenerated events for timeslot ${timeslotId} after schedule change`);
    } else {
      // Sync non-schedule changes to future events (only scheduled events, not completed/cancelled)
      const eventUpdates: any = {};

      if (input.startTime !== undefined) eventUpdates.startTime = input.startTime;
      if (input.endTime !== undefined) eventUpdates.endTime = input.endTime;
      if (input.roomId !== undefined) eventUpdates.roomId = input.roomId;
      if (input.teacherId !== undefined) eventUpdates.teacherId = input.teacherId;
      if (input.classType !== undefined) eventUpdates.classType = input.classType;
      if (input.teamsMeetingId !== undefined) eventUpdates.teamsMeetingId = input.teamsMeetingId;
      if (input.teamsMeetingUrl !== undefined) eventUpdates.teamsMeetingUrl = input.teamsMeetingUrl;
      if (input.teamsCreatedBy !== undefined) eventUpdates.teamsCreatedBy = input.teamsCreatedBy;

      // If there are changes to sync
      if (Object.keys(eventUpdates).length > 0) {
        eventUpdates.updatedAt = new Date();

        // Only sync to events that are not manually overridden
        await db
          .update(courseEvents)
          .set(eventUpdates)
          .where(
            and(
              eq(courseEvents.timeslotId, timeslotId),
              sql`${courseEvents.eventDate} >= CURRENT_DATE`,
              eq(courseEvents.status, 'scheduled'),
              eq(courseEvents.isOverridden, false)
            )
          );

        logger.info(`[TIMESLOT] Synced field changes to future events for timeslot ${timeslotId}`);
      }
    }

    return updated;
  },

  async deleteTimeslot(timeslotId: string) {
    // Deactivate the timeslot
    await db
      .update(courseTimeslots)
      .set({ isActive: false })
      .where(eq(courseTimeslots.id, timeslotId));

    // Cancel all associated future events
    await db
      .update(courseEvents)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(courseEvents.timeslotId, timeslotId),
          sql`${courseEvents.eventDate} >= CURRENT_DATE`
        )
      );

    return { message: 'Timeslot deactivated and future events cancelled successfully' };
  },

  async endCourse(courseId: string, input: { endDate: string }) {
    const [existingCourse] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!existingCourse) {
      throw new AppError(404, 'Course not found');
    }
    if (existingCourse.endDate) {
      throw new AppError(400, 'Course has already been ended');
    }

    let activeEnrollments: Array<{ id: string; classType: string | null }> = [];

    await db.transaction(async (tx) => {
      await tx
        .update(courses)
        .set({ endDate: input.endDate, isActive: false, updatedAt: new Date() })
        .where(eq(courses.id, courseId));

      activeEnrollments = await tx
        .select({ id: enrollments.id, classType: enrollments.classType })
        .from(enrollments)
        .where(and(eq(enrollments.courseId, courseId), eq(enrollments.status, 'active')));

      for (const enrollment of activeEnrollments) {
        await tx
          .update(enrollments)
          .set({ endDate: input.endDate, status: 'completed', completedAt: new Date() })
          .where(eq(enrollments.id, enrollment.id));
      }
    });

    logger.info(`[COURSES] Course ${courseId} ended on ${input.endDate}, ${activeEnrollments.length} enrollment(s) completed`);

    return { affectedEnrollments: activeEnrollments.length };
  },

  async generateEnrolledStudentsCSV(courseId: string, resetPasswords: boolean = false) {
    // Verify course exists
    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new AppError(404, 'Course not found');
    }

    // Get all active enrollments for this course with student details
    const activeEnrollments = await db
      .select({
        studentId: enrollments.studentId,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        parentPhone: users.parentPhone,
      })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .where(
        and(
          eq(enrollments.courseId, courseId),
          eq(enrollments.status, 'active'),
          eq(users.isActive, true)
        )
      )
      .orderBy(users.firstName, users.lastName);

    if (activeEnrollments.length === 0) {
      throw new AppError(404, 'No active students enrolled in this course');
    }

    // Generate CSV data
    const csvRows: string[] = [];

    // Header
    csvRows.push('First Name,Last Name,Username,Email,Phone,Parent Phone,Password');

    // Process each student
    for (const enrollment of activeEnrollments) {
      let password = '';

      if (resetPasswords) {
        // Generate a new random password
        password = crypto.randomBytes(8).toString('base64').slice(0, 12);

        // Reset the student's password
        try {
          await usersService.resetPassword(enrollment.studentId, password);
          logger.info(`Password reset for student ${enrollment.username} in course ${courseId}`);
        } catch (error: any) {
          logger.error(`Failed to reset password for student ${enrollment.username}`, {
            error: error.message,
          });
          password = 'ERROR_RESETTING';
        }
      } else {
        password = '(Not reset)';
      }

      // Escape CSV values
      const escapeCsvValue = (value: string | null) => {
        if (!value) return '';
        // If value contains comma, newline, or quote, wrap in quotes and escape quotes
        if (value.includes(',') || value.includes('\n') || value.includes('"')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      };

      csvRows.push([
        escapeCsvValue(enrollment.firstName),
        escapeCsvValue(enrollment.lastName),
        escapeCsvValue(enrollment.username),
        escapeCsvValue(enrollment.email),
        escapeCsvValue(enrollment.phone),
        escapeCsvValue(enrollment.parentPhone),
        escapeCsvValue(password),
      ].join(','));
    }

    logger.info(`Generated CSV for ${activeEnrollments.length} students in course ${courseId}, resetPasswords: ${resetPasswords}`);

    return csvRows.join('\n');
  },
};

export default coursesService;
