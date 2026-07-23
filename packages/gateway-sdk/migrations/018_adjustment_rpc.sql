-- 018_adjustment_rpc.sql
-- Atomic account adjustment RPC + metadata column for audit trail.

ALTER TABLE account_transactions ADD COLUMN IF NOT EXISTS metadata jsonb;

CREATE OR REPLACE FUNCTION process_adjustment(
  p_account_id uuid,
  p_adjustment_type text,
  p_amount numeric,
  p_target_balance numeric DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_reference_number text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_adjustment_date timestamptz DEFAULT now(),
  p_created_by text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_account accounts%ROWTYPE;
  v_direction text;
  v_amount numeric;
  v_new_balance numeric;
  v_old_balance numeric;
  v_txn_id uuid;
BEGIN
  IF p_idempotency_key IS NOT NULL AND p_idempotency_key != '' THEN
    IF EXISTS (SELECT 1 FROM account_transactions WHERE reference_number = p_idempotency_key AND transaction_type = 'adjustment') THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true);
    END IF;
  END IF;

  SELECT * INTO v_account FROM accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account not found');
  END IF;

  IF NOT v_account.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account is inactive');
  END IF;

  v_old_balance := v_account.current_balance;

  IF p_adjustment_type = 'increase' THEN
    IF p_amount IS NULL OR p_amount <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than zero');
    END IF;
    v_amount := p_amount;
    v_direction := 'credit';
    v_new_balance := v_old_balance + v_amount;
  ELSIF p_adjustment_type = 'decrease' THEN
    IF p_amount IS NULL OR p_amount <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than zero');
    END IF;
    v_amount := p_amount;
    v_direction := 'debit';
    v_new_balance := v_old_balance - v_amount;
    IF v_new_balance < 0 AND v_account.account_type NOT IN ('credit', 'expense') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance. Current: ' || v_old_balance);
    END IF;
  ELSIF p_adjustment_type = 'set_exact' THEN
    IF p_target_balance IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Target balance is required');
    END IF;
    IF p_target_balance = v_old_balance THEN
      RETURN jsonb_build_object('success', false, 'error', 'No adjustment required — current balance already matches target');
    END IF;
    v_amount := ABS(p_target_balance - v_old_balance);
    IF p_target_balance > v_old_balance THEN
      v_direction := 'credit';
      v_new_balance := p_target_balance;
    ELSE
      v_direction := 'debit';
      v_new_balance := p_target_balance;
      IF v_new_balance < 0 AND v_account.account_type NOT IN ('credit', 'expense') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target balance is negative but account type does not allow negative balances');
      END IF;
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid adjustment type');
  END IF;

  INSERT INTO account_transactions (
    account_id, transaction_type, direction, amount,
    balance_before, balance_after, reference_number, description,
    created_by, metadata, created_at
  ) VALUES (
    p_account_id, 'adjustment', v_direction, v_amount,
    v_old_balance, v_new_balance,
    COALESCE(p_reference_number, p_idempotency_key),
    p_reason,
    p_created_by,
    jsonb_build_object(
      'adjustment_mode', p_adjustment_type,
      'reason', p_reason,
      'target_balance', p_target_balance,
      'notes', p_notes
    ),
    COALESCE(p_adjustment_date, now())
  ) RETURNING id INTO v_txn_id;

  UPDATE accounts SET current_balance = v_new_balance WHERE id = p_account_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_txn_id,
    'account_id', p_account_id,
    'amount', v_amount,
    'direction', v_direction,
    'balance_before', v_old_balance,
    'balance_after', v_new_balance,
    'adjustment_type', p_adjustment_type
  );
END;
$$;
