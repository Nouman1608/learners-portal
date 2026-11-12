/**
 * Set teachers' fixed pay per ONLINE student ("Online Student Fixed Amount (IG Courses)",
 * which is also what Junior classes use; A Level classes use the A Level amount).
 *
 * Preview (changes nothing):  npx tsx scripts/set-teacher-online-rate.ts .env.junior 6000 user.one,user.two
 * Apply:                      add --apply
 * Usernames are matched without regard to capitals. Applies from the next salary slip made.
 */
import * as dotenv from 'dotenv';
import { Client } from 'pg';

const envFile = process.argv.find((a) => a.startsWith('.env')) || '.env';
const apply = process.argv.includes('--apply');
const [amountArg, namesArg] = process.argv.slice(2).filter((a) => !a.startsWith('.env') && !a.startsWith('--'));
const amount = Number(amountArg);
if (!(amount > 0) || !namesArg) {
  console.error('Usage: npx tsx scripts/set-teacher-online-rate.ts .env.junior 6000 user.one,user.two [--apply]');
  process.exit(1);
}
dotenv.config({ path: envFile, override: true });

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    console.log(`${apply ? 'APPLYING' : 'PREVIEW (nothing changed)'} on ${envFile}\n`);
    for (const username of namesArg.split(',').map((n) => n.trim()).filter(Boolean)) {
      const [t] = (await client.query(`
        select id, username, concat(first_name, ' ', last_name) as name, teacher_payment_type as type,
               local_student_fee_percentage::numeric as pct, online_student_fixed_amount_ig::numeric as ig,
               online_student_fixed_amount_alevel::numeric as al
        from users where role = 'teacher' and lower(username) = lower($1)`, [username])).rows;
      if (!t) { console.log(`SKIP  ${username}: no teacher with this username`); continue; }
      if (t.type && t.type !== 'percentage_based') { console.log(`SKIP  ${t.name}: paid as ${t.type}, not per student`); continue; }
      if (apply) await client.query(`update users set online_student_fixed_amount_ig = $1, updated_at = now() where id = $2`, [amount, t.id]);
      console.log(`${apply ? 'DONE ' : 'WILL '} ${t.name.trim()} (${t.username}): online per student Rs ${Number(t.ig) || 0} -> Rs ${amount}` +
        `  [local ${Number(t.pct) || 0}%, A Level Rs ${Number(t.al) || 0} unchanged]`);
    }
    if (!apply) console.log('\nRun again with --apply to make these changes.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
});
