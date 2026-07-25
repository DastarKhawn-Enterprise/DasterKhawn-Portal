-- 020_customer_status_and_indexes.sql
-- Adds status tracking, last_order_date, and performance indexes for customers

ALTER TABLE customers ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_order_date timestamptz;

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id_status ON orders(customer_id, status);
