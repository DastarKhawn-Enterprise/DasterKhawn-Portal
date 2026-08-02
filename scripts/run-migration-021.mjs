import pkg from 'pg';
const { Client } = pkg;
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Migration 021: add metadata jsonb column to gateway staff_roles table.
// Target: GATEWAY Supabase project (db.<ref>.supabase.co), NOT a tenant DB.
// Provide the gateway project's postgres password via GATEWAY_DB_PASSWORD (env) or argv[2].
const password = process.env.GATEWAY_DB_PASSWORD || process.argv[2];
if (!password) {
  console.error('Usage: set GATEWAY_DB_PASSWORD (or pass it as argv) with the gateway Supabase DB password.');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(join(__dirname, '..', 'packages', 'gateway-sdk', 'migrations', '021_staff_metadata.sql'), 'utf-8');

const client = new Client({
  host: 'db.sifzogcmljuabtkvrpcs.supabase.co', port: 5432,
  user: 'postgres', password,
  database: 'postgres', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
});
try {
  await client.connect();
  console.log('Connected to gateway DB.');
  const { rows } = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='staff_roles' AND column_name='metadata'");
  if (rows.length === 0) {
    console.log('Running migration 021 (add staff_roles.metadata)...');
    await client.query(migrationSql);
    console.log('Applied.');
  } else {
    console.log('Column already exists — skipping.');
  }
  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('PostgREST schema cache reloaded.');
} catch (e) {
  console.error('Failed:', e.message);
  process.exitCode = 1;
} finally {
  try { await client.end(); } catch {}
}
console.log('Done.');
