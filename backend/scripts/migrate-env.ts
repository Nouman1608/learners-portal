/**
 * Back up a portal's database, then apply pending migrations (src/db/migrations).
 * Unlike `npm run db:migrate`, it picks the env file and never prints DATABASE_URL.
 *
 * Usage (backend folder):  npx tsx scripts/migrate-env.ts .env
 *                          npx tsx scripts/migrate-env.ts .env.junior
 * The backup is written to /opt/nomi-education/<database>-before-migrate-<time>.dump
 */
import * as dotenv from 'dotenv';
import { execFileSync } from 'child_process';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const envFile = process.argv[2];
if (!envFile) {
  console.error('Usage: npx tsx scripts/migrate-env.ts .env');
  process.exit(1);
}
dotenv.config({ path: envFile, override: true });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`No DATABASE_URL in ${envFile}`);
  process.exit(1);
}

async function main() {
  const database = new URL(url!).pathname.slice(1);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const backup = `/opt/nomi-education/${database}-before-migrate-${stamp}.dump`;
  execFileSync('pg_dump', ['-Fc', '-f', backup, url!], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`Backup saved: ${backup}`);

  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: './src/db/migrations' });
    console.log(`Migrations applied to ${database}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
});
