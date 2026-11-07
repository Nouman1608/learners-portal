/**
 * Read-only: a student's enrollments and fees, to see why a fee is (or isn't) showing.
 *
 * Usage (backend folder):  npx tsx scripts/student-fees.ts .env "uzma batool"
 * Use .env.junior for the Junior Campus. The name may be partial.
 */
import * as dotenv from 'dotenv';
import { Client } from 'pg';

const [envFile, name] = process.argv.slice(2);
if (!envFile || !name) {
  console.error('Usage: npx tsx scripts/student-fees.ts .env "student name"');
  process.exit(1);
}
dotenv.config({ path: envFile, override: true });

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(`
      select concat(u.first_name, ' ', u.last_name) as student, u.is_active as user_active,
             c.title as course, e.status as enrollment,
             to_char(e.enrolled_at, 'YYYY-MM-DD') as enrolled, to_char(e.dropped_at, 'YYYY-MM-DD') as dropped,
             f.month || '/' || f.year as fee_for, f.amount, f.status as fee_status,
             (select coalesce(sum(p.amount), 0) from payments p where p.fee_id = f.id) as paid
      from users u
      join enrollments e on e.student_id = u.id
      join courses c on c.id = e.course_id
      left join fees f on f.enrollment_id = e.id
      where u.role = 'student' and concat(u.first_name, ' ', u.last_name) ilike $1
      order by student, course, f.year, f.month`, [`%${name.trim().replace(/\s+/g, '%')}%`]);
    if (!rows.length) console.log(`No student matching "${name}" in ${envFile}`);
    else console.table(rows);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
