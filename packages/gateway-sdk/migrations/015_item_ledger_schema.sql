-- 015_item_ledger_schema.sql
CREATE TABLE IF NOT EXISTS item_ledger (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid references inventory_items(id) on delete cascade,
  movement_type text not null check (movement_type in ('purchase', 'sale', 'adjustment', 'wastage')),
  quantity_change numeric not null,
  unit_cost numeric,
  total_cost numeric,
  reference_order_id uuid references orders(id),
  vendor text,
  notes text,
  created_by text,
  created_at timestamptz default now()
);

ALTER TABLE item_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "il_select" ON item_ledger FOR SELECT TO authenticated USING (true);
CREATE POLICY "il_insert" ON item_ledger FOR INSERT TO authenticated WITH CHECK (has_permission('menu:edit'));
