-- 026_unique_order_number.sql
-- Enforce uniqueness on order_number to guarantee the 4-digit random numbers never collide
-- (works because existing serial values 1..N are already unique, and all new orders set order_number explicitly)

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_order_number ON orders(order_number);
