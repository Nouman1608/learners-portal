/**
 * Junior Campus (owner, 2026-11-12): local students' category follows their grade.
 *   Grade 1-5 -> 'junior' (Junior), Grade 6-8 -> 'prep' (Prep), Grade 9-10 -> 'matric' (Matric)
 * Only ACTIVE, LOCAL enrollments in a "Grade N" class count (ATP grades, online and preschool
 * students are left as they are). Students with grades in two bands are listed, not changed.
 *
 * Preview (changes nothing):  npx tsx scripts/junior-grade-categories.ts .env.junior
 * Apply:                      npx tsx scripts/junior-grade-categories.ts .env.junior --apply
 * Safe to run again later (e.g. after promotions): it only changes students whose category differs.
 */
import * as dotenv from 'dotenv';
import { Client } from 'pg';

const envFile = process.argv.find((a) => a.startsWith('.env')) || '.env.junior';
const apply = process.argv.includes('--apply');
dotenv.config({ path: envFile, override: true });

const band = (grade: number) => (grade <= 5 ? 'junior' : grade <= 8 ? 'prep' : grade <= 10 ? 'matric' : null);
const LABEL: Record<string, string> = { junior: 'Junior', prep: 'Prep', matric: 'Matric' };

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(`
      select u.id, u.username, concat(u.first_name, ' ', u.last_name) as student, u.student_subcategory as current,
             array_agg(distinct substring(trim(c.title) from '^Grade ([0-9]+)$')::int) as grades
      from users u
      join enrollments e on e.student_id = u.id and e.status = 'active' and e.attendance_mode = 'local'
      join courses c on c.id = e.course_id and trim(c.title) ~ '^Grade [0-9]+$'
      where u.role = 'student'
      group by u.id
      order by student`);

    console.log(`${apply ? 'APPLYING' : 'PREVIEW (nothing changed)'} on ${envFile}\n`);
    const counts: Record<string, number> = {};
    let unchanged = 0;
    let unclear = 0;
    for (const r of rows) {
      const bands = [...new Set((r.grades as number[]).map(band).filter(Boolean))] as string[];
      if (bands.length !== 1) {
        unclear++;
        console.log(`CHECK ${r.student.trim()} (${r.username}): grades ${r.grades.join(', ')} – not changed`);
        continue;
      }
      const target = bands[0];
      if (r.current === target) { unchanged++; continue; }
      if (apply) await client.query(`update users set student_subcategory = $1, updated_at = now() where id = $2`, [target, r.id]);
      counts[target] = (counts[target] || 0) + 1;
      console.log(`${apply ? 'DONE ' : 'WILL '} ${r.student.trim()} (Grade ${r.grades.join(', ')}): ${r.current || 'none'} -> ${LABEL[target]}`);
    }
    console.log(`\nMoved: Junior ${counts.junior || 0}, Prep ${counts.prep || 0}, Matric ${counts.matric || 0}. ` +
      `Already right: ${unchanged}. To check: ${unclear}.${apply ? '' : ' Run again with --apply to make these changes.'}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
});
