-- 009_customers_schema.sql
CREATE TABLE IF NOT EXISTS customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  loyalty_points integer not null default 0,
  total_orders integer not null default 0,
  total_spent numeric not null default 0,
  notes text,
  created_at timestamptz default now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cust_select" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "cust_insert" ON customers FOR INSERT TO authenticated WITH CHECK (has_permission('orders:create'));
CREATE POLICY "cust_update" ON customers FOR UPDATE TO authenticated USING (has_permission('orders:create')) WITH CHECK (has_permission('orders:create'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id);
