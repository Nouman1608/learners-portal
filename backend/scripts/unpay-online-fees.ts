/**
 * Set students' ONLINE class fees back to unpaid for given months, removing only payments
 * recorded on a given day (e.g. by a sheet update), so payments entered by hand are kept.
 *
 * Preview (changes nothing):
 *   npx tsx scripts/unpay-online-fees.ts .env.junior 2026 10,11 2026-11-10 user.one,user.two
 * Apply: add --apply
 */
import * as dotenv from 'dotenv';
import { Client } from 'pg';

const envFile = process.argv.find((a) => a.startsWith('.env')) || '.env';
const apply = process.argv.includes('--apply');
const [yearArg, monthsArg, dayArg, namesArg] = process.argv.slice(2).filter((a) => !a.startsWith('.env') && !a.startsWith('--'));
const year = Number(yearArg);
const months = (monthsArg || '').split(',').map(Number).filter((m) => m >= 1 && m <= 12);
if (!year || !months.length || !/^\d{4}-\d{2}-\d{2}$/.test(dayArg || '') || !namesArg) {
  console.error('Usage: npx tsx scripts/unpay-online-fees.ts .env.junior 2026 10,11 2026-11-10 user.one,user.two [--apply]');
  process.exit(1);
}
dotenv.config({ path: envFile, override: true });

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const q = async (text: string, params: unknown[] = []) => (await client.query(text, params)).rows;
  let total = 0;
  let count = 0;
  try {
    console.log(`${apply ? 'APPLYING' : 'PREVIEW (nothing changed)'} on ${envFile}\n`);
    for (const username of namesArg.split(',').map((n) => n.trim()).filter(Boolean)) {
      const fees = await q(`
        select f.id, f.month, f.amount::numeric as amount, trim(c.title) as course, concat(u.first_name, ' ', u.last_name) as student,
               (select count(*) from payments p where p.fee_id = f.id)::int as payments,
               (select count(*) from payments p where p.fee_id = f.id and to_char(p.created_at, 'YYYY-MM-DD') = $4)::int as from_day
        from fees f join users u on u.id = f.student_id join courses c on c.id = f.course_id
        join enrollments e on e.id = f.enrollment_id
        where lower(u.username) = lower($1) and f.year = $2 and f.month = any($3::int[])
          and f.status = 'received' and e.attendance_mode = 'online'
        order by f.month, c.title`, [username, year, months, dayArg]);
      if (!fees.length) { console.log(`INFO  ${username}: no paid online fees in those months`); continue; }
      for (const f of fees) {
        const label = `${f.student.trim()} ${f.course} ${f.month}/${year} (Rs ${Number(f.amount)})`;
        if (f.payments !== 1 || f.from_day !== 1) { console.log(`SKIP  ${label}: payment not from ${dayArg}, left alone`); continue; }
        if (apply) {
          await q(`delete from payments where fee_id = $1`, [f.id]);
          await q(`update fees set received_at = null, received_by = null, serial_number = null, updated_at = now(),
                     status = case when amount::numeric > 0 and due_date < (now() at time zone 'Asia/Karachi')::date
                                   then 'overdue' else 'pending' end
                   where id = $1`, [f.id]);
        }
        count++;
        total += Number(f.amount);
        console.log(`${apply ? 'DONE ' : 'WILL '} ${label}: back to unpaid`);
      }
    }
    console.log(`\n${count} fee(s), Rs ${total}.${apply ? '' : ' Run again with --apply to make these changes.'}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
});
