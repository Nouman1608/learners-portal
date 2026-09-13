import { Request, Response } from 'express';
import { z } from 'zod';
import coursesService from '../services/courses.service';
import roomsService from '../services/rooms.service';
import teamsOAuthService from '../services/teams-oauth.service';
import microsoftGraphService from '../services/microsoft-graph.service';
import logger from '../utils/logger';

const createCourseSchema = z.object({
  courseCategory: z.enum(['senior', 'junior']),
  courseLevel: z.enum(['ig', 'alevel']).optional().or(z.literal('')),
  subject: z.string().max(100).optional().or(z.literal('')),
  teacherName: z.string().min(1, 'Teacher name is required').max(100),
  studentName: z.string().max(100).optional().or(z.literal('')),
  description: z.string().optional(),
  duration: z.number().int().positive('Duration must be positive'),
  whatsappGroupLink: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

const updateCourseSchema = z.object({
  courseCategory: z.enum(['senior', 'junior']).optional(),
  courseLevel: z.enum(['ig', 'alevel']).optional().or(z.literal('')),
  subject: z.string().max(100).optional().or(z.literal('')),
  teacherName: z.string().min(1).max(100).optional(),
  studentName: z.string().max(100).optional().or(z.literal('')),
  description: z.string().optional(),
  duration: z.number().int().positive().optional(),
  whatsappGroupLink: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  isActive: z.boolean().optional(),
});

const assignTeacherSchema = z.object({
  teacherId: z.string().uuid(),
  percentageCut: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid percentage format'),
});

const updateTeacherSchema = z.object({
  percentageCut: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid percentage format'),
});

const createTimeslotSchema = z.object({
  classType: z.enum(['online', 'local', 'hybrid', '1-to-1']),
  teacherId: z.preprocess((val) => val === '' ? undefined : val, z.string().uuid().optional()),
  roomId: z.preprocess((val) => val === '' ? undefined : val, z.string().uuid().optional()),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, 'At least one day must be selected'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)'),
  recurrenceType: z.enum(['weekly', 'biweekly', 'monthly']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  endDate: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return undefined;
      if (typeof val === 'string' && val.toLowerCase() === 'mm/dd/yyyy') return undefined;
      return val;
    },
    z.string().regex(/^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})$/, 'Invalid date format (YYYY-MM-DD or MM/DD/YYYY)').optional()
  ),
});

const createRoomSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  capacity: z.number().int().positive('Capacity must be positive'),
});

const updateRoomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  capacity: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

// Course Controllers
export const createCourse = async (req: Request, res: Response) => {
  try {
    const validatedData = createCourseSchema.parse(req.body);

    const course = await coursesService.createCourse({
      ...validatedData,
      courseLevel: validatedData.courseLevel || undefined,
      subject: validatedData.subject || undefined,
      studentName: validatedData.studentName || undefined,
      createdBy: req.user!.id,
    });

    logger.info(`Course created: ${course.title} by ${req.user!.username}`);

    return res.status(201).json({ course });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    throw error;
  }
};

export const getCourses = async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const courses = await coursesService.getCourses(activeOnly);
    return res.json({ courses, count: courses.length });
  } catch (error) {
    throw error;
  }
};

export const getCourseById = async (req: Request, res: Response) => {
  try {
    const course = await coursesService.getCourseById(req.params.id);
    return res.json({ course });
  } catch (error) {
    throw error;
  }
};

export const updateCourse = async (req: Request, res: Response) => {
  try {
    // Pass '' through untouched — it means "clear this field" (service maps '' → null).
    // Mapping '' to undefined here would make clearing a silent no-op.
    const validatedData = updateCourseSchema.parse(req.body);
    const course = await coursesService.updateCourse(req.params.id, validatedData);

    logger.info(`Course updated: ${course.title} by ${req.user!.username}`);

    return res.json({ course });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    throw error;
  }
};

export const deleteCourse = async (req: Request, res: Response) => {
  try {
    const result = await coursesService.deleteCourse(req.params.id);
    logger.info(`Course deleted: ${req.params.id} by ${req.user!.username}`);
    return res.json(result);
  } catch (error) {
    throw error;
  }
};

export const hardDeleteCourse = async (req: Request, res: Response) => {
  try {
    const result = await coursesService.hardDeleteCourse(req.params.id);
    logger.info(`Course HARD DELETED: ${req.params.id} by ${req.user!.username}`);
    return res.json(result);
  } catch (error) {
    throw error;
  }
};

const endCourseSchema = z.object({
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
});

export const endCourse = async (req: Request, res: Response) => {
  try {
    const validatedData = endCourseSchema.parse(req.body);
    const result = await coursesService.endCourse(req.params.id, { endDate: validatedData.endDate });
    logger.info(`Course ${req.params.id} ended on ${validatedData.endDate} by ${req.user!.username}`);
    return res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    throw error;
  }
};

// Teacher Assignment Controllers
export const assignTeacher = async (req: Request, res: Response) => {
  try {
    const validatedData = assignTeacherSchema.parse(req.body);

    // Teachers can only assign themselves, admins can assign anyone
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'sudo';
    const isSelfAssignment = validatedData.teacherId === req.user!.id;

    if (!isAdmin && !isSelfAssignment) {
      return res.status(403).json({
        error: 'Teachers can only assign themselves to courses. Contact an admin to assign other teachers.'
      });
    }

    const assignment = await coursesService.assignTeacher(req.params.id, validatedData);

    logger.info(`Teacher assigned to course ${req.params.id} by ${req.user!.username}`);

    return res.status(201).json({ assignment });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    throw error;
  }
};

export const updateTeacherAssignment = async (req: Request, res: Response) => {
  try {
    const validatedData = updateTeacherSchema.parse(req.body);
    const assignment = await coursesService.updateTeacherAssignment(
      req.params.id,
      req.params.teacherId,
      validatedData.percentageCut
    );

    logger.info(`Teacher assignment updated for course ${req.params.id} by ${req.user!.username}`);

    return res.json({ assignment });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    throw error;
  }
};

export const removeTeacher = async (req: Request, res: Response) => {
  try {
    const result = await coursesService.removeTeacher(req.params.id, req.params.teacherId);
    logger.info(`Teacher removed from course ${req.params.id} by ${req.user!.username}`);
    return res.json(result);
  } catch (error) {
    throw error;
  }
};

export const getCourseTeachers = async (req: Request, res: Response) => {
  try {
    const teachers = await coursesService.getCourseTeachers(req.params.id);
    return res.json({ teachers, count: teachers.length });
  } catch (error) {
    throw error;
  }
};

// Timeslot Controllers
export const createTimeslot = async (req: Request, res: Response) => {
  try {
    const validatedData = createTimeslotSchema.parse(req.body);
    const timeslot = await coursesService.createTimeslot({
      ...validatedData,
      courseId: req.params.id,
    });

    logger.info(`Timeslot created for course ${req.params.id} by ${req.user!.username}`);

    return res.status(201).json({ timeslot });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    throw error;
  }
};

export const getCourseTimeslots = async (req: Request, res: Response) => {
  try {
    const timeslots = await coursesService.getCourseTimeslots(req.params.id);
    return res.json({ timeslots, count: timeslots.length });
  } catch (error) {
    throw error;
  }
};

// The service supports updating activation state and Teams meeting fields —
// a plain partial() of the create schema would strip them
const updateTimeslotSchema = createTimeslotSchema.partial().extend({
  isActive: z.boolean().optional(),
  teamsMeetingId: z.string().optional().or(z.literal('')),
  teamsMeetingUrl: z.string().url().optional().or(z.literal('')),
});

export const updateTimeslot = async (req: Request, res: Response) => {
  try {
    const validatedData = updateTimeslotSchema.parse(req.body);
    const timeslot = await coursesService.updateTimeslot(req.params.timeslotId, validatedData);

    logger.info(`Timeslot updated: ${req.params.timeslotId} by ${req.user!.username}`);

    return res.json({ timeslot });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    throw error;
  }
};

export const deleteTimeslot = async (req: Request, res: Response) => {
  try {
    const result = await coursesService.deleteTimeslot(req.params.timeslotId);
    logger.info(`Timeslot deleted: ${req.params.timeslotId} by ${req.user!.username}`);
    return res.json(result);
  } catch (error) {
    throw error;
  }
};

// Room Controllers
export const createRoom = async (req: Request, res: Response) => {
  try {
    const validatedData = createRoomSchema.parse(req.body);
    const room = await roomsService.createRoom(validatedData);

    logger.info(`Room created: ${room.name} by ${req.user!.username}`);

    return res.status(201).json({ room });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    throw error;
  }
};

export const getRooms = async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const rooms = await roomsService.getRooms(activeOnly);
    return res.json({ rooms, count: rooms.length });
  } catch (error) {
    throw error;
  }
};

export const getRoomById = async (req: Request, res: Response) => {
  try {
    const room = await roomsService.getRoomById(req.params.id);
    return res.json({ room });
  } catch (error) {
    throw error;
  }
};

export const updateRoom = async (req: Request, res: Response) => {
  try {
    const validatedData = updateRoomSchema.parse(req.body);
    const room = await roomsService.updateRoom(req.params.id, validatedData);

    logger.info(`Room updated: ${room.name} by ${req.user!.username}`);

    return res.json({ room });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    throw error;
  }
};

export const downloadEnrolledStudentsCSV = async (req: Request, res: Response) => {
  try {
    const courseId = req.params.id;
    const resetPasswords = req.query.resetPasswords === 'true';

    const csvData = await coursesService.generateEnrolledStudentsCSV(courseId, resetPasswords);

    // Get course name for filename
    const course = await coursesService.getCourseById(courseId);
    const filename = `${course.title.replace(/\s+/g, '_')}_students_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    logger.info(`Downloaded enrolled students CSV for course ${courseId} by ${req.user!.username}, resetPasswords: ${resetPasswords}`);

    return res.send(csvData);
  } catch (error) {
    throw error;
  }
};

export const deleteRoom = async (req: Request, res: Response) => {
  try {
    const result = await roomsService.deleteRoom(req.params.id);
    logger.info(`Room deleted: ${req.params.id} by ${req.user!.username}`);
    return res.json(result);
  } catch (error) {
    throw error;
  }
};

// Teams Meeting State (sudo testing endpoint)
export const getTeamsMeetingState = async (req: Request, res: Response) => {
  try {
    const courseId = req.params.id;

    // Get course timeslots with Teams meeting IDs
    const timeslots = await coursesService.getCourseTimeslots(courseId);

    // Find a timeslot with a Teams meeting
    const timeslotWithMeeting = timeslots.find(
      (t) => t.teamsMeetingId && t.teamsCreatedBy
    );

    if (!timeslotWithMeeting || !timeslotWithMeeting.teamsMeetingId || !timeslotWithMeeting.teamsCreatedBy) {
      return res.status(404).json({
        error: 'No Teams meeting found for this course',
        timeslots: timeslots.map((t) => ({
          id: t.id,
          teamsMeetingId: t.teamsMeetingId,
          teamsCreatedBy: t.teamsCreatedBy,
        })),
      });
    }

    // Get the teacher's access token
    const teacherId = timeslotWithMeeting.teamsCreatedBy;
    const accessToken = await teamsOAuthService.ensureValidToken(teacherId);

    // Fetch meeting state from Microsoft Graph
    const meetingState = await microsoftGraphService.getMeetingState(
      accessToken,
      timeslotWithMeeting.teamsMeetingId
    );

    logger.info(`Teams meeting state fetched for course ${courseId} by ${req.user!.username}`);

    return res.json({
      timeslot: {
        id: timeslotWithMeeting.id,
        teamsMeetingId: timeslotWithMeeting.teamsMeetingId,
        teamsMeetingUrl: timeslotWithMeeting.teamsMeetingUrl,
        teamsCreatedBy: timeslotWithMeeting.teamsCreatedBy,
      },
      meetingState,
    });
  } catch (error: any) {
    logger.error('Error fetching Teams meeting state', {
      courseId: req.params.id,
      error: error.message,
    });
    throw error;
  }
};
