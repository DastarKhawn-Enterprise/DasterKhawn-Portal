-- 016_accounts_schema.sql
-- Accounts, Payments, Account Transactions for per-tenant financial ledger.

-- 1. ACCOUNTS
CREATE TABLE IF NOT EXISTS accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_type text not null check (account_type in ('cash','bank','mobile_wallet','card','credit','other')),
  payment_method text not null check (payment_method in ('cash','jazzcash','easypaisa','bank_transfer','card','credit','split','other')),
  institution_name text,
  account_number_masked text,
  opening_balance numeric not null default 0,
  current_balance numeric not null default 0,
  currency text not null default 'PKR',
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_select" ON accounts FOR SELECT TO authenticated USING (has_permission('accounts:view') OR has_permission('orders:create'));
CREATE POLICY "acc_insert" ON accounts FOR INSERT TO authenticated WITH CHECK (has_permission('accounts:manage'));
CREATE POLICY "acc_update" ON accounts FOR UPDATE TO authenticated USING (has_permission('accounts:manage')) WITH CHECK (has_permission('accounts:manage'));

-- 2. PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  customer_id uuid references customers(id),
  account_id uuid references accounts(id),
  payment_method text not null check (payment_method in ('cash','jazzcash','easypaisa','bank_transfer','card','credit','split','other')),
  amount numeric not null,
  cash_received numeric,
  change_due numeric,
  reference_number text,
  status text not null default 'completed' check (status in ('completed','refunded')),
  idempotency_key text,
  notes text,
  created_by text,
  created_at timestamptz default now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pay_select" ON payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "pay_insert" ON payments FOR INSERT TO authenticated WITH CHECK (has_permission('orders:create'));
CREATE POLICY "pay_update" ON payments FOR UPDATE TO authenticated USING (has_permission('accounts:manage')) WITH CHECK (has_permission('accounts:manage'));

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_account_id ON payments(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency_key ON payments(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 3. ACCOUNT TRANSACTIONS
CREATE TABLE IF NOT EXISTS account_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id),
  payment_id uuid references payments(id),
  order_id uuid references orders(id),
  expense_id uuid references expenses(id),
  customer_id uuid references customers(id),
  transaction_type text not null check (transaction_type in ('sale','expense','income','transfer_in','transfer_out','refund','adjustment','opening_balance','credit_sale','credit_payment')),
  direction text not null check (direction in ('credit','debit')),
  amount numeric not null,
  balance_before numeric not null,
  balance_after numeric not null,
  reference_number text,
  description text,
  created_by text,
  created_at timestamptz default now()
);

ALTER TABLE account_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "atx_select" ON account_transactions FOR SELECT TO authenticated USING (has_permission('accounts:view') OR has_permission('orders:create'));
CREATE POLICY "atx_insert" ON account_transactions FOR INSERT TO authenticated WITH CHECK (has_permission('accounts:manage') OR has_permission('orders:create'));

CREATE INDEX IF NOT EXISTS idx_atx_account_id ON account_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_atx_order_id ON account_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_atx_expense_id ON account_transactions(expense_id);
CREATE INDEX IF NOT EXISTS idx_atx_created_at ON account_transactions(created_at DESC);

-- 4. Order payment columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text default 'unpaid' check (payment_status in ('unpaid','partially_paid','paid','refunded'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_paid numeric default 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_due numeric default 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS primary_payment_method text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS change_due numeric default 0;

-- 5. Seed zero-balance accounts
INSERT INTO accounts (name, account_type, payment_method, is_default)
SELECT * FROM (VALUES
  ('Cash in Hand', 'cash', 'cash', true),
  ('JazzCash Wallet', 'mobile_wallet', 'jazzcash', false),
  ('Easypaisa Wallet', 'mobile_wallet', 'easypaisa', false),
  ('Bank Account', 'bank', 'bank_transfer', false),
  ('Card Account', 'card', 'card', false),
  ('Customer Credit Account', 'credit', 'credit', false)
) AS v(name, account_type, payment_method, is_default)
WHERE NOT EXISTS (SELECT 1 FROM accounts LIMIT 1);

-- 6. Atomic payment processing RPC
CREATE OR REPLACE FUNCTION process_payments(
  p_order_id uuid,
  p_payments jsonb,
  p_created_by text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_payment jsonb;
  v_account accounts%ROWTYPE;
  v_total_paid numeric := 0;
  v_payment_id uuid;
  v_transaction_id uuid;
  v_new_balance numeric;
  v_old_balance numeric;
  v_results jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is already paid');
  END IF;

  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    SELECT * INTO v_account FROM accounts WHERE id = (v_payment->>'account_id')::uuid AND is_active = true;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Account not found or inactive: ' || coalesce(v_payment->>'account_id', 'null'));
    END IF;

    IF v_payment->>'idempotency_key' IS NOT NULL AND v_payment->>'idempotency_key' != '' THEN
      IF EXISTS (SELECT 1 FROM payments WHERE idempotency_key = v_payment->>'idempotency_key') THEN
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO payments (order_id, customer_id, account_id, payment_method, amount, cash_received, change_due, reference_number, notes, created_by, idempotency_key)
    VALUES (
      p_order_id,
      (v_payment->>'customer_id')::uuid,
      v_account.id,
      COALESCE(v_payment->>'payment_method', v_account.payment_method),
      (v_payment->>'amount')::numeric,
      (v_payment->>'cash_received')::numeric,
      (v_payment->>'change_due')::numeric,
      v_payment->>'reference_number',
      v_payment->>'notes',
      p_created_by,
      v_payment->>'idempotency_key'
    )
    RETURNING id INTO v_payment_id;

    v_old_balance := v_account.current_balance;

    IF (v_payment->>'payment_method') = 'credit' THEN
      v_new_balance := v_old_balance + (v_payment->>'amount')::numeric;
      UPDATE accounts SET current_balance = v_new_balance WHERE id = v_account.id;
      INSERT INTO account_transactions (account_id, payment_id, order_id, transaction_type, direction, amount, balance_before, balance_after, reference_number, description, created_by)
      VALUES (v_account.id, v_payment_id, p_order_id, 'credit_sale', 'credit', (v_payment->>'amount')::numeric, v_old_balance, v_new_balance, v_payment->>'reference_number', 'Credit sale - ' || COALESCE(v_payment->>'notes', ''), p_created_by)
      RETURNING id INTO v_transaction_id;
    ELSE
      v_new_balance := v_old_balance + (v_payment->>'amount')::numeric;
      UPDATE accounts SET current_balance = v_new_balance WHERE id = v_account.id;
      INSERT INTO account_transactions (account_id, payment_id, order_id, transaction_type, direction, amount, balance_before, balance_after, reference_number, description, created_by)
      VALUES (v_account.id, v_payment_id, p_order_id, 'sale', 'credit', (v_payment->>'amount')::numeric, v_old_balance, v_new_balance, v_payment->>'reference_number', 'Sale - ' || COALESCE(v_payment->>'notes', ''), p_created_by)
      RETURNING id INTO v_transaction_id;
    END IF;

    v_total_paid := v_total_paid + (v_payment->>'amount')::numeric;

    v_results := v_results || jsonb_build_object(
      'payment_id', v_payment_id,
      'transaction_id', v_transaction_id,
      'account_id', v_account.id,
      'amount', (v_payment->>'amount')::numeric
    );
  END LOOP;

  UPDATE orders SET
    amount_paid = COALESCE(amount_paid, 0) + v_total_paid,
    amount_due = GREATEST(total - (COALESCE(amount_paid, 0) + v_total_paid), 0),
    payment_status = CASE
      WHEN (COALESCE(amount_paid, 0) + v_total_paid) >= total THEN 'paid'
      WHEN (COALESCE(amount_paid, 0) + v_total_paid) > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END,
    primary_payment_method = CASE
      WHEN (SELECT count(*) FROM jsonb_array_elements(p_payments)) = 1 THEN p_payments->0->>'payment_method'
      ELSE 'split'
    END,
    paid_at = CASE
      WHEN (COALESCE(amount_paid, 0) + v_total_paid) >= total THEN now()
      ELSE paid_at
    END,
    change_due = COALESCE(change_due, 0) + COALESCE(
      (SELECT SUM(COALESCE((p->>'change_due')::numeric, 0)) FROM jsonb_array_elements(p_payments) AS p), 0
    )
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'payments', v_results, 'total_paid', v_total_paid);
END;
$$;

-- 7. Atomic expense posting RPC
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id);

CREATE OR REPLACE FUNCTION process_expense(
  p_account_id uuid,
  p_category text,
  p_description text,
  p_amount numeric,
  p_expense_date date,
  p_created_by text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_account accounts%ROWTYPE;
  v_expense_id uuid;
  v_new_balance numeric;
  v_old_balance numeric;
BEGIN
  SELECT * INTO v_account FROM accounts WHERE id = p_account_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account not found or inactive');
  END IF;

  IF v_account.current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance in ' || v_account.name);
  END IF;

  INSERT INTO expenses (category, description, amount, expense_date, created_by, account_id)
  VALUES (p_category, p_description, p_amount, p_expense_date, p_created_by, p_account_id)
  RETURNING id INTO v_expense_id;

  v_old_balance := v_account.current_balance;
  v_new_balance := v_old_balance - p_amount;
  UPDATE accounts SET current_balance = v_new_balance WHERE id = v_account.id;

  INSERT INTO account_transactions (account_id, expense_id, transaction_type, direction, amount, balance_before, balance_after, description, created_by)
  VALUES (v_account.id, v_expense_id, 'expense', 'debit', p_amount, v_old_balance, v_new_balance, 'Expense: ' || COALESCE(p_description, p_category), p_created_by);

  RETURN jsonb_build_object('success', true, 'expense_id', v_expense_id, 'account_id', p_account_id);
END;
$$;

-- 8. Transfer RPC
CREATE OR REPLACE FUNCTION process_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_reference_number text,
  p_description text,
  p_created_by text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_from accounts%ROWTYPE;
  v_to accounts%ROWTYPE;
  v_from_new numeric;
  v_to_new numeric;
BEGIN
  SELECT * INTO v_from FROM accounts WHERE id = p_from_account_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Source account not found'); END IF;

  SELECT * INTO v_to FROM accounts WHERE id = p_to_account_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Destination account not found'); END IF;

  IF p_from_account_id = p_to_account_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to the same account');
  END IF;

  IF v_from.current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance in ' || v_from.name);
  END IF;

  v_from_new := v_from.current_balance - p_amount;
  UPDATE accounts SET current_balance = v_from_new WHERE id = v_from.id;

  v_to_new := v_to.current_balance + p_amount;
  UPDATE accounts SET current_balance = v_to_new WHERE id = v_to.id;

  INSERT INTO account_transactions (account_id, transaction_type, direction, amount, balance_before, balance_after, reference_number, description, created_by)
  VALUES (v_from.id, 'transfer_out', 'debit', p_amount, v_from.current_balance, v_from_new, p_reference_number, 'Transfer to ' || v_to.name || COALESCE(' - ' || p_description, ''), p_created_by);

  INSERT INTO account_transactions (account_id, transaction_type, direction, amount, balance_before, balance_after, reference_number, description, created_by)
  VALUES (v_to.id, 'transfer_in', 'credit', p_amount, v_to.current_balance, v_to_new, p_reference_number, 'Transfer from ' || v_from.name || COALESCE(' - ' || p_description, ''), p_created_by);

  RETURN jsonb_build_object('success', true, 'from_balance', v_from_new, 'to_balance', v_to_new);
END;
$$;

-- 9. Refund RPC
CREATE OR REPLACE FUNCTION process_refund(
  p_order_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_reason text,
  p_created_by text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_account accounts%ROWTYPE;
  v_new_balance numeric;
  v_payment_id uuid;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Order not found'); END IF;

  IF v_order.payment_status NOT IN ('paid', 'partially_paid') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not in a paid state');
  END IF;

  SELECT * INTO v_account FROM accounts WHERE id = p_account_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Account not found'); END IF;

  IF v_account.current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance in ' || v_account.name);
  END IF;

  v_new_balance := v_account.current_balance - p_amount;
  UPDATE accounts SET current_balance = v_new_balance WHERE id = v_account.id;

  INSERT INTO payments (order_id, account_id, payment_method, amount, status, notes, created_by)
  VALUES (p_order_id, v_account.id, v_order.primary_payment_method, p_amount, 'refunded', p_reason, p_created_by)
  RETURNING id INTO v_payment_id;

  INSERT INTO account_transactions (account_id, payment_id, order_id, transaction_type, direction, amount, balance_before, balance_after, description, created_by)
  VALUES (v_account.id, v_payment_id, p_order_id, 'refund', 'debit', p_amount, v_account.current_balance, v_new_balance, 'Refund for order #' || v_order.order_number || ' - ' || COALESCE(p_reason, ''), p_created_by);

  UPDATE orders SET
    payment_status = 'refunded',
    amount_paid = GREATEST(COALESCE(amount_paid, 0) - p_amount, 0),
    amount_due = total - GREATEST(COALESCE(amount_paid, 0) - p_amount, 0)
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id);
END;
$$;
