/**
 * One-off (2026-11-12): fees set aside for "on leave" before the On leave tick existed
 * were stored as status 'dropped' while the enrollment stayed active. Move them to the
 * new 'leave' status. A real "Dropped" tick always drops the enrollment, so a 'dropped'
 * fee on an ACTIVE enrollment can only be one of these leave cases.
 *
 * Preview (changes nothing):  npx tsx scripts/convert-leave-fees.ts .env.junior
 * Apply:                      npx tsx scripts/convert-leave-fees.ts .env.junior --apply
 */
import * as dotenv from 'dotenv';
import { Client } from 'pg';

const envFile = process.argv.find((a) => a.startsWith('.env')) || '.env.junior';
const apply = process.argv.includes('--apply');
dotenv.config({ path: envFile, override: true });

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(`
      select f.id, concat(u.first_name, ' ', u.last_name) as student, c.title as course, f.month, f.year, f.amount::numeric as amount
      from fees f
      join enrollments e on e.id = f.enrollment_id
      join users u on u.id = f.student_id
      join courses c on c.id = f.course_id
      where f.status = 'dropped' and e.status = 'active'
      order by f.year, f.month, student`);
    console.log(`${apply ? 'APPLYING' : 'PREVIEW (nothing changed)'} on ${envFile}\n`);
    for (const r of rows) {
      console.log(`${apply ? 'DONE ' : 'WILL '} ${r.student.trim()} ${r.course.trim()} ${r.month}/${r.year} (${Number(r.amount)}): dropped -> on leave`);
    }
    if (apply && rows.length) {
      await client.query(`update fees set status = 'leave', updated_at = now() where id = any($1::uuid[])`, [rows.map((r) => r.id)]);
    }
    console.log(`\n${rows.length} fee(s).${apply ? '' : ' Run again with --apply to change them.'}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
});
