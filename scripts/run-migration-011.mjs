import pkg from 'pg';
const { Client } = pkg;
const client = new Client({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 6543,
  user: 'postgres.gbioelofixkczadssfta', password: 'Abd.usman2002',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
await client.connect();

// First check if table already exists
const { rows: check } = await client.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='reservations'"
);
console.log('Before migration — reservations table:', check.length > 0 ? 'EXISTS' : 'MISSING');

const sqls = [
  `CREATE TABLE IF NOT EXISTS reservations (
    id uuid primary key default gen_random_uuid(),
    guest_name text not null,
    guest_phone text,
    party_size integer not null default 2,
    reservation_date date not null,
    reservation_time time not null,
    table_id uuid references tables(id),
    status text not null default 'confirmed' check (status in ('confirmed','seated','cancelled','no_show')),
    notes text,
    created_at timestamptz default now()
  )`,
  'ALTER TABLE reservations ENABLE ROW LEVEL SECURITY',
  `CREATE POLICY "res_select" ON reservations FOR SELECT TO authenticated USING (true)`,
  `CREATE POLICY "res_insert" ON reservations FOR INSERT TO authenticated WITH CHECK (has_permission('orders:create') OR has_permission('orders:update'))`,
  `CREATE POLICY "res_update" ON reservations FOR UPDATE TO authenticated USING (has_permission('orders:create') OR has_permission('orders:update')) WITH CHECK (has_permission('orders:create') OR has_permission('orders:update'))`,
  `CREATE POLICY "res_delete" ON reservations FOR DELETE TO authenticated USING (has_permission('orders:create') OR has_permission('orders:update'))`,
  `ALTER PUBLICATION supabase_realtime ADD TABLE reservations`,
];

for (const sql of sqls) {
  try {
    await client.query(sql);
    console.log('OK:', sql.substring(0, 90));
  } catch (err) {
    console.error('ERR:', sql.substring(0, 90), err.message);
  }
}

const { rows: verify } = await client.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='reservations'"
);
console.log('After migration — reservations table:', verify.length > 0 ? 'EXISTS' : 'MISSING');

await client.end();
