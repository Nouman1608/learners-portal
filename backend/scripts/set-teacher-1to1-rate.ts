/**
 * Set a teacher's one-to-one class rate (src/config/teacherOneToOneRates.json) by name.
 * A rate equal to the default removes the teacher's own entry. Restart the backend after.
 *
 * Usage (backend folder):  npx tsx scripts/set-teacher-1to1-rate.ts .env "Aizaz" 2000
 * The name is matched against first + last name and must find exactly one teacher.
 */
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const [envFile, name, rateArg] = process.argv.slice(2);
const rate = Number(rateArg);
if (!envFile || !name || !Number.isFinite(rate) || rate < 0) {
  console.error('Usage: npx tsx scripts/set-teacher-1to1-rate.ts .env "Teacher name" 2000');
  process.exit(1);
}
dotenv.config({ path: envFile, override: true });

const configPath = path.join(__dirname, '../src/config/teacherOneToOneRates.json');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(
    `select id, first_name, last_name from users
     where role = 'teacher' and concat(first_name, ' ', last_name) ilike $1`, [`%${name}%`]);
  await client.end();
  if (rows.length !== 1) {
    console.error(`Found ${rows.length} teachers matching "${name}": ` +
      rows.map((r) => `${r.first_name} ${r.last_name}`).join(', '));
    process.exit(1);
  }
  const teacher = rows[0];

  const rates = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, number>;
  const before = rates[teacher.id] ?? rates.default;
  if (rate === rates.default) delete rates[teacher.id];
  else rates[teacher.id] = rate;
  fs.writeFileSync(configPath, JSON.stringify(rates, null, 2) + '\n');

  console.log(`${teacher.first_name} ${teacher.last_name} (${teacher.id}): Rs ${before} -> Rs ${rate} per class`);
  console.log('Now restart the backend so the new rate is used.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
