import { db } from '../config/database';
import { enrollments, fees, users, courses, courseTeachers, invoices } from '../db/schema';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import leadsService from './leads.service';
import { feesService } from './fees.service';
import { invoicesService } from './invoices.service';

export type CurrencyCode = 'PKR' | 'USD' | 'GBP' | 'SAR';

export interface CreateEnrollmentInput {
  studentId: string;
  courseId: string;
  createdBy: string;
  enrolledAt?: string; // Enrollment date (YYYY-MM-DD), defaults to now
  attendanceMode?: 'local' | 'online';
  classType?: 'online' | 'local' | 'hybrid' | '1-to-1';
  customFeePerMonth?: string; // Required for non-1-to-1 classes
  perSessionFee?: string; // Required for 1-to-1 classes (fee per session)
  expectedClassesPerMonth?: number; // Expected sessions per month for 1-to-1 (for projected fee display)
  currency?: CurrencyCode; // Only for online students, defaults to PKR
  feeType?: 'custom' | 'scholarship';
  prorateFirstMonth?: boolean; // Pro-rate first month by days to sync billing to the 1st
  feeNotes?: string; // Reason for custom fee
  startDate?: string; // Enrollment start date (YYYY-MM-DD)
  endDate?: string; // Enrollment end date (YYYY-MM-DD)
}

export interface UpdateEnrollmentInput {
  status?: 'active' | 'completed' | 'dropped';
  completedAt?: Date;
  enrolledAt?: Date; // Editable enrollment date
  startDate?: string; // Enrollment start date (YYYY-MM-DD)
  endDate?: string; // Enrollment end date (YYYY-MM-DD)
  droppedAt?: Date; // When student dropped
  willReturnAfterDrop?: boolean; // Will student return after dropping
  tentativeReturnDate?: string; // Tentative return date (YYYY-MM-DD)
  classType?: never; // Explicitly prevent classType changes
}

export const enrollmentsService = {
  async createEnrollment(input: CreateEnrollmentInput) {
    // Verify student exists and is a student
    const [student] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, input.studentId), eq(users.role, 'student')))
      .limit(1);

    if (!student) {
      throw new AppError(404, 'Student not found');
    }

    // Verify course exists and is active
    const [course] = await db
      .select()
      .from(courses)
      .where(and(eq(courses.id, input.courseId), eq(courses.isActive, true)))
      .limit(1);

    if (!course) {
      throw new AppError(404, 'Course not found or inactive');
    }

    // Check if already enrolled
    const existing = await db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, input.studentId),
          eq(enrollments.courseId, input.courseId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new AppError(400, 'Student already enrolled in this course');
    }

    // Determine currency - only online students can use non-PKR currencies
    const attendanceMode = input.attendanceMode || 'local';
    let currency: CurrencyCode = 'PKR'; // Default to PKR

    if (attendanceMode === 'online' && input.currency) {
      // Validate currency code
      const validCurrencies: CurrencyCode[] = ['PKR', 'USD', 'GBP', 'SAR'];
      if (!validCurrencies.includes(input.currency)) {
        throw new AppError(400, 'Invalid currency code');
      }
      currency = input.currency;
    } else if (attendanceMode === 'local' && input.currency && input.currency !== 'PKR') {
      // Warn if trying to use non-PKR for local students
      logger.warn(`Attempted to use ${input.currency} for local student. Defaulting to PKR.`, {
        studentId: input.studentId,
        courseId: input.courseId,
      });
    }

    // Validate fee fields based on class type
    const is1to1 = input.classType === '1-to-1';
    if (is1to1 && !input.perSessionFee) {
      throw new AppError(400, 'Per-session fee is required for 1-to-1 enrollments');
    }
    if (!is1to1 && !input.customFeePerMonth) {
      throw new AppError(400, 'Fee per month is required for enrollment');
    }

    // Create enrollment
    const [newEnrollment] = await db
      .insert(enrollments)
      .values({
        studentId: input.studentId,
        courseId: input.courseId,
        status: 'active',
        createdBy: input.createdBy,
        enrolledAt: input.enrolledAt ? new Date(input.enrolledAt) : new Date(),
        attendanceMode,
        classType: input.classType || null,
        customFeePerMonth: input.customFeePerMonth || null,
        perSessionFee: input.perSessionFee || null,
        expectedClassesPerMonth: input.expectedClassesPerMonth || null,
        currency, // Add currency field
        feeType: input.feeType || 'custom',
        prorateFirstMonth: input.prorateFirstMonth || false,
        feeNotes: input.feeNotes,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
      })
      .returning();

    // Generate initial fee for current month (skip for 1-to-1 classes - they use usage-based billing)
    if (!is1to1) {
      // The initial fee belongs to the enrollment month (honors backdating),
      // not blindly to the current month
      const now = new Date();
      const effectiveEnrolledAt = input.enrolledAt ? new Date(input.enrolledAt) : now;
      const feeMonth = effectiveEnrolledAt.getMonth() + 1;
      const feeYear = effectiveEnrolledAt.getFullYear();
      const enrolledDay = effectiveEnrolledAt.getDate();

      let feeAmount = input.customFeePerMonth!;
      let feeNotes: string | undefined;

      // Pro-rated first month: charge only the days from the enrollment date to the
      // end of that month, so billing syncs to the 1st from the next month onward
      if (input.prorateFirstMonth) {
        const daysInMonth = new Date(feeYear, feeMonth, 0).getDate();
        const chargedDays = daysInMonth - enrolledDay + 1;
        feeAmount = Math.round((chargedDays / daysInMonth) * parseFloat(feeAmount)).toString();
        feeNotes = `Pro-rated first month: ${chargedDays} of ${daysInMonth} days`;
      }

      // The child is billed the full month's fee immediately on enrollment,
      // no matter what day of the month they join (no 20th cutoff, no
      // catch-up — those are still used to gate the *teacher's* payout, one
      // month later than the child's bill when they joined on/after the
      // 20th; see feesService.shouldGenerateFeeForMonth).
      const dueDate = new Date(feeYear, feeMonth - 1, 10);

      await db.insert(fees).values({
        enrollmentId: newEnrollment.id,
        studentId: input.studentId,
        courseId: input.courseId,
        month: feeMonth,
        year: feeYear,
        amount: feeAmount,
        currency, // Use the same currency as enrollment
        dueDate: dueDate.toISOString().split('T')[0],
        status: 'pending',
        feeNotes,
      });
    } else {
      // 1-to-1: create a zero-amount placeholder fee for the enrollment month so
      // the admin can record sessions immediately (Edit Sessions on the Fees page).
      // The daily cron keeps it in sync with completed sessions from then on.
      const now = new Date();
      const effectiveEnrolledAt = input.enrolledAt ? new Date(input.enrolledAt) : now;
      const feeMonth = effectiveEnrolledAt.getMonth() + 1;
      const feeYear = effectiveEnrolledAt.getFullYear();
      const periodStart = new Date(feeYear, feeMonth - 1, 1).toISOString().split('T')[0];
      const periodEnd = new Date(feeYear, feeMonth, 0).toISOString().split('T')[0];

      await db.insert(fees).values({
        enrollmentId: newEnrollment.id,
        studentId: input.studentId,
        courseId: input.courseId,
        month: feeMonth,
        year: feeYear,
        amount: '0.00',
        currency,
        dueDate: new Date(feeYear, feeMonth - 1, 10).toISOString().split('T')[0],
        status: 'pending',
        billingType: 'usage',
        sessionCount: 0,
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
        feeNotes: `1-to-1 class: 0 session(s) × ${currency} ${parseFloat(input.perSessionFee!).toFixed(2)}`,
      });

      logger.info(`[ENROLLMENT] 1-to-1 enrollment created with placeholder fee for ${feeMonth}/${feeYear}.`, {
        enrollmentId: newEnrollment.id,
        perSessionFee: input.perSessionFee,
      });
    }

    return newEnrollment;
  },

  async getEnrollments(filters?: {
    studentId?: string;
    courseId?: string;
    status?: string;
    teacherId?: string;
  }) {
    let query = db
      .select({
        id: enrollments.id,
        studentId: enrollments.studentId,
        courseId: enrollments.courseId,
        enrolledAt: enrollments.enrolledAt,
        status: enrollments.status,
        attendanceMode: enrollments.attendanceMode,
        classType: enrollments.classType,
        customFeePerMonth: enrollments.customFeePerMonth,
        perSessionFee: enrollments.perSessionFee,
        expectedClassesPerMonth: enrollments.expectedClassesPerMonth,
        currency: enrollments.currency,
        feeType: enrollments.feeType,
        prorateFirstMonth: enrollments.prorateFirstMonth,
        feeNotes: enrollments.feeNotes,
        startDate: enrollments.startDate,
        endDate: enrollments.endDate,
        completedAt: enrollments.completedAt,
        droppedAt: enrollments.droppedAt,
        willReturnAfterDrop: enrollments.willReturnAfterDrop,
        tentativeReturnDate: enrollments.tentativeReturnDate,
        student: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
          parentPhone: users.parentPhone,
        },
        course: {
          id: courses.id,
          title: courses.title,
          description: courses.description,
          duration: courses.duration,
        },
      })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .innerJoin(courses, eq(enrollments.courseId, courses.id));

    // If filtering by teacher, join with courseTeachers table
    if (filters?.teacherId) {
      query = query.innerJoin(
        courseTeachers,
        and(
          eq(courseTeachers.courseId, enrollments.courseId),
          eq(courseTeachers.teacherId, filters.teacherId)
        )
      ) as any;
    }

    const conditions = [];
    if (filters?.studentId) {
      conditions.push(eq(enrollments.studentId, filters.studentId));
    }
    if (filters?.courseId) {
      conditions.push(eq(enrollments.courseId, filters.courseId));
    }
    if (filters?.status) {
      conditions.push(eq(enrollments.status, filters.status));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const allEnrollments = await query.orderBy(desc(enrollments.enrolledAt));

    // Fetch teachers for all courses in the result set
    const courseIds = [...new Set(allEnrollments.map((e: any) => e.course.id))];
    if (courseIds.length > 0) {
      const teacherRows = await db
        .select({
          courseId: courseTeachers.courseId,
          teacherId: courseTeachers.teacherId,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(courseTeachers)
        .innerJoin(users, eq(courseTeachers.teacherId, users.id))
        .where(inArray(courseTeachers.courseId, courseIds));

      // Group teachers by courseId
      const teachersByCourse = new Map<string, Array<{ id: string; firstName: string; lastName: string }>>();
      for (const row of teacherRows) {
        if (!teachersByCourse.has(row.courseId)) {
          teachersByCourse.set(row.courseId, []);
        }
        teachersByCourse.get(row.courseId)!.push({
          id: row.teacherId,
          firstName: row.firstName,
          lastName: row.lastName,
        });
      }

      // Attach teachers to each enrollment's course
      for (const enrollment of allEnrollments as any[]) {
        enrollment.course.teachers = teachersByCourse.get(enrollment.course.id) || [];
      }
    }

    return allEnrollments;
  },

  async getEnrollmentById(enrollmentId: string) {
    const [enrollment] = await db
      .select({
        id: enrollments.id,
        studentId: enrollments.studentId,
        courseId: enrollments.courseId,
        enrolledAt: enrollments.enrolledAt,
        status: enrollments.status,
        attendanceMode: enrollments.attendanceMode,
        classType: enrollments.classType,
        customFeePerMonth: enrollments.customFeePerMonth,
        perSessionFee: enrollments.perSessionFee,
        expectedClassesPerMonth: enrollments.expectedClassesPerMonth,
        currency: enrollments.currency,
        feeType: enrollments.feeType,
        prorateFirstMonth: enrollments.prorateFirstMonth,
        feeNotes: enrollments.feeNotes,
        startDate: enrollments.startDate,
        endDate: enrollments.endDate,
        completedAt: enrollments.completedAt,
        droppedAt: enrollments.droppedAt,
        willReturnAfterDrop: enrollments.willReturnAfterDrop,
        tentativeReturnDate: enrollments.tentativeReturnDate,
        student: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
          parentPhone: users.parentPhone,
        },
        course: {
          id: courses.id,
          title: courses.title,
          description: courses.description,
          duration: courses.duration,
        },
      })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(eq(enrollments.id, enrollmentId))
      .limit(1);

    if (!enrollment) {
      throw new AppError(404, 'Enrollment not found');
    }

    return enrollment;
  },

  async updateEnrollment(enrollmentId: string, input: UpdateEnrollmentInput, updatedBy?: string) {
    const existingEnrollment = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, enrollmentId))
      .limit(1);

    if (existingEnrollment.length === 0) {
      throw new AppError(404, 'Enrollment not found');
    }

    // CRITICAL: Prevent classType changes to avoid billing confusion
    // Once an enrollment is created with a specific classType, it cannot be changed
    // This prevents switching between regular monthly billing and usage-based billing mid-enrollment
    if ('classType' in input) {
      throw new AppError(400, 'Cannot change classType after enrollment creation. This would cause billing inconsistencies.');
    }

    const updateData: any = { ...input };

    // If marking as completed, set completedAt
    if (input.status === 'completed' && !input.completedAt) {
      updateData.completedAt = new Date();
    }

    // If marking as dropped, set droppedAt
    if (input.status === 'dropped' && !input.droppedAt) {
      updateData.droppedAt = new Date();
    }

    // Check if status is changing to dropped or completed
    const isStatusChangingToInactive =
      ((input.status === 'dropped' || input.status === 'completed') &&
        existingEnrollment[0].status === 'active') ||
      // Editing the drop date of an already-dropped enrollment also affects
      // which months should have fees, so regenerate for those too
      (input.droppedAt !== undefined &&
        (input.status === 'dropped' || (!input.status && existingEnrollment[0].status === 'dropped')));

    // Changing the enrollment date moves the entire billing anchor (20th rule,
    // catch-ups, first-month proration), so fees must be reconciled
    const oldEnrolledAt = existingEnrollment[0].enrolledAt ? new Date(existingEnrollment[0].enrolledAt) : null;
    const newEnrolledAt = input.enrolledAt ? new Date(input.enrolledAt) : null;
    // Compare calendar dates only — the stored timestamp carries a time-of-day
    // while edits arrive as midnight, and only the date drives billing
    const toDateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const enrolledAtChanged =
      newEnrolledAt !== null &&
      (oldEnrolledAt === null || toDateKey(newEnrolledAt) !== toDateKey(oldEnrolledAt));

    // Re-activating a dropped enrollment: clear the stale drop date and restore
    // the current month's fee (past months are left alone — the drop gap stays unbilled)
    const isReactivation =
      input.status === 'active' && existingEnrollment[0].status === 'dropped';
    if (isReactivation) {
      updateData.droppedAt = null;
    }

    const billingAffected = isStatusChangingToInactive || enrolledAtChanged || isReactivation;

    // Get affected data before update if billing is affected
    let affectedPeriods: Set<string> = new Set();
    let affectedStudents: Set<string> = new Set();
    let enrollmentFees: any[] = [];
    let affectedTeachers: any[] = [];

    if (billingAffected) {
      logger.info(`[STATUS CHANGE] Enrollment ${enrollmentId} billing-affecting update (status: ${input.status ?? 'unchanged'}, enrolledAtChanged: ${enrolledAtChanged}, reactivation: ${isReactivation})`);

      affectedStudents.add(existingEnrollment[0].studentId);

      if (isStatusChangingToInactive || enrolledAtChanged) {
        // Get all fees associated with this enrollment
        enrollmentFees = await db
          .select({
            id: fees.id,
            month: fees.month,
            year: fees.year,
            studentId: fees.studentId,
          })
          .from(fees)
          .where(eq(fees.enrollmentId, enrollmentId));

        // Collect unique periods
        enrollmentFees.forEach(fee => {
          affectedPeriods.add(`${fee.month}-${fee.year}`);
        });
      }

      if (enrolledAtChanged) {
        // The old and new enrollment months both need reconciling — a fee may
        // need deleting from the old month and creating in the new one
        if (oldEnrolledAt) {
          affectedPeriods.add(`${oldEnrolledAt.getMonth() + 1}-${oldEnrolledAt.getFullYear()}`);
        }
        affectedPeriods.add(`${newEnrolledAt!.getMonth() + 1}-${newEnrolledAt!.getFullYear()}`);
      }

      if (isReactivation) {
        const now = new Date();
        affectedPeriods.add(`${now.getMonth() + 1}-${now.getFullYear()}`);
      }

      // Get teachers affected by this enrollment
      affectedTeachers = await db
        .select({ teacherId: courseTeachers.teacherId })
        .from(courseTeachers)
        .where(eq(courseTeachers.courseId, existingEnrollment[0].courseId));

      logger.info(`[STATUS CHANGE] Found ${enrollmentFees.length} fees; ${affectedPeriods.size} periods to reconcile`);
    }

    const [updatedEnrollment] = await db
      .update(enrollments)
      .set(updateData)
      .where(eq(enrollments.id, enrollmentId))
      .returning();

    // Regenerate fees and invoices if billing was affected
    if (billingAffected && affectedPeriods.size > 0) {
      logger.info(`[STATUS CHANGE] Regenerating fees and invoices for ${affectedPeriods.size} affected periods`);

      for (const period of affectedPeriods) {
        const [month, year] = period.split('-').map(Number);

        try {
          // Regenerate fees for this period
          logger.info(`[STATUS CHANGE] Regenerating fees for ${month}/${year}`);
          await feesService.generateMonthlyFees(month, year, true);

          // Regenerate student invoices
          for (const studentId of affectedStudents) {
            try {
              // Delete ALL versions of this student's invoice for the period
              await db
                .delete(invoices)
                .where(
                  and(
                    eq(invoices.type, 'student'),
                    eq(invoices.recipientId, studentId),
                    eq(invoices.month, month),
                    eq(invoices.year, year)
                  )
                );

              // Regenerate one invoice per currency the student has fees in
              const feeCurrencies = await db
                .selectDistinct({ currency: sql<string>`COALESCE(${fees.currency}, 'PKR')` })
                .from(fees)
                .where(
                  and(
                    eq(fees.studentId, studentId),
                    eq(fees.month, month),
                    eq(fees.year, year)
                  )
                );

              for (const { currency } of feeCurrencies) {
                await invoicesService.generateStudentInvoice({
                  studentId,
                  month,
                  year,
                  currency,
                  generatedBy: updatedBy || 'system',
                });
                logger.info(`[STATUS CHANGE] Regenerated ${currency} student invoice for ${studentId} - ${month}/${year}`);
              }
            } catch (invoiceError: any) {
              logger.error(`[STATUS CHANGE] Failed to regenerate student invoice for ${studentId}`, {
                error: invoiceError.message,
                month,
                year,
              });
            }
          }

          // Regenerate teacher invoices
          for (const teacher of affectedTeachers) {
            try {
              // Delete ALL versions of this teacher's invoice for the period
              await db
                .delete(invoices)
                .where(
                  and(
                    eq(invoices.type, 'teacher'),
                    eq(invoices.recipientId, teacher.teacherId),
                    eq(invoices.month, month),
                    eq(invoices.year, year)
                  )
                );

              await invoicesService.generateTeacherInvoice({
                teacherId: teacher.teacherId,
                month,
                year,
                generatedBy: updatedBy || 'system',
              });
              logger.info(`[STATUS CHANGE] Regenerated teacher invoice for ${teacher.teacherId} - ${month}/${year}`);
            } catch (invoiceError: any) {
              logger.error(`[STATUS CHANGE] Failed to regenerate teacher invoice for ${teacher.teacherId}`, {
                error: invoiceError.message,
                month,
                year,
              });
            }
          }
        } catch (error: any) {
          logger.error(`[STATUS CHANGE] Failed to regenerate for period ${month}/${year}`, {
            error: error.message,
          });
        }
      }
    }

    // Auto-create lead if student is dropped and will return
    if (input.status === 'dropped' && input.willReturnAfterDrop === true) {
      try {
        // Get full enrollment details with student info
        const enrollment = await this.getEnrollmentById(enrollmentId);

        // Create lead from dropped enrollment
        let phoneNumber = enrollment.student.phone || enrollment.student.parentPhone;
        // Ensure phone number has + prefix
        if (phoneNumber && !phoneNumber.startsWith('+')) {
          phoneNumber = '+' + phoneNumber;
        }
        await leadsService.createLeadFromDroppedEnrollment(enrollmentId, {
          name: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
          phone: phoneNumber || null,
          email: enrollment.student.email,
          tentativeReturnDate: input.tentativeReturnDate,
          notes: `Auto-created from dropped enrollment in ${enrollment.course.title}. Dropped on ${new Date().toISOString().split('T')[0]}.`,
          createdBy: existingEnrollment[0].createdBy ? existingEnrollment[0].createdBy : 'system',
        });

        logger.info('Auto-created lead for dropped student', {
          enrollmentId,
          studentId: enrollment.student.id,
          tentativeReturnDate: input.tentativeReturnDate,
        });
      } catch (error: any) {
        // Log error but don't fail the enrollment update
        logger.error('Failed to auto-create lead from dropped enrollment', {
          enrollmentId,
          error: error.message,
        });
      }
    }

    return updatedEnrollment;
  },

  async updateEnrollmentFee(
    enrollmentId: string,
    customFeePerMonth?: string,
    perSessionFee?: string,
    feeType?: 'custom' | 'scholarship',
    feeNotes?: string,
    currency?: 'PKR' | 'USD' | 'GBP' | 'SAR',
    expectedClassesPerMonth?: number | null,
    prorateFirstMonth?: boolean
  ) {
    const [existingEnrollment] = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, enrollmentId))
      .limit(1);

    if (!existingEnrollment) {
      throw new AppError(404, 'Enrollment not found');
    }

    const is1to1 = existingEnrollment.classType === '1-to-1';

    // Build update data based on class type ('' / null mean "clear")
    const updateData: any = {};
    if (feeType !== undefined) updateData.feeType = feeType;
    if (feeNotes !== undefined) updateData.feeNotes = feeNotes || null;
    if (currency !== undefined) updateData.currency = currency;
    if (prorateFirstMonth !== undefined && !is1to1) updateData.prorateFirstMonth = prorateFirstMonth;

    // Save whichever fee field is provided — don't restrict by stored classType
    // (classType may be null on older enrollments)
    if (perSessionFee) {
      updateData.perSessionFee = perSessionFee;
    }
    if (customFeePerMonth) {
      updateData.customFeePerMonth = customFeePerMonth;
    }
    if (expectedClassesPerMonth !== undefined) {
      updateData.expectedClassesPerMonth = expectedClassesPerMonth;
    }

    const [updatedEnrollment] = await db
      .update(enrollments)
      .set(updateData)
      .where(eq(enrollments.id, enrollmentId))
      .returning();

    // Sync the new fee amount and currency to all pending/submitted fees for this enrollment
    // Only for non-1-to-1 classes (1-to-1 fees are regenerated based on sessions)
    const feeUpdateData: any = { updatedAt: new Date() };
    if (!is1to1 && customFeePerMonth) {
      feeUpdateData.amount = customFeePerMonth;
    }
    if (currency) {
      feeUpdateData.currency = currency;
    }

    // Only update if we have something to sync
    if (Object.keys(feeUpdateData).length > 1) {
      await db
        .update(fees)
        .set(feeUpdateData)
        .where(
          and(
            eq(fees.enrollmentId, enrollmentId),
            sql`${fees.status} IN ('pending', 'overdue')`
          )
        );
    }

    // Reconcile the first-month fee when the prorate flag changes (non-1-to-1 only).
    // Runs after the sync above so the prorated amount isn't overwritten by it.
    if (prorateFirstMonth !== undefined && !is1to1 && updatedEnrollment.enrolledAt) {
      const fullFee = customFeePerMonth || updatedEnrollment.customFeePerMonth;
      if (fullFee) {
        const enrolledAt = new Date(updatedEnrollment.enrolledAt);
        const firstMonth = enrolledAt.getMonth() + 1;
        const firstYear = enrolledAt.getFullYear();

        let firstMonthAmount = fullFee;
        let firstMonthNotes = 'Regular monthly fee';
        if (prorateFirstMonth) {
          const daysInMonth = new Date(firstYear, firstMonth, 0).getDate();
          const chargedDays = daysInMonth - enrolledAt.getDate() + 1;
          firstMonthAmount = Math.round((chargedDays / daysInMonth) * parseFloat(fullFee)).toString();
          firstMonthNotes = `Pro-rated first month: ${chargedDays} of ${daysInMonth} days`;
        }

        // A first-month fee is now always billed immediately, so a leftover
        // catch-up row from before this rule existed is stale — clear it so it
        // doesn't block inserting/updating the real first-month fee below.
        await db
          .delete(fees)
          .where(
            and(
              eq(fees.enrollmentId, enrollmentId),
              eq(fees.month, firstMonth),
              eq(fees.year, firstYear),
              eq(fees.isCatchUp, true),
              sql`${fees.status} != 'received'`
            )
          );

        const [existingFirstFee] = await db
          .select({ id: fees.id, status: fees.status })
          .from(fees)
          .where(
            and(
              eq(fees.enrollmentId, enrollmentId),
              eq(fees.month, firstMonth),
              eq(fees.year, firstYear),
              eq(fees.isCatchUp, false)
            )
          )
          .limit(1);

        if (existingFirstFee) {
          if (existingFirstFee.status !== 'received') {
            await db
              .update(fees)
              .set({ amount: firstMonthAmount, feeNotes: firstMonthNotes, updatedAt: new Date() })
              .where(eq(fees.id, existingFirstFee.id));
            logger.info(`[ENROLLMENT] Updated first-month fee for enrollment ${enrollmentId} (${firstMonth}/${firstYear}): ${firstMonthAmount}`);
          }
        } else {
          // No first-month fee exists (e.g. an older enrollment from before fees
          // were always billed immediately) — create it now, full or prorated.
          await db.insert(fees).values({
            enrollmentId,
            studentId: updatedEnrollment.studentId,
            courseId: updatedEnrollment.courseId,
            month: firstMonth,
            year: firstYear,
            amount: firstMonthAmount,
            currency: currency || updatedEnrollment.currency || 'PKR',
            dueDate: new Date(firstYear, firstMonth - 1, 10).toISOString().split('T')[0],
            status: 'pending',
            billingType: 'monthly',
            isCatchUp: false,
            feeNotes: firstMonthNotes,
          });
          logger.info(`[ENROLLMENT] Created missing first-month fee for enrollment ${enrollmentId} (${firstMonth}/${firstYear}): ${firstMonthAmount}`);
        }
      }
    }

    // Regenerate any already-generated invoices so they reflect the new fee
    // amounts. Only periods with an existing invoice are regenerated (new
    // versions via versioning); periods not yet invoiced wait for the cron.
    try {
      const feePeriods = await db
        .selectDistinct({
          month: fees.month,
          year: fees.year,
          currency: sql<string>`COALESCE(${fees.currency}, 'PKR')`,
        })
        .from(fees)
        .where(
          and(
            eq(fees.enrollmentId, enrollmentId),
            sql`${fees.status} IN ('pending', 'overdue')`
          )
        );

      const studentId = updatedEnrollment.studentId;
      const courseId = updatedEnrollment.courseId;
      const seenPeriods = new Set<string>();

      for (const { month, year, currency: feeCurrency } of feePeriods) {
        // Student invoice for this period+currency
        const [existingStudentInvoice] = await db
          .select({ id: invoices.id })
          .from(invoices)
          .where(
            and(
              eq(invoices.type, 'student'),
              eq(invoices.recipientId, studentId),
              eq(invoices.month, month),
              eq(invoices.year, year),
              eq(invoices.currency, feeCurrency),
              eq(invoices.isLatest, true)
            )
          )
          .limit(1);

        if (existingStudentInvoice) {
          await invoicesService.generateStudentInvoice({
            studentId,
            month,
            year,
            currency: feeCurrency,
          });
          logger.info(`[ENROLLMENT] Regenerated ${feeCurrency} student invoice for ${studentId} - ${month}/${year} after fee edit`);
        }

        // Teacher invoices once per period (not per currency)
        const periodKey = `${month}-${year}`;
        if (seenPeriods.has(periodKey)) continue;
        seenPeriods.add(periodKey);

        const teachers = await db
          .select({ teacherId: courseTeachers.teacherId })
          .from(courseTeachers)
          .where(eq(courseTeachers.courseId, courseId));

        for (const teacher of teachers) {
          const [existingTeacherInvoice] = await db
            .select({ id: invoices.id })
            .from(invoices)
            .where(
              and(
                eq(invoices.type, 'teacher'),
                eq(invoices.recipientId, teacher.teacherId),
                eq(invoices.month, month),
                eq(invoices.year, year),
                eq(invoices.isLatest, true)
              )
            )
            .limit(1);

          if (existingTeacherInvoice) {
            await invoicesService.generateTeacherInvoice({
              teacherId: teacher.teacherId,
              month,
              year,
            });
            logger.info(`[ENROLLMENT] Regenerated teacher invoice for ${teacher.teacherId} - ${month}/${year} after fee edit`);
          }
        }
      }
    } catch (regenError: any) {
      // The fee update itself succeeded — invoice regeneration failure is logged, not thrown
      logger.error(`[ENROLLMENT] Invoice regeneration after fee edit failed for enrollment ${enrollmentId}`, {
        error: regenError.message,
      });
    }

    return updatedEnrollment;
  },

  async deleteEnrollment(enrollmentId: string) {
    // Soft delete by marking as dropped
    await this.updateEnrollment(enrollmentId, { status: 'dropped' });
    return { message: 'Enrollment marked as dropped' };
  },

  async hardDeleteEnrollment(enrollmentId: string, deletedBy: string) {
    // Get enrollment details before deletion
    const [enrollment] = await db
      .select({
        id: enrollments.id,
        studentId: enrollments.studentId,
        courseId: enrollments.courseId,
        studentName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`.as('studentName'),
        courseName: courses.title,
        startDate: enrollments.startDate,
      })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(eq(enrollments.id, enrollmentId))
      .limit(1);

    if (!enrollment) {
      throw new AppError(404, 'Enrollment not found');
    }

    logger.info(`[HARD DELETE] Starting hard delete for enrollment ${enrollmentId}`, {
      studentId: enrollment.studentId,
      courseId: enrollment.courseId,
      studentName: enrollment.studentName,
      courseName: enrollment.courseName,
      deletedBy,
    });

    // Get all fees associated with this enrollment to identify affected periods
    const enrollmentFees = await db
      .select({
        id: fees.id,
        month: fees.month,
        year: fees.year,
        studentId: fees.studentId,
      })
      .from(fees)
      .where(eq(fees.enrollmentId, enrollmentId));

    logger.info(`[HARD DELETE] Found ${enrollmentFees.length} fees to delete`);

    // Collect unique periods and affected students/teachers
    const affectedPeriods = new Set<string>();
    const affectedStudents = new Set<string>();

    enrollmentFees.forEach(fee => {
      affectedPeriods.add(`${fee.month}-${fee.year}`);
      affectedStudents.add(fee.studentId);
    });

    // Get teachers affected by this enrollment
    const affectedTeachers = await db
      .select({ teacherId: courseTeachers.teacherId })
      .from(courseTeachers)
      .where(eq(courseTeachers.courseId, enrollment.courseId));

    // STEP 1: Delete all invoices and their line items for affected periods
    // This must happen BEFORE deleting fees, as invoice_line_items reference fees with RESTRICT
    logger.info(`[HARD DELETE] Deleting invoices for affected periods`);

    for (const period of affectedPeriods) {
      const [month, year] = period.split('-').map(Number);

      // Delete student invoices
      for (const studentId of affectedStudents) {
        const studentInvoices = await db
          .select({ id: invoices.id })
          .from(invoices)
          .where(
            and(
              eq(invoices.type, 'student'),
              eq(invoices.recipientId, studentId),
              eq(invoices.month, month),
              eq(invoices.year, year)
            )
          );

        for (const invoice of studentInvoices) {
          await db.delete(invoices).where(eq(invoices.id, invoice.id));
          logger.info(`[HARD DELETE] Deleted student invoice for ${studentId} - ${month}/${year}`);
        }
      }

      // Delete teacher invoices
      for (const teacher of affectedTeachers) {
        const teacherInvoices = await db
          .select({ id: invoices.id })
          .from(invoices)
          .where(
            and(
              eq(invoices.type, 'teacher'),
              eq(invoices.recipientId, teacher.teacherId),
              eq(invoices.month, month),
              eq(invoices.year, year)
            )
          );

        for (const invoice of teacherInvoices) {
          await db.delete(invoices).where(eq(invoices.id, invoice.id));
          logger.info(`[HARD DELETE] Deleted teacher invoice for ${teacher.teacherId} - ${month}/${year}`);
        }
      }
    }

    // STEP 2: Hard delete the enrollment (cascade will delete fees and payments)
    const deletedCount = await db
      .delete(enrollments)
      .where(eq(enrollments.id, enrollmentId));

    if (!deletedCount) {
      throw new AppError(500, 'Failed to delete enrollment');
    }

    logger.info(`[HARD DELETE] Enrollment deleted. Cascade deleted ${enrollmentFees.length} fees.`);

    // STEP 3: Regenerate fees and invoices for affected periods
    const regenerationResults = {
      feesRegenerated: 0,
      studentInvoicesRegenerated: 0,
      teacherInvoicesRegenerated: 0,
      affectedPeriods: Array.from(affectedPeriods),
    };

    for (const period of affectedPeriods) {
      const [month, year] = period.split('-').map(Number);

      try {
        // Regenerate fees for this period
        logger.info(`[HARD DELETE] Regenerating fees for ${month}/${year}`);
        const feeResult = await feesService.generateMonthlyFees(month, year, true);
        regenerationResults.feesRegenerated += feeResult.regularFeesCreated + feeResult.usageFeesCreated;

        // Regenerate student invoices
        for (const studentId of affectedStudents) {
          try {
            // Check if student has any fees for this period before generating invoice
            const studentFeesCount = await db
              .select({ count: sql<number>`count(*)::int` })
              .from(fees)
              .where(
                and(
                  eq(fees.studentId, studentId),
                  eq(fees.month, month),
                  eq(fees.year, year)
                )
              );

            if (studentFeesCount[0].count > 0) {
              await invoicesService.generateStudentInvoice({
                studentId,
                month,
                year,
                generatedBy: deletedBy,
              });
              regenerationResults.studentInvoicesRegenerated++;
              logger.info(`[HARD DELETE] Regenerated student invoice for ${studentId} - ${month}/${year}`);
            } else {
              logger.info(`[HARD DELETE] Skipping invoice for ${studentId} - no fees for ${month}/${year}`);
            }
          } catch (invoiceError: any) {
            logger.error(`[HARD DELETE] Failed to regenerate student invoice for ${studentId}`, {
              error: invoiceError.message,
              month,
              year,
            });
            // Continue with other invoices even if one fails
          }
        }

        // Regenerate teacher invoices
        for (const teacher of affectedTeachers) {
          try {
            await invoicesService.generateTeacherInvoice({
              teacherId: teacher.teacherId,
              month,
              year,
              generatedBy: deletedBy,
            });
            regenerationResults.teacherInvoicesRegenerated++;
            logger.info(`[HARD DELETE] Regenerated teacher invoice for ${teacher.teacherId} - ${month}/${year}`);
          } catch (invoiceError: any) {
            logger.error(`[HARD DELETE] Failed to regenerate teacher invoice for ${teacher.teacherId}`, {
              error: invoiceError.message,
              month,
              year,
            });
            // Continue with other invoices even if one fails
          }
        }
      } catch (regenerationError: any) {
        logger.error(`[HARD DELETE] Failed to regenerate fees/invoices for ${month}/${year}`, {
          error: regenerationError.message,
        });
        // Continue with other periods even if one fails
      }
    }

    logger.info(`[HARD DELETE] Completed successfully`, regenerationResults);

    return {
      message: 'Enrollment permanently deleted and fees/invoices regenerated',
      details: {
        enrollmentId,
        studentName: enrollment.studentName,
        courseName: enrollment.courseName,
        feesDeleted: enrollmentFees.length,
        ...regenerationResults,
      },
    };
  },

  async getStudentEnrollments(studentId: string) {
    return this.getEnrollments({ studentId, status: 'active' });
  },

  async getCourseEnrollments(courseId: string) {
    return this.getEnrollments({ courseId, status: 'active' });
  },
};

export default enrollmentsService;
