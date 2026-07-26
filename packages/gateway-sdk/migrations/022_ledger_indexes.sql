-- 022_ledger_indexes.sql
-- Performance indexes for ledger tables (item_ledger, account_transactions)

-- item_ledger: daily date-range queries ordered by created_at DESC (ItemLedgerView)
CREATE INDEX IF NOT EXISTS idx_item_ledger_created_at ON item_ledger(created_at DESC);

-- item_ledger: per-item queries for running balance computation
CREATE INDEX IF NOT EXISTS idx_item_ledger_inventory_item_id ON item_ledger(inventory_item_id);

-- account_transactions: per-account queries ordered by created_at DESC (AccountsView ledger)
CREATE INDEX IF NOT EXISTS idx_atx_account_id_created_at ON account_transactions(account_id, created_at DESC);
