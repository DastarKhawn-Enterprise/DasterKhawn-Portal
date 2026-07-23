-- 019_restaurant_settings.sql
-- Extends settings table with full restaurant configuration
-- Creates branches table for multi-branch support

-- ── BRANCHES ──
CREATE TABLE IF NOT EXISTS branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  province text,
  postal_code text,
  country text default 'Pakistan',
  phone text,
  email text,
  is_default boolean default false,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  updated_by text
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- ── EXTEND SETTINGS ──
ALTER TABLE settings ADD COLUMN IF NOT EXISTS restaurant_name text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS restaurant_type text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_language text default 'en';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS timezone text default 'Asia/Karachi';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS date_format text default 'DD/MM/YYYY';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS time_format text default '12h';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_landing_page text default 'dashboard';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS dark_mode boolean default false;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS secondary_phone text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS additional_emails text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS website text;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS business_type text;
ALTER TABLE IF EXISTS settings ADD COLUMN IF NOT EXISTS ntn text;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS strn_number text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS fbr_status text default 'not_registered';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS registration_date date;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS pos_integration_id text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS fiscal_invoice_prefix text;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS tagline text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS tax_name text default 'Tax';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS tax_inclusive boolean default false;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS service_charge_enabled boolean default false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS service_charge_name text default 'Service Charge';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS service_charge_rate numeric default 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS service_charge_dine_in boolean default true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS service_charge_takeaway boolean default false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS service_charge_delivery boolean default false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS service_charge_drive_thru boolean default false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS tax_service_charge boolean default false;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_header text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_logo boolean default true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_branch_address boolean default true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_phone boolean default true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_ntn boolean default true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_cashier_name boolean default true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_payment_method boolean default true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_tax_breakdown boolean default true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_service_charge boolean default true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS thank_you_message text default 'Thank you for your visit!';

ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_order_status text default 'pending';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_send_to_kitchen boolean default true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS require_customer_delivery boolean default true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS require_customer_credit boolean default true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS allow_edit_before_payment boolean default true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS allow_edit_after_payment boolean default false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_print_receipt boolean default false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_payment_method text default 'cash';

ALTER TABLE settings ADD COLUMN IF NOT EXISTS low_stock_alerts boolean default true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_low_stock_threshold numeric default 10;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS allow_negative_stock boolean default false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_deduct_ingredients boolean default true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS write_item_ledger boolean default true;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS updated_by text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS updated_at timestamptz default now();

-- ── BUSINESS HOURS (separate table) ──
CREATE TABLE IF NOT EXISTS business_hours (
  id uuid primary key default gen_random_uuid(),
  day_of_week integer not null check (day_of_week between 0 and 6),
  open_time time,
  close_time time,
  is_closed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(day_of_week)
);

ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;

-- Seed default business hours (Mon-Sat 9:00-22:00, Sun closed)
INSERT INTO business_hours (day_of_week, open_time, close_time, is_closed)
SELECT * FROM (VALUES
  (0, NULL, NULL, true),
  (1, '09:00'::time, '22:00'::time, false),
  (2, '09:00'::time, '22:00'::time, false),
  (3, '09:00'::time, '22:00'::time, false),
  (4, '09:00'::time, '22:00'::time, false),
  (5, '09:00'::time, '22:00'::time, false),
  (6, '09:00'::time, '22:00'::time, false)
) AS v(day_of_week, open_time, close_time, is_closed)
WHERE NOT EXISTS (SELECT 1 FROM business_hours LIMIT 1);

-- ── RLS: allow all authenticated users to read, only super_admin/staff can write ──
CREATE POLICY "settings_read_all" ON settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_write_staff" ON settings FOR ALL TO authenticated
  USING (has_permission('settings:edit') OR has_permission('menu:edit'))
  WITH CHECK (has_permission('settings:edit') OR has_permission('menu:edit'));

CREATE POLICY "branches_read_all" ON branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "branches_write_staff" ON branches FOR ALL TO authenticated
  USING (has_permission('settings:edit'))
  WITH CHECK (has_permission('settings:edit'));

CREATE POLICY "business_hours_read_all" ON business_hours FOR SELECT TO authenticated USING (true);
CREATE POLICY "business_hours_write_staff" ON business_hours FOR ALL TO authenticated
  USING (has_permission('settings:edit'))
  WITH CHECK (has_permission('settings:edit'));
