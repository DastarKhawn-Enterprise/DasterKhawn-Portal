-- 030_staff_branches.sql
-- Per-tenant branch-user mapping (branch assignment for staff).
-- Run manually on each tenant database (same pattern as earlier migrations).
-- The authoritative user<->tenant mapping lives in the gateway `staff_roles` table;
-- this table adds the branch assignment that lives inside the brand's own Supabase.

-- NOTE: `branch_id` intentionally has NO foreign key to `branches`. That table may not
-- exist yet in every tenant (it comes from migration 019), so keeping this table
-- self-contained lets it be applied safely on any tenant, in any order.
CREATE TABLE IF NOT EXISTS staff_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  tenant_id uuid,
  branch_id uuid,
  assigned_at timestamptz DEFAULT now(),
  created_by text,
  UNIQUE (clerk_user_id, branch_id)
);

ALTER TABLE staff_branches ENABLE ROW LEVEL SECURITY;

-- Create policies only when the tenant's RLS helper has_permission() exists,
-- so this migration never fails on tenants where that migration hasn't been applied.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'has_permission' AND n.nspname = 'public'
  ) THEN
    EXECUTE 'CREATE POLICY "sb_read" ON staff_branches FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "sb_insert" ON staff_branches FOR INSERT TO authenticated WITH CHECK (has_permission(''staff:manage''))';
    EXECUTE 'CREATE POLICY "sb_update" ON staff_branches FOR UPDATE TO authenticated USING (has_permission(''staff:manage''))';
    EXECUTE 'CREATE POLICY "sb_delete" ON staff_branches FOR DELETE TO authenticated USING (has_permission(''staff:manage''))';
  END IF;
END $$;