import pkg from 'pg';
const { Client } = pkg;
const client = new Client({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 6543,
  user: 'postgres.gbioelofixkczadssfta', password: 'Abd.usman2002',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
await client.connect();

const sqls = [
  `CREATE TABLE IF NOT EXISTS customers (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    phone text,
    email text,
    loyalty_points integer not null default 0,
    total_orders integer not null default 0,
    total_spent numeric not null default 0,
    notes text,
    created_at timestamptz default now()
  )`,
  'ALTER TABLE customers ENABLE ROW LEVEL SECURITY',
  'CREATE POLICY "cust_select" ON customers FOR SELECT TO authenticated USING (true)',
  `CREATE POLICY "cust_insert" ON customers FOR INSERT TO authenticated WITH CHECK (has_permission('orders:create'))`,
  `CREATE POLICY "cust_update" ON customers FOR UPDATE TO authenticated USING (has_permission('orders:create')) WITH CHECK (has_permission('orders:create'))`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id)`,
];

for (const sql of sqls) {
  try {
    await client.query(sql);
    console.log('OK:', sql.substring(0, 90));
  } catch (err) {
    console.error('ERR:', sql.substring(0, 90), err.message);
  }
}

// Verify
const { rows: tables } = await client.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='customers'"
);
console.log('customers table:', tables.length > 0 ? 'exists' : 'missing');

const { rows: col } = await client.query(
  "SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name='customer_id'"
);
console.log('orders.customer_id column:', col.length > 0 ? 'exists' : 'missing');

await client.end();
