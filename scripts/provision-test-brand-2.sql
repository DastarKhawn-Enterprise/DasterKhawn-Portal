-- ============================================================
-- Provision Test Brand 2 — run this in the Supabase Dashboard
-- SQL editor for project: budfkxyycddkldrzmglo
-- ============================================================
-- Run ALL statements sequentially. This single script:
--   1. Creates all POS tables (menu_items, orders, order_items)
--   2. Applies role-based RLS policies
--   3. Enables Realtime for orders
--   4. Adds cancelled/dine_in/takeaway/order_type support
--   5. Creates settings, inventory, customers, expenses, reservations
--   6. Enables module toggles on settings
--   7. Seeds sample menu items and default settings row
-- ============================================================

-- ============================================================
-- MIGRATION: pos-schema.sql (base tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric not null,
  category text,
  available boolean default true,
  created_at timestamptz default now()
);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "temp_public_all_access_menu_items"
  ON menu_items
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS orders (
  id uuid primary key default gen_random_uuid(),
  order_number serial,
  status text not null default 'pending',
    check (status in ('pending', 'in_kitchen', 'ready', 'completed')),
  source text not null default 'pos',
    check (source in ('pos', 'website', 'app')),
  total numeric not null,
  created_by text,
  created_at timestamptz default now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "temp_public_all_access_orders"
  ON orders
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id),
  quantity integer not null default 1,
  price_at_order numeric not null,
  notes text
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "temp_public_all_access_order_items"
  ON order_items
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- MIGRATION: 002_role_based_rls.sql
-- ============================================================

DROP POLICY IF EXISTS "temp_public_all_access_menu_items" ON menu_items;
DROP POLICY IF EXISTS "temp_public_all_access_orders" ON orders;
DROP POLICY IF EXISTS "temp_public_all_access_order_items" ON order_items;

CREATE OR REPLACE FUNCTION has_permission(required text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    auth.jwt() ->> 'tenant_role' = 'super_admin' OR
    auth.jwt() -> 'permissions' ? required,
    false
  );
$$;

-- menu_items RLS
CREATE POLICY "auth_menu_select"
  ON menu_items
  FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'tenant_role' IS NOT NULL);

CREATE POLICY "auth_menu_insert"
  ON menu_items
  FOR INSERT
  TO authenticated
  WITH CHECK (has_permission('menu:edit'));

CREATE POLICY "auth_menu_update"
  ON menu_items
  FOR UPDATE
  TO authenticated
  USING (has_permission('menu:edit'))
  WITH CHECK (has_permission('menu:edit'));

CREATE POLICY "auth_menu_delete"
  ON menu_items
  FOR DELETE
  TO authenticated
  USING (has_permission('menu:edit'));

-- orders RLS
CREATE POLICY "auth_orders_select"
  ON orders
  FOR SELECT
  TO authenticated
  USING (has_permission('orders:view') OR has_permission('orders:create'));

CREATE POLICY "auth_orders_insert"
  ON orders
  FOR INSERT
  TO authenticated
  WITH CHECK (has_permission('orders:create'));

CREATE POLICY "auth_orders_update"
  ON orders
  FOR UPDATE
  TO authenticated
  USING (has_permission('orders:create') OR has_permission('orders:update'))
  WITH CHECK (has_permission('orders:create') OR has_permission('orders:update'));

-- order_items RLS
CREATE POLICY "auth_order_items_select"
  ON order_items
  FOR SELECT
  TO authenticated
  USING (has_permission('orders:view') OR has_permission('orders:create'));

CREATE POLICY "auth_order_items_insert"
  ON order_items
  FOR INSERT
  TO authenticated
  WITH CHECK (has_permission('orders:create'));

CREATE POLICY "auth_order_items_update"
  ON order_items
  FOR UPDATE
  TO authenticated
  USING (has_permission('orders:create') OR has_permission('orders:update'))
  WITH CHECK (has_permission('orders:create') OR has_permission('orders:update'));


-- ============================================================
-- MIGRATION: 003_enable_realtime.sql
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE orders;


-- ============================================================
-- MIGRATION: 004_add_cancelled_status.sql
-- ============================================================

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'in_kitchen', 'ready', 'completed', 'cancelled'));


-- ============================================================
-- MIGRATION: 005_dine_in_schema.sql (tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number text NOT NULL,
  capacity integer NOT NULL DEFAULT 4,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved')),
  current_order_id uuid REFERENCES orders(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tables ENABLE ROW LEVEL SECURITY;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES tables(id);
ALTER PUBLICATION supabase_realtime ADD TABLE tables;

CREATE POLICY "auth_tables_select"
  ON tables
  FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'tenant_role' IS NOT NULL);

CREATE POLICY "auth_tables_insert"
  ON tables
  FOR INSERT
  TO authenticated
  WITH CHECK (has_permission('orders:create'));

CREATE POLICY "auth_tables_update"
  ON tables
  FOR UPDATE
  TO authenticated
  USING (has_permission('orders:create') OR has_permission('orders:update'))
  WITH CHECK (has_permission('orders:create') OR has_permission('orders:update'));


-- ============================================================
-- MIGRATION: 006_takeaway_fields.sql
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type text DEFAULT 'dine_in';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_time timestamptz;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('dine_in', 'takeaway', 'delivery', 'drive_thru', 'third_party'));


-- ============================================================
-- MIGRATION: 007_settings_schema.sql (settings table + tax)
-- ============================================================

CREATE TABLE IF NOT EXISTS settings (
  id uuid primary key default gen_random_uuid(),
  tax_rate numeric default 0,
  tax_enabled boolean default false,
  default_discount_type text default 'percentage',
  receipt_footer_text text default 'Thank you for your order!',
  currency_symbol text default '$',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_select_all"
  ON settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "settings_update_edit"
  ON settings FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount numeric default 0;

INSERT INTO settings (tax_rate, tax_enabled, receipt_footer_text, currency_symbol)
VALUES (0, false, 'Thank you for your order!', '$');


-- ============================================================
-- MIGRATION: 008_inventory_schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default 'pcs',
  current_stock numeric not null default 0,
  low_stock_threshold numeric not null default 10,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS menu_item_ingredients (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid references menu_items(id) on delete cascade,
  inventory_item_id uuid references inventory_items(id) on delete cascade,
  quantity_used numeric not null default 1
);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_select" ON inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_insert" ON inventory_items FOR INSERT TO authenticated WITH CHECK (has_permission('menu:edit'));
CREATE POLICY "inv_update" ON inventory_items FOR UPDATE TO authenticated USING (has_permission('menu:edit')) WITH CHECK (has_permission('menu:edit'));
CREATE POLICY "inv_delete" ON inventory_items FOR DELETE TO authenticated USING (has_permission('menu:edit'));

CREATE POLICY "ing_select" ON menu_item_ingredients FOR SELECT TO authenticated USING (true);
CREATE POLICY "ing_insert" ON menu_item_ingredients FOR INSERT TO authenticated WITH CHECK (has_permission('menu:edit'));
CREATE POLICY "ing_update" ON menu_item_ingredients FOR UPDATE TO authenticated USING (has_permission('menu:edit')) WITH CHECK (has_permission('menu:edit'));
CREATE POLICY "ing_delete" ON menu_item_ingredients FOR DELETE TO authenticated USING (has_permission('menu:edit'));


-- ============================================================
-- MIGRATION: 009_customers_schema.sql
-- ============================================================

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


-- ============================================================
-- MIGRATION: 010_expenses_schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('electricity','rent','salaries','repairs','purchases','other')),
  description text,
  amount numeric not null,
  expense_date date not null default current_date,
  created_by text,
  created_at timestamptz default now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exp_select" ON expenses FOR SELECT TO authenticated USING (has_permission('reports:view') OR has_permission('settings:edit'));
CREATE POLICY "exp_insert" ON expenses FOR INSERT TO authenticated WITH CHECK (has_permission('settings:edit'));
CREATE POLICY "exp_update" ON expenses FOR UPDATE TO authenticated USING (has_permission('settings:edit')) WITH CHECK (has_permission('settings:edit'));
CREATE POLICY "exp_delete" ON expenses FOR DELETE TO authenticated USING (has_permission('settings:edit'));


-- ============================================================
-- MIGRATION: 011_reservations_schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS reservations (
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
);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "res_select" ON reservations FOR SELECT TO authenticated USING (true);
CREATE POLICY "res_insert" ON reservations FOR INSERT TO authenticated WITH CHECK (has_permission('orders:create') OR has_permission('orders:update'));
CREATE POLICY "res_update" ON reservations FOR UPDATE TO authenticated USING (has_permission('orders:create') OR has_permission('orders:update')) WITH CHECK (has_permission('orders:create') OR has_permission('orders:update'));
CREATE POLICY "res_delete" ON reservations FOR DELETE TO authenticated USING (has_permission('orders:create') OR has_permission('orders:update'));

ALTER PUBLICATION supabase_realtime ADD TABLE reservations;


-- ============================================================
-- MIGRATION: 013_tenant_modules.sql (enabled_modules on settings)
-- ============================================================

ALTER TABLE settings ADD COLUMN IF NOT EXISTS enabled_modules jsonb NOT NULL DEFAULT '{
  "dashboard": true, "orders": true, "dine_in": true, "take_away": true,
  "delivery": true, "drive_thru": true, "third_party": true,
  "reservations": true, "menu": true, "inventory": true,
  "customers": true, "reports": true, "expenses": true, "staff": true,
  "settings": true, "loyalty_points": true
}'::jsonb;


-- Update the default settings row to include enabled_modules
UPDATE settings SET enabled_modules = '{
  "dashboard": true, "orders": true, "dine_in": true, "take_away": true,
  "delivery": true, "drive_thru": true, "third_party": true,
  "reservations": true, "menu": true, "inventory": true,
  "customers": true, "reports": true, "expenses": true, "staff": true,
  "settings": true, "loyalty_points": true
}'::jsonb WHERE enabled_modules IS NULL;


-- ============================================================
-- SEED: Sample menu items
-- ============================================================

INSERT INTO menu_items (name, description, price, category) VALUES
  ('Test Burger',    'Juicy beef patty with lettuce and tomato',   8.50, 'Mains'),
  ('Test Pizza',     'Margherita with fresh mozzarella',          12.00, 'Mains'),
  ('Test Salad',     'Caesar salad with croutons',                 7.50, 'Starters'),
  ('Test Lemonade',  'Freshly squeezed lemonade',                  3.50, 'Drinks');


-- ============================================================
-- DONE
-- ============================================================
-- Verify by running:
--   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
--   SELECT count(*) AS menu_items FROM menu_items;
--   SELECT count(*) AS settings_rows FROM settings;
-- ============================================================
