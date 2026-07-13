-- 010_expenses_schema.sql
CREATE TABLE IF NOT EXISTS expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('electricity','rent','salaries','repairs','purchases','other')),
  description text,
  amount numeric not null,
  expense_date date not null default current_date,
  created_by text,
  created_at timestamptz default now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exp_select" ON expenses FOR SELECT TO authenticated USING (has_permission('reports:view') OR has_permission('settings:edit'));
CREATE POLICY "exp_insert" ON expenses FOR INSERT TO authenticated WITH CHECK (has_permission('settings:edit'));
CREATE POLICY "exp_update" ON expenses FOR UPDATE TO authenticated USING (has_permission('settings:edit')) WITH CHECK (has_permission('settings:edit'));
CREATE POLICY "exp_delete" ON expenses FOR DELETE TO authenticated USING (has_permission('settings:edit'));
