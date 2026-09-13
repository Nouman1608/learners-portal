import { db } from '../config/database';
import { courseEvents, courseTimeslots, courses, users, rooms } from '../db/schema';
import { enrollments } from '../db/schema/enrollments';
import { eq, and, gte, lte, or, between, sql, inArray, ne } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import { addDays, addWeeks, addMonths, startOfDay, endOfDay, format, parse } from 'date-fns';

export interface CreateEventInput {
  timeslotId: string;
  courseId: string;
  roomId?: string;
  teacherId?: string;
  eventDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  notes?: string;
  classType?: 'local' | 'online' | 'hybrid' | '1-to-1';
  teamsMeetingId?: string;
  teamsMeetingUrl?: string;
  teamsCreatedBy?: string;
}

export interface UpdateEventInput {
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  roomId?: string;
  teacherId?: string;
  status?: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  notes?: string;
}

export const calendarService = {
  /**
   * Generate events from a timeslot for a given date range
   */
  async generateEventsFromTimeslot(timeslotId: string, startDate: Date, endDate: Date) {
    // Get timeslot details
    const [timeslot] = await db
      .select()
      .from(courseTimeslots)
      .where(eq(courseTimeslots.id, timeslotId))
      .limit(1);

    if (!timeslot) {
      throw new AppError(404, 'Timeslot not found');
    }

    const events = [];
    const finalDate = timeslot.endDate ? new Date(timeslot.endDate) : endDate;
    const maxDate = finalDate < endDate ? finalDate : endDate;

    // Generate events for each day of the week in the timeslot
    for (const dayOfWeek of timeslot.daysOfWeek) {
      let currentDate = new Date(timeslot.startDate);

      // Don't generate events before the requested startDate
      if (currentDate < startDate) {
        currentDate = new Date(startDate);
      }

      // Adjust currentDate to the next occurrence of this day of week
      while (currentDate.getDay() !== dayOfWeek) {
        currentDate = addDays(currentDate, 1);
      }

      // Generate events for this day of week until maxDate
      while (currentDate <= maxDate) {
        // Check if event already exists for this date (match unique constraint: course_id, event_date, start_time)
        const eventDateStr = format(currentDate, 'yyyy-MM-dd');
        const existing = await db
          .select()
          .from(courseEvents)
          .where(
            and(
              eq(courseEvents.courseId, timeslot.courseId),
              eq(courseEvents.eventDate, eventDateStr),
              eq(courseEvents.startTime, timeslot.startTime)
            )
          )
          .limit(1);

        if (existing.length === 0) {
          events.push({
            timeslotId: timeslot.id,
            courseId: timeslot.courseId,
            teacherId: timeslot.teacherId,
            roomId: timeslot.roomId,
            eventDate: eventDateStr,
            startTime: timeslot.startTime,
            endTime: timeslot.endTime,
            status: 'scheduled' as const,
            classType: timeslot.classType,
            // Copy persistent Teams meeting link from timeslot
            teamsMeetingId: timeslot.teamsMeetingId,
            teamsMeetingUrl: timeslot.teamsMeetingUrl,
            teamsCreatedBy: timeslot.teamsCreatedBy,
          });
        }

        // Move to next occurrence based on recurrence type
        switch (timeslot.recurrenceType) {
          case 'weekly':
            currentDate = addWeeks(currentDate, 1);
            break;
          case 'biweekly':
            currentDate = addWeeks(currentDate, 2);
            break;
          case 'monthly':
            currentDate = addMonths(currentDate, 1);
            // Adjust to the same day of week
            while (currentDate.getDay() !== dayOfWeek) {
              currentDate = addDays(currentDate, 1);
            }
            break;
        }
      }
    }

    // Bulk insert events
    if (events.length > 0) {
      await db.insert(courseEvents).values(events);
    }

    return { message: `Generated ${events.length} events`, count: events.length };
  },

  /**
   * Generate events for all active timeslots for the next N days
   */
  async generateUpcomingEvents(daysAhead: number = 30) {
    const today = new Date();
    const futureDate = addDays(today, daysAhead);

    // Get all active timeslots
    const activeTimeslots = await db
      .select()
      .from(courseTimeslots)
      .where(eq(courseTimeslots.isActive, true));

    let totalGenerated = 0;

    for (const timeslot of activeTimeslots) {
      const result = await this.generateEventsFromTimeslot(
        timeslot.id,
        today,
        futureDate
      );
      totalGenerated += result.count;
    }

    return { message: `Generated ${totalGenerated} events`, count: totalGenerated };
  },

  /**
   * Get events with filtering
   */
  async getEvents(filters?: {
    courseId?: string;
    teacherId?: string;
    roomId?: string;
    studentId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }) {
    let query = db
      .select({
        id: courseEvents.id,
        timeslotId: courseEvents.timeslotId,
        courseId: courseEvents.courseId,
        roomId: courseEvents.roomId,
        teacherId: courseEvents.teacherId,
        eventDate: courseEvents.eventDate,
        startTime: courseEvents.startTime,
        endTime: courseEvents.endTime,
        status: courseEvents.status,
        classType: courseEvents.classType,
        teamsMeetingId: courseEvents.teamsMeetingId,
        teamsMeetingUrl: courseEvents.teamsMeetingUrl,
        recordingUrl: courseEvents.recordingUrl,
        notes: courseEvents.notes,
        course: {
          id: courses.id,
          title: courses.title,
          subject: courses.subject,
          courseCategory: courses.courseCategory,
        },
        room: {
          id: rooms.id,
          name: rooms.name,
          capacity: rooms.capacity,
        },
        teacher: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        },
      })
      .from(courseEvents)
      .innerJoin(courses, eq(courseEvents.courseId, courses.id))
      .leftJoin(rooms, eq(courseEvents.roomId, rooms.id))
      .leftJoin(users, eq(courseEvents.teacherId, users.id));

    const conditions = [];

    // If filtering by student, get their enrolled courses
    if (filters?.studentId) {
      const studentEnrollments = await db
        .select({ courseId: enrollments.courseId })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.studentId, filters.studentId),
            eq(enrollments.status, 'active')
          )
        );

      const enrolledCourseIds = studentEnrollments.map(e => e.courseId);

      if (enrolledCourseIds.length === 0) {
        // Student has no enrollments, return empty array
        return [];
      }

      conditions.push(inArray(courseEvents.courseId, enrolledCourseIds));
    }

    if (filters?.courseId) {
      conditions.push(eq(courseEvents.courseId, filters.courseId));
    }
    if (filters?.teacherId) {
      conditions.push(eq(courseEvents.teacherId, filters.teacherId));
    }
    if (filters?.roomId) {
      conditions.push(eq(courseEvents.roomId, filters.roomId));
    }
    if (filters?.status) {
      conditions.push(eq(courseEvents.status, filters.status));
    }
    if (filters?.startDate) {
      conditions.push(gte(courseEvents.eventDate, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(courseEvents.eventDate, filters.endDate));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const events = await query;

    // Format times to HH:MM (remove seconds if present)
    return events.map(event => ({
      ...event,
      startTime: event.startTime.substring(0, 5), // HH:MM:SS -> HH:MM
      endTime: event.endTime.substring(0, 5),
    }));
  },

  /**
   * Get event by ID
   */
  async getEventById(eventId: string) {
    const [event] = await db
      .select({
        id: courseEvents.id,
        timeslotId: courseEvents.timeslotId,
        courseId: courseEvents.courseId,
        roomId: courseEvents.roomId,
        teacherId: courseEvents.teacherId,
        eventDate: courseEvents.eventDate,
        startTime: courseEvents.startTime,
        endTime: courseEvents.endTime,
        status: courseEvents.status,
        classType: courseEvents.classType,
        teamsMeetingId: courseEvents.teamsMeetingId,
        teamsMeetingUrl: courseEvents.teamsMeetingUrl,
        recordingUrl: courseEvents.recordingUrl,
        notes: courseEvents.notes,
        course: {
          id: courses.id,
          title: courses.title,
          subject: courses.subject,
          courseCategory: courses.courseCategory,
          description: courses.description,
        },
        room: {
          id: rooms.id,
          name: rooms.name,
          capacity: rooms.capacity,
        },
        teacher: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(courseEvents)
      .innerJoin(courses, eq(courseEvents.courseId, courses.id))
      .leftJoin(rooms, eq(courseEvents.roomId, rooms.id))
      .leftJoin(users, eq(courseEvents.teacherId, users.id))
      .where(eq(courseEvents.id, eventId))
      .limit(1);

    if (!event) {
      throw new AppError(404, 'Event not found');
    }

    // Format times to HH:MM (remove seconds if present)
    return {
      ...event,
      startTime: event.startTime.substring(0, 5),
      endTime: event.endTime.substring(0, 5),
    };
  },

  /**
   * Check for conflicts (teacher or room double-booking)
   */
  async checkConflicts(
    eventDate: string,
    startTime: string,
    endTime: string,
    teacherId?: string,
    roomId?: string,
    excludeEventId?: string
  ): Promise<{ hasConflict: boolean; conflicts: any[] }> {
    const conflicts = [];

    // Check teacher conflict
    if (teacherId) {
      const teacherConditions = [
        eq(courseEvents.eventDate, eventDate),
        eq(courseEvents.teacherId, teacherId),
        or(
          // Overlapping time ranges
          and(
            lte(courseEvents.startTime, startTime),
            gte(courseEvents.endTime, startTime)
          ),
          and(
            lte(courseEvents.startTime, endTime),
            gte(courseEvents.endTime, endTime)
          ),
          and(
            gte(courseEvents.startTime, startTime),
            lte(courseEvents.endTime, endTime)
          )
        )
      ];

      if (excludeEventId) {
        teacherConditions.push(ne(courseEvents.id, excludeEventId));
      }

      const teacherConflicts = await db
        .select()
        .from(courseEvents)
        .where(and(...teacherConditions));
      if (teacherConflicts.length > 0) {
        conflicts.push({
          type: 'teacher',
          message: 'Teacher is already scheduled at this time',
          events: teacherConflicts,
        });
      }
    }

    // Check room conflict
    if (roomId) {
      const roomConditions = [
        eq(courseEvents.eventDate, eventDate),
        eq(courseEvents.roomId, roomId),
        or(
          and(
            lte(courseEvents.startTime, startTime),
            gte(courseEvents.endTime, startTime)
          ),
          and(
            lte(courseEvents.startTime, endTime),
            gte(courseEvents.endTime, endTime)
          ),
          and(
            gte(courseEvents.startTime, startTime),
            lte(courseEvents.endTime, endTime)
          )
        )
      ];

      if (excludeEventId) {
        roomConditions.push(ne(courseEvents.id, excludeEventId));
      }

      const roomConflicts = await db
        .select()
        .from(courseEvents)
        .where(and(...roomConditions));
      if (roomConflicts.length > 0) {
        conflicts.push({
          type: 'room',
          message: 'Room is already booked at this time',
          events: roomConflicts,
        });
      }
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  },

  /**
   * Create a new event (manual booking)
   */
  async createEvent(input: CreateEventInput) {
    // Check for conflicts
    const conflictCheck = await this.checkConflicts(
      input.eventDate,
      input.startTime,
      input.endTime,
      input.teacherId,
      input.roomId
    );

    if (conflictCheck.hasConflict) {
      throw new AppError(409, 'Scheduling conflict detected');
    }

    // When classType isn't provided, inherit it from the course's active timeslot
    // instead of defaulting to 'local'. This matters for 1-to-1 courses: usage
    // billing counts completed events with classType='1-to-1', so an ad-hoc
    // event defaulting to 'local' would never be billed.
    let classType = input.classType;
    if (!classType) {
      const [timeslot] = await db
        .select({ classType: courseTimeslots.classType })
        .from(courseTimeslots)
        .where(
          and(
            eq(courseTimeslots.courseId, input.courseId),
            eq(courseTimeslots.isActive, true)
          )
        )
        .limit(1);
      classType = timeslot?.classType || 'local';
    }

    const [newEvent] = await db
      .insert(courseEvents)
      .values({
        // Convert placeholder UUID to null for one-off events
        timeslotId: input.timeslotId === '00000000-0000-0000-0000-000000000000' ? null : input.timeslotId,
        courseId: input.courseId,
        roomId: input.roomId || null,
        teacherId: input.teacherId || null,
        eventDate: input.eventDate,
        startTime: input.startTime,
        endTime: input.endTime,
        status: 'scheduled',
        classType,
        teamsMeetingId: input.teamsMeetingId || null,
        teamsMeetingUrl: input.teamsMeetingUrl || null,
        teamsCreatedBy: input.teamsCreatedBy || null,
        notes: input.notes || null,
      })
      .returning();

    return newEvent;
  },

  /**
   * Update an event (rescheduling)
   */
  async updateEvent(eventId: string, input: UpdateEventInput) {
    const existingEvent = await this.getEventById(eventId);

    // If rescheduling (changing date/time), check for conflicts
    if (input.eventDate || input.startTime || input.endTime || input.teacherId || input.roomId) {
      const eventDate = input.eventDate || existingEvent.eventDate;
      const startTime = input.startTime || existingEvent.startTime;
      const endTime = input.endTime || existingEvent.endTime;
      const teacherId = input.teacherId !== undefined ? input.teacherId : existingEvent.teacherId;
      const roomId = input.roomId !== undefined ? input.roomId : existingEvent.roomId;

      const conflictCheck = await this.checkConflicts(
        eventDate,
        startTime,
        endTime,
        teacherId || undefined,
        roomId || undefined,
        eventId
      );

      if (conflictCheck.hasConflict) {
        throw new AppError(409, 'Scheduling conflict detected');
      }
    }

    // Mark as overridden if this event has a timeslot and we're changing sync-able fields
    const syncableFieldsChanged =
      input.startTime !== undefined ||
      input.endTime !== undefined ||
      input.roomId !== undefined ||
      input.teacherId !== undefined;

    const updateData: any = { ...input };
    if (existingEvent.timeslotId && syncableFieldsChanged) {
      updateData.isOverridden = true;
    }

    const [updatedEvent] = await db
      .update(courseEvents)
      .set(updateData)
      .where(eq(courseEvents.id, eventId))
      .returning();

    if (!updatedEvent) {
      throw new AppError(404, 'Event not found');
    }

    return updatedEvent;
  },

  /**
   * Cancel an event
   */
  async cancelEvent(eventId: string) {
    return this.updateEvent(eventId, { status: 'cancelled' });
  },

  /**
   * Mark event as completed
   */
  async completeEvent(eventId: string) {
    return this.updateEvent(eventId, { status: 'completed' });
  },

  /**
   * Delete a single event (sudo only)
   */
  async deleteEvent(eventId: string) {
    // Check if event exists
    const [event] = await db
      .select()
      .from(courseEvents)
      .where(eq(courseEvents.id, eventId))
      .limit(1);

    if (!event) {
      throw new AppError(404, 'Event not found');
    }

    // Delete the event
    await db
      .delete(courseEvents)
      .where(eq(courseEvents.id, eventId));

    return { message: 'Event deleted successfully' };
  },

  /**
   * Delete all events with the same timeslotId (recurring events)
   */
  async deleteRecurringEvents(eventId: string) {
    // Get the event to find its timeslotId
    const [event] = await db
      .select()
      .from(courseEvents)
      .where(eq(courseEvents.id, eventId))
      .limit(1);

    if (!event) {
      throw new AppError(404, 'Event not found');
    }

    // If event has no timeslotId, it's a one-off event - just delete it
    if (!event.timeslotId) {
      await db
        .delete(courseEvents)
        .where(eq(courseEvents.id, eventId));

      return { message: 'Single event deleted', deletedCount: 1 };
    }

    // Find all events with the same timeslotId
    const eventsToDelete = await db
      .select()
      .from(courseEvents)
      .where(eq(courseEvents.timeslotId, event.timeslotId));

    // Delete all recurring events
    await db
      .delete(courseEvents)
      .where(eq(courseEvents.timeslotId, event.timeslotId));

    return {
      message: `Deleted ${eventsToDelete.length} recurring events`,
      deletedCount: eventsToDelete.length,
    };
  },
};

export default calendarService;
