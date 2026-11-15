/**
 * One-off: the activity log used to save request bodies as sent, so password changes,
 * account setup and new users left readable passwords (and tokens) in activity_logs.details.
 * This replaces them with [REDACTED], using the same rule the log now applies (src/utils/redact).
 * Only counts, actions and dates are printed, never the values.
 * Rows whose details are not valid JSON are skipped and counted.
 *
 * Preview (changes nothing):  npx tsx scripts/redact-activity-log-passwords.ts .env
 * Apply:                      npx tsx scripts/redact-activity-log-passwords.ts .env --apply
 * Junior Campus:              use .env.junior instead of .env (run once for each campus)
 */
import * as dotenv from 'dotenv';
import { Client } from 'pg';
import { redactSensitive } from '../src/utils/redact';

const envFile = process.argv.slice(2).find((a) => a.startsWith('.env'));
const apply = process.argv.includes('--apply');
if (!envFile) {
  console.error('Usage: npx tsx scripts/redact-activity-log-passwords.ts .env|.env.junior [--apply]');
  process.exit(1);
}
dotenv.config({ path: envFile, override: true });
if (!process.env.DATABASE_URL) {
  console.error(`No DATABASE_URL in ${envFile}`);
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Narrow down in the database; the exact check is done on the parsed JSON below
    const { rows } = await client.query(`
      select id, action, resource, to_char(timestamp, 'YYYY-MM-DD') as day, details
      from activity_logs
      where details ~* '(pass|token|secret|api[_-]?key|authorization|"otp"|"pin)'
      order by timestamp`);

    const changes: { id: string; details: string; newDetails: string }[] = [];
    const byActionDay = new Map<string, number>();
    let notJson = 0;
    for (const r of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(r.details);
      } catch {
        notJson++;
        continue;
      }
      const newDetails = JSON.stringify(redactSensitive(parsed));
      if (newDetails === JSON.stringify(parsed)) continue;
      changes.push({ id: r.id, details: r.details, newDetails });
      const key = `${r.action} (${r.resource}) ${r.day}`;
      byActionDay.set(key, (byActionDay.get(key) || 0) + 1);
    }

    console.log(`${apply ? 'APPLYING' : 'PREVIEW (nothing changed)'} on ${envFile}`);
    console.log(`Rows checked: ${rows.length}; with a readable password/token: ${changes.length}; not valid JSON (skipped): ${notJson}\n`);
    for (const [key, count] of byActionDay) console.log(`  ${key}: ${count}`);

    if (apply && changes.length) {
      await client.query('begin');
      try {
        let updated = 0;
        for (const c of changes) {
          // Only if the row is unchanged since it was read
          const res = await client.query(
            'update activity_logs set details = $1 where id = $2 and details = $3',
            [c.newDetails, c.id, c.details]);
          updated += res.rowCount || 0;
        }
        await client.query('commit');
        console.log(`\nDONE: ${updated} row(s) redacted.`);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    } else if (changes.length) {
      console.log('\nRun again with --apply to redact these rows.');
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
});
