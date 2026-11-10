/**
 * One-off (Junior Campus, 2026-11-10): bring the portal in line with the owner's
 * "Junior Campus Data.xlsx" October and November tabs.
 *
 * Preview (changes nothing):  npx tsx scripts/junior-sheet-oct-nov-2026.ts .env.junior
 * Apply:                      npx tsx scripts/junior-sheet-oct-nov-2026.ts .env.junior --apply
 *
 * Sheet status "online" = paid by bank/online, "paid" = paid cash, "leave" = on leave
 * that month (fee set aside, enrolment kept), "left" = dropped. Owner decisions:
 * sheet fee amounts are right from October; students active in the portal but not on
 * the sheet are dropped (from 1 Oct, so their unpaid Oct/Nov fees go); Yahya Bilal gets
 * his own Sir Manzar English class from 16 Nov.
 */
import * as dotenv from 'dotenv';
import { Client } from 'pg';

const envFile = process.argv.find((a) => a.startsWith('.env')) || '.env.junior';
const apply = process.argv.includes('--apply');
dotenv.config({ path: envFile, override: true });

type Method = 'online' | 'cash';

const PHONES: [string, string][] = [['ahmed', '03219885377'], ['hareem', '03219885377']];

// username, class, new monthly fee (applies to Oct + Nov fees and the enrolment)
const FEE_CHANGES: [string, string, number][] = [
  ['saad', 'Grade 4', 6750], ['bilal', 'Grade 5', 6750], ['minha', 'Nursery', 6750],
  ['huda.farhan', 'Grade 6', 8500], ['momina.batool', 'Grade 8', 7250], ['abdul.wali', 'PG', 9000],
];

const ON_LEAVE_NOV: [string, string][] = [
  ['maryam.faisal', 'Grade 7'], ['nayalyn', 'Grade 7'], ['momina.batool', 'Grade 8'],
];

const PAID: [string, string, number, Method][] = [
  // October
  ['abdullah.javed', 'Grade 3', 10, 'online'], ['abdullah.javed', 'Quran', 10, 'online'],
  ['fariha.javed', 'Grade 6', 10, 'online'], ['fariha.javed', 'Quran', 10, 'online'],
  ['Ayan.atif', 'Grade 7', 10, 'online'], ['salar', 'Grade 6', 10, 'online'],
  ['shehsawar', 'Grade 8', 10, 'online'], ['arham.javed', 'Nursery', 10, 'online'],
  ['anaya.javed', 'Nursery', 10, 'online'],
  ['huda.farhan', 'Grade 6', 10, 'cash'], ['muaz.farhan', 'Grade 6', 10, 'cash'],
  ['abu.bakr', 'Grade 8', 10, 'cash'], ['shahmeer.mazhar', 'Grade 8', 10, 'cash'],
  // November
  ['abdullah.javed', 'Grade 3', 11, 'online'], ['abdullah.javed', 'Quran', 11, 'online'],
  ['ahmed', 'Grade 3', 11, 'online'], ['fariha.javed', 'Grade 6', 11, 'online'],
  ['fariha.javed', 'Quran', 11, 'online'], ['syed.qaim', 'Grade 7', 11, 'online'],
  ['qirat', 'Grade 6', 11, 'online'], ['abiha.ledger', 'Grade 7', 11, 'online'],
  ['aliyan.ledger', 'Grade 7', 11, 'online'], ['sufyan.ledger', 'Grade 7', 11, 'online'],
  ['Ayan.atif', 'Grade 7', 11, 'online'], ['hajra.fatima', 'Grade 7', 11, 'online'],
  ['abeera.naveed', 'Grade 8', 11, 'online'], ['hareem', 'Grade 8', 11, 'online'],
  ['abdul.wali', 'PG', 11, 'online'],
  ['saad', 'Grade 4', 11, 'cash'], ['bilal', 'Grade 5', 11, 'cash'], ['minha', 'Nursery', 11, 'cash'],
  ['ayesha', 'Grade 7', 11, 'cash'], ['shahzaib.bashir', 'Grade 8', 11, 'cash'],
  ['huda.farhan', 'Grade 6', 11, 'cash'], ['muaz.farhan', 'Grade 6', 11, 'cash'],
  ['abu.bakr', 'Grade 8', 11, 'cash'], ['hijab.fatima', 'Grade 6', 11, 'cash'],
  ['shahmeer.mazhar', 'Grade 8', 11, 'cash'], ['azaan.pori', 'Grade 8', 11, 'cash'],
  ['hareem', 'Quran', 11, 'cash'], ['hooram', 'Quran', 11, 'cash'], ['maid', 'Quran', 11, 'cash'],
  ['hooriya', 'PG', 11, 'cash'], ['rafay', 'PG', 11, 'cash'],
];

// Every active enrolment of these students is dropped from 1 Oct 2026
const DROP_STUDENTS = [
  'iyad', 'aiza.khalid', 'hassan.haris', 'suleha.khalid', 'bilal.sulehri', 'nalayn.zehra',
  'syeda.qirrat', 'fizza.ali.junior', 'Ayesha.ijaz', 'daim.mumtaz', 'muhammad.ibrahim.pre',
];
const DROP_DATE = new Date(2026, 9, 1, 12);

const YAHYA = { username: 'yahya.bilal', title: 'J ENGLISH SIR MANZAR GRADE 7 ONLINE (Camb)',
  copyTeacherFrom: 'J ENGLSIH SIR MANZAR GRADE 7 ONLINE', copySettingsFrom: 'J SCIENCE SIR FANOOS GRADE 7 ONLINE',
  fee: '15000', from: '2026-11-16' };

async function main() {
  const { feesService } = await import('../src/services/fees.service');
  const { enrollmentsService } = await import('../src/services/enrollments.service');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const q = async (text: string, params: unknown[] = []) => (await client.query(text, params)).rows;
  let problems = 0;
  const say = (msg: string) => console.log(`${apply ? 'DONE ' : 'WILL '} ${msg}`);
  const problem = (msg: string) => { problems++; console.log(`SKIP  ${msg}`); };

  const [admin] = await q(`select id, username from users where role in ('admin', 'sudo') and is_active
                           order by (username = 'sidra.naazir') desc, role limit 1`);
  if (!admin) throw new Error('No active admin user found');
  console.log(`${apply ? 'APPLYING' : 'PREVIEW (nothing changed)'} on ${envFile} as ${admin.username}\n`);

  const fee = async (username: string, course: string, month: number) => (await q(`
    select f.id, f.amount::numeric as amount, f.status, f.student_id, f.course_id, f.enrollment_id,
           (select count(*) from payments p where p.fee_id = f.id)::int as payments
    from fees f join users u on u.id = f.student_id join courses c on c.id = f.course_id
    where u.username = $1 and trim(c.title) = $2 and f.year = 2026 and f.month = $3 and not f.is_catch_up`,
    [username, course, month]))[0];
  const touched = new Set<string>(); // student|course|month invoices to rebuild

  try {
    // 1. Phone numbers from the sheet
    for (const [username, phone] of PHONES) {
      const [u] = await q(`select id, phone from users where username = $1`, [username]);
      if (!u) { problem(`${username}: student not found`); continue; }
      if (u.phone) continue;
      if (apply) await q(`update users set phone = $1, updated_at = now() where id = $2`, [phone, u.id]);
      say(`${username}: phone ${phone}`);
    }

    // 2. Monthly fee amounts (sheet is right from October)
    for (const [username, course, amount] of FEE_CHANGES) {
      const [e] = await q(`select e.id, e.custom_fee_per_month::numeric as fee from enrollments e
        join users u on u.id = e.student_id join courses c on c.id = e.course_id
        where u.username = $1 and trim(c.title) = $2 and e.status = 'active'`, [username, course]);
      if (!e) { problem(`${username} ${course}: no active enrolment`); continue; }
      if (apply) await q(`update enrollments set custom_fee_per_month = $1 where id = $2`, [amount, e.id]);
      say(`${username} ${course}: monthly fee ${Number(e.fee)} -> ${amount}`);
      for (const month of [10, 11]) {
        const f = await fee(username, course, month);
        if (!f || Number(f.amount) === amount) continue;
        if (f.status === 'received' && f.payments !== 1) { problem(`${username} ${course} ${month}/2026: ${f.payments} payments, fix by hand`); continue; }
        if (apply) {
          await q(`update fees set amount = $1, updated_at = now() where id = $2`, [amount, f.id]);
          if (f.status === 'received') await q(`update payments set amount = $1 where fee_id = $2`, [amount, f.id]);
        }
        touched.add(`${f.student_id}|${f.course_id}|${month}`);
        say(`  ${month}/2026 fee ${Number(f.amount)} -> ${amount}${f.status === 'received' ? ' (and its payment)' : ''}`);
      }
    }

    // 3. On leave in November: fee set aside, enrolment stays active
    const hasNotes = (await q(`select to_regclass('fee_admin_notes') is not null as ok`))[0].ok;
    for (const [username, course] of ON_LEAVE_NOV) {
      const f = await fee(username, course, 11);
      if (!f) { problem(`${username} ${course} 11/2026: no fee`); continue; }
      if (f.status === 'dropped') continue;
      if (f.status === 'received') { problem(`${username} ${course} 11/2026: already paid`); continue; }
      if (apply) {
        await q(`update fees set status = 'dropped', updated_at = now() where id = $1`, [f.id]);
        if (hasNotes) await q(`insert into fee_admin_notes (fee_id, note, updated_by) values ($1, $2, $3)
          on conflict (fee_id) do update set note = excluded.note, updated_at = now()`, [f.id, 'On leave in November (junior sheet)', admin.id]);
      }
      touched.add(`${f.student_id}|${f.course_id}|11`);
      say(`${username} ${course} 11/2026: on leave, fee ${Number(f.amount)} not owed`);
    }

    // 4. Paid fees
    const owed: Record<number, number> = {};
    for (const [username, course, month, method] of PAID) {
      const f = await fee(username, course, month);
      if (!f) { problem(`${username} ${course} ${month}/2026: no fee to mark paid`); continue; }
      if (f.status === 'received') continue;
      if (f.status === 'dropped') { problem(`${username} ${course} ${month}/2026: fee is marked dropped`); continue; }
      const amount = FEE_CHANGES.find(([u, c]) => u === username && c === course)?.[2] ?? Number(f.amount);
      if (apply) await feesService.markAsReceived(f.id, admin.id, {
        paymentMethod: method, serialNumber: method === 'cash' ? `Junior sheet ${month === 10 ? 'Oct' : 'Nov'} 2026` : undefined });
      owed[month] = (owed[month] || 0) + amount;
      say(`${username} ${course} ${month}/2026: paid ${amount} (${method === 'cash' ? 'cash' : 'bank/online'})`);
    }

    // 5. Yahya Bilal: own English class with Sir Manzar from 16 Nov
    const [yahya] = await q(`select id from users where username = $1`, [YAHYA.username]);
    const [existing] = await q(`select id from courses where title = $1`, [YAHYA.title]);
    const [src] = await q(`select * from courses where trim(title) = $1`, [YAHYA.copySettingsFrom]);
    const teachers = await q(`select ct.teacher_id, ct.percentage_cut, c.teacher_name from course_teachers ct
      join courses c on c.id = ct.course_id where trim(c.title) = $1`, [YAHYA.copyTeacherFrom]);
    if (!yahya || !src || !teachers.length) problem(`Yahya English: student, settings class or Sir Manzar class not found`);
    else {
      let courseId = existing?.id;
      if (!courseId) {
        if (apply) {
          [{ id: courseId }] = await q(`insert into courses (title, description, duration, course_category, course_level,
              subject, teacher_name, is_active, created_by) values ($1, $2, $3, $4, $5, 'English', $6, true, $7) returning id`,
            [YAHYA.title, src.description, src.duration, src.course_category, src.course_level, teachers[0].teacher_name, admin.id]);
          for (const t of teachers) await q(`insert into course_teachers (course_id, teacher_id, percentage_cut) values ($1, $2, $3)`,
            [courseId, t.teacher_id, t.percentage_cut]);
        }
        say(`new class "${YAHYA.title}" (teacher as in ${YAHYA.copyTeacherFrom})`);
      }
      const [enr] = courseId ? await q(`select id from enrollments where student_id = $1 and course_id = $2`, [yahya.id, courseId]) : [];
      if (!enr) {
        const [sci] = await q(`select e.* from enrollments e where e.student_id = $1 and e.course_id = $2`, [yahya.id, src.id]);
        if (apply) await enrollmentsService.createEnrollment({
          studentId: yahya.id, courseId, createdBy: admin.id, enrolledAt: YAHYA.from,
          attendanceMode: sci?.attendance_mode || 'online', classType: sci?.class_type || 'online',
          customFeePerMonth: YAHYA.fee, currency: sci?.currency || 'PKR', feeType: 'custom' });
        say(`yahya.bilal enrolled in English from ${YAHYA.from}, ${YAHYA.fee}/month`);
      }
    }

    // 6. Rebuild invoices for changed fee amounts / leave months
    if (apply) for (const key of touched) {
      const [studentId, courseId, month] = key.split('|');
      await enrollmentsService.rebuildInvoicesForFee(studentId, courseId, Number(month), 2026, admin.id);
    }

    // 7. Drops (last: each drop reruns that student's fee months, as the portal's drop button does)
    for (const username of DROP_STUDENTS) {
      const rows = await q(`select e.id, c.title from enrollments e join users u on u.id = e.student_id
        join courses c on c.id = e.course_id where u.username = $1 and e.status = 'active'`, [username]);
      if (!rows.length) { problem(`${username}: no active enrolment to drop`); continue; }
      for (const e of rows) {
        if (apply) await enrollmentsService.updateEnrollment(e.id, { status: 'dropped', droppedAt: DROP_DATE }, admin.id);
        say(`${username} ${e.title.trim()}: dropped from 1 Oct 2026 (unpaid Oct/Nov fees removed)`);
      }
    }

    console.log(`\nPayments: Oct ${owed[10] || 0}, Nov ${owed[11] || 0}. Problems: ${problems}.`);
    if (!apply) console.log('Nothing changed. Run again with --apply to make these changes.');
  } finally {
    await client.end();
  }
}

main()
  .then(() => setTimeout(() => process.exit(0), 3000)) // let background fee-status sync finish
  .catch((error) => { console.error(`Failed: ${error.message}`); process.exit(1); });
