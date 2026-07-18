'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { hasPermission } from './permissions';
import { supa } from './supa-query';

interface Props {
  slug: string;
  theme: ThemeConfig;
  loyaltyPointsEnabled?: boolean;
  currencySymbol: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  loyalty_points: number;
  total_orders: number;
  total_spent: number;
  notes: string | null;
  created_at: string;
}

interface PastOrder {
  id: string;
  order_number: number;
  status: string;
  total: number;
  created_at: string;
}

export default function CustomersView({ slug, theme, loyaltyPointsEnabled = true, currencySymbol }: Props) {
  const { user, isLoaded } = useUser();
  const meta = user?.publicMetadata as Record<string, any> | undefined;
  const perms = (meta?.permissions ?? []) as string[];
  const role = (meta?.role ?? '') as string;
  const canEdit = hasPermission(perms, role, 'orders:create');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [orderHistory, setOrderHistory] = useState<PastOrder[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchCustomers = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        const result = await supa(slug, { table: 'customers', select: '*', order: 'name', or: `name.ilike.${term},phone.ilike.${term}` });
        if (result.ok && result.data) setCustomers(result.data as Customer[]);
      } else {
        const result = await supa(slug, { table: 'customers', select: '*', order: 'name' });
        if (result.ok && result.data) setCustomers(result.data as Customer[]);
      }
    } catch (e) { console.error('[Customers] fetch', e); }
    setLoading(false);
  }, [isLoaded, slug, search]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const fetchOrderHistory = useCallback(async (customerId: string) => {
    setHistoryLoading(true);
    try {
      const result = await supa(slug, {
        table: 'orders',
        select: 'id, order_number, status, total, created_at',
        eq: ['customer_id', customerId],
        order: { column: 'created_at', ascending: false },
      });
      if (result.ok && result.data) setOrderHistory(result.data as PastOrder[]);
    } catch (e) { console.error('[Customers] history', e); }
    setHistoryLoading(false);
  }, [slug]);

  const openAddForm = () => {
    setEditingCustomer(null);
    setFormName(''); setFormPhone(''); setFormEmail(''); setFormNotes('');
    setError(''); setShowForm(true);
  };

  const openEditForm = (c: Customer) => {
    setEditingCustomer(c);
    setFormName(c.name); setFormPhone(c.phone || ''); setFormEmail(c.email || ''); setFormNotes(c.notes || '');
    setError(''); setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      const payload = { name: formName.trim(), phone: formPhone.trim() || null, email: formEmail.trim() || null, notes: formNotes.trim() || null };
      if (editingCustomer) {
        const result = await supa(slug, { table: 'customers', method: 'update', eq: ['id', editingCustomer.id], body: payload });
        if (!result.ok) { setError(result.error); setSaving(false); return; }
        setCustomers((prev) => prev.map((c) => (c.id === editingCustomer.id ? { ...c, ...payload } : c)));
        if (selectedCustomer?.id === editingCustomer.id) setSelectedCustomer((prev) => prev ? { ...prev, ...payload } : null);
      } else {
        const result = await supa(slug, { table: 'customers', method: 'insert', body: payload, single: true });
        if (!result.ok) { setError(result.error); setSaving(false); return; }
        if (result.data) setCustomers((prev) => [...prev, result.data as Customer]);
      }
      setShowForm(false);
    } catch (e: any) { setError(e.message || 'Save failed'); }
    setSaving(false);
  };

  const handleDelete = async (customer: Customer) => {
    setDeleteError('');
    try {
      if (customer.total_orders > 0) {
        setDeleteError(`Cannot delete — has order history, ${customer.total_orders} order${customer.total_orders === 1 ? '' : 's'} on record`);
        return;
      }
      setDeleting(true);
      const result = await supa(slug, { table: 'customers', method: 'delete', eq: ['id', customer.id] });
      if (!result.ok) { setDeleteError(result.error); setDeleting(false); return; }
      setCustomers((prev) => prev.filter((c) => c.id !== customer.id));
      if (selectedCustomer?.id === customer.id) setSelectedCustomer(null);
      setDeleteTarget(null);
    } catch (e: any) { setDeleteError(e.message || 'Delete failed'); }
    setDeleting(false);
  };

  const openProfile = (c: Customer) => {
    setSelectedCustomer(c);
    fetchOrderHistory(c.id);
  };

  const statusColor: Record<string, string> = {
    pending: 'text-yellow-600', in_kitchen: 'text-blue-600', ready: 'text-green-600',
    completed: 'text-gray-500', cancelled: 'text-red-500',
  };

  if (!isLoaded) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading...</p></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Customers</h1>
          {canEdit && <button onClick={openAddForm} className="px-4 py-2 text-white rounded text-sm font-medium transition-colors" style={{ backgroundColor: theme.primaryColor }}>+ Add Customer</button>}
        </div>

        <div className="mb-4">
          <input type="text" placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full md:w-80 px-3 py-2 border border-gray-300 rounded text-sm" />
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">{error}</div>}

        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            {loading ? (
              <p className="text-gray-400 text-sm">Loading customers...</p>
            ) : customers.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <p className="text-gray-400 text-sm">{search ? 'No customers match your search.' : 'No customers yet. Click "+ Add Customer" to create one.'}</p>
              </div>
            ) : (
              <>
                <div className="md:hidden space-y-3">
                  {customers.map((c) => (
                    <div key={c.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 cursor-pointer hover:bg-gray-50" onClick={() => openProfile(c)}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="font-semibold text-gray-800">{c.name}</div>
                        {loyaltyPointsEnabled && <div className="text-sm font-bold" style={{ color: theme.primaryColor }}>{c.loyalty_points} pts</div>}
                      </div>
                      <div className="text-sm text-gray-500 mb-2">{c.phone || 'No phone'}</div>
                      <div className="flex gap-4 text-sm text-gray-600">
                        <div><span className="text-gray-400">Orders:</span> {c.total_orders}</div>
                        <div><span className="text-gray-400">Spent:</span> {currencySymbol}{Number(c.total_spent).toFixed(2)}</div>
                      </div>
                      {canEdit && (
                        <button onClick={(e) => { e.stopPropagation(); openEditForm(c); }} className="mt-2 px-3 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Edit</button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="hidden md:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                        <th className="text-left px-4 py-3 font-medium">Name</th>
                        <th className="text-left px-4 py-3 font-medium">Phone</th>
                        <th className="text-right px-4 py-3 font-medium">Orders</th>
                        <th className="text-right px-4 py-3 font-medium">Spent</th>
                        {loyaltyPointsEnabled && <th className="text-right px-4 py-3 font-medium">Points</th>}
                        {canEdit && <th className="text-right px-4 py-3 font-medium"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map((c) => (
                        <tr key={c.id} className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${selectedCustomer?.id === c.id ? 'bg-blue-50' : ''}`} onClick={() => openProfile(c)}>
                          <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                          <td className="px-4 py-3 text-gray-500">{c.phone || '-'}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{c.total_orders}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{currencySymbol}{Number(c.total_spent).toFixed(2)}</td>
                          {loyaltyPointsEnabled && <td className="px-4 py-3 text-right font-medium" style={{ color: theme.primaryColor }}>{c.loyalty_points}</td>}
                          {canEdit && <td className="px-4 py-3 text-right"><button onClick={(e) => { e.stopPropagation(); openEditForm(c); }} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Edit</button></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {selectedCustomer && (
            <div className="hidden md:block w-80 flex-shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">{selectedCustomer.name}</h2>
                <div className="flex items-center gap-2">
                  {canEdit && <button onClick={() => setDeleteTarget(selectedCustomer)} className="text-red-400 hover:text-red-600 text-xs font-medium">Delete</button>}
                  <button onClick={() => setSelectedCustomer(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
                </div>
              </div>
              <div className="space-y-2 text-sm text-gray-600 mb-4">
                {selectedCustomer.phone && <p><span className="text-gray-400">Phone:</span> {selectedCustomer.phone}</p>}
                {selectedCustomer.email && <p><span className="text-gray-400">Email:</span> {selectedCustomer.email}</p>}
                {selectedCustomer.notes && <p><span className="text-gray-400">Notes:</span> {selectedCustomer.notes}</p>}
              </div>
              <div className={`grid ${loyaltyPointsEnabled ? 'grid-cols-3' : 'grid-cols-2'} gap-2 mb-4 text-center`}>
                <div className="bg-gray-50 rounded p-2"><div className="text-lg font-bold text-gray-800">{selectedCustomer.total_orders}</div><div className="text-xs text-gray-400">Orders</div></div>
                <div className="bg-gray-50 rounded p-2"><div className="text-lg font-bold text-gray-800">{currencySymbol}{Number(selectedCustomer.total_spent).toFixed(2)}</div><div className="text-xs text-gray-400">Spent</div></div>
                {loyaltyPointsEnabled && <div className="bg-gray-50 rounded p-2"><div className="text-lg font-bold" style={{ color: theme.primaryColor }}>{selectedCustomer.loyalty_points}</div><div className="text-xs text-gray-400">Points</div></div>}
              </div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Order History</h3>
              {historyLoading ? (
                <p className="text-xs text-gray-400">Loading...</p>
              ) : orderHistory.length === 0 ? (
                <p className="text-xs text-gray-400">No orders yet</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {orderHistory.map((o) => (
                    <div key={o.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-gray-50">
                      <div><span className="font-medium text-gray-700">#{o.order_number}</span><span className="text-gray-400 ml-2">{new Date(o.created_at).toLocaleDateString()}</span></div>
                      <div className="flex items-center gap-2"><span className={statusColor[o.status] || 'text-gray-500'}>{o.status}</span><span className="font-medium text-gray-700">{currencySymbol}{Number(o.total).toFixed(2)}</span></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {selectedCustomer && (
          <div className="fixed inset-0 z-50 md:hidden bg-gray-50 overflow-y-auto" onClick={() => setSelectedCustomer(null)}>
            <div className="min-h-full p-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">{selectedCustomer.name}</h2>
                <div className="flex items-center gap-2">
                  {canEdit && <button onClick={() => setDeleteTarget(selectedCustomer)} className="text-red-400 hover:text-red-600 text-xs font-medium">Delete</button>}
                  <button onClick={() => setSelectedCustomer(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                </div>
              </div>
              <div className="space-y-2 text-sm text-gray-600 mb-4">
                {selectedCustomer.phone && <p><span className="text-gray-400">Phone:</span> {selectedCustomer.phone}</p>}
                {selectedCustomer.email && <p><span className="text-gray-400">Email:</span> {selectedCustomer.email}</p>}
                {selectedCustomer.notes && <p><span className="text-gray-400">Notes:</span> {selectedCustomer.notes}</p>}
              </div>
              <div className={`grid ${loyaltyPointsEnabled ? 'grid-cols-3' : 'grid-cols-2'} gap-2 mb-4 text-center`}>
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3"><div className="text-lg font-bold text-gray-800">{selectedCustomer.total_orders}</div><div className="text-xs text-gray-400">Orders</div></div>
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3"><div className="text-lg font-bold text-gray-800">{currencySymbol}{Number(selectedCustomer.total_spent).toFixed(2)}</div><div className="text-xs text-gray-400">Spent</div></div>
                {loyaltyPointsEnabled && <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3"><div className="text-lg font-bold" style={{ color: theme.primaryColor }}>{selectedCustomer.loyalty_points}</div><div className="text-xs text-gray-400">Points</div></div>}
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Order History</h3>
                {historyLoading ? (<p className="text-xs text-gray-400">Loading...</p>
                ) : orderHistory.length === 0 ? (<p className="text-xs text-gray-400">No orders yet</p>
                ) : (
                  <div className="space-y-2">
                    {orderHistory.map((o) => (
                      <div key={o.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-100 last:border-0">
                        <div><span className="font-medium text-gray-700">#{o.order_number}</span><span className="text-gray-400 ml-2">{new Date(o.created_at).toLocaleDateString()}</span></div>
                        <div className="flex items-center gap-2"><span className={statusColor[o.status] || 'text-gray-500'}>{o.status}</span><span className="font-medium text-gray-700">{currencySymbol}{Number(o.total).toFixed(2)}</span></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => { if (!deleting) setDeleteTarget(null); }}>
          <div className="bg-white md:rounded-lg shadow-xl w-full md:max-w-sm md:mx-4 p-6 rounded-t-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Delete Customer</h2>
            <p className="text-sm text-gray-600 mb-1">Are you sure you want to delete <strong>{deleteTarget.name}</strong>?</p>
            {deleteError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">{deleteError}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setDeleteTarget(null); setDeleteError(''); }} disabled={deleting} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button onClick={() => handleDelete(deleteTarget)} disabled={deleting} className="px-4 py-2 text-sm rounded text-white font-medium disabled:opacity-50" style={{ backgroundColor: '#dc2626' }}>{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setShowForm(false)}>
          <div className="bg-white md:rounded-lg shadow-xl w-full md:max-w-md md:mx-4 p-6 rounded-t-xl md:max-h-[90vh] md:overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">{editingCustomer ? 'Edit Customer' : 'Add Customer'}</h2>
              <button onClick={() => setShowForm(false)} className="md:hidden text-gray-400 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div><label className="block text-sm text-gray-600 mb-1">Name *</label><input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" autoFocus /></div>
              <div><label className="block text-sm text-gray-600 mb-1">Phone</label><input type="text" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">Email</label><input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">Notes</label><textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded text-white font-medium disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>{saving ? 'Saving...' : (editingCustomer ? 'Update' : 'Add')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
