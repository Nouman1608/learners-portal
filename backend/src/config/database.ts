import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../db/schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;

// Junior Campus database, opened only on the Senior Campus instance (JUNIOR_DATABASE_URL set)
// so the sudo dashboard can show both campuses. Every session is forced read-only.
const juniorPool = process.env.JUNIOR_DATABASE_URL
  ? new Pool({
      connectionString: process.env.JUNIOR_DATABASE_URL,
      max: 3,
      options: '-c default_transaction_read_only=on',
    })
  : null;

export const juniorDb: Database | null = juniorPool ? drizzle(juniorPool, { schema }) : null;

export default db;
