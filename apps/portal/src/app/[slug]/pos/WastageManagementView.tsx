'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePOS } from './pos-context';
import { useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { Button, EmptyState, Modal, Skeleton, SkeletonTable } from '@sat-sys/ui';
import { supa } from './supa-query';
import { createWastageEntry, editWastageEntry, cancelWastageEntry } from './wastage-engine';
import { useEvent, usePublish } from './use-event';
import { useBusinessDate } from './business-date-context';

interface Props {
  slug: string;
  theme: ThemeConfig;
  currencySymbol: string;
}

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
}

interface WastEntry {
  id: string;
  inventory_item_id: string;
  movement_type: string;
  quantity_change: number;
  quantity_before: number | null;
  quantity_after: number | null;
  unit_cost: number | null;
  total_cost: number | null;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

const REASONS = [
  'Expired', 'Spoiled', 'Damaged', 'Kitchen Waste',
  'Customer Return', 'Trial Cooking', 'Cleaning', 'Breakage', 'Theft', 'Other',
];
const CATEGORIES = ['Raw Material', 'Prepared Item', 'Packaged Item', 'Consumable', 'Other'];

function extractTag(notes: string | null | undefined, tag: string): string {
  if (!notes) return '';
  const m = notes.match(new RegExp(`${tag}:\\s*([^·;|]*?)(?:\\s*·|\\s*;|\\s*$)`));
  return m ? m[1].trim() : '';
}

export default function WastageManagementView({ slug, theme, currencySymbol }: Props) {
  const publish = usePublish();
  const { user, isLoaded } = useUser();
  // The Inventory module gates this page (Wastage Management is a sub-area); full access inside.
  const canEdit = true;
  const bd = useBusinessDate('wastage-management');

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [entries, setEntries] = useState<WastEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formItemId, setFormItemId] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formUnit, setFormUnit] = useState('');
  const [formReason, setFormReason] = useState(REASONS[0]);
  const [formCategory, setFormCategory] = useState(CATEGORIES[0]);
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formEmployee, setFormEmployee] = useState('');
  const [formBranch, setFormBranch] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [reasonFilter, setReasonFilter] = useState('all');

  const itemsMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const { setPageTitle } = usePOS();
  useEffect(() => { setPageTitle('Wastage Management'); }, [setPageTitle]);

  const fetchItems = useCallback(async () => {
    if (!isLoaded) return;
    try {
      const r = await supa(slug, { table: 'inventory_items', select: 'id, name, unit, current_stock', order: 'name' });
      if (r.ok && r.data) setItems(r.data as InventoryItem[]);
    } catch (e) { console.error('[Wastage] items', e); }
  }, [isLoaded, slug]);

  const fetchEntries = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const r = await supa(slug, {
        table: 'item_ledger',
        select: 'id,inventory_item_id,movement_type,quantity_change,quantity_before,quantity_after,unit_cost,total_cost,reference,notes,created_by,created_at',
        eq: ['movement_type', 'wastage'],
        gte: ['created_at', bd.start],
        lte: ['created_at', bd.end],
        order: { column: 'created_at', ascending: false },
        limit: 5000,
      });
      if (r.ok && r.data) setEntries(r.data as WastEntry[]);
      else if (!r.ok) setError(r.error || 'Failed to load wastage');
    } catch (e: any) { console.error('[Wastage] entries', e); setError(e?.message || 'Failed to load wastage'); }
    setLoading(false);
  }, [isLoaded, slug, bd.start, bd.end]);

  const refetchAll = useCallback(() => { fetchItems(); fetchEntries(); }, [fetchItems, fetchEntries]);

  useEffect(() => {
    if (isLoaded) refetchAll();
  }, [isLoaded, refetchAll]);

  useEvent('item_ledger', () => fetchEntries());
  useEvent('inventory_items', fetchItems);

  const openAddForm = (defaultItemId?: string) => {
    setEditingId(null);
    setFormItemId(defaultItemId || (items.length ? items[0].id : ''));
    setFormQty('');
    setFormUnit('');
    setFormReason(REASONS[0]);
    setFormCategory(CATEGORIES[0]);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormTime(new Date().toTimeString().slice(0, 5));
    setFormEmployee(user?.fullName || '');
    setFormBranch('');
    setFormNotes('');
    setError('');
    setShowForm(true);
  };

  const openEditForm = (entry: WastEntry) => {
    setEditingId(entry.id);
    setFormItemId(entry.inventory_item_id);
    setFormQty(String(Math.abs(Number(entry.quantity_change))));
    setFormUnit(itemsMap.get(entry.inventory_item_id)?.unit || '');
    setFormReason(extractTag(entry.notes, 'Reason') || REASONS[0]);
    setFormCategory(extractTag(entry.notes, 'Category') || CATEGORIES[0]);
    setFormEmployee(extractTag(entry.notes, 'Employee') || entry.created_by || '');
    setFormBranch('');
    setFormNotes(entry.notes || '');
    setFormDate((entry.created_at || '').split('T')[0]);
    setFormTime((entry.created_at || '').slice(11, 16));
    setError('');
    setShowForm(true);
  };

  const selectedItem = formItemId ? itemsMap.get(formItemId) : undefined;

  const handleSave = async () => {
    if (!formItemId) { setError('Select an item'); return; }
    const qty = parseFloat(formQty);
    if (isNaN(qty) || qty <= 0) { setError('Enter a valid quantity'); return; }
    const occurredAt = formDate && formTime ? `${formDate}T${formTime}:00` : new Date().toISOString();
    const input = {
      inventory_item_id: formItemId,
      quantity: qty,
      unit: formUnit || undefined,
      reason: formReason,
      category: formCategory,
      employee: formEmployee.trim() || undefined,
      branch: formBranch.trim() || undefined,
      notes: formNotes.trim() || undefined,
      occurred_at: occurredAt,
    };
    setSaving(true);
    setError('');
    try {
      const res = editingId
        ? await editWastageEntry(slug, editingId, input)
        : await createWastageEntry(slug, input);
      if (!res.ok) { setError(res.error || 'Save failed'); setSaving(false); return; }
      publish('item_ledger', editingId ? 'UPDATE' : 'INSERT', { id: res.ledgerId });
      publish('inventory_items', 'UPDATE', { id: formItemId });
      setShowForm(false);
      refetchAll();
    } catch (e: any) { setError(e.message || 'Save failed'); }
    setSaving(false);
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    setCancelling(true);
    setError('');
    try {
      const res = await cancelWastageEntry(slug, cancelId);
      if (!res.ok) { setError(res.error || 'Cancel failed'); setCancelling(false); return; }
      publish('item_ledger', 'DELETE', { id: cancelId });
      publish('inventory_items', 'UPDATE', {});
      setCancelId(null);
      refetchAll();
    } catch (e: any) { setError(e.message || 'Cancel failed'); }
    setCancelling(false);
  };

  const visibleEntries = useMemo(() => {
    if (reasonFilter === 'all') return entries;
    return entries.filter((e) => extractTag(e.notes, 'Reason') === reasonFilter);
  }, [entries, reasonFilter]);

  const totalQty = visibleEntries.reduce((s, e) => s + Math.abs(Number(e.quantity_change)), 0);
  const totalCost = visibleEntries.reduce((s, e) => s + Number(e.total_cost || 0), 0);

  if (!isLoaded) {
    return <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6"><div className="max-w-6xl mx-auto"><SkeletonTable rows={6} cols={5} /></div></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="px-3 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg">
              📅 {bd.isToday ? 'Today' : bd.display}
            </span>
            <span className="px-3 py-2 text-sm text-gray-500 bg-white border border-gray-300 rounded-lg">
              {totalQty} unit{totalQty === 1 ? '' : 's'} · {currencySymbol}{totalCost.toFixed(2)}
            </span>
          </div>
          {canEdit && (
            <button onClick={() => openAddForm()} className="px-4 py-2 text-white rounded text-sm font-medium transition-colors" style={{ backgroundColor: theme.primaryColor }}>
              + Record Wastage
            </button>
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">{error}</div>}

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <select value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded text-sm bg-white">
            <option value="all">All Reasons</option>
            {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8"><Skeleton variant="table" rows={4} cols={5} /></div>
        ) : visibleEntries.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <EmptyState variant="no-data" as="bare" title="No Wastage" description="No wastage recorded for this period." />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">Date / Time</th>
                    <th className="text-left px-4 py-3 font-medium">Reference</th>
                    <th className="text-left px-4 py-3 font-medium">Item</th>
                    <th className="text-right px-4 py-3 font-medium">Qty</th>
                    <th className="text-left px-4 py-3 font-medium">Unit</th>
                    <th className="text-left px-4 py-3 font-medium">Reason</th>
                    <th className="text-left px-4 py-3 font-medium">Category</th>
                    <th className="text-left px-4 py-3 font-medium">Employee</th>
                    <th className="text-right px-4 py-3 font-medium">Cost</th>
                    <th className="text-center px-4 py-3 font-medium w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries.map((entry) => {
                  const item = itemsMap.get(entry.inventory_item_id);
                  const qty = Math.abs(Number(entry.quantity_change));
                  return (
                    <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(entry.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{entry.reference || '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{item?.name || 'Unknown'}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-red-600">-{qty}</td>
                    <td className="px-4 py-3 text-gray-500">{formUnit || item?.unit || ''}</td>
                    <td className="px-4 py-3 text-gray-600">{extractTag(entry.notes, 'Reason') || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{extractTag(entry.notes, 'Category') || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{extractTag(entry.notes, 'Employee') || '—'}</td>
                    <td className="px-4 py-3 text-right">{entry.total_cost != null ? `${currencySymbol}${Number(entry.total_cost).toFixed(2)}` : '—'}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {canEdit && (
                        <span className="inline-flex gap-1">
                          <button onClick={() => openEditForm(entry)} className="px-2 py-0.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Edit</button>
                          <button onClick={() => setCancelId(entry.id)} className="px-2 py-0.5 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50">Cancel</button>
                        </span>
                      )}
                    </td>
                  </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? 'Edit Wastage' : 'Record Wastage'}
        size="lg"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="primary" style={{ backgroundColor: theme.primaryColor }} onClick={handleSave} loading={saving}>
              {editingId ? 'Update' : 'Record'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Inventory Item *</label>
            <select value={formItemId} onChange={(e) => { setFormItemId(e.target.value); const it = itemsMap.get(e.target.value); setFormUnit(it?.unit || ''); }} className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
              <option value="">-- Select --</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>{item.name} ({Number(item.current_stock)} {item.unit})</option>
              ))}
            </select>
            {selectedItem && <p className="text-xs text-gray-400 mt-1">Current stock: {Number(selectedItem.current_stock)} {selectedItem.unit}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Quantity *</label>
              <input type="number" step="any" min="0" value={formQty} onChange={(e) => setFormQty(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Unit</label>
              <input type="text" value={formUnit} onChange={(e) => setFormUnit(e.target.value)} placeholder="e.g. kg" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Reason *</label>
              <select value={formReason} onChange={(e) => setFormReason(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Category</label>
              <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm text-gray-600 mb-1">Date</label><input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
            <div><label className="block text-sm text-gray-600 mb-1">Time</label><input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm text-gray-600 mb-1">Employee</label><input type="text" value={formEmployee} onChange={(e) => setFormEmployee(e.target.value)} placeholder="Responsible staff" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
            <div><label className="block text-sm text-gray-600 mb-1">Branch</label><input type="text" value={formBranch} onChange={(e) => setFormBranch(e.target.value)} placeholder="Branch (future-ready)" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Notes</label>
            <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} placeholder="Optional detail" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Attachment</label>
            <input type="file" disabled title="Attachment support coming soon" className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-gray-50 text-gray-400 cursor-not-allowed" />
            <p className="text-[10px] text-gray-400 mt-1">Attachment upload is future-ready and not yet persisted.</p>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={!!cancelId}
        onClose={() => setCancelId(null)}
        title="Cancel Wastage?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setCancelId(null)}>No</Button>
            <Button variant="danger" onClick={handleCancel} loading={cancelling}>Cancel Wastage</Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600">This reverses the stock reduction and marks the ledger entry as cancelled.</p>
      </Modal>
    </div>
  );
}