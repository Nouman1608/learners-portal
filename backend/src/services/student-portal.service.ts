import { db } from '../config/database';
import { users } from '../db/schema/users';
import { enrollments, fees, payments } from '../db/schema/enrollments';
import { courses } from '../db/schema/courses';
import { assessments, assessmentResults } from '../db/schema/assessments';
import { attendanceRecords } from '../db/schema/attendance';
import { eq, and, sql, desc } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

/**
 * Student Portal Service
 * Provides consolidated data for parent view of student progress
 */
export const studentPortalService = {
  /**
   * Get comprehensive student overview for parents
   */
  async getStudentOverview(studentId: string) {
    try {
      // Get student basic info
      const student = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, studentId))
        .limit(1);

      if (student.length === 0) {
        throw new AppError(404, 'Student not found');
      }

      // Get enrolled courses
      const enrolledCourses = await db
        .select({
          courseId: courses.id,
          courseTitle: courses.title,
          courseSubject: courses.subject,
          whatsappGroupLink: courses.whatsappGroupLink,
          status: enrollments.status,
          enrolledAt: enrollments.enrolledAt,
        })
        .from(enrollments)
        .innerJoin(courses, eq(enrollments.courseId, courses.id))
        .where(eq(enrollments.studentId, studentId));

      // Get timeslots with full details for each course
      const coursesWithTimeslots = await Promise.all(
        enrolledCourses.map(async (course) => {
          const timeslots = await db
            .select({
              id: sql.raw('course_timeslots.id'),
              daysOfWeek: sql.raw('course_timeslots.days_of_week'),
              startTime: sql.raw('course_timeslots.start_time'),
              endTime: sql.raw('course_timeslots.end_time'),
              classType: sql.raw('course_timeslots.class_type'),
              teamsMeetingUrl: sql.raw('course_timeslots.teams_meeting_url'),
            })
            .from(sql.raw('course_timeslots'))
            .where(
              and(
                sql`course_timeslots.course_id = ${course.courseId}`,
                sql`course_timeslots.is_active = true`
              )
            );

          // Get the first Teams link (if any)
          const teamsLink = timeslots.find((t: any) => t.teamsMeetingUrl)?.teamsMeetingUrl || null;

          // Flatten timeslots - each day in daysOfWeek becomes a separate timeslot entry
          const flattenedTimeslots: any[] = [];
          timeslots.forEach((t: any) => {
            const days = Array.isArray(t.daysOfWeek) ? t.daysOfWeek : [];
            days.forEach((day: number) => {
              flattenedTimeslots.push({
                id: `${t.id}-${day}`,
                dayOfWeek: day,
                startTime: t.startTime,
                endTime: t.endTime,
                classType: t.classType,
                teamsMeetingUrl: t.teamsMeetingUrl,
              });
            });
          });

          // Sort by day of week
          flattenedTimeslots.sort((a, b) => a.dayOfWeek - b.dayOfWeek);

          return {
            ...course,
            teamsLink,
            timeslots: flattenedTimeslots,
          };
        })
      );

      // Get academic performance summary
      const performanceSummary = await db
        .select({
          totalAssessments: sql<number>`COUNT(*)::int`,
          averageScore: sql<number>`AVG((${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100))::float`,
          passedCount: sql<number>`SUM(CASE WHEN (${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100) >= 60 THEN 1 ELSE 0 END)::int`,
          failedCount: sql<number>`SUM(CASE WHEN (${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100) < 60 THEN 1 ELSE 0 END)::int`,
        })
        .from(assessmentResults)
        .innerJoin(assessments, eq(assessmentResults.assessmentId, assessments.id))
        .where(eq(assessmentResults.studentId, studentId));

      // Get attendance summary
      const attendanceSummary = await db
        .select({
          totalClasses: sql<number>`COUNT(*)::int`,
          presentCount: sql<number>`SUM(CASE WHEN ${attendanceRecords.status} = 'present' THEN 1 ELSE 0 END)::int`,
          lateCount: sql<number>`SUM(CASE WHEN ${attendanceRecords.status} = 'late' THEN 1 ELSE 0 END)::int`,
          absentCount: sql<number>`SUM(CASE WHEN ${attendanceRecords.status} = 'absent' THEN 1 ELSE 0 END)::int`,
        })
        .from(attendanceRecords)
        .where(eq(attendanceRecords.studentId, studentId));

      const attendanceRate = attendanceSummary[0].totalClasses > 0
        ? (attendanceSummary[0].presentCount / attendanceSummary[0].totalClasses * 100)
        : 0;

      // Get fees summary
      const feesSummary = await db
        .select({
          totalFees: sql<number>`COALESCE(SUM(${fees.amount}::numeric), 0)::float`,
          totalPaid: sql<number>`COALESCE(SUM(${payments.amount}::numeric), 0)::float`,
          pendingCount: sql<number>`COUNT(CASE WHEN ${fees.status} IN ('pending', 'overdue') THEN 1 END)::int`,
        })
        .from(fees)
        .leftJoin(payments, eq(fees.id, payments.feeId))
        .where(eq(fees.studentId, studentId));

      const totalOutstanding = feesSummary[0].totalFees - feesSummary[0].totalPaid;

      return {
        student: student[0],
        courses: coursesWithTimeslots,
        academic: {
          totalAssessments: performanceSummary[0]?.totalAssessments || 0,
          averageScore: performanceSummary[0]?.averageScore || 0,
          passedCount: performanceSummary[0]?.passedCount || 0,
          failedCount: performanceSummary[0]?.failedCount || 0,
          passRate: performanceSummary[0]?.totalAssessments > 0
            ? (performanceSummary[0].passedCount / performanceSummary[0].totalAssessments * 100)
            : 0,
        },
        attendance: {
          totalClasses: attendanceSummary[0]?.totalClasses || 0,
          presentCount: attendanceSummary[0]?.presentCount || 0,
          lateCount: attendanceSummary[0]?.lateCount || 0,
          absentCount: attendanceSummary[0]?.absentCount || 0,
          attendanceRate,
        },
        fees: {
          totalFees: feesSummary[0]?.totalFees || 0,
          totalPaid: feesSummary[0]?.totalPaid || 0,
          totalOutstanding,
          pendingCount: feesSummary[0]?.pendingCount || 0,
        },
      };
    } catch (error: any) {
      logger.error('Error getting student overview', { error: error.message, studentId });
      if (error instanceof AppError) throw error;
      throw new AppError(500, 'Failed to fetch student overview');
    }
  },

  /**
   * Get detailed academic performance
   */
  async getAcademicPerformance(studentId: string, courseId?: string) {
    try {
      let query = db
        .select({
          assessmentId: assessments.id,
          assessmentTitle: assessments.title,
          courseTitle: courses.title,
          courseSubject: courses.subject,
          maxScore: assessments.maxScore,
          score: assessmentResults.score,
          scorePercentage: sql<number>`(${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100)::float`,
          feedback: assessmentResults.feedback,
          submittedAt: assessmentResults.submittedAt,
          gradedAt: assessmentResults.gradedAt,
        })
        .from(assessmentResults)
        .innerJoin(assessments, eq(assessmentResults.assessmentId, assessments.id))
        .innerJoin(courses, eq(assessments.courseId, courses.id))
        .where(eq(assessmentResults.studentId, studentId))
        .$dynamic();

      if (courseId) {
        query = query.where(eq(assessments.courseId, courseId));
      }

      const results = await query.orderBy(desc(assessmentResults.gradedAt));

      return results;
    } catch (error: any) {
      logger.error('Error getting academic performance', { error: error.message, studentId });
      throw new AppError(500, 'Failed to fetch academic performance');
    }
  },

  /**
   * Get attendance history
   */
  async getAttendanceHistory(studentId: string, courseId?: string) {
    try {
      const query = db
        .select({
          id: attendanceRecords.id,
          eventDate: sql<string>`${sql.raw('course_events')}.event_date`,
          startTime: sql<string>`${sql.raw('course_events')}.start_time`,
          endTime: sql<string>`${sql.raw('course_events')}.end_time`,
          courseTitle: courses.title,
          courseSubject: courses.subject,
          status: attendanceRecords.status,
          joinedAt: attendanceRecords.joinedAt,
          leftAt: attendanceRecords.leftAt,
          durationMinutes: attendanceRecords.durationMinutes,
        })
        .from(attendanceRecords)
        .innerJoin(sql.raw('course_events'), sql`${attendanceRecords.courseEventId} = course_events.id`)
        .innerJoin(courses, sql`course_events.course_id = ${courses.id}`)
        .where(eq(attendanceRecords.studentId, studentId))
        .orderBy(sql`course_events.event_date DESC`);

      const records = await query;

      // Format times to HH:MM (remove seconds if present)
      return records.map(record => ({
        ...record,
        startTime: record.startTime.substring(0, 5),
        endTime: record.endTime.substring(0, 5),
      }));
    } catch (error: any) {
      logger.error('Error getting attendance history', { error: error.message, studentId });
      throw new AppError(500, 'Failed to fetch attendance history');
    }
  },

  /**
   * Get fees and payment history
   */
  async getFeesHistory(studentId: string) {
    try {
      const feesWithPayments = await db
        .select({
          feeId: fees.id,
          courseTitle: courses.title,
          courseSubject: courses.subject,
          month: fees.month,
          year: fees.year,
          amount: fees.amount,
          dueDate: fees.dueDate,
          status: fees.status,
          receivedAt: fees.receivedAt,
          // payments: sql<any>`
          //   COALESCE(
          //     json_agg(
          //       json_build_object(
          //         'id', ${payments.id},
          //         'amount', ${payments.amount},
          //         'paymentMethod', ${payments.paymentMethod},
          //         'paymentDate', ${payments.paymentDate},
          //         'transactionId', ${payments.transactionId}
          //       )
          //       ORDER BY ${payments.paymentDate} DESC
          //     ) FILTER (WHERE ${payments.id} IS NOT NULL),
          //     '[]'::json
          //   )
          // `,
        })
        .from(fees)
        .innerJoin(courses, eq(fees.courseId, courses.id))
        
        .where(eq(fees.studentId, studentId))
        .groupBy(fees.id, courses.title, courses.subject)
        .orderBy(desc(fees.year), desc(fees.month));

      return feesWithPayments;
    } catch (error: any) {
      logger.error('Error getting fees history', { error: error, studentId });
      logger.error('Error getting fees history', { error: error.message, studentId });
      throw new AppError(500, 'Failed to fetch fees history');
    }
  },
};
