-- 012_add_enabled_modules.sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS enabled_modules jsonb NOT NULL DEFAULT '{
  "dashboard": true, "orders": true, "dine_in": true, "take_away": true,
  "delivery": true, "drive_thru": true, "third_party": true,
  "reservations": true, "menu": true, "inventory": true,
  "customers": true, "reports": true, "expenses": true, "staff": true,
  "settings": true, "loyalty_points": true
}'::jsonb;
