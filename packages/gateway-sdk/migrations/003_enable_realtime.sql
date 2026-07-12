-- =============================================================
-- Enable Supabase Realtime for kitchen order tracking
-- Run this against each tenant's Supabase project.
-- =============================================================

-- Add orders table to the realtime publication so INSERT/UPDATE
-- events are broadcast to subscribed clients (kitchen view).
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
