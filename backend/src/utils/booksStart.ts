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
 * Pass the year/month columns for raw SQL that aliases the fees table.
 */
export function feeInBooks(database: Database = db, year: unknown = fees.year, month: unknown = fees.month): SQL {
  if (!booksStartIndex || database !== db) return sql`true`;
  return sql`(${year} * 12 + ${month}) >= ${booksStartIndex}`;
}
