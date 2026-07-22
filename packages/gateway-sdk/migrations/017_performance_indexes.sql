-- 017_performance_indexes.sql
-- Performance indexes for common query patterns across all tables.

-- accounts: PaymentModal filters is_active=true and sorts by name
CREATE INDEX IF NOT EXISTS idx_accounts_is_active ON accounts(is_active) WHERE is_active = true;

-- orders: DashboardView filters completed+today range, CurrentOrdersView sorts by created_at
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- order_items: FK lookups (order detail, most-ordered aggregation)
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items(menu_item_id);

-- expenses: FK lookups from accounts module
CREATE INDEX IF NOT EXISTS idx_expenses_account_id ON expenses(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at DESC);

-- customers: search by name or phone (used in CurrentOrdersView checkout)
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- menu_items: filter by category, sort by name
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category) WHERE category IS NOT NULL;
