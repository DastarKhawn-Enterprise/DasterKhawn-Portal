-- =============================================================
-- Gateway Schema — SAT SYS control plane
-- Run this against the gateway Supabase project.
-- Stores tenant metadata, staff roles, and billing info only.
-- No POS business data lives here.
-- =============================================================

-- 1. tenants: one row per brand/POS instance
CREATE TABLE IF NOT EXISTS tenants (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  brand_name        text not null,
  owner_clerk_id    text not null,
  supabase_url      text not null,
  supabase_anon_key text not null,
  supabase_service_key text not null,
  status            text not null default 'active',
  theme_config      jsonb default '{}',
  created_at        timestamptz default now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Only super admins (service role) should manage tenants
CREATE POLICY "service_role_only_tenants"
  ON tenants
  USING (true)
  WITH CHECK (true);

-- 2. staff_roles: who belongs to which tenant, with what permissions
CREATE TABLE IF NOT EXISTS staff_roles (
  id              uuid primary key default gen_random_uuid(),
  clerk_user_id   text not null,
  tenant_id       uuid references tenants(id),
  role            text not null,
  permissions     text[] default '{}',
  created_at      timestamptz default now()
);

ALTER TABLE staff_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_staff_roles"
  ON staff_roles
  USING (true)
  WITH CHECK (true);

-- 3. billing: payment tracking per tenant
CREATE TABLE IF NOT EXISTS billing (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id),
  payment_status  text not null default 'unpaid',
  last_paid_at    timestamptz,
  due_date        date,
  amount_due      numeric
);

ALTER TABLE billing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_billing"
  ON billing
  USING (true)
  WITH CHECK (true);
