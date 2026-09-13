import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { calendarService } from '../services/calendar.service';
import microsoftGraphService from '../services/microsoft-graph.service';
import teamsOAuthService from '../services/teams-oauth.service';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

// Validation schemas
const createEventSchema = z.object({
  timeslotId: z.string().uuid(),
  courseId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  classType: z.enum(['local', 'online', 'hybrid', '1-to-1']).optional(),
  notes: z.string().max(1000).optional(),
  autoCreateTeamsMeeting: z.boolean().optional(),
  teamsMeetingUrl: z.string().url().optional(),
});

const updateEventSchema = z.object({
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  roomId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'rescheduled']).optional(),
  notes: z.string().max(1000).optional(),
});

const checkConflictsSchema = z.object({
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  teacherId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  excludeEventId: z.string().uuid().optional(),
});

const bulkCompleteEventsSchema = z.object({
  eventIds: z.array(z.string().uuid()).min(1),
});

export const getEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId, teacherId, roomId, studentId, startDate, endDate, status } = req.query;

    // Role-based filtering
    let filters: any = {
      courseId: courseId as string,
      teacherId: teacherId as string,
      roomId: roomId as string,
      startDate: startDate as string,
      endDate: endDate as string,
      status: status as string,
    };

    // If user is a teacher, only show their events
    if (req.user?.role === 'teacher') {
      filters.teacherId = req.user.id;
    }

    // If user is a student, show events for courses they're enrolled in
    if (req.user?.role === 'student') {
      filters.studentId = req.user.id;
    }

    const events = await calendarService.getEvents(filters);
    res.json({ events });
  } catch (error) {
    next(error);
  }
};

export const getEventById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await calendarService.getEventById(req.params.id);
    res.json({ event });
  } catch (error) {
    next(error);
  }
};

export const createEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createEventSchema.parse(req.body);

    // Validate Teams meeting options
    if (validated.autoCreateTeamsMeeting && validated.teamsMeetingUrl) {
      throw new AppError(400, 'Cannot specify both autoCreateTeamsMeeting and teamsMeetingUrl');
    }

    let teamsMeetingId: string | undefined;
    let teamsMeetingUrl: string | undefined;
    let teamsCreatedBy: string | undefined;

    // Auto-create Teams meeting if requested
    if (validated.autoCreateTeamsMeeting) {
      if (!req.user) {
        throw new AppError(401, 'Authentication required');
      }

      // Check if teacher has connected Teams
      const isConnected = await teamsOAuthService.isTeamsConnected(req.user.id);
      if (!isConnected) {
        throw new AppError(400, 'Please connect your Microsoft Teams account first');
      }

      logger.info('Auto-creating Teams meeting', { userId: req.user.id, courseId: validated.courseId });

      // Get valid access token
      const accessToken = await teamsOAuthService.ensureValidToken(req.user.id);

      // Combine date and time to create ISO timestamps
      const startDateTime = new Date(`${validated.eventDate}T${validated.startTime}:00`).toISOString();
      const endDateTime = new Date(`${validated.eventDate}T${validated.endTime}:00`).toISOString();

      // Create Teams meeting
      const meeting = await microsoftGraphService.createTeamsMeeting(
        accessToken,
        `Class: ${validated.courseId}`, // Will be improved with course title
        startDateTime,
        endDateTime
      );

      teamsMeetingId = meeting.meetingId;
      teamsMeetingUrl = meeting.joinUrl;
      teamsCreatedBy = req.user.id;

      logger.info('Teams meeting created successfully', {
        meetingId: teamsMeetingId,
        userId: req.user.id
      });
    }

    // Manual Teams meeting URL
    if (validated.teamsMeetingUrl) {
      teamsMeetingUrl = validated.teamsMeetingUrl;
      teamsMeetingId = microsoftGraphService.parseMeetingUrl(validated.teamsMeetingUrl) || undefined;

      if (req.user) {
        teamsCreatedBy = req.user.id;
      }
    }

    // Determine classType - if Teams meeting is created/provided, default to online
    const classType = validated.classType ||
                      (teamsMeetingUrl ? 'online' : 'local');

    // Create the event with Teams meeting details
    const eventData = {
      ...validated,
      classType,
      teamsMeetingId,
      teamsMeetingUrl,
      teamsCreatedBy,
    };

    const event = await calendarService.createEvent(eventData);
    res.status(201).json({ event });
  } catch (error) {
    next(error);
  }
};

export const updateEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = updateEventSchema.parse(req.body);
    const event = await calendarService.updateEvent(req.params.id, validated);
    res.json({ event });
  } catch (error) {
    next(error);
  }
};

export const cancelEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await calendarService.cancelEvent(req.params.id);
    res.json({ event });
  } catch (error) {
    next(error);
  }
};

export const completeEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await calendarService.completeEvent(req.params.id);
    res.json({ event });
  } catch (error) {
    next(error);
  }
};

export const bulkCompleteEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = bulkCompleteEventsSchema.parse(req.body);

    const results = [];
    const errors = [];

    for (const eventId of validated.eventIds) {
      try {
        const event = await calendarService.completeEvent(eventId);
        results.push({ eventId, success: true, event });
      } catch (error: any) {
        errors.push({ eventId, success: false, error: error.message });
      }
    }

    res.json({
      message: `Completed ${results.length} of ${validated.eventIds.length} events`,
      successful: results.length,
      failed: errors.length,
      results,
      errors,
    });
  } catch (error) {
    next(error);
  }
};

export const checkConflicts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = checkConflictsSchema.parse(req.body);
    const result = await calendarService.checkConflicts(
      validated.eventDate,
      validated.startTime,
      validated.endTime,
      validated.teacherId,
      validated.roomId,
      validated.excludeEventId
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const generateUpcomingEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const daysAhead = req.query.daysAhead ? parseInt(req.query.daysAhead as string) : 30;
    const result = await calendarService.generateUpcomingEvents(daysAhead);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const deleteEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only sudo can delete events
    if (req.user?.role !== 'sudo') {
      throw new AppError(403, 'Only sudo users can delete events');
    }

    await calendarService.deleteEvent(req.params.id);
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const deleteRecurringEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only sudo can delete events
    if (req.user?.role !== 'sudo') {
      throw new AppError(403, 'Only sudo users can delete events');
    }

    const result = await calendarService.deleteRecurringEvents(req.params.id);
    res.json({
      message: 'Recurring events deleted successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    next(error);
  }
};
