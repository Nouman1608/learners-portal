import { db } from '../config/database';
import { invoices, invoiceLineItems } from '../db/schema/invoices';
import { fees, enrollments, users, courses, courseTeachers, courseEvents } from '../db/schema';
import { eq, and, or, desc, sql, gte, lte, ilike } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import { feesService } from './fees.service';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

// Use environment variable for uploads directory, fallback to local uploads folder
const UPLOAD_BASE_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const UPLOADS_DIR = path.join(UPLOAD_BASE_DIR, 'invoices');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface SessionOverride {
  enrollmentId: string;
  sessionCount: number;
}

export interface GenerateStudentInvoiceInput {
  studentId: string;
  month: number;
  year: number;
  currency?: string;
  generatedBy?: string;
  sessionOverrides?: SessionOverride[]; // Admin-specified session counts for 1-to-1 classes
}

export interface GenerateTeacherInvoiceInput {
  teacherId: string;
  month: number;
  year: number;
  generatedBy?: string;
}

export const invoicesService = {
  /**
   * Get currency symbol
   */
  getCurrencySymbol(currency: string): string {
    const symbols: Record<string, string> = {
      'PKR': 'PKR',
      'USD': '$',
      'GBP': '£',
      'SAR': 'SR',
    };
    return symbols[currency] || currency;
  },

  /**
   * Format amount with currency
   */
  formatCurrency(amount: number | string, currency: string): string {
    const symbol = this.getCurrencySymbol(currency);
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `${symbol} ${num.toFixed(2)}`;
  },

  /**
   * Generate invoice number
   */
  generateInvoiceNumber(type: 'student' | 'teacher', month: number, year: number, sequence: number): string {
    const typeCode = type === 'student' ? 'STU' : 'TCH';
    const monthStr = month.toString().padStart(2, '0');
    const seqStr = sequence.toString().padStart(5, '0');
    return `INV-${year}-${monthStr}-${typeCode}-${seqStr}`;
  },

  /**
   * Get next invoice sequence number
   */
  async getNextSequence(type: 'student' | 'teacher', month: number, year: number): Promise<number> {
    const existingInvoices = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.type, type),
          eq(invoices.month, month),
          eq(invoices.year, year)
        )
      );

    return existingInvoices.length + 1;
  },

  /**
   * Generate PDF for student invoice
   */
  async generateStudentInvoicePDF(
    invoice: any,
    lineItems: any[],
    student: any,
    periodStr?: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const fileName = `${invoice.invoiceNumber}.pdf`;
        const filePath = path.join(UPLOADS_DIR, fileName);
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        // Header
        doc
          .fontSize(20)
          .text('Learners Academy', { align: 'center' })
          .fontSize(10)
          .text('Excellence in Education', { align: 'center' })
          .moveDown();

        // Invoice details
        doc
          .fontSize(16)
          .text('STUDENT INVOICE', { align: 'center' })
          .moveDown();

        doc
          .fontSize(10)
          .text(`Invoice Number: ${invoice.invoiceNumber}`, 50, 150)
          .text(`Date: ${new Date().toLocaleDateString()}`, 50, 165)
          .text(`Period: ${periodStr || `${getMonthName(invoice.month)} ${invoice.year}`}`, 50, 180);

        // Student details
        doc
          .text(`Student: ${student.firstName} ${student.lastName}`, 350, 150)
          .text(`Email: ${student.email}`, 350, 165)
          .text(`Username: ${student.username}`, 350, 180);

        // Line items table
        const tableTop = 250;
        doc
          .fontSize(12)
          .text('Course Fees', 50, tableTop)
          .moveDown();

        // Table headers
        const headerY = tableTop + 30;
        doc
          .fontSize(10)
          .text('Course', 50, headerY)
          .text('Amount', 450, headerY, { width: 90, align: 'right' });

        // Draw line under headers
        doc
          .moveTo(50, headerY + 15)
          .lineTo(550, headerY + 15)
          .stroke();

        // Helper function to check if we need a new page
        const checkPageBreak = (requiredSpace: number) => {
          if (currentY + requiredSpace > 720) {
            doc.addPage();
            currentY = 50;
          }
        };

        // Line items
        let currentY = headerY + 25;
        lineItems.forEach((item, index) => {
          // Check if we need a new page for this line item
          checkPageBreak(25);

          doc
            .fontSize(9)
            .text(item.description, 50, currentY)
            .text(invoicesService.formatCurrency(item.amount, invoice.currency), 450, currentY, { width: 90, align: 'right' });

          currentY += 20;
        });

        // Draw line before total
        doc
          .moveTo(350, currentY + 10)
          .lineTo(550, currentY + 10)
          .stroke();

        // Total
        currentY += 20;
        doc
          .fontSize(12)
          .text('Total Amount:', 350, currentY, { width: 90, align: 'right' })
          .text(invoicesService.formatCurrency(invoice.totalAmount, invoice.currency), 450, currentY, { width: 90, align: 'right' });

        // Footer
        doc
          .fontSize(8)
          .text(
            'This is a computer-generated invoice. Please contact administration for any queries.',
            50,
            doc.page.height - 100,
            { align: 'center', width: 500 }
          )
          

        doc.end();

        stream.on('finish', () => {
          resolve(`/uploads/invoices/${fileName}`);
        });

        stream.on('error', (err) => {
          reject(err);
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * Generate PDF for teacher invoice
   */
  async generateTeacherInvoicePDF(
    invoice: any,
    lineItems: any[],
    teacher: any,
    periodStr?: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const fileName = `${invoice.invoiceNumber}.pdf`;
        const filePath = path.join(UPLOADS_DIR, fileName);
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        // Header
        doc
          .fontSize(20)
          .text('Learners Academy', { align: 'center' })
          .fontSize(10)
          .text('Excellence in Education', { align: 'center' })
          .moveDown();

        // Invoice details
        doc
          .fontSize(16)
          .text('TEACHER PAYMENT INVOICE', { align: 'center' })
          .moveDown();

        doc
          .fontSize(10)
          .text(`Invoice Number: ${invoice.invoiceNumber}`, 50, 150)
          .text(`Date: ${new Date().toLocaleDateString()}`, 50, 165)
          .text(`Period: ${periodStr || `${getMonthName(invoice.month)} ${invoice.year}`}`, 50, 180);

        // Teacher details
        doc
          .text(`Teacher: ${teacher.firstName} ${teacher.lastName}`, 350, 150)
          .text(`Email: ${teacher.email}`, 350, 165)
          .text(`Username: ${teacher.username}`, 350, 180);

        // Organize line items hierarchically
        const organizedData = this.organizeLineItemsHierarchically(lineItems);

        // Line items section
        let currentY = 250;
        doc
          .fontSize(12)
          .text('Course Earnings', 50, currentY)
          .moveDown();

        currentY += 30;

        // Helper function to check if we need a new page
        const checkPageBreak = (requiredSpace: number) => {
          if (currentY + requiredSpace > 720) {
            doc.addPage();
            currentY = 50;
          }
        };

        // Render LOCAL STUDENTS section
        if (organizedData.local.courses.size > 0) {
          checkPageBreak(30);
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .text('LOCAL STUDENTS', 50, currentY);

          currentY += 20;

          for (const [courseName, students] of organizedData.local.courses) {
            // Check if we need a new page for the course header
            checkPageBreak(25);

            // Course name
            doc
              .fontSize(10)
              .font('Helvetica-Bold')
              .text(courseName, 70, currentY);

            currentY += 18;

            // Students
            for (const student of students) {
              // Check if we need a new page for this student
              checkPageBreak(20);

              const studentFee = student.metadata?.studentFee ? parseFloat(student.metadata.studentFee) : 0;
              const rateText = `${parseFloat(student.unitPrice).toFixed(1)}%`;

              doc
                .fontSize(9)
                .font('Helvetica')
                .text(`${student.metadata.studentName}`, 90, currentY, { width: 180 })
                .text(`PKR ${studentFee.toFixed(2)}`, 280, currentY, { width: 80, align: 'right' })
                .text(rateText, 370, currentY, { width: 70, align: 'right' })
                .text(`PKR ${parseFloat(student.amount).toFixed(2)}`, 450, currentY, { width: 90, align: 'right' });

              currentY += 16;
            }

            currentY += 5;
          }

          // Local subtotal
          checkPageBreak(25);
          doc
            .fontSize(10)
            .font('Helvetica-Bold')
            .text('Local Subtotal:', 350, currentY, { width: 90, align: 'right' })
            .text(`PKR ${organizedData.local.total.toFixed(2)}`, 450, currentY, { width: 90, align: 'right' });

          currentY += 25;
        }

        // Render ONLINE STUDENTS section
        if (organizedData.online.courses.size > 0) {
          checkPageBreak(30);
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .text('ONLINE STUDENTS', 50, currentY);

          currentY += 20;

          for (const [courseName, students] of organizedData.online.courses) {
            // Check if we need a new page for the course header
            checkPageBreak(25);

            // Course name
            doc
              .fontSize(10)
              .font('Helvetica-Bold')
              .text(courseName, 70, currentY);

            currentY += 18;

            // Students
            for (const student of students) {
              // Check if we need a new page for this student
              checkPageBreak(20);

              const rateText = `PKR ${parseFloat(student.unitPrice).toFixed(2)}`;

              doc
                .fontSize(9)
                .font('Helvetica')
                .text(`${student.metadata.studentName}`, 90, currentY, { width: 250 })
                .text(rateText, 370, currentY, { width: 70, align: 'right' })
                .text(`PKR ${parseFloat(student.amount).toFixed(2)}`, 450, currentY, { width: 90, align: 'right' });

              currentY += 16;
            }

            currentY += 5;
          }

          // Online subtotal
          checkPageBreak(25);
          doc
            .fontSize(10)
            .font('Helvetica-Bold')
            .text('Online Subtotal:', 350, currentY, { width: 90, align: 'right' })
            .text(`PKR ${organizedData.online.total.toFixed(2)}`, 450, currentY, { width: 90, align: 'right' });

          currentY += 25;
        }

        // Draw line before total
        doc
          .moveTo(450, currentY)
          .lineTo(550, currentY)
          .stroke();

        // Total
        currentY += 15;
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('Total Payment:', 350, currentY, { width: 90, align: 'right' })
          .text(`PKR ${parseFloat(invoice.totalAmount).toFixed(2)}`, 450, currentY, { width: 90, align: 'right' });

        // Footer
        doc
          .fontSize(8)
          .font('Helvetica')
          .text(
            'This is a computer-generated invoice. Please contact administration for any queries.',
            50,
            doc.page.height - 100,
            { align: 'center', width: 500 }
          )

        doc.end();

        stream.on('finish', () => {
          resolve(`/uploads/invoices/${fileName}`);
        });

        stream.on('error', (err) => {
          reject(err);
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * Generate simplified PDF for teacher invoice (hides rates and percentages)
   * This version is shown to teachers, hiding sensitive pricing information
   */
  async generateSimplifiedTeacherInvoicePDF(
    invoice: any,
    lineItems: any[],
    teacher: any,
    periodStr?: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const fileName = `${invoice.invoiceNumber}-simplified.pdf`;
        const filePath = path.join(UPLOADS_DIR, fileName);
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        // Header
        doc
          .fontSize(20)
          .text('Learners Academy', { align: 'center' })
          .fontSize(10)
          .text('Excellence in Education', { align: 'center' })
          .moveDown();

        // Invoice details
        doc
          .fontSize(16)
          .text('TEACHER PAYMENT INVOICE', { align: 'center' })
          .moveDown();

        doc
          .fontSize(10)
          .text(`Invoice Number: ${invoice.invoiceNumber}`, 50, 150)
          .text(`Date: ${new Date().toLocaleDateString()}`, 50, 165)
          .text(`Period: ${periodStr || `${getMonthName(invoice.month)} ${invoice.year}`}`, 50, 180);

        // Teacher details
        doc
          .text(`Teacher: ${teacher.firstName} ${teacher.lastName}`, 350, 150)
          .text(`Email: ${teacher.email}`, 350, 165)
          .text(`Username: ${teacher.username}`, 350, 180);

        // Organize line items hierarchically
        const organizedData = this.organizeLineItemsHierarchically(lineItems);

        // Line items section
        let currentY = 250;
        doc
          .fontSize(12)
          .text('Course Earnings', 50, currentY)
          .moveDown();

        currentY += 30;

        // Helper function to check if we need a new page
        const checkPageBreak = (requiredSpace: number) => {
          if (currentY + requiredSpace > 720) {
            doc.addPage();
            currentY = 50;
          }
        };

        // Render LOCAL STUDENTS section
        if (organizedData.local.courses.size > 0) {
          checkPageBreak(30);
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .text('LOCAL STUDENTS', 50, currentY);

          currentY += 20;

          for (const [courseName, students] of organizedData.local.courses) {
            // Check if we need a new page for the course header
            checkPageBreak(25);

            // Course name
            doc
              .fontSize(10)
              .font('Helvetica-Bold')
              .text(courseName, 70, currentY);

            currentY += 18;

            // Students (without showing rates)
            for (const student of students) {
              // Check if we need a new page for this student
              checkPageBreak(20);

              doc
                .fontSize(9)
                .font('Helvetica')
                .text(`${student.metadata.studentName}`, 90, currentY, { width: 350 })
                .text(`PKR ${parseFloat(student.amount).toFixed(2)}`, 450, currentY, { width: 90, align: 'right' });

              currentY += 16;
            }

            currentY += 5;
          }

          // Local subtotal
          checkPageBreak(25);
          doc
            .fontSize(10)
            .font('Helvetica-Bold')
            .text('Local Subtotal:', 350, currentY, { width: 90, align: 'right' })
            .text(`PKR ${organizedData.local.total.toFixed(2)}`, 450, currentY, { width: 90, align: 'right' });

          currentY += 25;
        }

        // Render ONLINE STUDENTS section
        if (organizedData.online.courses.size > 0) {
          checkPageBreak(30);
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .text('ONLINE STUDENTS', 50, currentY);

          currentY += 20;

          for (const [courseName, students] of organizedData.online.courses) {
            // Check if we need a new page for the course header
            checkPageBreak(25);

            // Course name
            doc
              .fontSize(10)
              .font('Helvetica-Bold')
              .text(courseName, 70, currentY);

            currentY += 18;

            // Students (without showing rates)
            for (const student of students) {
              // Check if we need a new page for this student
              checkPageBreak(20);

              doc
                .fontSize(9)
                .font('Helvetica')
                .text(`${student.metadata.studentName}`, 90, currentY, { width: 350 })
                .text(`PKR ${parseFloat(student.amount).toFixed(2)}`, 450, currentY, { width: 90, align: 'right' });

              currentY += 16;
            }

            currentY += 5;
          }

          // Online subtotal
          checkPageBreak(25);
          doc
            .fontSize(10)
            .font('Helvetica-Bold')
            .text('Online Subtotal:', 350, currentY, { width: 90, align: 'right' })
            .text(`PKR ${organizedData.online.total.toFixed(2)}`, 450, currentY, { width: 90, align: 'right' });

          currentY += 25;
        }

        // Draw line before total
        doc
          .moveTo(450, currentY)
          .lineTo(550, currentY)
          .stroke();

        // Total
        currentY += 15;
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('Total Payment:', 350, currentY, { width: 90, align: 'right' })
          .text(`PKR ${parseFloat(invoice.totalAmount).toFixed(2)}`, 450, currentY, { width: 90, align: 'right' });

        // Footer
        doc
          .fontSize(8)
          .font('Helvetica')
          .text(
            'This is a computer-generated invoice. Please contact administration for any queries.',
            50,
            doc.page.height - 100,
            { align: 'center', width: 500 }
          )

        doc.end();

        stream.on('finish', () => {
          resolve(`/uploads/invoices/${fileName}`);
        });

        stream.on('error', (err) => {
          reject(err);
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * Helper method to organize line items hierarchically by attendance mode and course
   */
  organizeLineItemsHierarchically(lineItems: any[]) {
    const organized = {
      local: {
        courses: new Map<string, any[]>(),
        total: 0,
      },
      online: {
        courses: new Map<string, any[]>(),
        total: 0,
      },
    };

    for (const item of lineItems) {
      const metadata = item.metadata || {};
      const attendanceMode = metadata.attendanceMode || 'local';
      const courseName = metadata.courseName || 'Unknown Course';
      const amount = parseFloat(item.amount);

      if (attendanceMode === 'local') {
        if (!organized.local.courses.has(courseName)) {
          organized.local.courses.set(courseName, []);
        }
        organized.local.courses.get(courseName)!.push(item);
        organized.local.total += amount;
      } else if (attendanceMode === 'online') {
        if (!organized.online.courses.has(courseName)) {
          organized.online.courses.set(courseName, []);
        }
        organized.online.courses.get(courseName)!.push(item);
        organized.online.total += amount;
      }
    }

    return organized;
  },

  /**
   * Generate student invoice
   */
  async generateStudentInvoice(input: GenerateStudentInvoiceInput) {
    const targetCurrency = input.currency || null;

    // Build where conditions for checking existing invoice
    const existingInvoiceConditions = [
      eq(invoices.recipientId, input.studentId),
      eq(invoices.month, input.month),
      eq(invoices.year, input.year),
      eq(invoices.type, 'student'),
      eq(invoices.isLatest, true)
    ];

    // If currency is specified, only check for invoices with that currency
    if (targetCurrency) {
      existingInvoiceConditions.push(eq(invoices.currency, targetCurrency));
    }

    // Check if latest invoice already exists
    const [existing] = await db
      .select()
      .from(invoices)
      .where(and(...existingInvoiceConditions))
      .limit(1);

    // Versioning: If exists, mark old as not latest and increment version
    let newVersion = 1;
    if (existing) {
      await db
        .update(invoices)
        .set({ isLatest: false })
        .where(eq(invoices.id, existing.id));

      newVersion = (existing.version || 1) + 1;
      logger.info(`[INVOICE] Regenerating student invoice for ${input.studentId} - ${input.month}/${input.year} (version ${newVersion})`);
    }

    // Get student details
    const [student] = await db
      .select()
      .from(users)
      .where(eq(users.id, input.studentId))
      .limit(1);

    if (!student) {
      throw new AppError(404, 'Student not found');
    }

    // Apply admin-specified session overrides for 1-to-1 classes before generating
    if (input.sessionOverrides && input.sessionOverrides.length > 0) {
      for (const override of input.sessionOverrides) {
        const [enrollment] = await db
          .select()
          .from(enrollments)
          .where(eq(enrollments.id, override.enrollmentId))
          .limit(1);

        if (!enrollment || !enrollment.perSessionFee) continue;

        const perSessionFee = parseFloat(enrollment.perSessionFee);
        const totalAmount = (perSessionFee * override.sessionCount).toFixed(2);
        const currency = enrollment.currency || 'PKR';
        const periodStart = new Date(input.year, input.month - 1, 1).toISOString().split('T')[0];
        const periodEnd = new Date(input.year, input.month, 0).toISOString().split('T')[0];
        const dueDate = new Date(input.year, input.month - 1, 10).toISOString().split('T')[0];

        const [existing] = await db
          .select()
          .from(fees)
          .where(and(
            eq(fees.enrollmentId, override.enrollmentId),
            eq(fees.month, input.month),
            eq(fees.year, input.year)
          ))
          .limit(1);

        if (existing) {
          await db.update(fees).set({
            amount: totalAmount,
            currency,
            billingType: 'usage',
            sessionCount: override.sessionCount,
            billingPeriodStart: periodStart,
            billingPeriodEnd: periodEnd,
            feeNotes: `1-to-1 class: ${override.sessionCount} session(s) × ${currency} ${perSessionFee.toFixed(2)} (admin override)`,
            updatedAt: new Date(),
          }).where(eq(fees.id, existing.id));
        } else {
          await db.insert(fees).values({
            enrollmentId: override.enrollmentId,
            studentId: input.studentId,
            courseId: enrollment.courseId,
            month: input.month,
            year: input.year,
            amount: totalAmount,
            currency,
            dueDate,
            status: 'pending',
            billingType: 'usage',
            sessionCount: override.sessionCount,
            billingPeriodStart: periodStart,
            billingPeriodEnd: periodEnd,
            feeNotes: `1-to-1 class: ${override.sessionCount} session(s) × ${currency} ${perSessionFee.toFixed(2)} (admin override)`,
          });
        }

        logger.info(`[INVOICE] Session override applied: enrollment ${override.enrollmentId} → ${override.sessionCount} sessions = ${currency} ${totalAmount}`);
      }
    }

    // Build where conditions for fetching fees.
    // Zero-amount fees are 1-to-1 placeholders (0 sessions) — never invoiced.
    const feeWhereConditions = [
      eq(fees.studentId, input.studentId),
      eq(fees.month, input.month),
      eq(fees.year, input.year),
      sql`${fees.amount}::numeric > 0`
    ];

    // If currency is specified, only get fees in that currency
    if (targetCurrency) {
      feeWhereConditions.push(eq(fees.currency, targetCurrency));
    }

    // Get fees for the month with enrollment details for 1-to-1 session info
    const studentFees = await db
      .select({
        id: fees.id,
        amount: fees.amount,
        currency: fees.currency,
        status: fees.status,
        billingType: fees.billingType,
        sessionCount: fees.sessionCount,
        course: {
          id: courses.id,
          title: courses.title,
        },
        enrollment: {
          perSessionFee: enrollments.perSessionFee,
          classType: enrollments.classType,
          enrolledAt: enrollments.enrolledAt,
        },
      })
      .from(fees)
      .innerJoin(courses, eq(fees.courseId, courses.id))
      .innerJoin(enrollments, eq(fees.enrollmentId, enrollments.id))
      .where(and(...feeWhereConditions));

    const currencyFilter = targetCurrency ? ` (${targetCurrency} only)` : '';
    logger.info(`[INVOICE] Found ${studentFees.length} fees for student ${input.studentId} (${student.username}) - ${input.month}/${input.year}${currencyFilter}`);

    if (studentFees.length === 0) {
      throw new AppError(404, `No fees found for this student and period${currencyFilter}`);
    }

    // Validate all fees have the same currency (should always be true now with currency filtering)
    const currencies = [...new Set(studentFees.map(f => f.currency || 'PKR'))];
    logger.info(`[INVOICE] Currencies detected for ${student.username}: ${currencies.join(', ')}`);

    if (currencies.length > 1) {
      throw new AppError(400, `Mixed currencies detected: ${currencies.join(', ')}. This should not happen with currency filtering.`);
    }
    const invoiceCurrency = studentFees[0].currency || 'PKR';
    logger.info(`[INVOICE] Generating invoice in ${invoiceCurrency} for ${student.username}`);

    // Calculate total
    const totalAmount = studentFees.reduce((sum, fee) => sum + parseInt(fee.amount), 0);

    // Generate invoice number (append currency and version suffix if needed)
    const sequence = await this.getNextSequence('student', input.month, input.year);
    let invoiceNumber = this.generateInvoiceNumber('student', input.month, input.year, sequence);

    // Add currency suffix if not PKR (to distinguish multi-currency invoices)
    if (invoiceCurrency !== 'PKR') {
      invoiceNumber = `${invoiceNumber}-${invoiceCurrency}`;
    }

    // Add version suffix if regenerated
    if (newVersion > 1) {
      invoiceNumber = `${invoiceNumber}-v${newVersion}`;
    }

    // Create invoice
    const [newInvoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber,
        type: 'student',
        recipientId: input.studentId,
        month: input.month,
        year: input.year,
        version: newVersion,
        isLatest: true,
        currency: invoiceCurrency,
        totalAmount: totalAmount.toString(),
        generatedBy: input.generatedBy || null,
      })
      .returning();

    // Create line items with session breakdown for 1-to-1 classes
    const lineItemsData = studentFees.map((fee) => {
      let description = fee.course.title;
      let quantity = '1';
      let unitPrice = fee.amount;

      // For 1-to-1 (usage-based) fees, show session breakdown
      if (fee.billingType === 'usage' && fee.sessionCount && fee.enrollment.perSessionFee) {
        description = `${fee.course.title} (${fee.sessionCount} session${fee.sessionCount > 1 ? 's' : ''})`;
        quantity = fee.sessionCount.toString();
        unitPrice = fee.enrollment.perSessionFee;
      }

      return {
        invoiceId: newInvoice.id,
        description,
        courseId: fee.course.id,
        feeId: fee.id,
        quantity,
        unitPrice,
        amount: fee.amount,
      };
    });

    const createdLineItems = await db
      .insert(invoiceLineItems)
      .values(lineItemsData)
      .returning();

    // Compute billing period from enrollment date
    const enrolledAt = studentFees[0]?.enrollment?.enrolledAt;
    const enrollDay = enrolledAt ? new Date(enrolledAt).getDate() : 1;
    const periodStr = formatBillingPeriod(enrollDay, input.month, input.year);

    // Generate PDF
    const pdfUrl = await this.generateStudentInvoicePDF(newInvoice, createdLineItems, student, periodStr);

    // Update invoice with PDF URL
    const [updatedInvoice] = await db
      .update(invoices)
      .set({ pdfUrl })
      .where(eq(invoices.id, newInvoice.id))
      .returning();

    logger.info(`[INVOICE] Generated student invoice ${invoiceNumber} for ${student.username}`);

    return {
      invoice: updatedInvoice,
      lineItems: createdLineItems,
    };
  },

  /**
   * Generate teacher invoice
   */
  async generateTeacherInvoice(input: GenerateTeacherInvoiceInput) {
    // Check if latest invoice already exists
    const [existing] = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.recipientId, input.teacherId),
          eq(invoices.month, input.month),
          eq(invoices.year, input.year),
          eq(invoices.type, 'teacher'),
          eq(invoices.isLatest, true)
        )
      )
      .limit(1);

    // Versioning: If exists, mark old as not latest and increment version
    let newVersion = 1;
    if (existing) {
      await db
        .update(invoices)
        .set({ isLatest: false })
        .where(eq(invoices.id, existing.id));

      newVersion = (existing.version || 1) + 1;
      logger.info(`[INVOICE] Regenerating teacher invoice for ${input.teacherId} - ${input.month}/${input.year} (version ${newVersion})`);
    }

    // Get teacher details with fee configuration
    const [teacher] = await db
      .select()
      .from(users)
      .where(eq(users.id, input.teacherId))
      .limit(1);

    if (!teacher) {
      throw new AppError(404, 'Teacher not found');
    }

    if (teacher.role !== 'teacher') {
      throw new AppError(400, 'User is not a teacher');
    }

    const isSalaried = teacher.teacherPaymentType === 'salaried';
    const monthlySalary = teacher.monthlySalary ? parseFloat(teacher.monthlySalary) : 0;
    const localFeePercentage = teacher.localStudentFeePercentage ? parseFloat(teacher.localStudentFeePercentage) : 0;
    const onlineFixedAmountIg = teacher.onlineStudentFixedAmountIg ? parseFloat(teacher.onlineStudentFixedAmountIg) : 0;
    const onlineFixedAmountAlevel = teacher.onlineStudentFixedAmountAlevel ? parseFloat(teacher.onlineStudentFixedAmountAlevel) : 0;

    const hasLocalConfig = localFeePercentage > 0;
    const hasOnlineConfig = onlineFixedAmountIg > 0 || onlineFixedAmountAlevel > 0;
    const hasSalaryConfig = isSalaried && monthlySalary > 0;

    if (!hasSalaryConfig && !hasLocalConfig && !hasOnlineConfig) {
      logger.warn(`[INVOICE] Skipping teacher ${teacher.firstName} ${teacher.lastName} (${input.teacherId}): no fee configuration set`);
      throw new AppError(400, 'Teacher fee configuration not set. Please update teacher profile with fee settings.');
    }

    // Get courses taught by teacher
    const teacherCourses = await db
      .select({
        courseId: courseTeachers.courseId,
        course: {
          id: courses.id,
          title: courses.title,
          courseLevel: courses.courseLevel,
        },
      })
      .from(courseTeachers)
      .innerJoin(courses, eq(courseTeachers.courseId, courses.id))
      .where(eq(courseTeachers.teacherId, input.teacherId));

    if (teacherCourses.length === 0) {
      logger.warn(`[INVOICE] Skipping teacher ${teacher.firstName} ${teacher.lastName}: no courses assigned`);
      throw new AppError(404, 'No courses assigned to this teacher');
    }

    logger.info(`[INVOICE] Processing teacher ${teacher.firstName} ${teacher.lastName}: ${teacherCourses.length} courses, paymentType=${isSalaried ? 'salaried' : 'percentage_based'}, localFee=${localFeePercentage}%, onlineIG=${onlineFixedAmountIg}, onlineAL=${onlineFixedAmountAlevel}, salary=${monthlySalary}`);

    // Calculate earnings per course
    const lineItemsData: any[] = [];
    let totalAmount = 0;

    // Salaried teachers: single line item, skip per-student calculations
    if (isSalaried) {
      lineItemsData.push({
        description: `Monthly Salary - ${input.month}/${input.year}`,
        courseId: null,
        feeId: null,
        quantity: '1',
        unitPrice: monthlySalary.toString(),
        amount: monthlySalary.toString(),
        metadata: {
          paymentType: 'salary',
        },
      });
      totalAmount = monthlySalary;
    }

    // Per-student calculations (only for percentage_based teachers)
    if (!isSalaried) for (const teacherCourse of teacherCourses) {
      // Get active enrollments for the course with student details
      const activeEnrollments = await db
        .select({
          id: enrollments.id,
          studentId: enrollments.studentId,
          customFeePerMonth: enrollments.customFeePerMonth,
          perSessionFee: enrollments.perSessionFee,
          classType: enrollments.classType,
          attendanceMode: enrollments.attendanceMode,
          startDate: enrollments.startDate,
          enrolledAt: enrollments.enrolledAt,
          student: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
          },
        })
        .from(enrollments)
        .innerJoin(users, eq(enrollments.studentId, users.id))
        .where(
          and(
            eq(enrollments.courseId, teacherCourse.courseId),
            eq(enrollments.status, 'active')
          )
        );

      if (activeEnrollments.length === 0) {
        logger.info(`[INVOICE]   Course "${teacherCourse.course.title}": no active enrollments, skipping`);
        continue;
      }

      // Separate local and online students from active enrollments
      const localEnrollments = hasLocalConfig ? activeEnrollments.filter(e => e.attendanceMode === 'local') : [];
      const onlineEnrollments = hasOnlineConfig ? activeEnrollments.filter(e => e.attendanceMode === 'online') : [];

      if (localEnrollments.length === 0 && onlineEnrollments.length === 0) {
        const modes = activeEnrollments.map(e => e.attendanceMode).filter(Boolean);
        const uniqueModes = [...new Set(modes)];
        logger.info(`[INVOICE]   Course "${teacherCourse.course.title}": ${activeEnrollments.length} eligible but no matching attendance modes (found: ${uniqueModes.join(', ') || 'none set'})`);
        continue;
      }

      logger.info(`[INVOICE]   Course "${teacherCourse.course.title}": ${localEnrollments.length} local, ${onlineEnrollments.length} online students eligible`);

      let courseEarnings = 0;

      // Create individual line items for local students (percentage-based)
      for (const enrollment of localEnrollments) {
        let studentFee = 0;
        let sessionCount: number | null = null;
        let feeId: string | null = null;

        // For 1-to-1 classes, get the actual fee from fees table (based on sessions)
        if (enrollment.classType === '1-to-1' && enrollment.perSessionFee) {
          const [enrollmentFee] = await db
            .select()
            .from(fees)
            .where(
              and(
                eq(fees.enrollmentId, enrollment.id),
                eq(fees.month, input.month),
                eq(fees.year, input.year)
              )
            )
            .limit(1);

          if (enrollmentFee && parseFloat(enrollmentFee.amount) > 0) {
            studentFee = parseFloat(enrollmentFee.amount);
            sessionCount = enrollmentFee.sessionCount;
            feeId = enrollmentFee.id;
          } else {
            // No fee record (or a zero-session placeholder) means no billable sessions that month
            logger.info(`[INVOICE]   Skipping 1-to-1 student ${enrollment.student.firstName} ${enrollment.student.lastName}: no billable sessions for ${input.month}/${input.year}`);
            continue;
          }
        } else {
          // Teacher eligibility follows the old 20th-of-month join cutoff, decoupled
          // from the child's own fee (which is now billed immediately from day one):
          // joined before the 20th → teacher credited this month; on/after the 20th
          // → teacher credit starts the following month instead.
          const enrolledAtDate = enrollment.enrolledAt ? new Date(enrollment.enrolledAt) : null;
          if (!feesService.shouldGenerateFeeForMonth(enrolledAtDate, input.month, input.year)) {
            logger.info(`[INVOICE]   Skipping local student ${enrollment.student.firstName} ${enrollment.student.lastName}: joined on/after the 20th, teacher credit starts next month`);
            continue;
          }

          // Regular monthly fee — look up actual fee record for the amount/proration
          const [regularFee] = await db
            .select({ amount: fees.amount })
            .from(fees)
            .where(
              and(
                eq(fees.enrollmentId, enrollment.id),
                eq(fees.month, input.month),
                eq(fees.year, input.year),
                eq(fees.isCatchUp, false)
              )
            )
            .limit(1);

          if (!regularFee) {
            logger.info(`[INVOICE]   Skipping local student ${enrollment.student.firstName} ${enrollment.student.lastName}: no fee record for ${input.month}/${input.year}`);
            continue;
          }
          studentFee = parseFloat(regularFee.amount);
        }

        if (studentFee === 0) continue;

        const earning = (studentFee * localFeePercentage) / 100;

        const description = enrollment.classType === '1-to-1' && sessionCount
          ? `1-to-1 Local - ${teacherCourse.course.title} - ${enrollment.student.firstName} ${enrollment.student.lastName} (${sessionCount} sessions)`
          : `Local - ${teacherCourse.course.title} - ${enrollment.student.firstName} ${enrollment.student.lastName}`;

        lineItemsData.push({
          description,
          courseId: teacherCourse.courseId,
          feeId,
          quantity: '1',
          unitPrice: localFeePercentage.toString(),
          amount: earning.toString(),
          metadata: {
            attendanceMode: 'local',
            classType: enrollment.classType || 'regular',
            courseName: teacherCourse.course.title,
            studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
            studentFee: studentFee.toString(),
            ...(sessionCount && { sessionCount: sessionCount.toString() }),
            ...(enrollment.perSessionFee && { perSessionFee: enrollment.perSessionFee }),
          },
        });

        courseEarnings += earning;
        totalAmount += earning;
      }

      // Create individual line items for online students (fixed amount per student based on course level)
      for (const enrollment of onlineEnrollments) {
        let sessionCount: number | null = null;
        let feeId: string | null = null;
        let regularFeeAmount: string | null = null;

        // Check fee record — ensures join date (20th rule) and proration are respected
        if (enrollment.classType === '1-to-1') {
          const [enrollmentFee] = await db
            .select()
            .from(fees)
            .where(
              and(
                eq(fees.enrollmentId, enrollment.id),
                eq(fees.month, input.month),
                eq(fees.year, input.year)
              )
            )
            .limit(1);

          if (enrollmentFee && parseFloat(enrollmentFee.amount) > 0) {
            sessionCount = enrollmentFee.sessionCount;
            feeId = enrollmentFee.id;
          } else {
            // No fee record (or a zero-session placeholder) means no billable sessions that month
            logger.info(`[INVOICE]   Skipping 1-to-1 online student ${enrollment.student.firstName} ${enrollment.student.lastName}: no billable sessions for ${input.month}/${input.year}`);
            continue;
          }
        } else {
          // Teacher eligibility follows the old 20th-of-month join cutoff, decoupled
          // from the child's own fee (which is now billed immediately from day one):
          // joined before the 20th → teacher credited this month; on/after the 20th
          // → teacher credit starts the following month instead.
          const enrolledAtDate = enrollment.enrolledAt ? new Date(enrollment.enrolledAt) : null;
          if (!feesService.shouldGenerateFeeForMonth(enrolledAtDate, input.month, input.year)) {
            logger.info(`[INVOICE]   Skipping online student ${enrollment.student.firstName} ${enrollment.student.lastName}: joined on/after the 20th, teacher credit starts next month`);
            continue;
          }

          // Regular online class — check fee record for the amount/proration
          const [regularFee] = await db
            .select({ id: fees.id, amount: fees.amount })
            .from(fees)
            .where(
              and(
                eq(fees.enrollmentId, enrollment.id),
                eq(fees.month, input.month),
                eq(fees.year, input.year),
                eq(fees.isCatchUp, false)
              )
            )
            .limit(1);

          if (!regularFee) {
            logger.info(`[INVOICE]   Skipping online student ${enrollment.student.firstName} ${enrollment.student.lastName}: no fee record for ${input.month}/${input.year}`);
            continue;
          }
          feeId = regularFee.id;
          regularFeeAmount = regularFee.amount;
        }

        // Determine the appropriate online amount based on course level
        const courseLevel = teacherCourse.course.courseLevel || 'ig';
        const onlineAmount = courseLevel === 'alevel' ? onlineFixedAmountAlevel : onlineFixedAmountIg;

        // If the student's fee is pro-rated (e.g. pro-rated first month), pro-rate
        // the teacher's fixed amount by the same ratio (fee paid / full monthly fee)
        let onlineEarning = onlineAmount;
        let isProrated = false;
        if (
          enrollment.classType !== '1-to-1' &&
          regularFeeAmount !== null &&
          enrollment.customFeePerMonth
        ) {
          const fullFee = parseFloat(enrollment.customFeePerMonth);
          const paidFee = parseFloat(regularFeeAmount);
          if (fullFee > 0 && paidFee < fullFee) {
            onlineEarning = Math.round(onlineAmount * (paidFee / fullFee));
            isProrated = true;
          }
        }

        const description = enrollment.classType === '1-to-1' && sessionCount
          ? `1-to-1 Online - ${teacherCourse.course.title} - ${enrollment.student.firstName} ${enrollment.student.lastName} (${sessionCount} sessions)`
          : `Online - ${teacherCourse.course.title} - ${enrollment.student.firstName} ${enrollment.student.lastName}${isProrated ? ' (pro-rated)' : ''}`;

        lineItemsData.push({
          description,
          courseId: teacherCourse.courseId,
          feeId,
          quantity: '1',
          unitPrice: onlineAmount.toString(),
          amount: onlineEarning.toString(),
          metadata: {
            attendanceMode: 'online',
            classType: enrollment.classType || 'regular',
            courseName: teacherCourse.course.title,
            studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
            ...(isProrated && { prorated: 'true' }),
            ...(sessionCount && { sessionCount: sessionCount.toString() }),
            ...(enrollment.perSessionFee && { perSessionFee: enrollment.perSessionFee }),
          },
        });

        courseEarnings += onlineEarning;
        totalAmount += onlineEarning;
      }
    }

    if (lineItemsData.length === 0) {
      throw new AppError(404, 'No earnings to invoice for this teacher');
    }

    // Generate invoice number (append version suffix if regenerated)
    const sequence = await this.getNextSequence('teacher', input.month, input.year);
    let invoiceNumber = this.generateInvoiceNumber('teacher', input.month, input.year, sequence);
    if (newVersion > 1) {
      invoiceNumber = `${invoiceNumber}-v${newVersion}`;
    }

    // Create invoice (teacher invoices are always in PKR)
    const [newInvoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber,
        type: 'teacher',
        recipientId: input.teacherId,
        month: input.month,
        year: input.year,
        version: newVersion,
        isLatest: true,
        currency: 'PKR',
        totalAmount: totalAmount.toString(),
        generatedBy: input.generatedBy || null,
      })
      .returning();

    // Create line items
    const lineItemsWithInvoiceId = lineItemsData.map((item) => ({
      ...item,
      invoiceId: newInvoice.id,
    }));

    const createdLineItems = await db
      .insert(invoiceLineItems)
      .values(lineItemsWithInvoiceId)
      .returning();

    // Generate both detailed and simplified PDFs
    const pdfUrl = await this.generateTeacherInvoicePDF(newInvoice, createdLineItems, teacher);
    const simplifiedPdfUrl = await this.generateSimplifiedTeacherInvoicePDF(newInvoice, createdLineItems, teacher);

    // Update invoice with both PDF URLs
    const [updatedInvoice] = await db
      .update(invoices)
      .set({ pdfUrl, simplifiedPdfUrl })
      .where(eq(invoices.id, newInvoice.id))
      .returning();

    logger.info(`[INVOICE] Generated teacher invoice ${invoiceNumber} for ${teacher.username}`);

    return {
      invoice: updatedInvoice,
      lineItems: createdLineItems,
    };
  },

  /**
   * Get invoices with filtering
   */
  async getInvoices(filters?: {
    recipientId?: string;
    type?: string;
    month?: number;
    year?: number;
    search?: string;
    includeAllVersions?: boolean; // Set to true to include old versions
  }) {
    let query = db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        type: invoices.type,
        recipientId: invoices.recipientId,
        month: invoices.month,
        year: invoices.year,
        version: invoices.version,
        isLatest: invoices.isLatest,
        currency: invoices.currency,
        totalAmount: invoices.totalAmount,
        pdfUrl: invoices.pdfUrl,
        simplifiedPdfUrl: invoices.simplifiedPdfUrl,
        emailedAt: invoices.emailedAt,
        createdAt: invoices.createdAt,
        recipient: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          whatsappGroupLink: users.whatsappGroupLink,
          studentCategory: users.studentCategory,
          studentSubcategory: users.studentSubcategory,
        },
      })
      .from(invoices)
      .innerJoin(users, eq(invoices.recipientId, users.id))
      .$dynamic();

    const conditions = [];

    // By default, only show latest versions
    if (!filters?.includeAllVersions) {
      conditions.push(eq(invoices.isLatest, true));
    }

    if (filters?.recipientId) {
      conditions.push(eq(invoices.recipientId, filters.recipientId));
    }
    if (filters?.type) {
      conditions.push(eq(invoices.type, filters.type));
    }
    if (filters?.month) {
      conditions.push(eq(invoices.month, filters.month));
    }
    if (filters?.year) {
      conditions.push(eq(invoices.year, filters.year));
    }
    if (filters?.search) {
      conditions.push(
        or(
          ilike(invoices.invoiceNumber, `%${filters.search}%`),
          ilike(users.firstName, `%${filters.search}%`),
          ilike(users.lastName, `%${filters.search}%`),
          // Match full names like "Harmeen Azmat" that span both columns
          ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, `%${filters.search}%`),
          ilike(users.email, `%${filters.search}%`)
        )
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    query = query.orderBy(desc(invoices.createdAt));

    const invoicesList = await query;

    // Fetch line items for each invoice
    const invoicesWithLineItems = await Promise.all(
      invoicesList.map(async (invoice) => {
        const items = await db
          .select()
          .from(invoiceLineItems)
          .where(eq(invoiceLineItems.invoiceId, invoice.id));

        return {
          ...invoice,
          lineItems: items,
        };
      })
    );

    return invoicesWithLineItems;
  },

  /**
   * Get invoice by ID
   */
  async getInvoiceById(invoiceId: string) {
    const [invoice] = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        type: invoices.type,
        recipientId: invoices.recipientId,
        month: invoices.month,
        year: invoices.year,
        version: invoices.version,
        isLatest: invoices.isLatest,
        currency: invoices.currency,
        totalAmount: invoices.totalAmount,
        pdfUrl: invoices.pdfUrl,
        simplifiedPdfUrl: invoices.simplifiedPdfUrl,
        emailedAt: invoices.emailedAt,
        createdAt: invoices.createdAt,
        recipient: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          username: users.username,
          whatsappGroupLink: users.whatsappGroupLink,
        },
      })
      .from(invoices)
      .innerJoin(users, eq(invoices.recipientId, users.id))
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      throw new AppError(404, 'Invoice not found');
    }

    // Get line items
    const items = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoiceId));

    return {
      ...invoice,
      lineItems: items,
    };
  },

  /**
   * Generate student invoices only for a month (for UI button)
   */
  async generateMonthlyStudentInvoices(month: number, year: number) {
    let invoiceCount = 0;

    // Get all student-currency combinations with fees for the month
    // This handles cases where students have fees in multiple currencies
    const studentCurrencyCombinations = await db
      .selectDistinct({
        studentId: fees.studentId,
        currency: sql<string>`COALESCE(${fees.currency}, 'PKR')`,
      })
      .from(fees)
      .where(and(eq(fees.month, month), eq(fees.year, year)));

    logger.info(`[INVOICE] Found ${studentCurrencyCombinations.length} student-currency combinations for ${month}/${year}`);

    // Generate student invoices for each student-currency combination
    for (const { studentId, currency } of studentCurrencyCombinations) {
      try {
        await this.generateStudentInvoice({ studentId, month, year, currency });
        invoiceCount++;
      } catch (error: any) {
        logger.error(`[INVOICE] Failed to generate ${currency} invoice for student ${studentId}:`, error);
      }
    }

    return {
      message: `Generated ${invoiceCount} student invoices`,
      studentCount: invoiceCount,
    };
  },

  /**
   * Generate all invoices for a month (for cron job)
   */
  async generateMonthlyInvoices(month: number, year: number) {
    let invoiceCount = 0;
    let teacherCount = 0;

    // Get all student-currency combinations with fees for the month
    // This handles cases where students have fees in multiple currencies
    const studentCurrencyCombinations = await db
      .selectDistinct({
        studentId: fees.studentId,
        currency: sql<string>`COALESCE(${fees.currency}, 'PKR')`,
      })
      .from(fees)
      .where(and(eq(fees.month, month), eq(fees.year, year)));

    logger.info(`[INVOICE] Found ${studentCurrencyCombinations.length} student-currency combinations for ${month}/${year}`);

    // Generate student invoices for each student-currency combination
    for (const { studentId, currency } of studentCurrencyCombinations) {
      try {
        await this.generateStudentInvoice({ studentId, month, year, currency });
        invoiceCount++;
      } catch (error: any) {
        logger.error(`[INVOICE] Failed to generate ${currency} invoice for student ${studentId}:`, error);
      }
    }

    // Get all teachers
    const allTeachers = await db
      .selectDistinct({ teacherId: courseTeachers.teacherId })
      .from(courseTeachers);

    // Generate teacher invoices
    for (const { teacherId } of allTeachers) {
      try {
        await this.generateTeacherInvoice({ teacherId, month, year });
        teacherCount++;
      } catch (error: any) {
        // Skip if no active enrollments or already exists
        if (error.statusCode !== 404 && error.statusCode !== 400) {
          logger.error(`[INVOICE] Failed to generate teacher invoice for ${teacherId}:`, error);
        }
      }
    }

    return {
      message: `Generated ${invoiceCount} student invoices and ${teacherCount} teacher invoices`,
      studentCount: invoiceCount,
      teacherCount,
    };
  },

  async generateMonthlyTeacherInvoices(month: number, year: number) {
    let teacherCount = 0;

    const allTeachers = await db
      .selectDistinct({ teacherId: courseTeachers.teacherId })
      .from(courseTeachers);

    logger.info(`[INVOICE] Generating teacher invoices for ${month}/${year}: ${allTeachers.length} teachers found`);

    for (const { teacherId } of allTeachers) {
      try {
        await this.generateTeacherInvoice({ teacherId, month, year });
        teacherCount++;
      } catch (error: any) {
        if (error.statusCode !== 404 && error.statusCode !== 400) {
          logger.error(`[INVOICE] Failed to generate teacher invoice for ${teacherId}:`, error);
        }
      }
    }

    return {
      message: `Generated ${teacherCount} teacher invoices`,
      teacherCount,
    };
  },

  async get1to1Sessions(studentId: string, month: number, year: number) {
    const periodStart = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const periodEnd = new Date(year, month, 0).toISOString().split('T')[0];

    // Get active 1-to-1 enrollments for this student
    const active1to1 = await db
      .select({
        enrollmentId: enrollments.id,
        courseId: enrollments.courseId,
        courseTitle: courses.title,
        perSessionFee: enrollments.perSessionFee,
        currency: enrollments.currency,
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(and(
        eq(enrollments.studentId, studentId),
        eq(enrollments.classType, '1-to-1'),
        eq(enrollments.status, 'active')
      ));

    if (active1to1.length === 0) return [];

    const result = [];

    for (const enrollment of active1to1) {
      // Count completed sessions in this month from courseEvents
      const [completedRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(courseEvents)
        .where(and(
          eq(courseEvents.courseId, enrollment.courseId),
          eq(courseEvents.classType, '1-to-1'),
          eq(courseEvents.status, 'completed'),
          gte(courseEvents.eventDate, periodStart),
          lte(courseEvents.eventDate, periodEnd)
        ));

      // Count all sessions (including scheduled) for reference
      const [allRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(courseEvents)
        .where(and(
          eq(courseEvents.courseId, enrollment.courseId),
          eq(courseEvents.classType, '1-to-1'),
          gte(courseEvents.eventDate, periodStart),
          lte(courseEvents.eventDate, periodEnd)
        ));

      // Check existing fee record for this month
      const [existingFee] = await db
        .select({ sessionCount: fees.sessionCount, amount: fees.amount })
        .from(fees)
        .where(and(
          eq(fees.enrollmentId, enrollment.enrollmentId),
          eq(fees.month, month),
          eq(fees.year, year)
        ))
        .limit(1);

      result.push({
        enrollmentId: enrollment.enrollmentId,
        courseTitle: enrollment.courseTitle,
        perSessionFee: enrollment.perSessionFee,
        currency: enrollment.currency || 'PKR',
        completedSessions: completedRow?.count || 0,
        totalSessions: allRow?.count || 0,
        existingSessionCount: existingFee?.sessionCount ?? null,
      });
    }

    return result;
  },
};

// Helper functions
function getMonthName(month: number): string {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return months[month - 1] || 'Unknown';
}

function getShortMonthName(month: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[month - 1] || 'Unknown';
}

/**
 * Format a billing period based on enrollment day.
 * e.g. enrollDay=5, month=2, year=2026 → "5 Feb 2026 - 5 Mar 2026"
 */
function formatBillingPeriod(enrollDay: number, month: number, year: number): string {
  const startMonth = month;
  const startYear = year;
  // Next month
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;

  return `${enrollDay} ${getShortMonthName(startMonth)} ${startYear} - ${enrollDay} ${getShortMonthName(endMonth)} ${endYear}`;
}

export default invoicesService;
