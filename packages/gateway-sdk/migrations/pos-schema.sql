-- =============================================================
-- POS Schema — per-tenant Supabase project
-- Run this against each tenant's Supabase project at onboarding.
-- =============================================================

-- WARNING: RLS policies below are TEMPORARY and permissive.
-- They allow ALL users (including anonymous) full access to all tables.
-- These MUST be replaced with role-based policies (owner/staff
-- with scoped permissions) before going to production.
-- See ARCHITECTURE.md §7 for the intended permission model.
-- =============================================================

-- 1. menu_items
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

-- TEMPORARY: permissive policy — REPLACE BEFORE PRODUCTION
CREATE POLICY "temp_public_all_access_menu_items"
  ON menu_items
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- 2. orders
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

-- TEMPORARY: permissive policy — REPLACE BEFORE PRODUCTION
CREATE POLICY "temp_public_all_access_orders"
  ON orders
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- 3. order_items
CREATE TABLE IF NOT EXISTS order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id),
  quantity integer not null default 1,
  price_at_order numeric not null,
  notes text
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- TEMPORARY: permissive policy — REPLACE BEFORE PRODUCTION
CREATE POLICY "temp_public_all_access_order_items"
  ON order_items
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
