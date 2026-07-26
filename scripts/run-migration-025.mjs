import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
dotenv.config({ path: 'G:/SAT SYS/apps/portal/.env.local' });

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new Client({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 6543,
  user: 'postgres.gbioelofixkczadssfta', password: 'Abd.usman2002',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
await client.connect();
console.log('Connected.');

const { rows: cols } = await client.query(
  "SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name='service_charge_amount'"
);
if (cols.length === 0) {
  const migrationSql = readFileSync(
    join(__dirname, '..', 'packages', 'gateway-sdk', 'migrations', '025_service_charge_orders.sql'),
    'utf-8'
  );
  console.log('Running migration...');
  await client.query(migrationSql);
  console.log('Migration applied.');
} else {
  console.log('Column already exists — skipping.');
}
await client.end();
console.log('Done.');
