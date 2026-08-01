import pkg from 'pg';
const { Client } = pkg;
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(join(__dirname, '..', 'packages', 'gateway-sdk', 'migrations', '023_discount_notes_orders.sql'), 'utf-8');

const tenants = [
  { name: 'Bao-G', user: 'postgres.gbioelofixkczadssfta', password: 'Abd.usman2002' },
  { name: 'Test Brand 2', user: 'postgres.budfkxyycddkldrzmglo', password: 'Dastarkhawn.ent26' },
];

for (const t of tenants) {
  console.log(`\n--- ${t.name} ---`);
  const client = new Client({
    host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 6543,
    user: t.user, password: t.password,
    database: 'postgres', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    const { rows: cols } = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name='discount_amount'"
    );
    if (cols.length === 0) {
      console.log('Running migration 023...');
      await client.query(migrationSql);
      console.log('Applied.');
    } else {
      console.log('Already has discount_amount — skipping.');
    }
  } catch (e) {
    console.error(`Failed: ${e.message}`);
  } finally {
    try { await client.end(); } catch {}
  }
}
console.log('\nDone.');
