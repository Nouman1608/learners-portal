import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { enrollmentsService } from '../services/enrollments.service';
import { feesService } from '../services/fees.service';
import { paymentsService } from '../services/payments.service';

// Validation schemas
const validDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (val: string) => {
    const year = parseInt(val.slice(0, 4), 10);
    return year >= 2000 && year <= 2100;
  },
  { message: 'Year must be between 2000 and 2100' }
);

const createEnrollmentSchema = z.object({
  studentId: z.string().uuid(),
  courseId: z.string().uuid(),
  enrolledAt: validDate.optional(),
  attendanceMode: z.enum(['local', 'online']).optional(),
  classType: z.enum(['online', 'hybrid', '1-to-1']).optional(),
  customFeePerMonth: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), // Required for non-1-to-1
  perSessionFee: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), // Required for 1-to-1 classes
  expectedClassesPerMonth: z.number().int().min(1).max(31).optional(), // Expected sessions per month for 1-to-1
  currency: z.enum(['PKR', 'USD', 'GBP', 'SAR']).optional(), // Only for online students
  feeType: z.enum(['custom', 'scholarship']).optional(),
  prorateFirstMonth: z.boolean().optional(), // Pro-rate first month to sync billing to the 1st
  feeNotes: z.string().max(1000).optional(),
  startDate: validDate.optional(),
  endDate: validDate.optional(),
}).refine(
  (data) => {
    // For 1-to-1 classes, perSessionFee is required
    if (data.classType === '1-to-1') {
      return !!data.perSessionFee;
    }
    // For other classes, customFeePerMonth is required
    return !!data.customFeePerMonth;
  },
  {
    message: 'For 1-to-1 classes, perSessionFee is required. For other classes, customFeePerMonth is required.',
  }
);

const updateEnrollmentSchema = z.object({
  status: z.enum(['active', 'completed', 'dropped']).optional(),
  enrolledAt: validDate.optional(),
  completedAt: z.string().datetime().optional(),
  startDate: validDate.optional(),
  endDate: validDate.optional(),
  droppedAt: validDate.optional(),
  willReturnAfterDrop: z.boolean().optional(),
  tentativeReturnDate: validDate.optional(),
});

const updateEnrollmentFeeSchema = z.object({
  customFeePerMonth: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  perSessionFee: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  expectedClassesPerMonth: z.number().int().min(1).max(31).nullable().optional(),
  currency: z.enum(['PKR', 'USD', 'GBP', 'SAR']).optional(),
  feeType: z.enum(['custom', 'scholarship']).optional(),
  prorateFirstMonth: z.boolean().optional(),
  feeNotes: z.string().max(1000).optional(),
}).refine(
  (data) =>
    data.customFeePerMonth ||
    data.perSessionFee ||
    data.currency ||
    data.expectedClassesPerMonth !== undefined ||
    data.prorateFirstMonth !== undefined,
  { message: 'At least one field must be provided' }
);

const createFeeSchema = z.object({
  enrollmentId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const updateFeeStatusSchema = z.object({
  status: z.enum(['pending', 'overdue', 'received']),
  receivedBy: z.string().uuid().optional(),
});

const createPaymentSchema = z.object({
  feeId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'jazzcash', 'easypaisa', 'payfast', 'other']),
  transactionId: z.string().max(255).optional(),
  paymentDate: z.string().datetime(),
  proofUrl: z.string().url().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

const markAsReceivedSchema = z.object({
  paymentMethod: z.enum(['online', 'cash']),
  serialNumber: z.string().min(1).max(255).optional(),
}).refine(
  (data) => data.paymentMethod !== 'cash' || (data.serialNumber && data.serialNumber.trim().length > 0),
  {
    message: 'Serial number is required when payment method is cash',
    path: ['serialNumber'],
  }
);

const generateFeesManuallySchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020),
});

// Enrollments
export const createEnrollment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createEnrollmentSchema.parse(req.body);
    const enrollment = await enrollmentsService.createEnrollment({
      ...validated,
      createdBy: req.user!.id,
    });
    res.status(201).json({ enrollment });
  } catch (error) {
    next(error);
  }
};

export const getEnrollments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, courseId, status } = req.query;
    const enrollments = await enrollmentsService.getEnrollments({
      studentId: studentId as string,
      courseId: courseId as string,
      status: status as string,
      teacherId: req.user!.role === 'teacher' ? req.user!.id : undefined,
    });
    res.json({ enrollments });
  } catch (error) {
    next(error);
  }
};

export const getEnrollmentById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const enrollment = await enrollmentsService.getEnrollmentById(req.params.id);
    res.json({ enrollment });
  } catch (error) {
    next(error);
  }
};

export const updateEnrollment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = updateEnrollmentSchema.parse(req.body);
    const enrollment = await enrollmentsService.updateEnrollment(
      req.params.id,
      {
        ...validated,
        enrolledAt: validated.enrolledAt ? new Date(validated.enrolledAt) : undefined,
        completedAt: validated.completedAt ? new Date(validated.completedAt) : undefined,
        droppedAt: validated.droppedAt ? new Date(validated.droppedAt) : undefined,
      },
      req.user!.id
    );
    res.json({ enrollment });
  } catch (error) {
    next(error);
  }
};

export const updateEnrollmentFee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = updateEnrollmentFeeSchema.parse(req.body);
    const enrollment = await enrollmentsService.updateEnrollmentFee(
      req.params.id,
      validated.customFeePerMonth,
      validated.perSessionFee,
      validated.feeType,
      validated.feeNotes,
      validated.currency,
      validated.expectedClassesPerMonth,
      validated.prorateFirstMonth
    );
    res.json({ enrollment, message: 'Enrollment fee updated successfully' });
  } catch (error) {
    next(error);
  }
};

export const deleteEnrollment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await enrollmentsService.deleteEnrollment(req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const hardDeleteEnrollment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await enrollmentsService.hardDeleteEnrollment(req.params.id, req.user!.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getStudentEnrollments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const enrollments = await enrollmentsService.getStudentEnrollments(req.params.studentId);
    res.json({ enrollments });
  } catch (error) {
    next(error);
  }
};

export const getCourseEnrollments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const enrollments = await enrollmentsService.getCourseEnrollments(req.params.courseId);
    res.json({ enrollments });
  } catch (error) {
    next(error);
  }
};

// Fees
export const createFee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createFeeSchema.parse(req.body);
    const fee = await feesService.createFee(validated);
    res.status(201).json({ fee });
  } catch (error) {
    next(error);
  }
};

export const getFees = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, courseId, status, month, year } = req.query;
    const fees = await feesService.getFees({
      studentId: studentId as string,
      courseId: courseId as string,
      status: status as string,
      month: month ? parseInt(month as string) : undefined,
      year: year ? parseInt(year as string) : undefined,
    });
    res.json({ fees });
  } catch (error) {
    next(error);
  }
};

export const getFeeById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fee = await feesService.getFeeById(req.params.id);
    res.json({ fee });
  } catch (error) {
    next(error);
  }
};

export const updateFeeStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = updateFeeStatusSchema.parse(req.body);
    const fee = await feesService.updateFeeStatus(req.params.id, validated);
    res.json({ fee });
  } catch (error) {
    next(error);
  }
};

const updateFeeSessionsSchema = z.object({
  sessionCount: z.number().int().min(0).max(31),
});

export const updateFeeSessions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = updateFeeSessionsSchema.parse(req.body);
    const result = await feesService.updateSessionCount(req.params.id, validated.sessionCount);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const markFeeAsReceived = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = markAsReceivedSchema.parse(req.body);
    const fee = await feesService.markAsReceived(req.params.id, req.user!.id, {
      paymentMethod: validated.paymentMethod,
      serialNumber: validated.serialNumber,
    });
    res.json({ fee });
  } catch (error) {
    next(error);
  }
};

export const getStudentFees = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fees = await feesService.getStudentFees(req.params.studentId);
    res.json({ fees });
  } catch (error) {
    next(error);
  }
};

export const getOverdueFees = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fees = await feesService.getOverdueFees();
    res.json({ fees });
  } catch (error) {
    next(error);
  }
};

export const generateFeesManually = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = generateFeesManuallySchema.parse(req.body);
    const result = await feesService.generateMonthlyFees(validated.month, validated.year, true);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

// Payments
export const createPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createPaymentSchema.parse(req.body);
    const payment = await paymentsService.createPayment({
      ...validated,
      createdBy: req.user!.id,
    });
    res.status(201).json({ payment });
  } catch (error) {
    next(error);
  }
};

export const getPayments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, feeId } = req.query;
    const payments = await paymentsService.getPayments({
      studentId: studentId as string,
      feeId: feeId as string,
    });
    res.json({ payments });
  } catch (error) {
    next(error);
  }
};

export const getPaymentById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await paymentsService.getPaymentById(req.params.id);
    res.json({ payment });
  } catch (error) {
    next(error);
  }
};

export const getStudentPayments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payments = await paymentsService.getStudentPayments(req.params.studentId);
    res.json({ payments });
  } catch (error) {
    next(error);
  }
};
