'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePOS } from './pos-context';
import { useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { Badge, Button, ConfirmDialog, EmptyState, Modal, Skeleton, SkeletonTable } from '@sat-sys/ui';
import { supa } from './supa-query';
import { useEvent, usePublish } from './use-event';

interface Props {
  slug: string;
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

export default function InventoryView({ slug, theme }: Props) {
  const publish = usePublish();
  const { user, isLoaded } = useUser();
  // The Inventory module gates this whole page; inside a module, full access.
  const canEdit = true;

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formUnit, setFormUnit] = useState('pcs');
  const [formStock, setFormStock] = useState('');
  const [formThreshold, setFormThreshold] = useState('');
  const [saving, setSaving] = useState(false);

  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustType, setAdjustType] = useState<'adjustment' | 'wastage'>('adjustment');
  const [adjusting, setAdjusting] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const fetchItems = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const result = await supa(slug, { table: 'inventory_items', select: '*', order: 'name' });
      if (result.ok && result.data) setItems(result.data as InventoryItem[]);
    } catch (e) { console.error('[Inventory] fetch', e); }
    setLoading(false);
  }, [isLoaded, slug]);

  const { setPageTitle } = usePOS();
  useEffect(() => { setPageTitle('Inventory'); }, [setPageTitle]);
  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEvent('inventory_items', () => { fetchItems(); });

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
      const payload = { name: formName.trim(), unit: formUnit, current_stock: stock, low_stock_threshold: threshold };

      if (editingId) {
        const result = await supa(slug, { table: 'inventory_items', method: 'update', eq: ['id', editingId], body: payload });
        if (!result.ok) { setError(result.error); setSaving(false); return; }
        publish('inventory_items', 'UPDATE', { id: editingId });
        setItems((prev) => prev.map((i) => (i.id === editingId ? { ...i, ...payload } : i)));
      } else {
        const result = await supa(slug, { table: 'inventory_items', method: 'insert', body: payload, single: true });
        if (!result.ok) { setError(result.error); setSaving(false); return; }
        publish('inventory_items', 'INSERT', { id: result.data?.id });
        if (result.data) setItems((prev) => [...prev, result.data as InventoryItem]);
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
      const result = await supa(slug, { table: 'inventory_items', method: 'delete', eq: ['id', deleteId] });
      if (!result.ok) { setError(result.error); setDeleting(false); return; }
      publish('inventory_items', 'DELETE', { id: deleteId });
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
      const newStock = Number(adjustItem.current_stock) + delta;
      const result = await supa(slug, { table: 'inventory_items', method: 'update', eq: ['id', adjustItem.id], body: { current_stock: newStock } });
      if (!result.ok) { setError(result.error); setAdjusting(false); return; }
      publish('inventory_items', 'UPDATE', { id: adjustItem.id });
      setItems((prev) => prev.map((i) => (i.id === adjustItem.id ? { ...i, current_stock: newStock } : i)));

      const movementType = delta < 0 && adjustType === 'wastage' ? 'wastage' : 'adjustment';
      const movementLabel = movementType === 'wastage' ? 'wastage' : 'adjustment';
      await supa(slug, {
        table: 'item_ledger',
        method: 'insert',
        body: {
          inventory_item_id: adjustItem.id,
          movement_type: movementType,
          quantity_change: delta,
          notes: adjustNote.trim() || `${movementLabel}: ${delta > 0 ? '+' : ''}${delta} ${adjustItem.unit}`,
          created_by: user?.id || null,
        },
      });
      publish('item_ledger', 'INSERT', { inventory_item_id: adjustItem.id });

      setAdjustItem(null);
      setAdjustDelta('');
      setAdjustNote('');
    } catch (e: any) { setError(e.message || 'Adjustment failed'); }
    setAdjusting(false);
  };

  const lowStockItems = items.filter((i) => Number(i.current_stock) <= Number(i.low_stock_threshold));

  if (!isLoaded) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <SkeletonTable rows={6} cols={4} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-end mb-4">
          {canEdit && (
            <button onClick={openAddForm} className="px-4 py-2 text-white rounded text-sm font-medium transition-colors" style={{ backgroundColor: theme.primaryColor }}>
              + Add Item
            </button>
          )}
        </div>

        {lowStockItems.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
            <div className="flex items-center gap-2 text-amber-800 font-medium text-sm mb-1">
              <span>△</span>
              <span>Low Stock Alert{lowStockItems.length > 1 ? 's' : ''}</span>
            </div>
            <ul className="text-sm text-amber-700 ml-5 list-disc">
              {lowStockItems.map((i) => (
                <li key={i.id}>{i.name} — {Number(i.current_stock)} {i.unit} (threshold: {Number(i.low_stock_threshold)})</li>
              ))}
            </ul>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">{error}</div>}

        {loading ? (
          <Skeleton variant="table" rows={4} cols={4} />
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <EmptyState variant="no-inventory" as="bare" />
          </div>
        ) : (
          <>
            <div className="md:hidden space-y-3">
              {items.map((item) => {
                const stock = Number(item.current_stock);
                const threshold = Number(item.low_stock_threshold);
                const isLow = stock <= threshold;
                return (
                  <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="font-semibold text-gray-800 min-w-0 truncate">{item.name}</div>
                      {isLow ? (
                        <Badge variant="danger" className="flex-shrink-0">Low</Badge>
                      ) : (
                        <Badge variant="success" className="flex-shrink-0">OK</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-sm text-gray-600 mb-3">
                      <div><span className="text-gray-400">Unit:</span> {item.unit}</div>
                      <div><span className="text-gray-400">Stock:</span> {stock}</div>
                      <div><span className="text-gray-400">Threshold:</span> {threshold}</div>
                    </div>
                    {canEdit && (
                      <div className="flex gap-2">
                        <button onClick={() => { setAdjustItem(item); setAdjustDelta(''); setAdjustNote(''); setAdjustType('adjustment'); setError(''); }} className="flex-1 px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Adjust</button>
                        <button onClick={() => openEditForm(item)} className="flex-1 px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Edit</button>
                        <button onClick={() => { setDeleteId(item.id); setError(''); }} className="flex-1 px-3 py-1.5 text-xs rounded border border-red-300 text-red-600 hover:bg-red-50">Delete</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-gray-400 text-xs uppercase tracking-wider">
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
                            <Badge variant="danger">Low</Badge>
                          ) : (
                            <Badge variant="success">OK</Badge>
                          )}
                        </td>
                        {canEdit && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => { setAdjustItem(item); setAdjustDelta(''); setAdjustNote(''); setError(''); }} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Adjust</button>
                              <button onClick={() => openEditForm(item)} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Edit</button>
                              <button onClick={() => { setDeleteId(item.id); setError(''); }} className="px-2 py-1 text-xs rounded border border-red-300 text-red-600 hover:bg-red-50">Del</button>
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

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? 'Edit Item' : 'Add Item'}
        size="md"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="primary" style={{ backgroundColor: theme.primaryColor }} onClick={handleSave} loading={saving}>
              {editingId ? 'Update' : 'Add'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div><label className="block text-sm text-gray-600 mb-1">Name</label><input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
          <div><label className="block text-sm text-gray-600 mb-1">Unit</label>
            <select value={formUnit} onChange={(e) => setFormUnit(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div><label className="block text-sm text-gray-600 mb-1">Current Stock</label><input type="number" step="any" value={formStock} onChange={(e) => setFormStock(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
          <div><label className="block text-sm text-gray-600 mb-1">Low Stock Threshold</label><input type="number" step="any" value={formThreshold} onChange={(e) => setFormThreshold(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={!!adjustItem}
        onClose={() => setAdjustItem(null)}
        title="Adjust Stock"
        size="sm"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setAdjustItem(null)}>Cancel</Button>
            <Button variant="primary" style={{ backgroundColor: theme.primaryColor }} onClick={handleAdjust} loading={adjusting}>
              Apply
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-500 mb-4">{adjustItem?.name} (current: {Number(adjustItem?.current_stock ?? 0)} {adjustItem?.unit})</p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Movement Type</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" name="adjType" checked={adjustType === 'adjustment'} onChange={() => setAdjustType('adjustment')} />
                Adjustment
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" name="adjType" checked={adjustType === 'wastage'} onChange={() => setAdjustType('wastage')} />
                Wastage
              </label>
            </div>
          </div>
          <div><label className="block text-sm text-gray-600 mb-1">Amount (+ add / − remove)</label><input type="number" step="any" value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} placeholder="e.g. 10 or -5" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
          <div><label className="block text-sm text-gray-600 mb-1">Note (optional)</label><input type="text" value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="e.g. restock, wastage" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Item?"
        message={<>This action cannot be undone.<br />Any menu items linked to this ingredient will have their references removed.{error && <span className="block text-red-600 mt-2">{error}</span>}</>}
        confirmLabel="Delete"
        loading={deleting}
        size="sm"
      />
    </div>
  );
}
