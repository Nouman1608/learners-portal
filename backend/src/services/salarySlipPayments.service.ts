import { db, Database } from '../config/database';
import { salarySlipPayments } from '../db/schema/salarySlipPayments';
import { and, eq } from 'drizzle-orm';

/** What a salary slip shows about its payment (null = not paid yet) */
export interface SlipPayment {
  paidOn: string; // YYYY-MM-DD
  paymentMethod: string | null;
  note: string | null;
}

export interface SlipKey {
  teacherId: string;
  slipType: string; // 'teacher' | 'teacher_1to1'
  month: number;
  year: number;
}

const where = (k: SlipKey) => and(
  eq(salarySlipPayments.teacherId, k.teacherId),
  eq(salarySlipPayments.slipType, k.slipType),
  eq(salarySlipPayments.month, k.month),
  eq(salarySlipPayments.year, k.year),
);

export const salarySlipPaymentsService = {
  /** The payment of one teacher's slip for a month, if it has been paid */
  async get(k: SlipKey, database: Database = db): Promise<SlipPayment | null> {
    const [row] = await database
      .select({ paidOn: salarySlipPayments.paidOn, paymentMethod: salarySlipPayments.paymentMethod, note: salarySlipPayments.note })
      .from(salarySlipPayments).where(where(k)).limit(1);
    return row ?? null;
  },

  /** Record (or change) the day a slip was paid */
  async set(k: SlipKey, payment: { paidOn: string; paymentMethod?: string | null; note?: string | null }, userId: string) {
    const values = { paidOn: payment.paidOn, paymentMethod: payment.paymentMethod || null, note: payment.note?.trim() || null };
    const [row] = await db.insert(salarySlipPayments)
      .values({ ...k, ...values, createdBy: userId })
      .onConflictDoUpdate({
        target: [salarySlipPayments.teacherId, salarySlipPayments.slipType, salarySlipPayments.year, salarySlipPayments.month],
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    return row;
  },

  /** Back to "not paid" */
  async clear(k: SlipKey) {
    await db.delete(salarySlipPayments).where(where(k));
  },
};
