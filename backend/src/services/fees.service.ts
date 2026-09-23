import { db } from '../config/database';
import { fees, enrollments, users, courses, payments, courseEvents, courseTeachers, invoices } from '../db/schema';
import { eq, and, desc, sql, lte, gte, ne, inArray } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

export interface CreateFeeInput {
  enrollmentId: string;
  month: number; // 1-12
  year: number;
  dueDate: string; // YYYY-MM-DD
}

export interface UpdateFeeStatusInput {
  status: 'pending' | 'overdue' | 'received';
  receivedBy?: string; // Required when marking as received
}

export interface MarkAsReceivedInput {
  paymentMethod: 'online' | 'cash';
  serialNumber?: string;
}

export const feesService = {
  async createFee(input: CreateFeeInput) {
    // Verify enrollment exists
    const [enrollment] = await db
      .select({
        id: enrollments.id,
        studentId: enrollments.studentId,
        courseId: enrollments.courseId,
        customFeePerMonth: enrollments.customFeePerMonth,
        currency: enrollments.currency,
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(eq(enrollments.id, input.enrollmentId))
      .limit(1);

    if (!enrollment) {
      throw new AppError(404, 'Enrollment not found');
    }

    // Check if fee already exists for this month/year
    const existing = await db
      .select()
      .from(fees)
      .where(
        and(
          eq(fees.enrollmentId, input.enrollmentId),
          eq(fees.month, input.month),
          eq(fees.year, input.year)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new AppError(400, 'Fee already exists for this month');
    }

    // Require fee per month on enrollment
    if (!enrollment.customFeePerMonth) {
      throw new AppError(400, 'Enrollment must have a fee per month set before generating fees');
    }
    const feeAmount = enrollment.customFeePerMonth;

    // Create fee — currency always follows the enrollment, like every other fee path
    const [newFee] = await db
      .insert(fees)
      .values({
        enrollmentId: input.enrollmentId,
        studentId: enrollment.studentId,
        courseId: enrollment.courseId,
        month: input.month,
        year: input.year,
        amount: feeAmount,
        currency: enrollment.currency || 'PKR',
        dueDate: input.dueDate,
        status: 'pending',
      })
      .returning();

    return newFee;
  },

  async getFees(filters?: {
    studentId?: string;
    courseId?: string;
    status?: string;
    month?: number;
    year?: number;
  }) {
    let query = db
      .select({
        id: fees.id,
        enrollmentId: fees.enrollmentId,
        studentId: fees.studentId,
        courseId: fees.courseId,
        month: fees.month,
        year: fees.year,
        amount: fees.amount,
        currency: fees.currency,
        dueDate: fees.dueDate,
        status: fees.status,
        receivedAt: fees.receivedAt,
        serialNumber: fees.serialNumber,
        billingType: fees.billingType,
        isCatchUp: fees.isCatchUp,
        feeNotes: fees.feeNotes,
        sessionCount: fees.sessionCount,
        createdAt: fees.createdAt,
        student: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          studentCategory: users.studentCategory,
          studentSubcategory: users.studentSubcategory,
        },
        course: {
          id: courses.id,
          title: courses.title,
        },
      })
      .from(fees)
      .innerJoin(users, eq(fees.studentId, users.id))
      .innerJoin(courses, eq(fees.courseId, courses.id));

    const conditions = [];
    if (filters?.studentId) {
      conditions.push(eq(fees.studentId, filters.studentId));
    }
    if (filters?.courseId) {
      conditions.push(eq(fees.courseId, filters.courseId));
    }
    if (filters?.status) {
      conditions.push(eq(fees.status, filters.status));
    }
    if (filters?.month) {
      conditions.push(eq(fees.month, filters.month));
    }
    if (filters?.year) {
      conditions.push(eq(fees.year, filters.year));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const allFees = await query.orderBy(desc(fees.year), desc(fees.month));
    return allFees;
  },

  async getFeeById(feeId: string) {
    const [fee] = await db
      .select({
        id: fees.id,
        enrollmentId: fees.enrollmentId,
        studentId: fees.studentId,
        courseId: fees.courseId,
        month: fees.month,
        year: fees.year,
        amount: fees.amount,
        currency: fees.currency,
        dueDate: fees.dueDate,
        status: fees.status,
        receivedAt: fees.receivedAt,
        serialNumber: fees.serialNumber,
        billingType: fees.billingType,
        isCatchUp: fees.isCatchUp,
        feeNotes: fees.feeNotes,
        sessionCount: fees.sessionCount,
        createdAt: fees.createdAt,
        student: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          studentCategory: users.studentCategory,
          studentSubcategory: users.studentSubcategory,
        },
        course: {
          id: courses.id,
          title: courses.title,
        },
      })
      .from(fees)
      .innerJoin(users, eq(fees.studentId, users.id))
      .innerJoin(courses, eq(fees.courseId, courses.id))
      .where(eq(fees.id, feeId))
      .limit(1);

    if (!fee) {
      throw new AppError(404, 'Fee not found');
    }

    // Get associated payments
    const feePayments = await db
      .select()
      .from(payments)
      .where(eq(payments.feeId, feeId));

    return {
      ...fee,
      payments: feePayments,
    };
  },

  async updateFeeStatus(feeId: string, input: UpdateFeeStatusInput) {
    const [existingFee] = await db
      .select()
      .from(fees)
      .where(eq(fees.id, feeId))
      .limit(1);

    if (!existingFee) {
      throw new AppError(404, 'Fee not found');
    }

    const updateData: any = {
      status: input.status,
      updatedAt: new Date(),
    };

    // Set timestamps based on status
    if (input.status === 'received') {
      if (!input.receivedBy) {
        throw new AppError(400, 'receivedBy is required when marking fee as received');
      }
      updateData.receivedAt = new Date();
      updateData.receivedBy = input.receivedBy;
    }

    const [updatedFee] = await db
      .update(fees)
      .set(updateData)
      .where(eq(fees.id, feeId))
      .returning();

    // Sync fee status immediately (run in background, don't block response)
    this.syncFeeStatusInBackground();

    return updatedFee;
  },

  async markAsReceived(feeId: string, receivedBy: string, input: MarkAsReceivedInput) {
    try {
      // 1. Validate: cash requires serial number
      if (input.paymentMethod === 'cash' && !input.serialNumber?.trim()) {
        throw new AppError(400, 'Serial number is required for cash payments');
      }

      // 2. Get fee details (for amount, currency, studentId)
      const fee = await this.getFeeById(feeId);

      if (fee.status === 'received') {
        throw new AppError(400, 'Fee is already marked as received');
      }

      // 3. Update fee status
      const [updatedFee] = await db
        .update(fees)
        .set({
          status: 'received',
          receivedAt: new Date(),
          receivedBy: receivedBy,
          serialNumber: input.serialNumber || null,
          updatedAt: new Date(),
        })
        .where(eq(fees.id, feeId))
        .returning();

      // 4. Create payment record
      const paymentMethodMap: Record<string, string> = {
        'online': 'bank_transfer',
        'cash': 'cash',
      };

      await db.insert(payments).values({
        feeId: feeId,
        studentId: fee.studentId,
        amount: fee.amount,
        paymentMethod: paymentMethodMap[input.paymentMethod],
        transactionId: input.serialNumber || null,
        paymentDate: new Date(),
        createdBy: receivedBy,
      });

      logger.info(`[FEES] Fee ${feeId} marked as received via ${input.paymentMethod}${input.serialNumber ? ' (Serial: ' + input.serialNumber + ')' : ''}`);

      // Sync fee status immediately (run in background, don't block response)
      this.syncFeeStatusInBackground();

      return updatedFee;
    } catch (error) {
      logger.error(`[FEES] Failed to mark fee ${feeId} as received:`, error);
      throw error;
    }
  },

  /**
   * Run fee generation and overdue detection in background
   * Called after fee status changes to keep data in sync
   */
  syncFeeStatusInBackground() {
    // Run asynchronously without blocking the response
    setImmediate(async () => {
      try {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        logger.info('[FEES SYNC] Starting immediate fee sync after status change');

        // 1. Generate any missing fees for current month
        const feeResult = await this.generateMonthlyFees(month, year, false);
        logger.info(`[FEES SYNC] Fee generation: ${feeResult.regularFeesCreated} regular, ${feeResult.usageFeesCreated} usage`);

        // 2. Mark overdue fees
        const overdueResult = await this.markOverdueFees();
        logger.info(`[FEES SYNC] Overdue detection: ${overdueResult.count} fees marked as overdue`);

      } catch (error) {
        logger.error('[FEES SYNC] Background sync failed:', error);
      }
    });
  },

  async markOverdueFees() {
    const today = new Date().toISOString().split('T')[0];

    // Update all pending fees with past due dates to overdue.
    // Zero-amount fees are 1-to-1 placeholders (0 sessions) — nothing is owed.
    const overdueCount = await db
      .update(fees)
      .set({ status: 'overdue', updatedAt: new Date() })
      .where(
        and(
          eq(fees.status, 'pending'),
          lte(fees.dueDate, today),
          sql`${fees.amount}::numeric > 0`
        )
      );

    return { message: 'Overdue fees updated', count: overdueCount };
  },

  /**
   * Generate fees for a given billing period
   * Handles both regular (billed immediately, in full, from the enrollment
   * month) and 1-to-1 (usage-based) classes
   */
  async generateMonthlyFees(month: number, year: number, isManualGeneration: boolean = false) {
    logger.info(`[FEES] Starting fee generation for ${month}/${year} (manual: ${isManualGeneration})`);

    // Get active AND dropped enrollments — dropped ones are processed so their
    // fees honor the drop date (fees stop after the drop month; drop month
    // follows the mirror 20th rule via generateRollingFee).
    const activeEnrollments = await db
      .select({
        id: enrollments.id,
        studentId: enrollments.studentId,
        courseId: enrollments.courseId,
        classType: enrollments.classType,
        status: enrollments.status,
        customFeePerMonth: enrollments.customFeePerMonth,
        perSessionFee: enrollments.perSessionFee,
        currency: enrollments.currency,
        startDate: enrollments.startDate,
        endDate: enrollments.endDate,
        enrolledAt: enrollments.enrolledAt,
        droppedAt: enrollments.droppedAt,
        prorateFirstMonth: enrollments.prorateFirstMonth,
        studentName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        courseName: courses.title,
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .where(inArray(enrollments.status, ['active', 'dropped']));

    let regularFeesCreated = 0;
    let usageFeesCreated = 0;
    const skippedEnrollments: string[] = [];

    const dueDate = new Date(year, month - 1, 10).toISOString().split('T')[0];

    for (const enrollment of activeEnrollments) {
      try {
        const is1to1 = enrollment.classType === '1-to-1';

        if (is1to1) {
          // USAGE-BASED BILLING for 1-to-1 classes
          const result = await this.generate1to1Fee(enrollment, month, year, dueDate, isManualGeneration);
          if (result.created) {
            usageFeesCreated += result.count;
          }
        } else {
          // ROLLING BASIS BILLING for regular classes
          const result = await this.generateRollingFee(
            enrollment,
            month,
            year,
            dueDate,
            isManualGeneration
          );
          regularFeesCreated += result.regularCount;
          if (result.skipped && result.skipReason) {
            skippedEnrollments.push(result.skipReason);
          }
        }
      } catch (error: any) {
        logger.error(`[FEES] Failed to generate fee for enrollment ${enrollment.id}:`, error);
      }
    }

    const summary = {
      message: `Generated ${regularFeesCreated} regular fees, ${usageFeesCreated} usage-based fees`,
      regularFeesCreated,
      usageFeesCreated,
      skippedCount: skippedEnrollments.length,
      totalCount: regularFeesCreated + usageFeesCreated,
    };

    logger.info(`[FEES] Fee generation completed:`, summary);
    return summary;
  },

  /**
   * Generate usage-based fee for 1-to-1 classes
   * Counts completed sessions in the billing month
   */
  async generate1to1Fee(
    enrollment: any,
    month: number,
    year: number,
    dueDate: string,
    isManualGeneration: boolean
  ) {
    // Check if fee already exists
    const existing = await db
      .select()
      .from(fees)
      .where(
        and(
          eq(fees.enrollmentId, enrollment.id),
          eq(fees.month, month),
          eq(fees.year, year)
        )
      )
      .limit(1);

    // Never touch received fees, and never clobber an admin-set session count —
    // the daily cron otherwise keeps the fee in sync with completed sessions
    const existingFee = existing[0];
    if (existingFee && (existingFee.status === 'received' || existingFee.feeNotes?.includes('admin override'))) {
      return { created: false, count: 0 };
    }

    // Validate perSessionFee exists
    if (!enrollment.perSessionFee) {
      logger.warn(`[FEES] Skipping 1-to-1 enrollment ${enrollment.id}: perSessionFee not set`);
      return { created: false, count: 0 };
    }

    // Hard lower bound: never generate fees for months before the enrollment existed
    if (enrollment.enrolledAt) {
      const enrolledAt = new Date(enrollment.enrolledAt);
      const enrolledYear = enrolledAt.getFullYear();
      const enrolledMonth = enrolledAt.getMonth() + 1;
      if (enrolledYear > year || (enrolledYear === year && enrolledMonth > month)) {
        return { created: false, count: 0 };
      }
    }

    // Calculate billing period (1st to last day of month)
    const periodStart = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const periodEnd = new Date(year, month, 0).toISOString().split('T')[0];

    // Count completed sessions in the billing period
    const completedSessions = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(courseEvents)
      .where(
        and(
          eq(courseEvents.courseId, enrollment.courseId),
          eq(courseEvents.classType, '1-to-1'),
          eq(courseEvents.status, 'completed'),
          gte(courseEvents.eventDate, periodStart),
          lte(courseEvents.eventDate, periodEnd)
        )
      );

    const sessionCount = completedSessions[0]?.count || 0;

    // Zero completed sessions: keep a zero-amount placeholder fee so the admin
    // can record sessions taken outside tracked events (Edit Sessions on the
    // Fees page). Placeholders are excluded from invoices and overdue detection.
    if (sessionCount === 0 && !existingFee) {
      const totalEvents = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(courseEvents)
        .where(
          and(
            eq(courseEvents.courseId, enrollment.courseId),
            eq(courseEvents.classType, '1-to-1'),
            gte(courseEvents.eventDate, periodStart),
            lte(courseEvents.eventDate, periodEnd)
          )
        );

      const totalCount = totalEvents[0]?.count || 0;
      if (totalCount > 0) {
        logger.warn(
          `[FEES] WARNING: 1-to-1 enrollment ${enrollment.id} has ${totalCount} events in ${month}/${year} but NONE are marked completed!`
        );
      }
    }

    // Calculate total amount
    const perSessionFee = parseFloat(enrollment.perSessionFee);
    const totalAmount = (perSessionFee * sessionCount).toFixed(2);
    const currency = enrollment.currency || 'PKR';

    // Create or update fee
    if (existingFee) {
      // Skip the no-op write when the count and amount are already current
      if (existingFee.sessionCount === sessionCount && existingFee.amount === totalAmount) {
        return { created: false, count: 0 };
      }

      await db
        .update(fees)
        .set({
          amount: totalAmount,
          currency: currency,
          billingType: 'usage',
          sessionCount,
          billingPeriodStart: periodStart,
          billingPeriodEnd: periodEnd,
          feeNotes: `1-to-1 class: ${sessionCount} session(s) × ${currency} ${perSessionFee.toFixed(2)}`,
          updatedAt: new Date(),
        })
        .where(eq(fees.id, existingFee.id));

      logger.info(`[FEES] Updated 1-to-1 fee for enrollment ${enrollment.id}: ${sessionCount} sessions = ${currency} ${totalAmount}`);
    } else {
      await db.insert(fees).values({
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        courseId: enrollment.courseId,
        month,
        year,
        amount: totalAmount,
        currency: currency,
        dueDate,
        status: 'pending',
        billingType: 'usage',
        sessionCount,
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
        feeNotes: `1-to-1 class: ${sessionCount} session(s) × ${currency} ${perSessionFee.toFixed(2)}`,
      });

      logger.info(`[FEES] Created 1-to-1 fee for enrollment ${enrollment.id}: ${sessionCount} sessions = ${currency} ${totalAmount}`);
    }

    return { created: true, count: 1 };
  },

  /**
   * Admin override of a 1-to-1 fee's session count — for sessions taken outside
   * the scheduled calendar events. Recomputes the amount, marks the fee as an
   * admin override (so the daily cron won't recompute it from events), and
   * regenerates any already-generated invoices for the period.
   * sessionCount 0 deletes the fee (nothing to bill).
   */
  async updateSessionCount(feeId: string, sessionCount: number) {
    const [fee] = await db.select().from(fees).where(eq(fees.id, feeId)).limit(1);
    if (!fee) {
      throw new AppError(404, 'Fee not found');
    }
    if (fee.status === 'received') {
      throw new AppError(400, 'Cannot edit sessions on a fee that is already received');
    }

    const [enrollment] = await db
      .select({
        id: enrollments.id,
        classType: enrollments.classType,
        perSessionFee: enrollments.perSessionFee,
        currency: enrollments.currency,
      })
      .from(enrollments)
      .where(eq(enrollments.id, fee.enrollmentId))
      .limit(1);

    if (!enrollment || enrollment.classType !== '1-to-1' || !enrollment.perSessionFee) {
      throw new AppError(400, 'Session counts can only be edited on 1-to-1 enrollments with a per-session fee');
    }

    const currency = enrollment.currency || 'PKR';
    const perSessionFee = parseFloat(enrollment.perSessionFee);

    // Count 0 keeps the fee as a zero-amount placeholder (still editable later);
    // the admin-override marker stops the nightly sync from recomputing it
    const totalAmount = (perSessionFee * sessionCount).toFixed(2);
    await db
      .update(fees)
      .set({
        amount: totalAmount,
        sessionCount,
        billingType: 'usage',
        feeNotes: `1-to-1 class: ${sessionCount} session(s) × ${currency} ${perSessionFee.toFixed(2)} (admin override)`,
        updatedAt: new Date(),
      })
      .where(eq(fees.id, feeId));
    logger.info(`[FEES] Admin set 1-to-1 fee ${feeId} to ${sessionCount} sessions = ${currency} ${totalAmount}`);

    // Regenerate any already-generated invoices for this period so they
    // reflect the new session count (versioned; periods without an invoice
    // wait for the monthly cron)
    try {
      const { invoicesService } = await import('./invoices.service');

      const [existingStudentInvoice] = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(
            eq(invoices.type, 'student'),
            eq(invoices.recipientId, fee.studentId),
            eq(invoices.month, fee.month),
            eq(invoices.year, fee.year),
            eq(invoices.currency, currency),
            eq(invoices.isLatest, true)
          )
        )
        .limit(1);

      if (existingStudentInvoice) {
        // Invoices only include billable fees (amount > 0). If none remain in
        // this period+currency, the invoice is deleted rather than regenerated.
        const [billable] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(fees)
          .where(
            and(
              eq(fees.studentId, fee.studentId),
              eq(fees.month, fee.month),
              eq(fees.year, fee.year),
              eq(fees.currency, currency),
              sql`${fees.amount}::numeric > 0`
            )
          );

        if (!billable || billable.count === 0) {
          await db
            .delete(invoices)
            .where(
              and(
                eq(invoices.type, 'student'),
                eq(invoices.recipientId, fee.studentId),
                eq(invoices.month, fee.month),
                eq(invoices.year, fee.year),
                eq(invoices.currency, currency)
              )
            );
          logger.info(`[FEES] Deleted empty student invoice for ${fee.studentId} - ${fee.month}/${fee.year}`);
        } else {
          await invoicesService.generateStudentInvoice({
            studentId: fee.studentId,
            month: fee.month,
            year: fee.year,
            currency,
          });
        }
      }

      // Teacher invoices for the course's teachers, if already generated
      const teachers = await db
        .select({ teacherId: courseTeachers.teacherId })
        .from(courseTeachers)
        .where(eq(courseTeachers.courseId, fee.courseId));

      for (const teacher of teachers) {
        const [existingTeacherInvoice] = await db
          .select({ id: invoices.id })
          .from(invoices)
          .where(
            and(
              eq(invoices.type, 'teacher'),
              eq(invoices.recipientId, teacher.teacherId),
              eq(invoices.month, fee.month),
              eq(invoices.year, fee.year),
              eq(invoices.isLatest, true)
            )
          )
          .limit(1);

        if (existingTeacherInvoice) {
          await invoicesService.generateTeacherInvoice({
            teacherId: teacher.teacherId,
            month: fee.month,
            year: fee.year,
          });
        }
      }
    } catch (regenError: any) {
      logger.error(`[FEES] Invoice regeneration after session edit failed for fee ${feeId}`, {
        error: regenError.message,
      });
    }

    return {
      message: sessionCount === 0 ? 'Fee set to 0 sessions (nothing owed)' : `Fee updated to ${sessionCount} session(s)`,
      deleted: false,
    };
  },

  /**
   * Generate rolling-basis fee for regular classes.
   * The child is always billed the full month's fee immediately, starting the
   * enrollment month, regardless of what day of the month they joined — there
   * is no cutoff and no catch-up fee. (The 20th-of-month cutoff still applies
   * separately to *teacher* invoice eligibility — see shouldGenerateFeeForMonth,
   * used from invoices.service.ts.)
   */
  async generateRollingFee(
    enrollment: any,
    billingMonth: number,
    billingYear: number,
    dueDate: string,
    isManualGeneration: boolean
  ) {
    let regularCount = 0;
    let skipped = false;
    let skipReason: string | null = null;

    // Validate customFeePerMonth exists
    if (!enrollment.customFeePerMonth) {
      logger.warn(`[FEES] Skipping enrollment ${enrollment.id}: customFeePerMonth not set`);
      return { regularCount: 0, skipped: true, skipReason: 'No customFeePerMonth set' };
    }

    // Hard lower bound: never generate fees for months before the enrollment existed in the system.
    // startDate can be backdated by an admin, but enrolledAt is the actual DB creation timestamp.
    if (enrollment.enrolledAt) {
      const enrolledAt = new Date(enrollment.enrolledAt);
      const enrolledYear = enrolledAt.getFullYear();
      const enrolledMonth = enrolledAt.getMonth() + 1;
      if (enrolledYear > billingYear || (enrolledYear === billingYear && enrolledMonth > billingMonth)) {
        // Manual regeneration reconciles: if the enrollment date moved forward,
        // fees left behind in months before it are no longer valid — remove them
        // (never received ones). The daily cron stays non-destructive here.
        if (isManualGeneration) {
          await db
            .delete(fees)
            .where(
              and(
                eq(fees.enrollmentId, enrollment.id),
                eq(fees.month, billingMonth),
                eq(fees.year, billingYear),
                ne(fees.status, 'received')
              )
            );
        }
        return {
          regularCount: 0,
          skipped: true,
          skipReason: `Enrollment created ${enrolledAt.toISOString().split('T')[0]} after billing period ${billingMonth}/${billingYear}`,
        };
      }
    }

    // Honor drop date (mirror of the 20th join rule):
    //   dropped before the 20th  → no fee for the drop month
    //   dropped on/after the 20th → full fee for the drop month
    //   any month after the drop month → no fee
    // Existing pending/overdue fees that violate this are deleted; received fees are never touched.
    // Gated on status so a stale droppedAt on a re-activated enrollment has no effect.
    if (enrollment.status === 'dropped' && enrollment.droppedAt) {
      const droppedAt = new Date(enrollment.droppedAt);
      const dropYear = droppedAt.getFullYear();
      const dropMonth = droppedAt.getMonth() + 1;
      const dropDay = droppedAt.getDate();

      const billingAfterDropMonth =
        billingYear > dropYear || (billingYear === dropYear && billingMonth > dropMonth);
      const isDropMonth = billingYear === dropYear && billingMonth === dropMonth;

      if (billingAfterDropMonth || (isDropMonth && dropDay < 20)) {
        await db
          .delete(fees)
          .where(
            and(
              eq(fees.enrollmentId, enrollment.id),
              eq(fees.month, billingMonth),
              eq(fees.year, billingYear),
              ne(fees.status, 'received')
            )
          );
        return {
          regularCount: 0,
          skipped: true,
          skipReason: `Dropped ${droppedAt.toISOString().split('T')[0]}${isDropMonth ? ' before 20th' : ''} - no fee for ${billingMonth}/${billingYear}`,
        };
      }
      // Dropped on/after the 20th of the billing month → fall through, full fee applies
    }

    let feeAmount = enrollment.customFeePerMonth;
    let feeNotes = 'Regular monthly fee';
    const currency = enrollment.currency || 'PKR';
    // Fee generation is driven by the enrollment date only (startDate is informational).
    const enrollmentDate = enrollment.enrolledAt ? new Date(enrollment.enrolledAt) : null;

    // Pro-rated first month (opt-in per enrollment): charge only the days from the
    // enrollment date to the end of the month, so billing syncs to the 1st from the
    // next month onward. Still generated immediately either way.
    const isProratedFirstMonth =
      enrollment.prorateFirstMonth &&
      enrollmentDate !== null &&
      enrollmentDate.getFullYear() === billingYear &&
      enrollmentDate.getMonth() + 1 === billingMonth;

    if (isProratedFirstMonth) {
      const daysInMonth = new Date(billingYear, billingMonth, 0).getDate();
      const chargedDays = daysInMonth - enrollmentDate!.getDate() + 1;
      feeAmount = Math.round((chargedDays / daysInMonth) * parseFloat(feeAmount)).toString();
      feeNotes = `Pro-rated first month: ${chargedDays} of ${daysInMonth} days`;
    }

    // Manual regeneration reconciles: a catch-up fee left over from before this
    // rule existed is stale once a regular fee is due for the month — remove it
    // so the unique (enrollment, month, year) constraint doesn't block the insert.
    // Received fees are never touched.
    if (isManualGeneration) {
      await db
        .delete(fees)
        .where(
          and(
            eq(fees.enrollmentId, enrollment.id),
            eq(fees.month, billingMonth),
            eq(fees.year, billingYear),
            eq(fees.isCatchUp, true),
            ne(fees.status, 'received')
          )
        );
    }

    const existing = await db
      .select()
      .from(fees)
      .where(
        and(
          eq(fees.enrollmentId, enrollment.id),
          eq(fees.month, billingMonth),
          eq(fees.year, billingYear),
          eq(fees.isCatchUp, false)
        )
      )
      .limit(1);

    if (existing.length === 0 || isManualGeneration) {
      if (existing.length > 0) {
        // Don't overwrite already-received fees
        if (existing[0].status !== 'received') {
          await db
            .update(fees)
            .set({
              amount: feeAmount,
              currency: currency,
              billingType: 'monthly',
              feeNotes: feeNotes,
              updatedAt: new Date(),
            })
            .where(eq(fees.id, existing[0].id));
          logger.info(`[FEES] Updated regular fee for enrollment ${enrollment.id} for ${billingMonth}/${billingYear}: ${currency} ${feeAmount}`);
        } else {
          logger.info(`[FEES] Skipping update for received fee, enrollment ${enrollment.id} for ${billingMonth}/${billingYear}`);
        }
        regularCount++; // Count updates in manual mode
      } else {
        await db.insert(fees).values({
          enrollmentId: enrollment.id,
          studentId: enrollment.studentId,
          courseId: enrollment.courseId,
          month: billingMonth,
          year: billingYear,
          amount: feeAmount,
          currency: currency,
          dueDate,
          status: 'pending',
          billingType: 'monthly',
          isCatchUp: false,
          feeNotes: feeNotes,
        });
        regularCount++;
      }

      logger.info(`[FEES] Processed regular fee for enrollment ${enrollment.id} for ${billingMonth}/${billingYear}: ${currency} ${feeAmount}`);
    }

    return { regularCount, skipped, skipReason };
  },

  /**
   * The old 20th-of-month join cutoff. No longer used to decide whether a
   * child is billed (they're always billed immediately, in full, from the
   * enrollment month — see generateRollingFee) — kept solely to gate *teacher*
   * invoice eligibility (invoices.service.ts): a teacher is credited for a
   * student starting the month this returns true for, one month later than
   * the child's own bill when the child joined on/after the 20th.
   * RULE: If enrolled before 20th of month, include that month
   *       If enrolled on/after 20th, skip that month
   */
  shouldGenerateFeeForMonth(enrollmentDate: Date | null, month: number, year: number): boolean {
    if (!enrollmentDate) {
      return true;
    }

    const enrollmentMonth = enrollmentDate.getMonth() + 1;
    const enrollmentYear = enrollmentDate.getFullYear();
    const enrollmentDay = enrollmentDate.getDate();

    // If enrollment started in a different month, generate fee
    if (enrollmentYear < year || (enrollmentYear === year && enrollmentMonth < month)) {
      return true;
    }

    // If enrollment started in this exact month
    if (enrollmentYear === year && enrollmentMonth === month) {
      return enrollmentDay < 20;
    }

    return false;
  },

  async getStudentFees(studentId: string) {
    return this.getFees({ studentId });
  },

  async getCourseFees(courseId: string) {
    return this.getFees({ courseId });
  },

  async getOverdueFees() {
    return this.getFees({ status: 'overdue' });
  },

  async getPendingFees() {
    return this.getFees({ status: 'pending' });
  },
};

export default feesService;
