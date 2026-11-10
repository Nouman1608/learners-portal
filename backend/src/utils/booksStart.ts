import { sql, SQL } from 'drizzle-orm';
import env from '../config/env';
import { db, Database } from '../config/database';
import { fees } from '../db/schema';

const [startYear, startMonth] = (env.BOOKS_START || '').split('-').map(Number);
const booksStartIndex = startYear && startMonth ? startYear * 12 + startMonth : null;

/**
 * Condition keeping only fees inside the books (BOOKS_START): fees for earlier
 * months, and payments joined to them, are left out of money pages.
 * Both campuses' books start in October 2026, so the cut-off also applies to the
 * other campus read from here (sudo Junior/Both view); `database` only names which
 * database the caller is querying.
 * Pass other year/month expressions to cut off other records by month (teacher
 * invoices, expenses).
 */
export function feeInBooks(_database: Database = db, year: unknown = fees.year, month: unknown = fees.month): SQL {
  if (!booksStartIndex) return sql`true`;
  return sql`(${year} * 12 + ${month}) >= ${booksStartIndex}`;
}

/** First day of the books (YYYY-MM-01), or null */
export function booksStartDate(_database: Database = db): string | null {
  if (!booksStartIndex) return null;
  return `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
}
