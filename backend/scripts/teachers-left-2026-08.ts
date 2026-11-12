/**
 * Owner, 2026-11-12: Amna Amin, Sadaf Amir and Fatima Yaseen left Learners Academy in
 * August 2026 (both campuses). On each portal:
 *   1. take them off every class (so month-end salary slips skip them)
 *   2. remove their salary slips (teacher invoices) from September 2026 onward
 *   3. deactivate their accounts (no sign-in; history up to August is kept)
 *
 * Preview (changes nothing):  npx tsx scripts/teachers-left-2026-08.ts
 * Apply (both portals):       npx tsx scripts/teachers-left-2026-08.ts --apply
 */
import * as dotenv from 'dotenv';
import fs from 'fs';
import { Client } from 'pg';

const apply = process.argv.includes('--apply');
const PEOPLE: [string, string][] = [['Amna', 'Amin'], ['Sadaf', 'Amir'], ['Fatima', 'Yaseen']];
const FROM = 2026 * 12 + 9; // September 2026

async function run(envFile: string, label: string) {
  const env = dotenv.parse(fs.readFileSync(envFile));
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  const q = async (text: string, params: unknown[] = []) => (await client.query(text, params)).rows;
  const say = (msg: string) => console.log(`${apply ? 'DONE ' : 'WILL '} ${msg}`);
  console.log(`\n== ${label} (${envFile}) ==`);
  try {
    for (const [first, last] of PEOPLE) {
      const users = await q(`select id, username, is_active from users where role = 'teacher'
                             and lower(trim(first_name)) = lower($1) and lower(trim(last_name)) = lower($2)`, [first, last]);
      if (!users.length) { console.log(`INFO  ${first} ${last}: not on this portal`); continue; }
      for (const u of users) {
        console.log(`${first} ${last} (${u.username})${u.is_active ? '' : ' – already inactive'}`);

        const classes = await q(`select c.id, trim(c.title) as title,
                                   (select string_agg(concat(t.first_name, ' ', t.last_name), ', ') from course_teachers o
                                      join users t on t.id = o.teacher_id where o.course_id = c.id and o.teacher_id <> $1) as others
                                 from course_teachers ct join courses c on c.id = ct.course_id
                                 where ct.teacher_id = $1 order by 2`, [u.id]);
        for (const c of classes) {
          if (apply) await q(`delete from course_teachers where course_id = $1 and teacher_id = $2`, [c.id, u.id]);
          say(`  off class ${c.title} (other teachers left: ${c.others || 'NONE'})`);
        }

        const slips = await q(`select month, year, count(*)::int as versions,
                                 max(case when is_latest then total_amount::numeric end) as total
                               from invoices where type = 'teacher' and recipient_id = $1 and year * 12 + month >= $2
                               group by year, month order by year, month`, [u.id, FROM]);
        for (const s of slips) {
          if (apply) await q(`delete from invoices where type = 'teacher' and recipient_id = $1 and month = $2 and year = $3`,
            [u.id, s.month, s.year]);
          say(`  remove salary slip ${s.month}/${s.year} (Rs ${Number(s.total || 0)})`);
        }

        if (u.is_active) {
          if (apply) await q(`update users set is_active = false, updated_at = now() where id = $1`, [u.id]);
          say('  deactivate account');
        }
      }
    }
  } finally {
    await client.end();
  }
}

async function main() {
  console.log(apply ? 'APPLYING' : 'PREVIEW (nothing changed)');
  await run('.env', 'SENIOR');
  await run('.env.junior', 'JUNIOR');
  if (!apply) console.log('\nRun again with --apply to make these changes.');
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
});
