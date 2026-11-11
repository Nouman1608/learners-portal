/**
 * Read-only: checks that recent changes are live on both portals' databases.
 * Usage (backend folder):  npx tsx scripts/deploy-check.ts
 */
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const ok = (good: boolean, text: string) => console.log(`${good ? 'OK   ' : 'MISSING'} ${text}`);

async function check(envFile: string, junior: boolean) {
  const env = dotenv.parse(fs.readFileSync(envFile));
  console.log(`\n== ${junior ? 'JUNIOR' : 'SENIOR'} (${envFile}) ==`);
  ok(env.BOOKS_START === '2026-10', `books start = ${env.BOOKS_START ?? '(not set)'}`);
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  const q = async (sql: string, p: unknown[] = []) => (await client.query(sql, p)).rows;
  try {
    const migrations = await q(`select count(*)::int as n from drizzle.__drizzle_migrations`).catch(() => [{ n: -1 }]);
    ok(migrations[0].n >= 5, `database updates applied: ${migrations[0].n} of 5`);
    for (const t of ['fee_admin_notes', 'teacher_advances', 'teacher_attendance_marks']) {
      const [r] = await q(`select to_regclass($1) is not null as ok`, [t]);
      ok(r.ok, `table ${t}`);
    }
    if (junior) {
      const leave = await q(`select concat(u.first_name, ' ', u.last_name) as s from fees f join users u on u.id = f.student_id
                             where f.status = 'leave' order by 1`);
      ok(leave.length > 0, `on-leave fees: ${leave.map((r) => r.s.trim()).join(', ') || 'none'}`);
      const stray = await q(`select count(*)::int as n from fees f join enrollments e on e.id = f.enrollment_id
                             where f.status = 'dropped' and e.status = 'active'`);
      ok(stray[0].n === 0, `old-style leave fees still marked dropped: ${stray[0].n}`);
      const staff = await q(`select username, teacher_payment_type as t, monthly_salary::numeric as m from users
        where username in ('amma.najma','urooj.maid','faiza.quran','anum.aslam','khush.bakth','attia.ashiq','maryam.nawaz','maida.jawed','Muhammad.hassan')
        order by username`);
      ok(staff.length === 9, `staff on salary list: ${staff.length} of 9 (${staff.map((r) => `${r.username} ${r.t} ${Number(r.m)}`).join('; ')})`);
      const [quran] = await q(`select count(*)::int as n from course_teachers ct join courses c on c.id = ct.course_id
                               join users u on u.id = ct.teacher_id where trim(c.title) = 'Quran' and u.username = 'faiza.quran'`);
      ok(quran.n === 1, 'Faiza teaches the Quran class');
      const cats = await q(`select coalesce(student_subcategory, '(none)') as c, count(*)::int as n from users
                            where role = 'student' and is_active group by 1 order by 1`);
      const prep = cats.find((r) => r.c === 'prep');
      ok(!!prep, `student categories: ${cats.map((r) => `${r.c} ${r.n}`).join(', ')}`);
    }
  } finally {
    await client.end();
  }
}

async function main() {
  await check('.env', false);
  await check('.env.junior', true);

  console.log('\n== ONE-TO-ONE RATES (shared) ==');
  const rates = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/config/teacherOneToOneRates.json'), 'utf8'));
  const env = dotenv.parse(fs.readFileSync('.env'));
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  const named = [];
  for (const [id, rate] of Object.entries(rates)) {
    if (id === 'default') continue;
    const [u] = (await client.query(`select concat(first_name, ' ', last_name) as n from users where id::text = $1`, [id])).rows;
    named.push(`${u ? u.n.trim() : id} Rs ${rate}`);
  }
  await client.end();
  console.log(`default Rs ${rates.default}; ${named.join('; ') || 'no teacher-specific rates'}`);
  ok(named.some((n) => /ghazali/i.test(n) && /2500/.test(n)), 'Sir Ghazali at Rs 2,500 (if he is a senior teacher)');
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
});
