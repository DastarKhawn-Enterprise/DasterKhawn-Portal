import pkg from 'pg';
const { Client } = pkg;
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(join(__dirname, '..', 'packages', 'gateway-sdk', 'migrations', '026_unique_order_number.sql'), 'utf-8');

const client = new Client({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 6543,
  user: 'postgres.gbioelofixkczadssfta', password: 'Abd.usman2002',
  database: 'postgres', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
});
try {
  await client.connect();
  console.log('Connected to Bao-G.');
  const { rows } = await client.query("SELECT indexname FROM pg_indexes WHERE tablename='orders' AND indexname='uq_orders_order_number'");
  if (rows.length === 0) {
    console.log('Running migration 026...');
    await client.query(migrationSql);
    console.log('Applied.');
  } else {
    console.log('Index already exists — skipping.');
  }
} catch (e) {
  console.error('Failed:', e.message);
} finally {
  try { await client.end(); } catch {}
}
console.log('Done.');
