import pkg from 'pg';
const { Client } = pkg;
const client = new Client({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 6543,
  user: 'postgres.gbioelofixkczadssfta', password: 'Abd.usman2002',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
await client.connect();

const sqls = [
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS enabled_modules jsonb NOT NULL DEFAULT '{"dashboard":true,"orders":true,"dine_in":true,"take_away":true,"delivery":true,"drive_thru":true,"third_party":true,"reservations":true,"menu":true,"inventory":true,"customers":true,"reports":true,"expenses":true,"staff":true,"settings":true,"loyalty_points":true}'::jsonb`,
];

for (const sql of sqls) {
  try {
    await client.query(sql);
    console.log('OK:', sql.substring(0, 90));
  } catch (err) {
    console.error('ERR:', sql.substring(0, 90), err.message);
  }
}

const { rows } = await client.query(
  "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='enabled_modules'"
);
console.log('enabled_modules column:', rows.length > 0 ? 'EXISTS' : 'MISSING');

await client.end();
