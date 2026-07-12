-- =============================================================
-- Dine In Module — tables table + RLS
-- Run this against the per-tenant Supabase project.
-- =============================================================

-- 1. tables
CREATE TABLE IF NOT EXISTS tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number text NOT NULL,
  capacity integer NOT NULL DEFAULT 4,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved')),
  current_order_id uuid REFERENCES orders(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tables ENABLE ROW LEVEL SECURITY;

-- 2. Add table_id to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES tables(id);

-- 3. Enable Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE tables;

-- 4. RLS policies

-- SELECT: any authenticated user with a tenant_role
CREATE POLICY "auth_tables_select"
  ON tables
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() ->> 'tenant_role' IS NOT NULL
  );

-- INSERT: orders:create permission
CREATE POLICY "auth_tables_insert"
  ON tables
  FOR INSERT
  TO authenticated
  WITH CHECK (has_permission('orders:create'));

-- UPDATE: orders:create or orders:update permission
CREATE POLICY "auth_tables_update"
  ON tables
  FOR UPDATE
  TO authenticated
  USING (has_permission('orders:create') OR has_permission('orders:update'))
  WITH CHECK (has_permission('orders:create') OR has_permission('orders:update'));
