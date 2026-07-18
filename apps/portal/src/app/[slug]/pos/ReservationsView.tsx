'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { hasPermission } from './permissions';
import { supa } from './supa-query';

interface Props {
  slug: string;
  theme: ThemeConfig;
}

interface Reservation {
  id: string;
  guest_name: string;
  guest_phone: string | null;
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  table_id: string | null;
  status: 'confirmed' | 'seated' | 'cancelled' | 'no_show';
  notes: string | null;
  created_at: string;
  tables?: { table_number: string } | null;
}

interface TableRecord {
  id: string;
  table_number: string;
  capacity: number;
  status: string;
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmed', seated: 'Seated', cancelled: 'Cancelled', no_show: 'No Show',
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-blue-100 text-blue-700 border-blue-200',
  seated: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
  no_show: 'bg-gray-100 text-gray-500 border-gray-200',
};

type FilterMode = 'upcoming' | 'past' | 'all';

export default function ReservationsView({ slug, theme }: Props) {
  const { user, isLoaded } = useUser();
  const meta = user?.publicMetadata as Record<string, any> | undefined;
  const perms = (meta?.permissions ?? []) as string[];
  const role = (meta?.role ?? '') as string;
  const canEdit = hasPermission(perms, role, 'orders:create') || hasPermission(perms, role, 'orders:update');

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterMode, setFilterMode] = useState<FilterMode>('upcoming');

  const [showForm, setShowForm] = useState(false);
  const [editingRes, setEditingRes] = useState<Reservation | null>(null);
  const [formGuestName, setFormGuestName] = useState('');
  const [formGuestPhone, setFormGuestPhone] = useState('');
  const [formPartySize, setFormPartySize] = useState(2);
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formTableId, setFormTableId] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const [resResult, tablesResult] = await Promise.all([
        supa(slug, {
          table: 'reservations',
          select: '*, tables!left(table_number)',
          order: [
            { column: 'reservation_date', ascending: true },
            { column: 'reservation_time', ascending: true },
          ],
        }),
        supa(slug, { table: 'tables', select: 'id, table_number, capacity, status', order: 'table_number' }),
      ]);
      if (resResult.ok && resResult.data) setReservations(resResult.data as Reservation[]);
      if (tablesResult.ok && tablesResult.data) setTables(tablesResult.data as TableRecord[]);
    } catch (e) { console.error('[Reservations] fetch', e); }
    setLoading(false);
  }, [isLoaded, slug]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAddForm = () => {
    setEditingRes(null); setFormGuestName(''); setFormGuestPhone(''); setFormPartySize(2);
    setFormDate(new Date().toISOString().split('T')[0]); setFormTime(''); setFormTableId(''); setFormNotes('');
    setError(''); setShowForm(true);
  };

  const openEditForm = (res: Reservation) => {
    setEditingRes(res); setFormGuestName(res.guest_name); setFormGuestPhone(res.guest_phone || '');
    setFormPartySize(res.party_size); setFormDate(res.reservation_date); setFormTime(res.reservation_time);
    setFormTableId(res.table_id || ''); setFormNotes(res.notes || ''); setError(''); setShowForm(true);
  };

  const handleSave = async () => {
    if (!formGuestName.trim()) { setError('Guest name is required'); return; }
    if (!formDate) { setError('Date is required'); return; }
    if (!formTime) { setError('Time is required'); return; }
    setSaving(true); setError('');
    try {
      const payload: Record<string, unknown> = {
        guest_name: formGuestName.trim(), guest_phone: formGuestPhone.trim() || null,
        party_size: formPartySize, reservation_date: formDate, reservation_time: formTime,
        table_id: formTableId || null, notes: formNotes.trim() || null,
      };
      if (editingRes) {
        const result = await supa(slug, { table: 'reservations', method: 'update', eq: ['id', editingRes.id], body: payload });
        if (!result.ok) { setError(result.error); setSaving(false); return; }
        fetchData();
      } else {
        const result = await supa(slug, { table: 'reservations', method: 'insert', body: payload, single: true });
        if (!result.ok) { setError(result.error); setSaving(false); return; }
        if (result.data) {
          setReservations((prev) => [...prev, result.data as Reservation].sort(
            (a, b) => a.reservation_date.localeCompare(b.reservation_date) || a.reservation_time.localeCompare(b.reservation_time)
          ));
        }
      }
      setShowForm(false);
    } catch (e: any) { setError(e.message || 'Save failed'); }
    setSaving(false);
  };

  const handleStatusAction = async (res: Reservation, newStatus: Reservation['status']) => {
    setError('');
    try {
      const updates: Record<string, unknown> = { status: newStatus };
      if (newStatus === 'seated' && res.table_id) {
        await supa(slug, { table: 'tables', method: 'update', body: { status: 'occupied' }, eq: ['id', res.table_id] });
      }
      const result = await supa(slug, { table: 'reservations', method: 'update', body: updates, eq: ['id', res.id] });
      if (!result.ok) { setError(result.error); return; }
      fetchData();
    } catch (e: any) { setError(e.message || 'Status update failed'); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const result = await supa(slug, { table: 'reservations', method: 'delete', eq: ['id', deleteId] });
      if (!result.ok) { setError(result.error); setDeleting(false); return; }
      setReservations((prev) => prev.filter((r) => r.id !== deleteId));
      setDeleteId(null);
    } catch (e: any) { setError(e.message || 'Delete failed'); }
    setDeleting(false);
  };

  const today = new Date().toISOString().split('T')[0];
  const filteredReservations = reservations.filter((r) => {
    if (filterMode === 'upcoming' && filterDate) {
      const rDateTime = new Date(`${r.reservation_date}T${r.reservation_time}`);
      return rDateTime >= new Date(filterDate) && r.status === 'confirmed';
    }
    if (filterMode === 'past') {
      const rDate = new Date(r.reservation_date);
      return (rDate < new Date(filterDate || today) || r.status !== 'confirmed');
    }
    return true;
  });

  if (!isLoaded) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading...</p></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Reservations</h1>
          {canEdit && <button onClick={openAddForm} className="px-4 py-2 text-white rounded text-sm font-medium transition-colors" style={{ backgroundColor: theme.primaryColor }}>+ Add Reservation</button>}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1.5">
              {(['upcoming', 'past', 'all'] as FilterMode[]).map((m) => (
                <button key={m} onClick={() => setFilterMode(m)}
                  className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${filterMode === m ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  style={filterMode === m ? { backgroundColor: theme.primaryColor } : {}}>
                  {m === 'upcoming' ? 'Upcoming' : m === 'past' ? 'Past / Handled' : 'All'}
                </button>
              ))}
            </div>
            <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="px-3 py-1.5 text-xs border border-gray-300 rounded" />
            <button onClick={fetchData} disabled={loading} className="px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>{loading ? '...' : 'Refresh'}</button>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">{error}</div>}

        {loading ? (
          <p className="text-gray-400 text-sm">Loading reservations...</p>
        ) : filteredReservations.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center"><p className="text-gray-400 text-sm">No reservations found.</p></div>
        ) : (
          <>
            <div className="md:hidden space-y-3">
              {filteredReservations.map((r) => (
                <div key={r.id} className={`bg-white rounded-lg shadow-sm border p-4 ${r.status !== 'confirmed' ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div><div className="text-sm font-semibold text-gray-800">{r.guest_name}</div><div className="text-xs text-gray-500">{r.guest_phone || '—'}</div></div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${STATUS_COLORS[r.status] || ''}`}>{STATUS_LABELS[r.status]}</span>
                  </div>
                  <div className="text-xs text-gray-500 mb-2">{r.reservation_date} · {r.reservation_time.slice(0, 5)} · {r.party_size} {r.party_size === 1 ? 'guest' : 'guests'}</div>
                  <div className="text-xs text-gray-500 mb-2">Table: {r.table_id ? (r.tables?.table_number || '—') : <span className="italic">Unassigned</span>}</div>
                  {r.notes && <div className="text-xs text-gray-400 italic mb-2">{r.notes}</div>}
                  {canEdit && r.status === 'confirmed' && (
                    <div className="flex gap-1.5 mt-2">
                      <button onClick={() => handleStatusAction(r, 'seated')} className="flex-1 px-2 py-1 text-[10px] rounded bg-green-100 text-green-700 font-semibold hover:bg-green-200">Seat</button>
                      <button onClick={() => handleStatusAction(r, 'cancelled')} className="flex-1 px-2 py-1 text-[10px] rounded bg-red-100 text-red-700 font-semibold hover:bg-red-200">Cancel</button>
                      <button onClick={() => handleStatusAction(r, 'no_show')} className="flex-1 px-2 py-1 text-[10px] rounded bg-gray-100 text-gray-600 font-semibold hover:bg-gray-200">No Show</button>
                      <button onClick={() => openEditForm(r)} className="px-2 py-1 text-[10px] rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Edit</button>
                    </div>
                  )}
                  {canEdit && r.status !== 'confirmed' && (
                    <div className="flex gap-1.5 mt-2">
                      <button onClick={() => openEditForm(r)} className="px-2 py-1 text-[10px] rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Edit</button>
                      <button onClick={() => setDeleteId(r.id)} className="px-2 py-1 text-[10px] rounded border border-red-300 text-red-600 hover:bg-red-50">Delete</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="hidden md:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Guest</th>
                    <th className="text-left px-4 py-3 font-medium">Phone</th>
                    <th className="text-left px-4 py-3 font-medium">Date / Time</th>
                    <th className="text-left px-4 py-3 font-medium">Party</th>
                    <th className="text-left px-4 py-3 font-medium">Table</th>
                    <th className="text-left px-4 py-3 font-medium">Notes</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReservations.map((r) => (
                    <tr key={r.id} className={`border-b border-gray-100 hover:bg-gray-50 ${r.status !== 'confirmed' ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">{r.guest_name}</td>
                      <td className="px-4 py-3 text-gray-600">{r.guest_phone || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{r.reservation_date}<br /><span className="text-xs">{r.reservation_time.slice(0, 5)}</span></td>
                      <td className="px-4 py-3 text-gray-700">{r.party_size}</td>
                      <td className="px-4 py-3 text-gray-600">{r.table_id ? (r.tables?.table_number || '—') : <span className="italic text-gray-400">Unassigned</span>}</td>
                      <td className="px-4 py-3 text-gray-400 max-w-[120px] truncate">{r.notes || '—'}</td>
                      <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${STATUS_COLORS[r.status] || ''}`}>{STATUS_LABELS[r.status]}</span></td>
                      <td className="px-4 py-3 text-right">
                        {canEdit && r.status === 'confirmed' ? (
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleStatusAction(r, 'seated')} className="px-2 py-1 text-[10px] rounded bg-green-100 text-green-700 font-semibold hover:bg-green-200">Seat</button>
                            <button onClick={() => handleStatusAction(r, 'cancelled')} className="px-2 py-1 text-[10px] rounded bg-red-100 text-red-700 font-semibold hover:bg-red-200">Cancel</button>
                            <button onClick={() => handleStatusAction(r, 'no_show')} className="px-2 py-1 text-[10px] rounded bg-gray-100 text-gray-600 font-semibold hover:bg-gray-200">No Show</button>
                            <button onClick={() => openEditForm(r)} className="px-2 py-1 text-[10px] rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Edit</button>
                          </div>
                        ) : canEdit ? (
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEditForm(r)} className="px-2 py-1 text-[10px] rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Edit</button>
                            <button onClick={() => setDeleteId(r.id)} className="px-2 py-1 text-[10px] rounded border border-red-300 text-red-600 hover:bg-red-50">Delete</button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setShowForm(false)}>
          <div className="bg-white md:rounded-lg shadow-xl w-full md:max-w-md md:mx-4 p-6 rounded-t-xl md:max-h-[90vh] md:overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">{editingRes ? 'Edit Reservation' : 'Add Reservation'}</h2>
              <button onClick={() => setShowForm(false)} className="md:hidden text-gray-400 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div><label className="block text-sm text-gray-600 mb-1">Guest Name *</label><input type="text" value={formGuestName} onChange={(e) => setFormGuestName(e.target.value)} placeholder="Guest name" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">Phone</label><input type="text" value={formGuestPhone} onChange={(e) => setFormGuestPhone(e.target.value)} placeholder="Phone number" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="block text-sm text-gray-600 mb-1">Party Size</label><input type="number" min="1" value={formPartySize} onChange={(e) => setFormPartySize(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
                <div><label className="block text-sm text-gray-600 mb-1">Date *</label><input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
                <div><label className="block text-sm text-gray-600 mb-1">Time *</label><input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              </div>
              <div><label className="block text-sm text-gray-600 mb-1">Table (optional)</label>
                <select value={formTableId} onChange={(e) => setFormTableId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                  <option value="">— No table assigned —</option>
                  {tables.filter((t) => t.status === 'available' || t.id === formTableId).map((t) => (
                    <option key={t.id} value={t.id}>Table {t.table_number} (capacity: {t.capacity})</option>
                  ))}
                </select>
              </div>
              <div><label className="block text-sm text-gray-600 mb-1">Notes (optional)</label><input type="text" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Special requests, allergies, etc." className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded text-white font-medium disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>{saving ? 'Saving...' : (editingRes ? 'Update' : 'Add')}</button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setDeleteId(null)}>
          <div className="bg-white md:rounded-lg shadow-xl w-full md:max-w-sm md:mx-4 p-6 rounded-t-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">Delete Reservation?</h2>
              <button onClick={() => setDeleteId(null)} className="md:hidden text-gray-400 text-xl">✕</button>
            </div>
            <p className="text-sm text-gray-600 mb-4">This action cannot be undone.</p>
            {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm rounded bg-red-600 text-white font-medium disabled:opacity-50">{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
