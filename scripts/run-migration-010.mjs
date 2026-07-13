import pkg from 'pg';
const { Client } = pkg;
const client = new Client({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 6543,
  user: 'postgres.gbioelofixkczadssfta', password: 'Abd.usman2002',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
await client.connect();

const sqls = [
  `CREATE TABLE IF NOT EXISTS expenses (
    id uuid primary key default gen_random_uuid(),
    category text not null check (category in ('electricity','rent','salaries','repairs','purchases','other')),
    description text,
    amount numeric not null,
    expense_date date not null default current_date,
    created_by text,
    created_at timestamptz default now()
  )`,
  'ALTER TABLE expenses ENABLE ROW LEVEL SECURITY',
  `CREATE POLICY "exp_select" ON expenses FOR SELECT TO authenticated USING (has_permission('reports:view') OR has_permission('settings:edit'))`,
  `CREATE POLICY "exp_insert" ON expenses FOR INSERT TO authenticated WITH CHECK (has_permission('settings:edit'))`,
  `CREATE POLICY "exp_update" ON expenses FOR UPDATE TO authenticated USING (has_permission('settings:edit')) WITH CHECK (has_permission('settings:edit'))`,
  `CREATE POLICY "exp_delete" ON expenses FOR DELETE TO authenticated USING (has_permission('settings:edit'))`,
];

for (const sql of sqls) {
  try {
    await client.query(sql);
    console.log('OK:', sql.substring(0, 90));
  } catch (err) {
    console.error('ERR:', sql.substring(0, 90), err.message);
  }
}

const { rows: tables } = await client.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='expenses'"
);
console.log('expenses table:', tables.length > 0 ? 'exists' : 'missing');

await client.end();
