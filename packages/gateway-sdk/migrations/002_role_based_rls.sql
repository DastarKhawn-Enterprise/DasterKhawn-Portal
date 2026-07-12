-- =============================================================
-- Role-based RLS policies — per-tenant Supabase project
-- Run this AFTER configuring the Clerk JWT template (see below).
-- First, DROP the old temporary public policies created by pos-schema.sql.
-- =============================================================

-- =============================================================
-- PREREQUISITE: Clerk JWT Template Configuration
-- =============================================================
-- 1. In Clerk Dashboard → JWT Templates → "New template" → "Supabase"
-- 2. Use this mapping (the template name should be "supabase"):
--
--    {
--      "sub": "{{user.id}}",
--      "role": "authenticated",
--      "aud": "authenticated",
--      "email": "{{user.email_addresses[0].email_address}}",
--      "iat": "{{iat}}",
--      "exp": "{{exp}}",
--      "tenant_role": "{{user.public_metadata.role}}",
--      "permissions": "{{user.public_metadata.permissions}}"
--    }
--
-- 3. In Supabase Dashboard → Authentication → Settings
--    Set JWT secret to your Clerk JWKS URL:
--    https://<your-clerk-domain>.clerk.accounts.dev/.well-known/jwks.json
--    (Replace <your-clerk-domain> with your actual Clerk domain, e.g. "sin cere-kingfish-72")
-- 4. Save. Existing tokens will continue to work; new tokens will include the custom claims.
--
-- The RLS policies below use auth.jwt() to read the "tenant_role" and "permissions"
-- claims injected by the Clerk template.
-- =============================================================

-- =============================================================
-- Drop temporary public policies
-- =============================================================

DROP POLICY IF EXISTS "temp_public_all_access_menu_items" ON menu_items;
DROP POLICY IF EXISTS "temp_public_all_access_orders" ON orders;
DROP POLICY IF EXISTS "temp_public_all_access_order_items" ON order_items;

-- =============================================================
-- Helper: check if the JWT has a given permission
-- =============================================================

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

-- =============================================================
-- menu_items
-- =============================================================

-- Any authenticated user with a valid tenant_role can read
CREATE POLICY "auth_menu_select"
  ON menu_items
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() ->> 'tenant_role' IS NOT NULL
  );

-- Only users with menu:edit permission can insert, update, delete
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

-- =============================================================
-- orders
-- =============================================================

CREATE POLICY "auth_orders_select"
  ON orders
  FOR SELECT
  TO authenticated
  USING (
    has_permission('orders:view') OR has_permission('orders:create')
  );

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

-- =============================================================
-- order_items
-- =============================================================

CREATE POLICY "auth_order_items_select"
  ON order_items
  FOR SELECT
  TO authenticated
  USING (
    has_permission('orders:view') OR has_permission('orders:create')
  );

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
