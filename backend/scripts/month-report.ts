/**
 * Read-only: every student's enrollments plus their fees for a range of months,
 * as tab-separated lines (to compare the portal against a fee sheet).
 *
 * Usage (backend folder):  npx tsx scripts/month-report.ts .env.junior 2026 9 11
 * Prints two sections: ENROLLMENTS and FEES.
 */
import * as dotenv from 'dotenv';
import { Client } from 'pg';

const [envFile, yearArg, fromArg, toArg] = process.argv.slice(2);
if (!envFile || !yearArg || !fromArg || !toArg) {
  console.error('Usage: npx tsx scripts/month-report.ts .env.junior 2026 9 11');
  process.exit(1);
}
dotenv.config({ path: envFile, override: true });

const clean = (v: unknown) => (v === null || v === undefined ? '' : String(v).replace(/[\t\r\n]+/g, ' '));
const print = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return;
  console.log(Object.keys(rows[0]).join('\t'));
  for (const r of rows) console.log(Object.values(r).map(clean).join('\t'));
};

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    console.log('== ENROLLMENTS ==');
    const enr = await client.query(`
      select u.username, concat(u.first_name, ' ', u.last_name) as student, u.is_active as active,
             u.student_category as cat, u.student_subcategory as sub, u.phone, u.parent_phone,
             c.title as course,
             (select string_agg(t.first_name || ' ' || t.last_name, ', ')
                from course_teachers ct join users t on t.id = ct.teacher_id where ct.course_id = c.id) as teachers,
             e.status, e.class_type, e.custom_fee_per_month as fee, e.per_session_fee as per_session,
             to_char(e.enrolled_at, 'YYYY-MM-DD') as enrolled, to_char(e.dropped_at, 'YYYY-MM-DD') as dropped,
             e.will_return_after_drop as returning, e.fee_notes
      from users u
      left join enrollments e on e.student_id = u.id
      left join courses c on c.id = e.course_id
      where u.role = 'student'
      order by student, course`);
    print(enr.rows);

    console.log('== FEES ==');
    const fees = await client.query(`
      select u.username, concat(u.first_name, ' ', u.last_name) as student, c.title as course,
             f.month, f.year, f.amount, f.status, to_char(f.due_date, 'YYYY-MM-DD') as due,
             f.serial_number as serial,
             (select coalesce(sum(p.amount), 0) from payments p where p.fee_id = f.id) as paid,
             (select string_agg(distinct p.payment_method::text, ',') from payments p where p.fee_id = f.id) as method
      from fees f
      join users u on u.id = f.student_id
      join courses c on c.id = f.course_id
      where f.year = $1 and f.month between $2 and $3
      order by student, f.month, course`, [Number(yearArg), Number(fromArg), Number(toArg)]);
    print(fees.rows);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
