-- 007_settings_schema.sql
-- Single-row settings table per tenant
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

-- Add tax_amount column to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount numeric default 0;

-- Insert default settings row
INSERT INTO settings (tax_rate, tax_enabled, receipt_footer_text, currency_symbol)
VALUES (0, false, 'Thank you for your order!', '$');
