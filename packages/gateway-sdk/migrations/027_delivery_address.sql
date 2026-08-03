-- 027_delivery_address.sql
-- Adds delivery address to orders; re-asserts drive-thru vehicle columns (014)
-- for tenants provisioned before that migration existed.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle_type text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle_plate_number text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address text;
