-- 031_inventory_ledger.sql
-- Inventory Ledger v2: unified movement types, generic reference, branch attribution.
-- Run manually on each tenant database (same pattern as earlier migrations).

-- 1) Extend movement_type CHECK with purchase_return / sale_cancelled / transfer / opening_balance.
--    Keeps the legacy ORDER_EDIT_* (uppercase) values intact for historical rows.
ALTER TABLE item_ledger DROP CONSTRAINT IF EXISTS item_ledger_movement_type_check;
ALTER TABLE item_ledger ADD CONSTRAINT item_ledger_movement_type_check
  CHECK (
    movement_type IN (
      'purchase',
      'purchase_return',
      'sale',
      'sale_cancelled',
      'ORDER_EDIT_ADD',
      'ORDER_EDIT_REMOVE',
      'adjustment',
      'wastage',
      'transfer',
      'opening_balance'
    )
  );

-- 2) Human-friendly reference token (e.g. purchase number) + optional branch display name.
ALTER TABLE item_ledger
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS branch_name text;

-- 3) Per-item history reads are the hot path for the redesigned Inventory Ledger (expandable rows).
CREATE INDEX IF NOT EXISTS idx_item_ledger_item_created
  ON item_ledger(inventory_item_id, created_at DESC);