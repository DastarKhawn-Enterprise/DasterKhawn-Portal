-- 023_discount_notes_orders.sql
-- Add discount and notes columns to orders table

ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount numeric default 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_type text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_value numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes text;
