'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { hasPermission, decodeJwt } from './permissions';

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
  theme: ThemeConfig;
}

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  low_stock_threshold: number;
  created_at: string;
}

const UNITS = ['pcs', 'kg', 'liters', 'grams', 'ml', 'oz', 'lb', 'bags', 'boxes', 'bottles'];

export default function InventoryView({ supabaseUrl, supabaseAnonKey, theme }: Props) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [authReady, setAuthReady] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Add/Edit modal
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formUnit, setFormUnit] = useState('pcs');
  const [formStock, setFormStock] = useState('');
  const [formThreshold, setFormThreshold] = useState('');
  const [saving, setSaving] = useState(false);

  // Stock adjustment modal
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Errors
  const [error, setError] = useState('');

  const getSupabaseClient = useCallback(async () => {
    const token = await getToken({ template: 'supabase' });
    if (!token) throw new Error('No auth token');
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
  }, [getToken, supabaseUrl, supabaseAnonKey]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setAuthReady(true);
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!authReady) return;
    (async () => {
      try {
        const token = await getToken({ template: 'supabase' });
        if (!token) return;
        const decoded = decodeJwt(token);
        if (decoded) setCanEdit(hasPermission(decoded.permissions, decoded.tenant_role, 'menu:edit'));
      } catch (e) {}
    })();
  }, [authReady, getToken]);

  const fetchItems = useCallback(async () => {
    if (!authReady) return;
    setLoading(true);
    try {
      const client = await getSupabaseClient();
      const { data } = await client.from('inventory_items').select('*').order('name');
      if (data) setItems(data as unknown as InventoryItem[]);
    } catch (e) { console.error('[Inventory] fetch', e); }
    setLoading(false);
  }, [authReady, getSupabaseClient]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const openAddForm = () => {
    setEditingId(null);
    setFormName('');
    setFormUnit('pcs');
    setFormStock('0');
    setFormThreshold('10');
    setError('');
    setShowForm(true);
  };

  const openEditForm = (item: InventoryItem) => {
    setEditingId(item.id);
    setFormName(item.name);
    setFormUnit(item.unit);
    setFormStock(String(item.current_stock));
    setFormThreshold(String(item.low_stock_threshold));
    setError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { setError('Name is required'); return; }
    const stock = parseFloat(formStock);
    const threshold = parseFloat(formThreshold);
    if (isNaN(stock) || isNaN(threshold)) { setError('Stock and threshold must be numbers'); return; }

    setSaving(true);
    setError('');
    try {
      const client = await getSupabaseClient();
      const payload = { name: formName.trim(), unit: formUnit, current_stock: stock, low_stock_threshold: threshold };

      if (editingId) {
        const { error: err } = await client.from('inventory_items').update(payload).eq('id', editingId);
        if (err) { setError(err.message); setSaving(false); return; }
        setItems((prev) => prev.map((i) => (i.id === editingId ? { ...i, ...payload } : i)));
      } else {
        const { data, error: err } = await client.from('inventory_items').insert(payload).select('*').single();
        if (err) { setError(err.message); setSaving(false); return; }
        if (data) setItems((prev) => [...prev, data as unknown as InventoryItem]);
      }
      setShowForm(false);
    } catch (e: any) { setError(e.message || 'Save failed'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    setError('');
    try {
      const client = await getSupabaseClient();
      const { error: err } = await client.from('inventory_items').delete().eq('id', deleteId);
      if (err) { setError(err.message); setDeleting(false); return; }
      setItems((prev) => prev.filter((i) => i.id !== deleteId));
      setDeleteId(null);
    } catch (e: any) { setError(e.message || 'Delete failed'); }
    setDeleting(false);
  };

  const handleAdjust = async () => {
    if (!adjustItem) return;
    const delta = parseFloat(adjustDelta);
    if (isNaN(delta) || delta === 0) { setError('Enter a non-zero adjustment amount'); return; }

    setAdjusting(true);
    setError('');
    try {
      const client = await getSupabaseClient();
      const newStock = Number(adjustItem.current_stock) + delta;
      const { error: err } = await client.from('inventory_items').update({ current_stock: newStock }).eq('id', adjustItem.id);
      if (err) { setError(err.message); setAdjusting(false); return; }
      setItems((prev) => prev.map((i) => (i.id === adjustItem.id ? { ...i, current_stock: newStock } : i)));
      setAdjustItem(null);
      setAdjustDelta('');
      setAdjustNote('');
    } catch (e: any) { setError(e.message || 'Adjustment failed'); }
    setAdjusting(false);
  };

  const lowStockItems = items.filter((i) => Number(i.current_stock) <= Number(i.low_stock_threshold));

  if (!isLoaded || !authReady) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading...</p></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Inventory</h1>
          {canEdit && (
            <button
              onClick={openAddForm}
              className="px-4 py-2 text-white rounded text-sm font-medium transition-colors"
              style={{ backgroundColor: theme.primaryColor }}
            >
              + Add Item
            </button>
          )}
        </div>

        {/* Low stock alert banner */}
        {lowStockItems.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
            <div className="flex items-center gap-2 text-red-700 font-medium text-sm mb-1">
              <span>⚠</span>
              <span>Low Stock Alert{lowStockItems.length > 1 ? 's' : ''}</span>
            </div>
            <ul className="text-sm text-red-600 ml-5 list-disc">
              {lowStockItems.map((i) => (
                <li key={i.id}>
                  {i.name} — {Number(i.current_stock)} {i.unit} (threshold: {Number(i.low_stock_threshold)})
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">{error}</div>
        )}

        {/* Inventory list - cards on mobile, table on desktop */}
        {loading ? (
          <p className="text-gray-400 text-sm">Loading inventory...</p>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-gray-400 text-sm">{'No inventory items yet. Click "+ Add Item" to begin.'}</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {items.map((item) => {
                const stock = Number(item.current_stock);
                const threshold = Number(item.low_stock_threshold);
                const isLow = stock <= threshold;
                return (
                  <div key={item.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="font-semibold text-gray-800">{item.name}</div>
                      {isLow ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Low</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">OK</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-sm text-gray-600 mb-3">
                      <div><span className="text-gray-400">Unit:</span> {item.unit}</div>
                      <div><span className="text-gray-400">Stock:</span> {stock}</div>
                      <div><span className="text-gray-400">Threshold:</span> {threshold}</div>
                    </div>
                    {canEdit && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setAdjustItem(item); setAdjustDelta(''); setAdjustNote(''); setError(''); }}
                          className="flex-1 px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
                        >
                          Adjust
                        </button>
                        <button
                          onClick={() => openEditForm(item)}
                          className="flex-1 px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => { setDeleteId(item.id); setError(''); }}
                          className="flex-1 px-3 py-1.5 text-xs rounded border border-red-300 text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Name</th>
                    <th className="text-left px-4 py-3 font-medium">Unit</th>
                    <th className="text-right px-4 py-3 font-medium">Stock</th>
                    <th className="text-right px-4 py-3 font-medium">Threshold</th>
                    <th className="text-right px-4 py-3 font-medium">Status</th>
                    {canEdit && <th className="text-right px-4 py-3 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const stock = Number(item.current_stock);
                    const threshold = Number(item.low_stock_threshold);
                    const isLow = stock <= threshold;
                    return (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                        <td className="px-4 py-3 text-gray-500">{item.unit}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-800">{stock}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{threshold}</td>
                        <td className="px-4 py-3 text-right">
                          {isLow ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Low</span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">OK</span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => { setAdjustItem(item); setAdjustDelta(''); setAdjustNote(''); setError(''); }}
                                className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
                              >
                                Adjust
                              </button>
                              <button
                                onClick={() => openEditForm(item)}
                                className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => { setDeleteId(item.id); setError(''); }}
                                className="px-2 py-1 text-xs rounded border border-red-300 text-red-600 hover:bg-red-50"
                              >
                                Del
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setShowForm(false)}>
          <div className="bg-white md:rounded-lg shadow-xl w-full md:max-w-md md:mx-4 p-6 md:max-h-[90vh] md:overflow-y-auto rounded-t-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">{editingId ? 'Edit Item' : 'Add Item'}</h2>
              <button onClick={() => setShowForm(false)} className="md:hidden text-gray-400 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Name</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Unit</label>
                <select value={formUnit} onChange={(e) => setFormUnit(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Current Stock</label>
                <input type="number" step="any" value={formStock} onChange={(e) => setFormStock(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Low Stock Threshold</label>
                <input type="number" step="any" value={formThreshold} onChange={(e) => setFormThreshold(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded text-white font-medium disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>
                {saving ? 'Saving...' : (editingId ? 'Update' : 'Add')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock adjustment modal */}
      {adjustItem && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setAdjustItem(null)}>
          <div className="bg-white md:rounded-lg shadow-xl w-full md:max-w-sm md:mx-4 p-6 md:max-h-[90vh] md:overflow-y-auto rounded-t-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-gray-800">Adjust Stock</h2>
              <button onClick={() => setAdjustItem(null)} className="md:hidden text-gray-400 text-xl">✕</button>
            </div>
            <p className="text-sm text-gray-500 mb-4">{adjustItem.name} (current: {Number(adjustItem.current_stock)} {adjustItem.unit})</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Amount (+ add / − remove)</label>
                <input type="number" step="any" value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} placeholder="e.g. 10 or -5" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Note (optional)</label>
                <input type="text" value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="e.g. restock, wastage" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setAdjustItem(null)} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleAdjust} disabled={adjusting} className="px-4 py-2 text-sm rounded text-white font-medium disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>
                {adjusting ? 'Adjusting...' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setDeleteId(null)}>
          <div className="bg-white md:rounded-lg shadow-xl w-full md:max-w-sm md:mx-4 p-6 rounded-t-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">Delete Item?</h2>
              <button onClick={() => setDeleteId(null)} className="md:hidden text-gray-400 text-xl">✕</button>
            </div>
            <p className="text-sm text-gray-600 mb-1">This action cannot be undone.</p>
            <p className="text-sm text-gray-500 mb-4">Any menu items linked to this ingredient will have their references removed.</p>
            {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm rounded bg-red-600 text-white font-medium disabled:opacity-50">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
