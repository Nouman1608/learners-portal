import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { invoicesService } from '../services/invoices.service';
import { emailService } from '../services/email.service';
import { db } from '../config/database';
import { invoices } from '../db/schema/invoices';
import { eq } from 'drizzle-orm';

// Validation schemas
const generateStudentInvoiceSchema = z.object({
  studentId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020),
  sessionOverrides: z.array(z.object({
    enrollmentId: z.string().uuid(),
    sessionCount: z.number().int().min(0),
  })).optional(),
});

const generateTeacherInvoiceSchema = z.object({
  teacherId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020),
});

const generateMonthlyInvoicesSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020),
});

export const get1to1Sessions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;
    const month = parseInt(req.query.month as string);
    const year = parseInt(req.query.year as string);
    if (!studentId || isNaN(month) || isNaN(year)) {
      return res.status(400).json({ error: 'studentId, month, and year are required' });
    }
    const sessions = await invoicesService.get1to1Sessions(studentId, month, year);
    return res.json({ sessions });
  } catch (error) {
    next(error);
  }
};

export const generateStudentInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = generateStudentInvoiceSchema.parse(req.body);
    const result = await invoicesService.generateStudentInvoice({
      ...validated,
      generatedBy: req.user!.id,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const generateTeacherInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = generateTeacherInvoiceSchema.parse(req.body);
    const result = await invoicesService.generateTeacherInvoice({
      ...validated,
      generatedBy: req.user!.id,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const generateMonthlyStudentInvoices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = generateMonthlyInvoicesSchema.parse(req.body);
    const result = await invoicesService.generateMonthlyStudentInvoices(validated.month, validated.year);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const generateMonthlyInvoices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = generateMonthlyInvoicesSchema.parse(req.body);
    const result = await invoicesService.generateMonthlyInvoices(validated.month, validated.year);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const generateMonthlyTeacherInvoices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = generateMonthlyInvoicesSchema.parse(req.body);
    const result = await invoicesService.generateMonthlyTeacherInvoices(validated.month, validated.year);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const generatePreviousMonthInvoices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    let prevMonth = now.getMonth(); // 0-11, so current month - 1 gives previous month
    let prevYear = now.getFullYear();

    // Handle January edge case
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear--;
    }

    const result = await invoicesService.generateMonthlyInvoices(prevMonth, prevYear);
    res.json({
      ...result,
      month: prevMonth,
      year: prevYear,
    });
  } catch (error) {
    next(error);
  }
};

export const getInvoices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { recipientId, type, month, year, search } = req.query;

    const filters: any = {};

    if (recipientId) filters.recipientId = recipientId as string;
    if (type) filters.type = type as string;
    if (search) filters.search = search as string;
    if (month) filters.month = parseInt(month as string);
    if (year) filters.year = parseInt(year as string);

    // If user is not admin/sudo, only show their own invoices
    if (req.user?.role !== 'sudo' && req.user?.role !== 'admin') {
      filters.recipientId = req.user!.id;
    }

    const invoicesList = await invoicesService.getInvoices(filters);
    res.json({ invoices: invoicesList });
  } catch (error) {
    next(error);
  }
};

export const getInvoiceById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await invoicesService.getInvoiceById(req.params.id);

    // Authorization: users can only view their own invoices (unless admin/sudo)
    if (
      req.user?.role !== 'sudo' &&
      req.user?.role !== 'admin' &&
      invoice.recipientId !== req.user!.id
    ) {
      return res.status(403).json({ message: 'You can only view your own invoices' });
    }

    res.json({ invoice });
  } catch (error) {
    next(error);
  }
};

export const downloadInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await invoicesService.getInvoiceById(req.params.id);

    // Authorization: users can only download their own invoices (unless admin/sudo)
    if (
      req.user?.role !== 'sudo' &&
      req.user?.role !== 'admin' &&
      invoice.recipientId !== req.user!.id
    ) {
      return res.status(403).json({ message: 'You can only download your own invoices' });
    }

    // Determine which PDF to return based on user role
    // Teachers see simplified PDF (without rates/percentages), admins see detailed PDF
    let pdfUrl;
    if (req.user?.role === 'sudo' || req.user?.role === 'admin') {
      // Admins always see the detailed PDF
      pdfUrl = invoice.pdfUrl;
    } else if (invoice.type === 'teacher' && invoice.simplifiedPdfUrl) {
      // Teachers viewing their own invoice see the simplified version
      pdfUrl = invoice.simplifiedPdfUrl;
    } else {
      // Default to regular PDF
      pdfUrl = invoice.pdfUrl;
    }

    if (!pdfUrl) {
      return res.status(400).json({ message: 'Invoice PDF not generated yet' });
    }

    // Send the PDF URL for download
    res.json({
      pdfUrl,
      invoiceNumber: invoice.invoiceNumber
    });
  } catch (error) {
    next(error);
  }
};

export const emailInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await invoicesService.getInvoiceById(req.params.id);

    if (!invoice.pdfUrl) {
      return res.status(400).json({ message: 'Invoice PDF not generated yet' });
    }

    const monthName = getMonthName(invoice.month);

    const emailSent = await emailService.sendInvoiceEmail({
      to: invoice.recipient.email,
      recipientName: `${invoice.recipient.firstName} ${invoice.recipient.lastName}`,
      invoiceNumber: invoice.invoiceNumber,
      month: monthName,
      year: invoice.year,
      totalAmount: invoice.totalAmount,
      pdfPath: invoice.pdfUrl,
      type: invoice.type as 'student' | 'teacher',
    });

    if (emailSent) {
      // Update emailedAt timestamp
      await db
        .update(invoices)
        .set({ emailedAt: new Date() })
        .where(eq(invoices.id, invoice.id));

      res.json({ message: 'Invoice emailed successfully' });
    } else {
      res.status(500).json({ message: 'Failed to send email (SMTP not configured)' });
    }
  } catch (error) {
    next(error);
  }
};

// Helper function
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
