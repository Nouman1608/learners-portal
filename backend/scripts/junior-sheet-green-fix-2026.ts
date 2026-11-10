/**
 * One-off (Junior Campus, 2026-11-10): correction to junior-sheet-oct-nov-2026.ts.
 * The owner's rule is "only rows coloured green on the sheet are paid".
 *  - November: 25 fees marked paid from the sheet's status text are not green -> back to unpaid
 *    (only the payment that script recorded today is removed).
 *  - One-to-one table: green rows in October and November -> paid (bank/online).
 *
 * Preview (changes nothing):  npx tsx scripts/junior-sheet-green-fix-2026.ts .env.junior
 * Apply:                      npx tsx scripts/junior-sheet-green-fix-2026.ts .env.junior --apply
 */
import * as dotenv from 'dotenv';
import { Client } from 'pg';

const envFile = process.argv.find((a) => a.startsWith('.env')) || '.env.junior';
const apply = process.argv.includes('--apply');
dotenv.config({ path: envFile, override: true });

// November fees that are NOT green on the sheet: undo the payment recorded on 2026-11-10
const UNPAY_NOV: [string, string][] = [
  ['abdullah.javed', 'Grade 3'], ['abdullah.javed', 'Quran'], ['fariha.javed', 'Grade 6'], ['fariha.javed', 'Quran'],
  ['abiha.ledger', 'Grade 7'], ['aliyan.ledger', 'Grade 7'], ['sufyan.ledger', 'Grade 7'], ['Ayan.atif', 'Grade 7'],
  ['hajra.fatima', 'Grade 7'], ['abeera.naveed', 'Grade 8'], ['abdul.wali', 'PG'],
  ['saad', 'Grade 4'], ['bilal', 'Grade 5'], ['minha', 'Nursery'], ['ayesha', 'Grade 7'], ['shahzaib.bashir', 'Grade 8'],
  ['huda.farhan', 'Grade 6'], ['hijab.fatima', 'Grade 6'], ['shahmeer.mazhar', 'Grade 8'], ['azaan.pori', 'Grade 8'],
  ['hareem', 'Quran'], ['hooram', 'Quran'], ['maid', 'Quran'], ['hooriya', 'PG'], ['rafay', 'PG'],
];

// One-to-one rows that are green on the sheet: [username, class, months]
const PAY_ONE_TO_ONE: [string, string, number[]][] = [
  ['zoya.atif', 'J MATHS MISS REHAM GRADE 7 ONLINE', [10]],
  ['zoya.atif', 'J SCIENCE SIR FANOOS GRADE 7 ONLINE', [10]], // November rows are blue, not green
  ['muhammad.umar', 'J ENGLSIH SIR MANZAR GRADE 7 ONLINE', [10, 11]],
  ['muhammad.umar', 'J URDU SIR MANZAR GRADE 7 ONLINE', [10, 11]],
  ['muhammad.umar', 'J MATHS SIR MANZAR GRADE 7 ONLINE', [10, 11]],
  ['yahya.bilal', 'J SCIENCE SIR FANOOS GRADE 7 ONLINE', [10, 11]],
  ['zahra.batool', 'J English SIR MANZAR GRADE 6 ONLINE', [10, 11]],
  ['shezah.muneer', 'J Maths Sir Manzar GRADE 6 ONLINE', [10, 11]],
  ['hira.noor', 'J MATHS SIR Manzar Grade 5 ONLINE', [10, 11]],
];

async function main() {
  const { feesService } = await import('../src/services/fees.service');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const q = async (text: string, params: unknown[] = []) => (await client.query(text, params)).rows;
  let problems = 0;
  const say = (msg: string) => console.log(`${apply ? 'DONE ' : 'WILL '} ${msg}`);
  const problem = (msg: string) => { problems++; console.log(`SKIP  ${msg}`); };

  const [admin] = await q(`select id, username from users where role in ('admin', 'sudo') and is_active
                           order by (username = 'sidra.naazir') desc, role limit 1`);
  console.log(`${apply ? 'APPLYING' : 'PREVIEW (nothing changed)'} on ${envFile} as ${admin.username}\n`);

  const fee = async (username: string, course: string, month: number) => (await q(`
    select f.id, f.amount::numeric as amount, f.status, to_char(f.received_at, 'YYYY-MM-DD') as received_on
    from fees f join users u on u.id = f.student_id join courses c on c.id = f.course_id
    where u.username = $1 and trim(c.title) = $2 and f.year = 2026 and f.month = $3 and not f.is_catch_up`,
    [username, course, month]))[0];

  try {
    let undone = 0;
    for (const [username, course] of UNPAY_NOV) {
      const f = await fee(username, course, 11);
      if (!f) { problem(`${username} ${course} 11/2026: no fee`); continue; }
      if (f.status !== 'received') continue; // already unpaid
      const pays = await q(`select id, to_char(created_at, 'YYYY-MM-DD') as day from payments where fee_id = $1`, [f.id]);
      if (pays.length !== 1 || pays[0].day !== '2026-11-10') {
        problem(`${username} ${course} 11/2026: payment not from today's sheet update, left alone`); continue;
      }
      if (apply) {
        await q(`delete from payments where id = $1`, [pays[0].id]);
        await q(`update fees set received_at = null, received_by = null, serial_number = null, updated_at = now(),
                   status = case when amount::numeric > 0 and due_date < (now() at time zone 'Asia/Karachi')::date
                                 then 'overdue' else 'pending' end
                 where id = $1`, [f.id]);
      }
      undone += Number(f.amount);
      say(`${username} ${course} 11/2026: back to unpaid (${Number(f.amount)})`);
    }

    let paid = 0;
    for (const [username, course, months] of PAY_ONE_TO_ONE) {
      for (const month of months) {
        const f = await fee(username, course, month);
        if (!f) { problem(`${username} ${course} ${month}/2026: no fee`); continue; }
        if (f.status === 'received') continue;
        if (f.status === 'dropped') { problem(`${username} ${course} ${month}/2026: fee is dropped`); continue; }
        if (apply) await feesService.markAsReceived(f.id, admin.id, { paymentMethod: 'online' });
        paid += Number(f.amount);
        say(`${username} ${course.trim()} ${month}/2026: paid ${Number(f.amount)} (bank/online)`);
      }
    }

    console.log(`\nUnpaid again: Rs ${undone}. One-to-one marked paid: Rs ${paid}. Problems: ${problems}.`);
    if (!apply) console.log('Nothing changed. Run again with --apply to make these changes.');
  } finally {
    await client.end();
  }
}

main()
  .then(() => setTimeout(() => process.exit(0), 3000))
  .catch((error) => { console.error(`Failed: ${error.message}`); process.exit(1); });
