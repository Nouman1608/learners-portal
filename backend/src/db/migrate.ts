import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import logger from '../utils/logger';

dotenv.config();

async function runMigrations() {
  console.log('DATABASE_URL:', process.env.DATABASE_URL);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool);

  try {
    console.log('Running migrations from ./src/db/migrations...');
    logger.info('Running migrations...');
    await migrate(db, { migrationsFolder: './src/db/migrations' });
    console.log('✅ Migrations completed successfully');
    logger.info('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    logger.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
