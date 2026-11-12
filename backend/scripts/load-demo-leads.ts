/**
 * Load demo leads from a JSON file (made from the Portal Entry Sheet "Demo Leads" tab).
 * The data file is NOT kept in this repository (it holds names and phone numbers): copy it
 * to the server, use it, then delete it.
 *
 * File: [{ "name", "phone" (+E.164), "subject", "level", "demoDate" (YYYY-MM-DD or ""), "expectedJoin" }]
 * One lead per phone number (the portal allows one); every row becomes a notes line
 * "Demo <date>: <subject> (<level>)". A phone that is already a lead only gets the lines
 * its notes do not have yet.
 *
 * Preview (changes nothing):  npx tsx scripts/load-demo-leads.ts .env /opt/nomi-education/demo-leads.json
 * Apply:                      add --apply
 */
import * as dotenv from 'dotenv';
import fs from 'fs';
import { Client } from 'pg';

const envFile = process.argv.find((a) => a.startsWith('.env')) || '.env';
const dataFile = process.argv.find((a) => a.endsWith('.json'));
const apply = process.argv.includes('--apply');
dotenv.config({ path: envFile, override: true });

interface Row { name: string; phone: string; subject: string; level: string; demoDate: string; expectedJoin: string }

const pretty = (d: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'no date');
const titleCase = (s: string) => s.trim().toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

async function main() {
  if (!dataFile || !fs.existsSync(dataFile)) throw new Error(`Data file not found: ${dataFile || '(none given)'}`);
  const rows: Row[] = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  for (const r of rows) if (!/^\+\d{8,15}$/.test(r.phone)) throw new Error(`Bad phone for ${r.name}: ${r.phone}`);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const q = async (text: string, params: unknown[] = []) => (await client.query(text, params)).rows;
  const say = (msg: string) => console.log(`${apply ? 'DONE ' : 'WILL '} ${msg}`);
  try {
    const [admin] = await q(`select id, username from users where role in ('admin', 'sudo') and is_active
                             order by (username = 'fajar.ahmad') desc, role limit 1`);
    console.log(`${apply ? 'APPLYING' : 'PREVIEW (nothing changed)'} on ${envFile} as ${admin.username}: ${rows.length} rows\n`);

    const byPhone = new Map<string, Row[]>();
    for (const r of rows) byPhone.set(r.phone, [...(byPhone.get(r.phone) || []), r]);

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    for (const [phone, group] of byPhone) {
      const names = [...new Set(group.map((r) => titleCase(r.name)))];
      const name = names.join(' / ');
      const lines = group.map((r) => `Demo ${pretty(r.demoDate)}: ${r.subject} (${r.level})${names.length > 1 ? ` – ${titleCase(r.name)}` : ''}`);
      const join = group.map((r) => r.expectedJoin).filter(Boolean).sort()[0] || null;

      const [lead] = await q(`select id, name, notes from leads where phone = $1`, [phone]);
      if (!lead) {
        if (apply) await q(`insert into leads (name, phone, notes, status, source, potential_join_date, created_by)
                            values ($1, $2, $3, 'new', 'manual', $4, $5)`, [name, phone, lines.join('\n'), join, admin.id]);
        created++;
        say(`new lead ${name}: ${group.length} demo subject(s)`);
        continue;
      }
      const missing = lines.filter((l) => !(lead.notes || '').includes(l));
      if (!missing.length) { unchanged++; continue; }
      if (apply) await q(`update leads set notes = concat_ws(E'\\n', nullif(notes, ''), $1::text), updated_at = now() where id = $2`,
        [missing.join('\n'), lead.id]);
      updated++;
      say(`existing lead ${lead.name}: add ${missing.length} demo line(s)`);
    }
    console.log(`\nNew leads: ${created}. Existing leads updated: ${updated}. Already there: ${unchanged}.` +
      `${apply ? '' : ' Run again with --apply to make these changes.'}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
});
