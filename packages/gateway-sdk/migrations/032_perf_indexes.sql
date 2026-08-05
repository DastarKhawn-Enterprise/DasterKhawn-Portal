-- Performance: add indexes for frequently-filtered / frequently-joined columns.
-- Additive only, fully guarded: every index is created ONLY IF its table and all its
-- referenced columns exist. Safe to run on any tenant regardless of schema drift.
-- Run in the tenant database (Supabase SQL editor) for existing tenants; new tenants
-- created via the Super Admin dashboard run this automatically.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='orders')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='status')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON orders (status, created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='order_type')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_orders_order_type_created ON orders (order_type, created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='branch_id') THEN
    CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON orders (branch_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='customer_id') THEN
    CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders (customer_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='order_items')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='order_id') THEN
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='menu_item_id') THEN
    CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items (menu_item_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='payments')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='order_id') THEN
    CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments (order_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments (created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='item_ledger')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='item_ledger' AND column_name='inventory_item_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='item_ledger' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_item_ledger_item_created ON item_ledger (inventory_item_id, created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='item_ledger' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_item_ledger_created_at ON item_ledger (created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='inventory_transactions')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_transactions' AND column_name='inventory_item_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_transactions' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item_created ON inventory_transactions (inventory_item_id, created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='customers')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='phone') THEN
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='name') THEN
    CREATE INDEX IF NOT EXISTS idx_customers_lower_name ON customers (lower(name));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers (created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='reservations')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reservations' AND column_name='reservation_date')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reservations' AND column_name='status') THEN
    CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations (reservation_date, status);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='menu_items')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='menu_items' AND column_name='category') THEN
    CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items (category);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='staff_roles')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='staff_roles' AND column_name='clerk_user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_staff_roles_clerk ON staff_roles (clerk_user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='account_transactions')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='account_transactions' AND column_name='account_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='account_transactions' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_account_transactions_account_created ON account_transactions (account_id, created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='account_transactions' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_account_transactions_created_at ON account_transactions (created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='expenses')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses (created_at DESC);
  END IF;
END $$;