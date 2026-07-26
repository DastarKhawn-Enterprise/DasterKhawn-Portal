-- 025_service_charge_orders.sql
-- Add service_charge_amount column to orders table

ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge_amount numeric default 0;
