-- 029_order_edit_delta.sql
-- Delta-based inventory movement for EXISTING order modifications.
-- Run manually on each tenant database (same as the earlier migration pattern).

-- 1) Allow order-edit movement types in item_ledger
ALTER TABLE item_ledger DROP CONSTRAINT IF EXISTS item_ledger_movement_type_check;
ALTER TABLE item_ledger ADD CONSTRAINT item_ledger_movement_type_check
  CHECK (movement_type IN ('purchase','sale','adjustment','wastage','ORDER_EDIT_ADD','ORDER_EDIT_REMOVE'));

-- 2) Extend item_ledger with tenant/branch/menu/qty-before-after/edit-history columns
ALTER TABLE item_ledger
  ADD COLUMN IF NOT EXISTS tenant_id text,
  ADD COLUMN IF NOT EXISTS branch_id text,
  ADD COLUMN IF NOT EXISTS menu_item_id uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity_before numeric,
  ADD COLUMN IF NOT EXISTS quantity_after numeric,
  ADD COLUMN IF NOT EXISTS edit_history_id uuid;

-- 3) Order edit history table (Order ID, Edited By, Edited At, Items Added,
--    Items Removed, Inventory Delta, Ledger Reference)
CREATE TABLE IF NOT EXISTS order_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  action text NOT NULL DEFAULT 'edit',
  branch_id text,
  edited_by text,
  edited_at timestamptz DEFAULT now(),
  items_added jsonb NOT NULL DEFAULT '[]'::jsonb,
  items_removed jsonb NOT NULL DEFAULT '[]'::jsonb,
  inventory_delta jsonb NOT NULL DEFAULT '[]'::jsonb,
  ledger_reference jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE order_edit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oeh_select" ON order_edit_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "oeh_insert" ON order_edit_history FOR INSERT TO authenticated WITH CHECK (has_permission('menu:edit'));
CREATE POLICY "oeh_update" ON order_edit_history FOR UPDATE TO authenticated USING (has_permission('menu:edit'));