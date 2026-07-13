-- 008_inventory_schema.sql
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

-- Reuse existing has_permission() PostgreSQL function (defined in earlier migration)
-- which checks auth.jwt() -> 'permissions' and tenant_role = 'super_admin'

CREATE POLICY "inv_select" ON inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_insert" ON inventory_items FOR INSERT TO authenticated WITH CHECK (has_permission('menu:edit'));
CREATE POLICY "inv_update" ON inventory_items FOR UPDATE TO authenticated USING (has_permission('menu:edit')) WITH CHECK (has_permission('menu:edit'));
CREATE POLICY "inv_delete" ON inventory_items FOR DELETE TO authenticated USING (has_permission('menu:edit'));

CREATE POLICY "ing_select" ON menu_item_ingredients FOR SELECT TO authenticated USING (true);
CREATE POLICY "ing_insert" ON menu_item_ingredients FOR INSERT TO authenticated WITH CHECK (has_permission('menu:edit'));
CREATE POLICY "ing_update" ON menu_item_ingredients FOR UPDATE TO authenticated USING (has_permission('menu:edit')) WITH CHECK (has_permission('menu:edit'));
CREATE POLICY "ing_delete" ON menu_item_ingredients FOR DELETE TO authenticated USING (has_permission('menu:edit'));
