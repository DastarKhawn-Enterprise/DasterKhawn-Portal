-- 024_invoice_number.sql
-- Add invoice_number column to orders for invoice generation at payment time

ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_number text;
CREATE INDEX IF NOT EXISTS idx_orders_invoice_number ON orders(invoice_number);
