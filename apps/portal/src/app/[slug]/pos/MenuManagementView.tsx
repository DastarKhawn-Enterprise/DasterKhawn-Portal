'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import type { ThemeConfig } from '@sat-sys/pos-ui';

interface MenuItemRecord {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  available: boolean | null;
}

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
  theme: ThemeConfig;
}

const defaultForm: Omit<MenuItemRecord, 'id'> = {
  name: '',
  description: '',
  price: 0,
  category: null,
  available: true,
};

export default function MenuManagementView({ supabaseUrl, supabaseAnonKey, theme }: Props) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [authReady, setAuthReady] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [items, setItems] = useState<MenuItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Add/Edit form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<MenuItemRecord, 'id'>>({ ...defaultForm });
  const [newCategory, setNewCategory] = useState('');
  const [useNewCategory, setUseNewCategory] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<MenuItemRecord | null>(null);

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

  // Decode permissions from Supabase JWT
  useEffect(() => {
    if (!authReady) return;
    getToken({ template: 'supabase' })
      .then((token) => {
        if (!token) return;
        try {
          let base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
          while (base64.length % 4) base64 += '=';
          const payload = JSON.parse(atob(base64));
          const perms = payload.permissions;
          const tenantRole = payload.tenant_role || '';
          console.log('[Menu Permissions] raw JWT:', JSON.stringify({ permissions: perms, tenant_role: tenantRole }));
          const permList: string[] = typeof perms === 'string' ? (() => { try { return JSON.parse(perms); } catch { return []; } })() : (perms ?? []);
          const hasPermission = permList.includes('menu:edit') || tenantRole === 'super_admin';
          console.log('[Menu Permissions] has menu:edit?', permList.includes('menu:edit'), '| super_admin?', tenantRole === 'super_admin', '| canEdit:', hasPermission);
          setCanEdit(hasPermission);
        } catch (e) {
          console.error('[Menu Permissions] decode error:', e);
        }
      })
      .catch((e) => console.error('[Menu Permissions] getToken error:', e));
  }, [authReady, getToken]);

  // Fetch all menu items
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const client = await getSupabaseClient();
      const { data, error } = await client
        .from('menu_items')
        .select('*')
        .order('name');
      if (!error && data) setItems(data as MenuItemRecord[]);
    } catch (e) { console.error('[Menu] fetch error', e); }
    setLoading(false);
  }, [getSupabaseClient]);

  useEffect(() => {
    if (!authReady) return;
    fetchItems();
  }, [authReady, fetchItems]);

  // Group by category
  const categories = [...new Set(items.map((i) => i.category ?? 'Uncategorized'))].sort();

  // Open add form
  const handleAdd = useCallback(() => {
    setEditId(null);
    setForm({ ...defaultForm });
    setNewCategory('');
    setUseNewCategory(false);
    setShowForm(true);
  }, []);

  // Open edit form
  const handleEdit = useCallback((item: MenuItemRecord) => {
    setEditId(item.id);
    setForm({ name: item.name, description: item.description, price: item.price, category: item.category, available: item.available });
    setNewCategory('');
    setUseNewCategory(false);
    setShowForm(true);
  }, []);

  // Save item
  const handleSave = useCallback(async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const client = await getSupabaseClient();
      const payload = {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        price: form.price,
        category: useNewCategory ? newCategory.trim() || null : form.category,
        available: form.available,
      };

      if (editId) {
        const { error } = await client.from('menu_items').update(payload).eq('id', editId);
        if (error) { console.error('[Menu] update error', error); setSaving(false); return; }
      } else {
        const { error } = await client.from('menu_items').insert(payload);
        if (error) { console.error('[Menu] insert error', error); setSaving(false); return; }
      }

      setShowForm(false);
      fetchItems();
    } catch (e) { console.error('[Menu] save error', e); }
    setSaving(false);
  }, [form, editId, useNewCategory, newCategory, getSupabaseClient, fetchItems]);

  // Delete item
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(deleteTarget.id);
    try {
      const client = await getSupabaseClient();
      const { error } = await client.from('menu_items').delete().eq('id', deleteTarget.id);
      if (error) { console.error('[Menu] delete error', error); setDeleting(null); return; }
      // Hard delete — known limitation: breaks historical order_items references
      setDeleteTarget(null);
      fetchItems();
    } catch (e) { console.error('[Menu] delete error', e); }
    setDeleting(null);
  }, [deleteTarget, getSupabaseClient, fetchItems]);

  // Toggle available
  const handleToggle = useCallback(async (item: MenuItemRecord) => {
    const newVal = !(item.available ?? true);
    // Optimistic update
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, available: newVal } : i)));
    try {
      const client = await getSupabaseClient();
      const { error } = await client.from('menu_items').update({ available: newVal }).eq('id', item.id);
      if (error) {
        // Revert on error
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, available: item.available } : i)));
      }
    } catch {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, available: item.available } : i)));
    }
  }, [getSupabaseClient]);

  if (!isLoaded || !authReady) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading...</p></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-700 uppercase tracking-wider">Menu Management</h2>
        {canEdit && (
          <button
            onClick={handleAdd}
            className="px-4 py-2 rounded-lg text-white text-sm font-semibold"
            style={{ backgroundColor: theme.primaryColor }}
          >
            + Add Item
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400 text-center pt-12">Loading menu...</p>
      ) : items.length === 0 ? (
        <p className="text-gray-400 text-center pt-12">No menu items yet. {canEdit ? 'Click + Add Item to create one.' : ''}</p>
      ) : (
        categories.map((cat) => {
          const catItems = items.filter((i) => (i.category ?? 'Uncategorized') === cat);
          return (
            <div key={cat} className="mb-8">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{cat}</h3>
              <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                {catItems.map((item) => {
                  const isAvailable = item.available !== false;
                  return (
                    <div key={item.id} className={`flex items-center gap-4 px-4 py-3 ${isAvailable ? '' : 'bg-gray-50'}`}>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${isAvailable ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                          {item.name}
                        </div>
                        {item.description && (
                          <div className={`text-xs truncate max-w-md ${isAvailable ? 'text-gray-400' : 'text-gray-300'}`}>
                            {item.description}
                          </div>
                        )}
                      </div>
                      <div className={`text-sm font-semibold tabular-nums w-20 text-right ${isAvailable ? 'text-gray-700' : 'text-gray-400'}`}>
                        ${Number(item.price).toFixed(2)}
                      </div>
                      {/* Available toggle */}
                      {canEdit ? (
                        <button
                          onClick={() => handleToggle(item)}
                          className={`relative w-10 h-5 rounded-full transition-colors ${isAvailable ? 'bg-green-400' : 'bg-gray-300'}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isAvailable ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      ) : (
                        <span className={`text-xs font-medium w-10 text-center ${isAvailable ? 'text-green-600' : 'text-gray-400'}`}>
                          {isAvailable ? 'On' : 'Off'}
                        </span>
                      )}
                      {/* Edit / Delete (owner only) */}
                      {canEdit && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEdit(item)}
                            className="px-2.5 py-1 text-xs font-medium rounded hover:bg-gray-100 text-gray-600"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteTarget(item)}
                            className="px-2.5 py-1 text-xs font-medium rounded hover:bg-red-50 text-red-500"
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* ─── Add/Edit Modal ─── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">{editId ? 'Edit Item' : 'Add Menu Item'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea
                  value={form.description || ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  rows={2}
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  {useNewCategory ? (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        placeholder="New category"
                        className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      />
                      <button
                        onClick={() => setUseNewCategory(false)}
                        className="text-xs text-gray-500 hover:text-gray-700 px-2"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <select
                      value={form.category || ''}
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          setUseNewCategory(true);
                          setNewCategory('');
                        } else {
                          setForm({ ...form, category: e.target.value || null });
                        }
                      }}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value="">-- Select --</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="__new__">+ Add new category</option>
                    </select>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="avail-check"
                  checked={form.available ?? true}
                  onChange={(e) => setForm({ ...form, available: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="avail-check" className="text-sm text-gray-700">Available</label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || saving}
                className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: theme.primaryColor }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation ─── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-2">Delete &ldquo;{deleteTarget.name}&rdquo;?</h3>
            <p className="text-sm text-gray-500 mb-6">
              This cannot be undone. Items that have been ordered before may break historical records.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting === deleteTarget.id}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
              >
                {deleting === deleteTarget.id ? '...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
