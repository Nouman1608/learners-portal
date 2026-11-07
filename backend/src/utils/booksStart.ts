import { sql, SQL } from 'drizzle-orm';
import env from '../config/env';
import { db, Database } from '../config/database';
import { fees } from '../db/schema';

const [startYear, startMonth] = (env.BOOKS_START || '').split('-').map(Number);
const booksStartIndex = startYear && startMonth ? startYear * 12 + startMonth : null;

/**
 * Condition keeping only fees inside this portal's books (BOOKS_START): fees for
 * earlier months, and payments joined to them, are left out of money pages.
 * Only this portal's own database is cut off — another campus read from here is not.
 * Pass other year/month expressions to cut off other records by month (teacher
 * invoices, expenses).
 */
export function feeInBooks(database: Database = db, year: unknown = fees.year, month: unknown = fees.month): SQL {
  if (!booksStartIndex || database !== db) return sql`true`;
  return sql`(${year} * 12 + ${month}) >= ${booksStartIndex}`;
}

/** First day of the books (YYYY-MM-01) for this portal's own database, or null */
export function booksStartDate(database: Database = db): string | null {
  if (!booksStartIndex || database !== db) return null;
  return `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
}
