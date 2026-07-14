-- 011_reservations_schema.sql
CREATE TABLE IF NOT EXISTS reservations (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null,
  guest_phone text,
  party_size integer not null default 2,
  reservation_date date not null,
  reservation_time time not null,
  table_id uuid references tables(id),
  status text not null default 'confirmed' check (status in ('confirmed','seated','cancelled','no_show')),
  notes text,
  created_at timestamptz default now()
);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "res_select" ON reservations FOR SELECT TO authenticated USING (true);
CREATE POLICY "res_insert" ON reservations FOR INSERT TO authenticated WITH CHECK (has_permission('orders:create') OR has_permission('orders:update'));
CREATE POLICY "res_update" ON reservations FOR UPDATE TO authenticated USING (has_permission('orders:create') OR has_permission('orders:update')) WITH CHECK (has_permission('orders:create') OR has_permission('orders:update'));
CREATE POLICY "res_delete" ON reservations FOR DELETE TO authenticated USING (has_permission('orders:create') OR has_permission('orders:update'));

ALTER PUBLICATION supabase_realtime ADD TABLE reservations;
