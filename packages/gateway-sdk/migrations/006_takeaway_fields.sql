-- =============================================================
-- Take Away / Order Type fields
-- Adds order_type, customer fields to orders table.
-- =============================================================

-- 1. Add new columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type text DEFAULT 'dine_in';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_time timestamptz;

-- 2. Add check constraint for order_type
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('dine_in', 'takeaway', 'delivery', 'drive_thru', 'third_party'));

-- 3. Retroactively classify existing orders
--    Orders with a table_id are dine_in; all others are takeaway.
UPDATE orders SET order_type = 'dine_in'  WHERE order_type IS NULL AND table_id IS NOT NULL;
UPDATE orders SET order_type = 'takeaway' WHERE order_type IS NULL;
