-- Add metadata JSONB column to staff_roles for extended staff info
-- Stores: phone, employment_status, login_enabled, leave dates, audit trail
ALTER TABLE staff_roles ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
