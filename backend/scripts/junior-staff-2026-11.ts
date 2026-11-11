/**
 * One-off (Junior Campus, 2026-11-12): the owner's staff salary list.
 *  - New salaried teachers (password Teacher@123, sign-in allowed, username first.last)
 *  - Faiza: paid per child (Rs 2,100 for each child in her classes); she teaches the Quran class
 *  - Existing Maida Jawed and Muhammad Hassan switch to a fixed monthly salary
 *
 * Preview (changes nothing):  npx tsx scripts/junior-staff-2026-11.ts .env.junior
 * Apply:                      npx tsx scripts/junior-staff-2026-11.ts .env.junior --apply
 */
import * as dotenv from 'dotenv';
import { Client } from 'pg';

const envFile = process.argv.find((a) => a.startsWith('.env')) || '.env.junior';
const apply = process.argv.includes('--apply');
dotenv.config({ path: envFile, override: true });

type Pay = { type: 'salaried' | 'per_child'; amount: number };
const NEW_STAFF: { firstName: string; lastName: string; pay: Pay }[] = [
  { firstName: 'Amma', lastName: 'Najma', pay: { type: 'salaried', amount: 19000 } },
  { firstName: 'Urooj', lastName: 'Maid', pay: { type: 'salaried', amount: 12000 } },
  { firstName: 'Faiza', lastName: 'Quran', pay: { type: 'per_child', amount: 2100 } },
  { firstName: 'Anum', lastName: 'Aslam', pay: { type: 'salaried', amount: 15000 } },
  { firstName: 'Khush', lastName: 'Bakth', pay: { type: 'salaried', amount: 15000 } },
  { firstName: 'Attia', lastName: 'Ashiq', pay: { type: 'salaried', amount: 15000 } },
  { firstName: 'Maryam', lastName: 'Nawaz', pay: { type: 'salaried', amount: 17000 } },
];
const EXISTING: { username: string; pay: Pay }[] = [
  { username: 'maida.jawed', pay: { type: 'salaried', amount: 15000 } },
  { username: 'Muhammad.hassan', pay: { type: 'salaried', amount: 19000 } },
];

const username = (first: string, last: string) =>
  [first, last].filter(Boolean).join('.').toLowerCase().replace(/[^a-z0-9.]/g, '');

async function main() {
  const { usersService } = await import('../src/services/users.service');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const q = async (text: string, params: unknown[] = []) => (await client.query(text, params)).rows;
  let problems = 0;
  const say = (msg: string) => console.log(`${apply ? 'DONE ' : 'WILL '} ${msg}`);
  const problem = (msg: string) => { problems++; console.log(`SKIP  ${msg}`); };
  const payText = (p: Pay) => (p.type === 'salaried' ? `salary Rs ${p.amount}/month` : `Rs ${p.amount} per child`);

  try {
    const [admin] = await q(`select id, username from users where role in ('admin', 'sudo') and is_active
                             order by (username = 'sidra.naazir') desc, role limit 1`);
    console.log(`${apply ? 'APPLYING' : 'PREVIEW (nothing changed)'} on ${envFile} as ${admin.username}\n`);

    for (const s of NEW_STAFF) {
      if (!s.lastName) { problem(`${s.firstName}: last name needed`); continue; }
      const name = username(s.firstName, s.lastName);
      const [exists] = await q(`select id, role from users where lower(username) = $1
                                or (lower(first_name) = lower($2) and lower(last_name) = lower($3))`, [name, s.firstName, s.lastName]);
      if (exists) { problem(`${s.firstName} ${s.lastName}: already in the portal (${exists.role})`); continue; }
      if (apply) {
        const user = await usersService.createUser({
          username: name, password: 'Teacher@123', role: 'teacher', firstName: s.firstName, lastName: s.lastName,
          teacherPaymentType: s.pay.type, monthlySalary: s.pay.amount, createdBy: admin.id,
        });
        await q(`update users set must_change_password = false where id = $1`, [user.id]);
      }
      say(`new teacher ${s.firstName} ${s.lastName} (username ${name}, password Teacher@123): ${payText(s.pay)}`);
    }

    // Faiza teaches the Quran class (her per-child pay counts its children)
    const [quran] = await q(`select id from courses where trim(title) = 'Quran'`);
    if (!quran) problem('Quran class not found');
    else {
      const others = await q(`select concat(u.first_name, ' ', u.last_name) as name from course_teachers ct
        join users u on u.id = ct.teacher_id where ct.course_id = $1`, [quran.id]);
      console.log(`INFO  Quran class teachers now: ${others.map((o) => o.name).join(', ') || 'none'}`);
      const [faiza] = await q(`select id from users where username = 'faiza.quran'`);
      if (faiza || !apply) {
        if (apply) await q(`insert into course_teachers (course_id, teacher_id, percentage_cut) values ($1, $2, 0)
                           on conflict (course_id, teacher_id) do nothing`, [quran.id, faiza.id]);
        say('Faiza Quran: teacher of the Quran class');
      } else problem('faiza.quran not found, so not added to the Quran class');
    }

    for (const e of EXISTING) {
      const [u] = await q(`select id, first_name, last_name, teacher_payment_type, monthly_salary::numeric as salary,
                                  local_student_fee_percentage::numeric as pct from users where username = $1`, [e.username]);
      if (!u) { problem(`${e.username}: not found`); continue; }
      if (apply) {
        await q(`update users set teacher_payment_type = $1, monthly_salary = $2, local_student_fee_percentage = null,
                   online_student_fixed_amount_ig = null, online_student_fixed_amount_alevel = null, updated_at = now()
                 where id = $3`, [e.pay.type, e.pay.amount, u.id]);
      }
      const before = u.teacher_payment_type === 'salaried' ? `salary Rs ${Number(u.salary)}` : `${Number(u.pct) || 0}% of fees`;
      say(`${u.first_name} ${u.last_name}: ${before} -> ${payText(e.pay)}`);
    }

    console.log(`\nProblems: ${problems}.${apply ? '' : ' Run again with --apply to make these changes.'}`);
  } finally {
    await client.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => { console.error(`Failed: ${error.message}`); process.exit(1); });
