/**
 * Move a student's billing day to the 1st of the month, with one part-month fee.
 *  1. Their active enrollment's date moves to the 1st of the same month (so every fee made
 *     from now on falls due on the 1st).
 *  2. Their unpaid fees from the books start onward move to the 1st (status follows).
 *  3. The given month's fee becomes the part-month amount, with an admin note.
 *  4. That month's student (and teacher) invoices are rebuilt if they exist.
 * Only this student's records change. The student must have exactly one active enrollment.
 *
 * Preview (changes nothing):  npx tsx scripts/move-billing-to-first.ts .env.junior user.name 2026 11 4333
 * Apply:                      add --apply
 */
import * as dotenv from 'dotenv';
import { Client } from 'pg';

const envFile = process.argv.find((a) => a.startsWith('.env')) || '.env';
const apply = process.argv.includes('--apply');
const [username, yearArg, monthArg, amountArg] = process.argv.slice(2).filter((a) => !a.startsWith('.env') && !a.startsWith('--'));
const year = Number(yearArg);
const month = Number(monthArg);
const partAmount = Number(amountArg);
if (!username || !year || !(month >= 1 && month <= 12) || !(partAmount > 0)) {
  console.error('Usage: npx tsx scripts/move-billing-to-first.ts .env.junior user.name 2026 11 4333 [--apply]');
  process.exit(1);
}
dotenv.config({ path: envFile, override: true });

async function main() {
  const { enrollmentsService } = await import('../src/services/enrollments.service');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const q = async (text: string, params: unknown[] = []) => (await client.query(text, params)).rows;
  const say = (msg: string) => console.log(`${apply ? 'DONE ' : 'WILL '} ${msg}`);
  try {
    console.log(`${apply ? 'APPLYING' : 'PREVIEW (nothing changed)'} on ${envFile}\n`);
    const [admin] = await q(`select id from users where role in ('admin', 'sudo') and is_active order by role limit 1`);
    const enr = await q(`
      select e.id, e.student_id, e.course_id, to_char(e.enrolled_at, 'YYYY-MM-DD') as enrolled, trim(c.title) as course,
             concat(u.first_name, ' ', u.last_name) as student, e.custom_fee_per_month::numeric as fee
      from enrollments e join users u on u.id = e.student_id join courses c on c.id = e.course_id
      where lower(u.username) = lower($1) and e.status = 'active'`, [username]);
    if (enr.length !== 1) throw new Error(`${username}: expected 1 active enrollment, found ${enr.length}`);
    const e = enr[0];
    const newDate = `${e.enrolled.slice(0, 8)}01`;
    console.log(`${e.student.trim()} – ${e.course}, Rs ${Number(e.fee)}/month, enrolled ${e.enrolled}`);

    if (e.enrolled !== newDate) {
      if (apply) await q(`update enrollments set enrolled_at = $1::date + time '12:00' where id = $2`, [newDate, e.id]);
      say(`enrolment date ${e.enrolled} -> ${newDate} (fees fall due on the 1st)`);
    }

    const unpaid = await q(`select id, month, year, to_char(due_date, 'YYYY-MM-DD') as due from fees
                            where enrollment_id = $1 and status in ('pending', 'overdue') order by year, month`, [e.id]);
    for (const f of unpaid) {
      const due = `${f.year}-${String(f.month).padStart(2, '0')}-01`;
      if (f.due === due) continue;
      if (apply) await q(`update fees set due_date = $1, updated_at = now(),
                            status = case when amount::numeric > 0 and $1::date < (now() at time zone 'Asia/Karachi')::date
                                          then 'overdue' else 'pending' end
                          where id = $2`, [due, f.id]);
      say(`${f.month}/${f.year} fee due ${f.due} -> ${due}`);
    }

    const [part] = await q(`select id, amount::numeric as amount, status from fees
                            where enrollment_id = $1 and month = $2 and year = $3 and not is_catch_up`, [e.id, month, year]);
    if (!part) throw new Error(`no ${month}/${year} fee for this enrollment`);
    if (part.status === 'received') throw new Error(`${month}/${year} fee is already paid`);
    if (apply) {
      await q(`update fees set amount = $1, updated_at = now() where id = $2`, [partAmount, part.id]);
      await q(`insert into fee_admin_notes (fee_id, note, updated_by) values ($1, $2, $3)
               on conflict (fee_id) do update set note = excluded.note, updated_at = now()`,
        [part.id, `Part month (Rs ${partAmount}) to move billing to the 1st; full fee from next month`, admin.id]);
      await enrollmentsService.rebuildInvoicesForFee(e.student_id, e.course_id, month, year, admin.id);
    }
    say(`${month}/${year} fee Rs ${Number(part.amount)} -> Rs ${partAmount} (part month), with a note; invoices rebuilt if any`);
  } finally {
    await client.end();
  }
}

main()
  .then(() => setTimeout(() => process.exit(0), 2000))
  .catch((error) => { console.error(`Failed: ${error.message}`); process.exit(1); });
