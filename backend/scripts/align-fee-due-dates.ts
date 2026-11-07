/**
 * One-off: move unpaid fees from October 2026 onward to fall due on the enrollment's
 * day of the month (the same rule new fees use, feeDueDate). Paid and dropped fees are
 * left alone. Status follows the new date: overdue if it has passed, otherwise pending.
 *
 * Preview (changes nothing):  npx tsx scripts/align-fee-due-dates.ts .env
 * Apply:                      npx tsx scripts/align-fee-due-dates.ts .env --apply
 * Junior Campus:              use .env.junior instead of .env
 */
import * as dotenv from 'dotenv';
import { Client } from 'pg';

const FROM_YEAR = 2026;
const FROM_MONTH = 10;

const envFile = process.argv.find((a) => a.startsWith('.env')) || '.env';
const apply = process.argv.includes('--apply');
dotenv.config({ path: envFile, override: true });

async function main() {
  const { feeDueDate } = await import('../src/services/fees.service');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(`
      select f.id, f.month, f.year, f.amount::numeric as amount, f.due_date::text as due, f.status,
             e.enrolled_at, concat(u.first_name, ' ', u.last_name) as student, c.title as course
      from fees f
      join enrollments e on e.id = f.enrollment_id
      join users u on u.id = f.student_id
      join courses c on c.id = f.course_id
      where f.status in ('pending', 'overdue') and f.year * 12 + f.month >= $1
      order by f.year, f.month, student`, [FROM_YEAR * 12 + FROM_MONTH]);

    const changes = rows
      .map((r) => {
        const due = feeDueDate(r.enrolled_at, r.month, r.year);
        const status = Number(r.amount) > 0 && due <= today ? 'overdue' : 'pending';
        return { ...r, newDue: due, newStatus: status };
      })
      .filter((r) => r.newDue !== r.due || r.newStatus !== r.status);

    console.log(`Database: ${envFile}. Unpaid fees from ${FROM_MONTH}/${FROM_YEAR}: ${rows.length}; to change: ${changes.length}`);
    for (const r of changes.slice(0, 15)) {
      console.log(`  ${r.student} | ${r.course} | ${r.month}/${r.year} | ${r.due} ${r.status} -> ${r.newDue} ${r.newStatus}`);
    }
    if (changes.length > 15) console.log(`  ...and ${changes.length - 15} more`);

    if (!apply) {
      console.log('Preview only. Add --apply to make these changes.');
      return;
    }
    await client.query('BEGIN');
    for (const r of changes) {
      await client.query('update fees set due_date = $1, status = $2, updated_at = now() where id = $3',
        [r.newDue, r.newStatus, r.id]);
    }
    await client.query('COMMIT');
    console.log(`Updated ${changes.length} fees.`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
