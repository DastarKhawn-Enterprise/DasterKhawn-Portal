-- 028_audit_logs.sql
-- Non-financial audit trail for user actions (e.g. invoice reprints).
-- Reprints must not create payments / invoices / ledger entries; they only
-- append an audit row so the event is traceable per tenant.

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  order_id uuid,
  order_number bigint,
  created_by text,
  device text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_order_id ON audit_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT TO authenticated USING (has_permission('orders:view') OR has_permission('reports:view'));
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT TO authenticated WITH CHECK (has_permission('orders:create'));