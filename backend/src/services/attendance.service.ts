import { db } from '../config/database';
import { attendanceRecords, attendanceSyncLog } from '../db/schema/attendance';
import { courseEvents, courses } from '../db/schema/courses';
import { enrollments } from '../db/schema/enrollments';
import { users } from '../db/schema/users';
import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import microsoftGraphService from './microsoft-graph.service';
import teamsOAuthService from './teams-oauth.service';

/**
 * Attendance Service
 * Handles automatic attendance syncing from Microsoft Teams meetings
 */
export const attendanceService = {
  /**
   * Sync attendance for a single event from Teams
   * @param eventId Course event ID
   */
  async syncEventAttendance(eventId: string, triggeredBy: 'cron' | 'manual' = 'cron'): Promise<{
    success: boolean;
    participantCount: number;
    message: string;
  }> {
    try {
      // 1. Get event details
      const [event] = await db
        .select()
        .from(courseEvents)
        .where(eq(courseEvents.id, eventId));

      if (!event) {
        throw new AppError(404, 'Course event not found');
      }

      if (!event.teamsMeetingId) {
        logger.warn('Event has no Teams meeting linked', { eventId });
        await this.logSync(eventId, 'no_meeting', 0, triggeredBy, 'No Teams meeting linked to this event');
        return { success: false, participantCount: 0, message: 'No Teams meeting linked' };
      }

      if (!event.teamsCreatedBy) {
        throw new AppError(400, 'Teams meeting has no creator associated');
      }

      // 2. Get teacher's OAuth token
      const accessToken = await teamsOAuthService.ensureValidToken(event.teamsCreatedBy);

      // 3. Fetch attendance report from Teams
      logger.info('Fetching attendance from Teams', { eventId, meetingId: event.teamsMeetingId });
      const attendanceReport = await microsoftGraphService.getMeetingAttendanceReport(
        accessToken,
        event.teamsMeetingId
      );

      if (attendanceReport.participants.length === 0) {
        logger.warn('No participants found in Teams meeting', { eventId, meetingId: event.teamsMeetingId });
        await this.logSync(eventId, 'success', 0, triggeredBy, 'Meeting has no participants yet');
        return { success: true, participantCount: 0, message: 'No participants in meeting' };
      }

      // 4. Get enrolled students for this course
      // For hybrid classes, only get students with attendance_mode = 'online'
      let enrolledStudents = await db
        .select({
          studentId: enrollments.studentId,
          userName: users.username,
          teamsUsername: users.teamsUsername,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          attendanceMode: enrollments.attendanceMode,
        })
        .from(enrollments)
        .innerJoin(users, eq(enrollments.studentId, users.id))
        .where(eq(enrollments.courseId, event.courseId));

      // For hybrid classes, only sync online students from Teams
      if (event.classType === 'hybrid') {
        enrolledStudents = enrolledStudents.filter((s: any) => s.attendanceMode === 'online');
        logger.info('Hybrid class: syncing only online students from Teams', {
          eventId,
          totalEnrolled: enrolledStudents.length,
        });
      }

      if (enrolledStudents.length === 0) {
        logger.warn('No enrolled students found for course', { eventId, courseId: event.courseId });
        await this.logSync(eventId, 'success', attendanceReport.participants.length, triggeredBy, 'No enrolled students to match');
        return { success: true, participantCount: attendanceReport.participants.length, message: 'No enrolled students' };
      }

      // 5. Match Teams participants to students by teamsUsername (fallback to portal username)
      const studentUsername = new Map(
        enrolledStudents.map(s => [(s.teamsUsername || s.userName).replace(/[.\-_ ]+/g, '').toLowerCase(), s])
      );
      
      const matchedParticipants = attendanceReport.participants
        .map(p => {
          const student = studentUsername.get(p.displayName.replace(/[.\-_ ]+/g, '').toLowerCase());
          return student ? { participant: p, student } : null;
        })
        .filter(m => m !== null);
        logger.info('Student username map', { usernames: Array.from(studentUsername.keys()), displayNames: attendanceReport.participants.map(p => p.displayName) });
      logger.info('Matched participants to students', {
        eventId,
        totalParticipants: attendanceReport.participants.length,
        matchedCount: matchedParticipants.length,
        unmatchedCount: attendanceReport.participants.length - matchedParticipants.length,
      });

      // 6. Calculate attendance status based on join/leave times
      // Combine eventDate with startTime/endTime to get full datetime
      const eventStart = new Date(`${event.eventDate}T${event.startTime}`);
      const eventEnd = new Date(`${event.eventDate}T${event.endTime}`);
      const eventDurationMinutes = (eventEnd.getTime() - eventStart.getTime()) / (1000 * 60);
      const lateThresholdMinutes = 5;
      const minimumAttendancePercentage = 0.8;

      const attendanceData = matchedParticipants.map(({ participant, student }) => {
        // Validate and parse join/leave times
        let joinedAt: Date | null = null;
        let leftAt: Date | null = null;

        try {
          if (participant.joinedAt) {
            joinedAt = new Date(participant.joinedAt);
            if (isNaN(joinedAt.getTime())) {
              joinedAt = null;
            }
          }
        } catch (e) {
          logger.warn('Invalid joinedAt date for participant', {
            participantId: participant.id,
            joinedAt: participant.joinedAt
          });
        }

        try {
          if (participant.leftAt) {
            leftAt = new Date(participant.leftAt);
            if (isNaN(leftAt.getTime())) {
              leftAt = null;
            }
          }
        } catch (e) {
          logger.warn('Invalid leftAt date for participant', {
            participantId: participant.id,
            leftAt: participant.leftAt
          });
        }

        const durationMinutes = participant.durationInSeconds / 60;

        // Log joined and left times for debugging
        logger.info('Processing attendance for student', {
          eventId,
          studentId: student.studentId,
          studentName: `${student.firstName} ${student.lastName}`,
          joinedAt: joinedAt ? joinedAt.toISOString() : 'null',
          leftAt: leftAt ? leftAt.toISOString() : 'null',
          eventStart: eventStart.toISOString(),
          eventEnd: eventEnd.toISOString(),
          durationMinutes: Math.round(durationMinutes),
          eventDurationMinutes: Math.round(eventDurationMinutes),
        });

        // Determine status
        let status: 'present' | 'late' | 'absent' = 'present';

        // Check if joined after meeting ended - mark as absent
        if (joinedAt && joinedAt.getTime() > eventEnd.getTime()) {
          status = 'absent';
          logger.info('Student marked as absent - joined after meeting ended', {
            studentId: student.studentId,
            joinedAt: joinedAt.toISOString(),
            eventEnd: eventEnd.toISOString(),
          });
        }
        // Check if joined late (more than 5 minutes after start)
        else if (joinedAt) {
          const minutesLate = (joinedAt.getTime() - eventStart.getTime()) / (1000 * 60);
          if (minutesLate > lateThresholdMinutes) {
            status = 'late';
            logger.info('Student marked as late - joined more than 5 minutes late', {
              studentId: student.studentId,
              minutesLate: Math.round(minutesLate),
            });
          }
        }

        // Check if attended less than 80% of class
        if (status !== 'absent') {
          const attendancePercentage = durationMinutes / eventDurationMinutes;
          if (attendancePercentage < minimumAttendancePercentage) {
            status = 'late';
            logger.info('Student marked as late - attended less than 80% of class', {
              studentId: student.studentId,
              attendancePercentage: (attendancePercentage * 100).toFixed(2) + '%',
            });
          }
        }

        return {
          courseEventId: eventId,
          studentId: student.studentId,
          status,
          joinedAt,
          leftAt,
          durationMinutes: Math.round(durationMinutes),
          source: 'teams' as const,
          teamsParticipantId: participant.id,
          syncedAt: new Date(),
        };
      });

      // 7. Mark students not in report as 'absent'
      const presentStudentIds = new Set(matchedParticipants.map(m => m.student.studentId));
      const absentStudents = enrolledStudents
        .filter(s => !presentStudentIds.has(s.studentId))
        .map(s => ({
          courseEventId: eventId,
          studentId: s.studentId,
          status: 'absent' as const,
          source: 'teams' as const,
          syncedAt: new Date(),
        }));

      const allAttendanceRecords = [...attendanceData, ...absentStudents];

      // 8. For 1-to-1 classes, also build teacher attendance record
      let teacherRecord: typeof allAttendanceRecords[0] | null = null;
      if (event.classType === '1-to-1' && event.teacherId) {
        const [teacherUser] = await db
          .select({
            id: users.id,
            userName: users.username,
            teamsUsername: users.teamsUsername,
            firstName: users.firstName,
            lastName: users.lastName,
          })
          .from(users)
          .where(eq(users.id, event.teacherId));

        if (teacherUser) {
          const normalizedTeacherName = (teacherUser.teamsUsername || teacherUser.userName)
            .replace(/[.\-_ ]+/g, '').toLowerCase();
          const teacherParticipant = attendanceReport.participants.find(
            p => p.displayName.replace(/[.\-_ ]+/g, '').toLowerCase() === normalizedTeacherName
          );

          if (teacherParticipant) {
            let tJoinedAt: Date | null = null;
            let tLeftAt: Date | null = null;
            try {
              if (teacherParticipant.joinedAt) tJoinedAt = new Date(teacherParticipant.joinedAt);
            } catch (_) { /* ignore */ }
            try {
              if (teacherParticipant.leftAt) tLeftAt = new Date(teacherParticipant.leftAt);
            } catch (_) { /* ignore */ }

            const tDurationMinutes = teacherParticipant.durationInSeconds / 60;
            let tStatus: 'present' | 'late' | 'absent' = 'present';
            if (tJoinedAt && tJoinedAt.getTime() > eventEnd.getTime()) {
              tStatus = 'absent';
            } else if (tJoinedAt) {
              const minutesLate = (tJoinedAt.getTime() - eventStart.getTime()) / (1000 * 60);
              if (minutesLate > lateThresholdMinutes) tStatus = 'late';
            }
            if (tStatus !== 'absent') {
              const pct = tDurationMinutes / eventDurationMinutes;
              if (pct < minimumAttendancePercentage) tStatus = 'late';
            }

            teacherRecord = {
              courseEventId: eventId,
              studentId: teacherUser.id,
              status: tStatus,
              joinedAt: tJoinedAt,
              leftAt: tLeftAt,
              durationMinutes: Math.round(tDurationMinutes),
              source: 'teams' as const,
              role: 'teacher' as const,
              teamsParticipantId: teacherParticipant.id,
              syncedAt: new Date(),
            } as any;
          } else {
            teacherRecord = {
              courseEventId: eventId,
              studentId: teacherUser.id,
              status: 'absent' as const,
              source: 'teams' as const,
              role: 'teacher' as const,
              syncedAt: new Date(),
            } as any;
          }
        }
      }

      const finalRecords = teacherRecord
        ? [...allAttendanceRecords, teacherRecord]
        : allAttendanceRecords;

      // 9. Upsert attendance records (update if exists, insert if not)
      for (const record of finalRecords) {
        const [existing] = await db
          .select()
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.courseEventId, record.courseEventId),
              eq(attendanceRecords.studentId, record.studentId)
            )
          );

        if (existing) {
          await db
            .update(attendanceRecords)
            .set({
              status: record.status,
              joinedAt: 'joinedAt' in record ? record.joinedAt : null,
              leftAt: 'leftAt' in record ? record.leftAt : null,
              durationMinutes: 'durationMinutes' in record ? record.durationMinutes : null,
              teamsParticipantId: 'teamsParticipantId' in record ? record.teamsParticipantId : null,
              syncedAt: record.syncedAt,
              updatedAt: new Date(),
            })
            .where(eq(attendanceRecords.id, existing.id));
        } else {
          await db.insert(attendanceRecords).values(record);
        }
      }

      // 10. Only mark attendanceSynced when triggered by cron (final authoritative sync)
      // Manual syncs leave the flag false so cron can still do a definitive re-sync later
      if (triggeredBy === 'cron') {
        await db
          .update(courseEvents)
          .set({ attendanceSynced: true })
          .where(eq(courseEvents.id, eventId));
      }

      // 11. Log sync result
      await this.logSync(
        eventId,
        'success',
        attendanceReport.participants.length,
        triggeredBy,
        `Synced ${matchedParticipants.length} present, ${absentStudents.length} absent`
      );

      logger.info('Attendance sync completed', {
        eventId,
        totalStudents: enrolledStudents.length,
        present: matchedParticipants.length,
        absent: absentStudents.length,
      });

      return {
        success: true,
        participantCount: attendanceReport.participants.length,
        message: `Synced ${matchedParticipants.length} present, ${absentStudents.length} absent`,
      };
    } catch (error: any) {
      logger.error('Error syncing event attendance', { eventId, error: error.message });
      await this.logSync(eventId, 'failed', 0, triggeredBy, error.message);
      throw new AppError(500, 'Failed to sync attendance from Teams');
    }
  },

  /**
   * Sync recent meetings (for cron job)
   * Finds meetings ended in last hour that haven't been synced
   */
  async syncRecentMeetings(): Promise<{
    total: number;
    synced: number;
    failed: number;
  }> {
    try {
      // Format times in PKT (Pakistan Standard Time, UTC+5) to match stored event times
      const formatPKT = (date: Date) => {
        // Convert to PKT by adding 5 hours offset
        const pktDate = new Date(date.getTime() + (5 * 60 * 60 * 1000));
        return pktDate.toISOString().slice(0, 19).replace('T', ' ');
      };

      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

      const twoHoursAgoPKT = formatPKT(twoHoursAgo);
      const tenMinutesAgoPKT = formatPKT(tenMinutesAgo);

      logger.info('Checking for events to sync', {
        windowStart: twoHoursAgoPKT,
        windowEnd: tenMinutesAgoPKT,
        nowUTC: now.toISOString()
      });

      // Find events that:
      // 1. Have teamsMeetingId (Teams meeting linked)
      // 2. attendanceSynced = false
      // 3. Event end time was 10 minutes to 2 hours ago (in PKT)
      const eventsToSync = await db
        .select()
        .from(courseEvents)
        .where(
          and(
            sql`${courseEvents.teamsMeetingId} IS NOT NULL`,
            eq(courseEvents.attendanceSynced, false),
            sql`(${courseEvents.eventDate}::date + ${courseEvents.endTime}::time) >= ${twoHoursAgoPKT}::timestamp`,
            sql`(${courseEvents.eventDate}::date + ${courseEvents.endTime}::time) <= ${tenMinutesAgoPKT}::timestamp`
          )
        );

      logger.info('Found events to sync', { count: eventsToSync.length });

      let synced = 0;
      let failed = 0;

      for (const event of eventsToSync) {
        try {
          await this.syncEventAttendance(event.id, 'cron');
          synced++;
        } catch (error: any) {
          logger.error('Failed to sync event in cron job', { eventId: event.id, error: error.message });
          failed++;
        }
      }

      logger.info('Cron attendance sync completed', { total: eventsToSync.length, synced, failed });

      return { total: eventsToSync.length, synced, failed };
    } catch (error: any) {
      logger.error('Error in syncRecentMeetings', { error: error.message });
      throw error;
    }
  },

  /**
   * Get attendance for an event with student details
   * @param eventId Course event ID
   */
  async getEventAttendance(eventId: string) {
    try {
      const attendance = await db
        .select({
          id: attendanceRecords.id,
          courseEventId: attendanceRecords.courseEventId,
          studentId: attendanceRecords.studentId,
          status: attendanceRecords.status,
          joinedAt: attendanceRecords.joinedAt,
          leftAt: attendanceRecords.leftAt,
          durationMinutes: attendanceRecords.durationMinutes,
          source: attendanceRecords.source,
          role: attendanceRecords.role,
          syncedAt: attendanceRecords.syncedAt,
          student: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
          },
        })
        .from(attendanceRecords)
        .innerJoin(users, eq(attendanceRecords.studentId, users.id))
        .where(eq(attendanceRecords.courseEventId, eventId))
        .orderBy(attendanceRecords.role, users.lastName, users.firstName);

      return attendance;
    } catch (error: any) {
      logger.error('Error getting event attendance', { eventId, error: error.message });
      throw new AppError(500, 'Failed to fetch attendance');
    }
  },

  /**
   * Get student attendance history
   * @param studentId Student ID
   * @param courseId Optional course filter
   * @param dateRange Optional date range { startDate, endDate }
   */
  async getStudentAttendance(
    studentId: string,
    courseId?: string,
    dateRange?: { startDate: Date; endDate: Date }
  ) {
    try {
      let query = db
        .select({
          id: attendanceRecords.id,
          status: attendanceRecords.status,
          joinedAt: attendanceRecords.joinedAt,
          leftAt: attendanceRecords.leftAt,
          durationMinutes: attendanceRecords.durationMinutes,
          syncedAt: attendanceRecords.syncedAt,
          event: {
            id: courseEvents.id,
            eventDate: courseEvents.eventDate,
            startTime: courseEvents.startTime,
            endTime: courseEvents.endTime,
            courseId: courseEvents.courseId,
          },
          course: {
            id: courses.id,
            title: courses.title,
          },
        })
        .from(attendanceRecords)
        .innerJoin(courseEvents, eq(attendanceRecords.courseEventId, courseEvents.id))
        .innerJoin(courses, eq(courseEvents.courseId, courses.id))
        .where(eq(attendanceRecords.studentId, studentId))
        .$dynamic();

      if (courseId) {
        query = query.where(eq(courseEvents.courseId, courseId));
      }

      if (dateRange) {
        query = query.where(
          and(
            gte(courseEvents.eventDate, dateRange.startDate.toISOString().split('T')[0]),
            lte(courseEvents.eventDate, dateRange.endDate.toISOString().split('T')[0])
          )
        );
      }

      const attendance = await query.orderBy(desc(courseEvents.eventDate));

      return attendance;
    } catch (error: any) {
      logger.error('Error getting student attendance', { studentId, error: error.message });
      throw new AppError(500, 'Failed to fetch student attendance');
    }
  },

  /**
   * Get course attendance statistics
   * @param courseId Course ID
   */
  async getCourseAttendanceStats(courseId: string) {
    try {
      // Get all attendance for this course
      const stats = await db
        .select({
          studentId: attendanceRecords.studentId,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          totalClasses: sql<number>`COUNT(${attendanceRecords.id})`,
          presentCount: sql<number>`SUM(CASE WHEN ${attendanceRecords.status} = 'present' THEN 1 ELSE 0 END)`,
          lateCount: sql<number>`SUM(CASE WHEN ${attendanceRecords.status} = 'late' THEN 1 ELSE 0 END)`,
          absentCount: sql<number>`SUM(CASE WHEN ${attendanceRecords.status} = 'absent' THEN 1 ELSE 0 END)`,
          averageDuration: sql<number>`AVG(${attendanceRecords.durationMinutes})`,
        })
        .from(attendanceRecords)
        .innerJoin(courseEvents, eq(attendanceRecords.courseEventId, courseEvents.id))
        .innerJoin(users, eq(attendanceRecords.studentId, users.id))
        .where(
          and(
            eq(courseEvents.courseId, courseId),
            eq(attendanceRecords.role, 'student')
          )
        )
        .groupBy(attendanceRecords.studentId, users.firstName, users.lastName, users.email);

      // Attendance rate based on absences: late counts as attended, only absent reduces the rate
      const statsWithRate = stats.map(s => ({
        ...s,
        attendanceRate: s.totalClasses > 0 ? ((s.presentCount + s.lateCount) / s.totalClasses) * 100 : 0,
        onTimeRate: s.totalClasses > 0 ? (s.presentCount / s.totalClasses) * 100 : 0,
      }));

      return statsWithRate;
    } catch (error: any) {
      logger.error('Error getting course attendance stats', { courseId, error: error.message });
      throw new AppError(500, 'Failed to fetch course attendance statistics');
    }
  },

  /**
   * Get student attendance rate for a course
   * @param studentId Student ID
   * @param courseId Course ID
   */
  async getStudentAttendanceRate(studentId: string, courseId: string): Promise<{
    totalClasses: number;
    presentCount: number;
    lateCount: number;
    absentCount: number;
    attendanceRate: number;
    onTimeRate: number;
  }> {
    try {
      const [stats] = await db
        .select({
          totalClasses: sql<number>`COUNT(${attendanceRecords.id})`,
          presentCount: sql<number>`SUM(CASE WHEN ${attendanceRecords.status} = 'present' THEN 1 ELSE 0 END)`,
          lateCount: sql<number>`SUM(CASE WHEN ${attendanceRecords.status} = 'late' THEN 1 ELSE 0 END)`,
          absentCount: sql<number>`SUM(CASE WHEN ${attendanceRecords.status} = 'absent' THEN 1 ELSE 0 END)`,
        })
        .from(attendanceRecords)
        .innerJoin(courseEvents, eq(attendanceRecords.courseEventId, courseEvents.id))
        .where(
          and(
            eq(attendanceRecords.studentId, studentId),
            eq(courseEvents.courseId, courseId),
            eq(attendanceRecords.role, 'student')
          )
        );

      // Attendance rate based on absences: late counts as attended, only absent reduces the rate
      const attendanceRate = stats.totalClasses > 0
        ? ((stats.presentCount + stats.lateCount) / stats.totalClasses) * 100 : 0;
      const onTimeRate = stats.totalClasses > 0
        ? (stats.presentCount / stats.totalClasses) * 100 : 0;

      return {
        ...stats,
        attendanceRate,
        onTimeRate,
      };
    } catch (error: any) {
      logger.error('Error getting student attendance rate', { studentId, courseId, error: error.message });
      throw new AppError(500, 'Failed to fetch student attendance rate');
    }
  },

  /**
   * Log attendance sync operation
   * @param eventId Course event ID
   * @param status Sync status
   * @param participantCount Number of participants
   * @param message Optional message
   */
  async logSync(
    eventId: string,
    status: 'success' | 'failed' | 'no_meeting',
    participantCount: number,
    syncedBy: 'cron' | 'manual',
    message?: string
  ): Promise<void> {
    try {
      await db.insert(attendanceSyncLog).values({
        courseEventId: eventId,
        status,
        participantCount,
        errorMessage: message,
        syncedBy,
      });
    } catch (error: any) {
      logger.error('Error logging sync', { eventId, error: error.message });
    }
  },

  /**
   * Mark attendance manually for local students
   * Used for hybrid classes and local classes
   * @param eventId Course event ID
   * @param attendanceData Array of student IDs with their attendance status
   */
  async markManualAttendance(
    eventId: string,
    attendanceData: Array<{
      studentId: string;
      status: 'present' | 'absent' | 'late';
    }>
  ): Promise<void> {
    try {
      // 1. Verify event exists
      const [event] = await db
        .select()
        .from(courseEvents)
        .where(eq(courseEvents.id, eventId));

      if (!event) {
        throw new AppError(404, 'Course event not found');
      }

      // 2. Verify all students are enrolled in the course
      const studentIds = attendanceData.map(a => a.studentId);
      const enrolledStudents = await db
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.courseId, event.courseId),
            inArray(enrollments.studentId, studentIds)
          )
        );

      if (enrolledStudents.length !== studentIds.length) {
        throw new AppError(400, 'Some students are not enrolled in this course');
      }

      // 3. For hybrid classes, ensure we're only marking local students
      if (event.classType === 'hybrid') {
        const localStudents = enrolledStudents.filter((e: any) => e.attendanceMode === 'local');
        const localStudentIds = new Set(localStudents.map((s: any) => s.studentId));

        const invalidStudents = attendanceData.filter(a => !localStudentIds.has(a.studentId));
        if (invalidStudents.length > 0) {
          throw new AppError(400, 'Cannot manually mark attendance for online students in hybrid classes');
        }
      }

      // 4. Upsert attendance records
      for (const record of attendanceData) {
        const [existing] = await db
          .select()
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.courseEventId, eventId),
              eq(attendanceRecords.studentId, record.studentId)
            )
          );

        if (existing) {
          await db
            .update(attendanceRecords)
            .set({
              status: record.status,
              source: 'manual',
              syncedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(attendanceRecords.id, existing.id));
        } else {
          await db.insert(attendanceRecords).values({
            courseEventId: eventId,
            studentId: record.studentId,
            status: record.status,
            source: 'manual',
            syncedAt: new Date(),
          });
        }
      }

      logger.info('Manual attendance marked', {
        eventId,
        recordCount: attendanceData.length,
      });
    } catch (error: any) {
      logger.error('Error marking manual attendance', { eventId, error: error.message });
      throw error;
    }
  },

  /**
   * Get enrolled students grouped by attendance mode
   * Used for hybrid class attendance UI
   */
  async getEnrolledStudentsByMode(
    eventId: string
  ): Promise<{
    local: Array<{ id: string; firstName: string; lastName: string; email: string }>;
    online: Array<{ id: string; firstName: string; lastName: string; email: string }>;
  }> {
    // Get event to find courseId
    const [event] = await db
      .select()
      .from(courseEvents)
      .where(eq(courseEvents.id, eventId));

    if (!event) {
      throw new AppError(404, 'Course event not found');
    }

    const students = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        attendanceMode: enrollments.attendanceMode,
      })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .where(
        and(
          eq(enrollments.courseId, event.courseId),
          eq(enrollments.status, 'active')
        )
      )
      .orderBy(users.lastName, users.firstName);

    return {
      local: students.filter((s: any) => s.attendanceMode === 'local'),
      online: students.filter((s: any) => s.attendanceMode === 'online'),
    };
  },
};

export default attendanceService;
