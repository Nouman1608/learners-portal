/**
 * Junior Campus (owner, 2026-11-12): Maida Jawed, Muhammad Hassan and Maryam Nawaz are
 * the ONLY teachers of Grade 6, 7 and 8. Other teachers are taken off those grades.
 * (All three are salaried, so this does not change their pay; a teacher taken off
 * stops earning from those grades' students on future salary slips.)
 *
 * Preview (changes nothing):  npx tsx scripts/junior-grade-teachers.ts .env.junior
 * Apply:                      npx tsx scripts/junior-grade-teachers.ts .env.junior --apply
 */
import * as dotenv from 'dotenv';
import { Client } from 'pg';

const envFile = process.argv.find((a) => a.startsWith('.env')) || '.env.junior';
const apply = process.argv.includes('--apply');
dotenv.config({ path: envFile, override: true });

const GRADES = ['Grade 6', 'Grade 7', 'Grade 8'];
const TEACHERS = ['maida.jawed', 'Muhammad.hassan', 'maryam.nawaz'];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const q = async (text: string, params: unknown[] = []) => (await client.query(text, params)).rows;
  let problems = 0;
  try {
    console.log(`${apply ? 'APPLYING' : 'PREVIEW (nothing changed)'} on ${envFile}\n`);
    const teachers = await q(`select id, username, concat(first_name, ' ', last_name) as name from users
                              where username = any($1) and role = 'teacher'`, [TEACHERS]);
    for (const u of TEACHERS) if (!teachers.find((t) => t.username === u)) { problems++; console.log(`SKIP  teacher ${u} not found`); }
    if (problems) return;
    const keepIds = teachers.map((t) => t.id);

    for (const grade of GRADES) {
      const [course] = await q(`select id from courses where trim(title) = $1`, [grade]);
      if (!course) { problems++; console.log(`SKIP  ${grade}: class not found`); continue; }
      const current = await q(`select ct.teacher_id as id, concat(u.first_name, ' ', u.last_name) as name from course_teachers ct
                               join users u on u.id = ct.teacher_id where ct.course_id = $1 order by 2`, [course.id]);
      console.log(`${grade} now: ${current.map((c) => c.name.trim()).join(', ') || 'no teacher'}`);
      for (const c of current.filter((c) => !keepIds.includes(c.id))) {
        if (apply) await q(`delete from course_teachers where course_id = $1 and teacher_id = $2`, [course.id, c.id]);
        console.log(`${apply ? 'DONE ' : 'WILL '}   remove ${c.name.trim()}`);
      }
      for (const t of teachers.filter((t) => !current.find((c) => c.id === t.id))) {
        if (apply) await q(`insert into course_teachers (course_id, teacher_id, percentage_cut) values ($1, $2, 0)
                            on conflict (course_id, teacher_id) do nothing`, [course.id, t.id]);
        console.log(`${apply ? 'DONE ' : 'WILL '}   add ${t.name.trim()}`);
      }
    }
    console.log(`\nProblems: ${problems}.${apply ? '' : ' Run again with --apply to make these changes.'}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
});
