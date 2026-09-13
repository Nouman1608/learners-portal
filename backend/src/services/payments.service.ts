import { db } from '../config/database';
import { payments, fees, users } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import { feesService } from './fees.service';

export interface CreatePaymentInput {
  feeId: string;
  amount: string; // decimal as string
  paymentMethod: 'cash' | 'bank_transfer' | 'jazzcash' | 'easypaisa' | 'payfast' | 'other';
  transactionId?: string;
  paymentDate: string; // ISO date string
  proofUrl?: string; // URL to uploaded payment proof
  notes?: string;
  createdBy: string; // Student ID
}

export const paymentsService = {
  async createPayment(input: CreatePaymentInput) {
    // Verify fee exists
    const fee = await feesService.getFeeById(input.feeId);

    if (!fee) {
      throw new AppError(404, 'Fee not found');
    }

    // Verify the student creating the payment is the fee owner
    if (fee.studentId !== input.createdBy) {
      throw new AppError(403, 'You can only submit payments for your own fees');
    }

    // Create payment record
    const [newPayment] = await db
      .insert(payments)
      .values({
        feeId: input.feeId,
        studentId: input.createdBy,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        transactionId: input.transactionId || null,
        paymentDate: new Date(input.paymentDate),
        proofUrl: input.proofUrl || null,
        notes: input.notes || null,
        createdBy: input.createdBy,
      })
      .returning();

    return newPayment;
  },

  async getPayments(filters?: {
    studentId?: string;
    feeId?: string;
  }) {
    let query = db
      .select({
        id: payments.id,
        feeId: payments.feeId,
        studentId: payments.studentId,
        amount: payments.amount,
        paymentMethod: payments.paymentMethod,
        transactionId: payments.transactionId,
        paymentDate: payments.paymentDate,
        proofUrl: payments.proofUrl,
        notes: payments.notes,
        createdAt: payments.createdAt,
        student: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        },
        fee: {
          id: fees.id,
          month: fees.month,
          year: fees.year,
          amount: fees.amount,
          status: fees.status,
        },
      })
      .from(payments)
      .innerJoin(users, eq(payments.studentId, users.id))
      .innerJoin(fees, eq(payments.feeId, fees.id));

    const conditions = [];
    if (filters?.studentId) {
      conditions.push(eq(payments.studentId, filters.studentId));
    }
    if (filters?.feeId) {
      conditions.push(eq(payments.feeId, filters.feeId));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const allPayments = await query.orderBy(desc(payments.createdAt));
    return allPayments;
  },

  async getPaymentById(paymentId: string) {
    const [payment] = await db
      .select({
        id: payments.id,
        feeId: payments.feeId,
        studentId: payments.studentId,
        amount: payments.amount,
        paymentMethod: payments.paymentMethod,
        transactionId: payments.transactionId,
        paymentDate: payments.paymentDate,
        proofUrl: payments.proofUrl,
        notes: payments.notes,
        createdAt: payments.createdAt,
        student: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
        fee: {
          id: fees.id,
          month: fees.month,
          year: fees.year,
          amount: fees.amount,
          status: fees.status,
          dueDate: fees.dueDate,
        },
      })
      .from(payments)
      .innerJoin(users, eq(payments.studentId, users.id))
      .innerJoin(fees, eq(payments.feeId, fees.id))
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!payment) {
      throw new AppError(404, 'Payment not found');
    }

    return payment;
  },

  async getStudentPayments(studentId: string) {
    return this.getPayments({ studentId });
  },

  async getFeePayments(feeId: string) {
    return this.getPayments({ feeId });
  },
};

export default paymentsService;
