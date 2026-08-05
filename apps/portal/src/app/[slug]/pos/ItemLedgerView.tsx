'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePOS } from './pos-context';
import { useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { Button, EmptyState, Modal, Skeleton, SkeletonTable, StatusPill } from '@sat-sys/ui';
import { supa } from './supa-query';
import { createPurchaseEntry, editPurchaseEntry, cancelPurchaseEntry } from './inventory-engine';
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
  low_stock_threshold: number;
}

interface LedgerEntry {
  id: string;
  inventory_item_id: string;
  movement_type: string;
  quantity_change: number;
  quantity_before: number | null;
  quantity_after: number | null;
  unit_cost: number | null;
  total_cost: number | null;
  reference_order_id: string | null;
  reference: string | null;
  vendor: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

const MOVEMENT_LABELS: Record<string, string> = {
  purchase: 'Purchase',
  purchase_return: 'Purchase Return',
  sale: 'Sale',
  sale_cancelled: 'Sale Cancelled',
  ORDER_EDIT_ADD: 'Order Edit Add',
  ORDER_EDIT_REMOVE: 'Order Edit Remove',
  adjustment: 'Adjustment',
  wastage: 'Wastage',
  transfer: 'Transfer',
  opening_balance: 'Opening Balance',
};

const MOVEMENT_TYPES = Object.keys(MOVEMENT_LABELS);

const MOVEMENT_TONE: Record<string, string> = {
  purchase: 'bg-green-50 text-green-700 border-green-200',
  purchase_return: 'bg-orange-50 text-orange-700 border-orange-200',
  sale: 'bg-blue-50 text-blue-700 border-blue-200',
  sale_cancelled: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  ORDER_EDIT_ADD: 'bg-amber-50 text-amber-700 border-amber-200',
  ORDER_EDIT_REMOVE: 'bg-teal-50 text-teal-700 border-teal-200',
  adjustment: 'bg-amber-50 text-amber-700 border-amber-200',
  wastage: 'bg-red-50 text-red-700 border-red-200',
  transfer: 'bg-purple-50 text-purple-700 border-purple-200',
  opening_balance: 'bg-gray-50 text-gray-700 border-gray-200',
};

function typePill(type: string) {
  return {
    status: type,
    label: MOVEMENT_LABELS[type] || type,
    className: MOVEMENT_TONE[type] || 'bg-gray-50 text-gray-700 border-gray-200',
  };
}

export default function ItemLedgerView({ slug, theme, currencySymbol }: Props) {
  const publish = usePublish();
  const { user, isLoaded } = useUser();
  // The Item Ledger module gates this whole page; inside a module, full access.
  const canEdit = true;

  const bd = useBusinessDate('item-ledger');
  const canEditDate = canEdit;

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsError, setItemsError] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [histories, setHistories] = useState<Record<string, LedgerEntry[]>>({});
  const [balances, setBalances] = useState<Record<string, Record<string, number>>>({});
  const [historyLoading, setHistoryLoading] = useState<Record<string, boolean>>({});
  const [historyError, setHistoryError] = useState<Record<string, string>>({});

  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [purchaseItemId, setPurchaseItemId] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('');
  const [purchaseUnitCost, setPurchaseUnitCost] = useState('');
  const [purchaseVendor, setPurchaseVendor] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [purchaseLogExpense, setPurchaseLogExpense] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editUnitCost, setEditUnitCost] = useState('');
  const [editVendor, setEditVendor] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editingError, setEditingError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { setPageTitle } = usePOS();
  useEffect(() => { setPageTitle('Inventory Ledger'); }, [setPageTitle]);

  const itemsMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const fetchItems = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);
    setItemsError('');
    try {
      const result = await supa(slug, {
        table: 'inventory_items',
        select: 'id, name, unit, current_stock, low_stock_threshold',
        order: 'name',
      });
      if (result.ok && result.data) {
        setItems(result.data as InventoryItem[]);
      } else if (!result.ok) {
        setItemsError(result.error || 'Failed to load items');
      }
    } catch (e: any) {
      console.error('[Ledger] fetch items', e);
      setItemsError(e?.message || 'Failed to load items');
    } finally {
      setLoading(false);
    }
  }, [isLoaded, slug]);

  const fetchItemHistory = useCallback(async (itemId: string) => {
    if (histories[itemId]) return;
    setHistoryLoading((prev) => ({ ...prev, [itemId]: true }));
    setHistoryError((prev) => ({ ...prev, [itemId]: '' }));
    try {
      const result = await supa(slug, {
        table: 'item_ledger',
        select: 'id,inventory_item_id,movement_type,quantity_change,quantity_before,quantity_after,unit_cost,total_cost,reference_order_id,reference,vendor,notes,created_by,created_at',
        eq: ['inventory_item_id', itemId],
        order: { column: 'created_at', ascending: false },
        limit: 1000,
      });
      if (result.ok && result.data) {
        const entries = result.data as LedgerEntry[];
        const item = items.find((i) => i.id === itemId);
        const balanceMap: Record<string, number> = {};
        const asc = [...entries].sort((a, b) => {
          const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          return t !== 0 ? t : a.id < b.id ? -1 : 1;
        });
        let bal = Number(item?.current_stock ?? 0);
        for (let i = asc.length - 1; i >= 0; i--) {
          balanceMap[asc[i].id] = bal;
          bal -= Number(asc[i].quantity_change);
        }
        setHistories((prev) => ({ ...prev, [itemId]: entries }));
        setBalances((prev) => ({ ...prev, [itemId]: balanceMap }));
      } else if (!result.ok) {
        setHistoryError((prev) => ({ ...prev, [itemId]: result.error || 'Failed to load history' }));
      }
    } catch (e: any) {
      console.error('[Ledger] history', e);
      setHistoryError((prev) => ({ ...prev, [itemId]: e?.message || 'Failed to load history' }));
    } finally {
      setHistoryLoading((prev) => ({ ...prev, [itemId]: false }));
    }
  }, [slug, histories, items]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  // Purchases/cancels also update inventory_items, so a single subscription covers both
  // stock level and ledger history changes (removes a duplicate fetch per event).
  useEvent('inventory_items', () => {
    fetchItems();
    if (expandedId) fetchItemHistory(expandedId);
  });

  const toggleExpand = (itemId: string) => {
    setExpandedId((prev) => (prev === itemId ? null : itemId));
    fetchItemHistory(itemId);
  };

  const refreshExpanded = useCallback(() => {
    if (!expandedId) return;
    setHistories((prev) => {
      const next = { ...prev };
      delete next[expandedId];
      return next;
    });
    fetchItemHistory(expandedId);
    fetchItems();
  }, [expandedId, fetchItemHistory, fetchItems]);

  const filteredEntries = useMemo(() => {
    const entries = expandedId ? (histories[expandedId] ?? []) : [];
    const q = searchText.trim().toLowerCase();
    return entries.filter((e) => {
      if (typeFilter !== 'all' && e.movement_type !== typeFilter) return false;
      if (dateFrom && e.created_at.slice(0, 10) < dateFrom) return false;
      if (dateTo && e.created_at.slice(0, 10) > dateTo) return false;
      if (!q) return true;
      const orderRef = e.reference_order_id ? `#${e.reference_order_id}` : '';
      const hay = `${MOVEMENT_LABELS[e.movement_type] || e.movement_type} ${e.vendor || ''} ${e.notes || ''} ${e.reference || ''} ${orderRef}`.toLowerCase();
      return hay.includes(q);
    });
  }, [expandedId, histories, searchText, typeFilter, dateFrom, dateTo]);

  const lowStockItems = items.filter((i) => Number(i.current_stock) <= Number(i.low_stock_threshold));

  const openPurchaseForm = (itemId: string) => {
    setPurchaseItemId(itemId);
    setPurchaseQty('');
    setPurchaseUnitCost('');
    setPurchaseVendor('');
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setPurchaseNotes('');
    setPurchaseLogExpense(true);
    setError('');
    setShowPurchaseForm(true);
  };

  const handlePurchase = async () => {
    if (!purchaseItemId) { setError('Select an item'); return; }
    const qty = parseFloat(purchaseQty);
    if (isNaN(qty) || qty <= 0) { setError('Enter a valid quantity'); return; }
    const cost = parseFloat(purchaseUnitCost);
    if (isNaN(cost) || cost < 0) { setError('Enter a valid unit cost'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await createPurchaseEntry(slug, {
        inventory_item_id: purchaseItemId,
        quantity: qty,
        unit_cost: cost,
        vendor: purchaseVendor.trim() || null,
        notes: purchaseNotes.trim() || null,
        purchase_date: purchaseDate,
        log_expense: purchaseLogExpense,
        created_by: user?.id || null,
      });
      if (!res.ok) { setError(res.error || 'Purchase failed'); setSaving(false); return; }
      const insertedId = res.ledgerIds?.[0];
      if (insertedId) publish('item_ledger', 'INSERT', { id: insertedId });
      await fetchItems();
      refreshExpanded();
      setShowPurchaseForm(false);
      setPurchaseQty('');
      setPurchaseUnitCost('');
      setPurchaseVendor('');
      setPurchaseNotes('');
    } catch (e: any) { setError(e.message || 'Purchase failed'); }
    setSaving(false);
  };

  const openEditForm = (entry: LedgerEntry) => {
    setEditingId(entry.id);
    setEditQty(String(Number(entry.quantity_change)));
    setEditUnitCost(entry.unit_cost != null ? String(Number(entry.unit_cost)) : '');
    setEditVendor(entry.vendor || '');
    setEditNotes(entry.notes || '');
    setEditingError('');
    setShowPurchaseForm(false);
  };

  const handleEditPurchase = async () => {
    if (!editingId) return;
    const qty = parseFloat(editQty);
    if (isNaN(qty) || qty <= 0) { setEditingError('Enter a valid quantity'); return; }
    const cost = parseFloat(editUnitCost);
    if (isNaN(cost) || cost < 0) { setEditingError('Enter a valid unit cost'); return; }
    setEditSaving(true);
    setEditingError('');
    try {
      const res = await editPurchaseEntry(slug, editingId, {
        quantity: qty,
        unit_cost: cost,
        vendor: editVendor.trim() || null,
        notes: editNotes.trim() || null,
      });
      if (!res.ok) { setEditingError(res.error || 'Update failed'); setEditSaving(false); return; }
      publish('item_ledger', 'UPDATE', { id: editingId });
      await fetchItems();
      refreshExpanded();
      setEditingId(null);
    } catch (e: any) { setEditingError(e.message || 'Update failed'); }
    setEditSaving(false);
  };

  const handleCancelPurchase = async (entry: LedgerEntry) => {
    if (!window.confirm(`Cancel this purchase of ${Math.abs(Number(entry.quantity_change))} units? Stock will be reversed.`)) return;
    setBusyId(entry.id);
    try {
      const res = await cancelPurchaseEntry(slug, entry.id);
      if (!res.ok) { setHistoryError((prev) => ({ ...prev, [entry.inventory_item_id]: res.error || 'Cancel failed' })); return; }
      publish('item_ledger', 'DELETE', { id: entry.id });
      await fetchItems();
      refreshExpanded();
    } catch (e: any) {
      setHistoryError((prev) => ({ ...prev, [entry.inventory_item_id]: e?.message || 'Cancel failed' }));
    }
    setBusyId(null);
  };

  if (!isLoaded) {
    return <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6"><div className="max-w-5xl mx-auto"><SkeletonTable rows={6} cols={4} /></div></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header: date + summary */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="px-3 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg">
              📅 {bd.isToday ? 'Today' : bd.display}
            </span>
            <span className="px-3 py-2 text-sm text-gray-500 bg-white border border-gray-300 rounded-lg">
              {items.length} item{items.length === 1 ? '' : 's'}
              {lowStockItems.length > 0 && (
                <span className="ml-2 text-amber-600 font-medium">{lowStockItems.length} low</span>
              )}
            </span>
            {!canEditDate && canEdit && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                Past date — read only
              </span>
            )}
          </div>
        </div>

        {itemsError && <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded text-sm mb-4">{itemsError}</div>}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">{error}</div>}

        {/* Inventory rows (single row per item, expandable) */}
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 mb-4">
            <Skeleton variant="table" rows={4} cols={4} />
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 mb-4">
            <EmptyState variant="no-inventory" as="bare" description="Add items in the Inventory tab first." />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
            {/* Desktop header */}
            <div className="hidden md:flex border-b border-gray-200 bg-gray-50 text-gray-400 text-xs uppercase tracking-wider px-4 py-3">
              <div className="flex-1 font-medium">Item Name</div>
              <div className="w-28 text-right font-medium">Current Stock</div>
              <div className="w-20 text-center font-medium">Unit</div>
              <div className="w-28 text-right font-medium">Min Stock</div>
              <div className="w-36 text-center font-medium">Action</div>
            </div>

            {items.map((item) => {
              const expanded = expandedId === item.id;
              const isLow = Number(item.current_stock) <= Number(item.low_stock_threshold);
              return (
                <div key={item.id} className="border-b border-gray-100 last:border-b-0">
                  {/* Row */}
                  <div
                    className={`flex flex-wrap md:flex-nowrap items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 ${expanded ? 'bg-gray-50' : ''}`}
                    onClick={() => toggleExpand(item.id)}
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className={`text-gray-400 text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
                      <span className="font-medium text-gray-800 truncate">{item.name}</span>
                      {isLow && <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-50 text-amber-700 border border-amber-200">Low</span>}
                    </div>
                    <div className={`w-28 text-right font-mono font-semibold ${isLow ? 'text-amber-600' : 'text-gray-700'}`}>{Number(item.current_stock)}</div>
                    <div className="w-20 text-center text-gray-500 text-sm">{item.unit}</div>
                    <div className="w-28 text-right font-mono text-gray-400">{Number(item.low_stock_threshold)}</div>
                    <div className="w-36 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openPurchaseForm(item.id)}
                        disabled={!canEditDate}
                        className="px-3 py-1.5 text-xs rounded text-white font-medium transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ backgroundColor: theme.primaryColor }}
                      >
                        + Add Purchase
                      </button>
                    </div>
                  </div>

                  {/* Expanded history */}
                  {expanded && (
                    <div className="px-4 md:px-6 pb-4 bg-gray-50/60">
                      {/* Filters */}
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <input
                          type="text"
                          value={searchText}
                          onChange={(e) => setSearchText(e.target.value)}
                          placeholder="Search notes / vendor / order…"
                          className="px-3 py-1.5 border border-gray-300 rounded text-sm w-56"
                        />
                        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded text-sm">
                          <option value="all">All Types</option>
                          {MOVEMENT_TYPES.map((t) => (
                            <option key={t} value={t}>{MOVEMENT_LABELS[t]}</option>
                          ))}
                        </select>
                        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded text-sm" title="From" />
                        <span className="text-xs text-gray-400">to</span>
                        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded text-sm" title="To" />
                        <button onClick={() => { setSearchText(''); setTypeFilter('all'); setDateFrom(''); setDateTo(''); }} className="px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100">
                          Clear
                        </button>
                      </div>

                      {historyLoading[item.id] ? (
                        <Skeleton variant="table" rows={3} cols={5} />
                      ) : historyError[item.id] ? (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
                          {historyError[item.id]}
                          <button onClick={() => fetchItemHistory(item.id)} className="ml-2 px-2 py-0.5 text-xs rounded bg-red-100 hover:bg-red-200">Retry</button>
                        </div>
                      ) : filteredEntries.length === 0 ? (
                        <EmptyState variant="no-data" as="bare" title="No Transactions" description="No matching ledger entries." />
                      ) : (
                        <>
                          <div className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-200 bg-gray-50 text-gray-400 text-xs uppercase tracking-wider">
                                  <th className="text-left px-3 py-2 font-medium">Date / Time</th>
                                  <th className="text-left px-3 py-2 font-medium">Type</th>
                                  <th className="text-right px-3 py-2 font-medium">Before</th>
                                  <th className="text-right px-3 py-2 font-medium">Change</th>
                                  <th className="text-right px-3 py-2 font-medium">After</th>
                                  <th className="text-right px-3 py-2 font-medium">Cost</th>
                                  <th className="text-left px-3 py-2 font-medium">Ref / Vendor</th>
                                  <th className="text-left px-3 py-2 font-medium">Notes</th>
                                  {canEditDate && <th className="text-center px-3 py-2 font-medium w-28">Actions</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {filteredEntries.map((entry) => {
                                  const qty = Number(entry.quantity_change);
                                  const bal = balances[item.id]?.[entry.id];
                                  const pill = typePill(entry.movement_type);
                                  return (
                                    <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                                        {new Date(entry.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                      </td>
                                      <td className="px-3 py-2">
                                        <StatusPill status={pill.status} label={pill.label} size="sm" className={pill.className} />
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono text-gray-500">{entry.quantity_before != null ? Number(entry.quantity_before) : '—'}</td>
                                      <td className={`px-3 py-2 text-right font-mono font-semibold ${qty > 0 ? 'text-green-600' : qty < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                        {qty > 0 ? '+' : ''}{qty}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono text-gray-700">{entry.quantity_after != null ? Number(entry.quantity_after) : bal ?? '—'}</td>
                                      <td className="px-3 py-2 text-right text-gray-600">
                                        {entry.total_cost != null ? `${currencySymbol}${Number(entry.total_cost).toFixed(2)}` : '—'}
                                      </td>
                                      <td className="px-3 py-2 text-gray-600 max-w-[160px] truncate">
                                        {entry.vendor || entry.reference || (entry.reference_order_id ? `#${entry.reference_order_id.slice(0, 8)}` : '—')}
                                      </td>
                                      <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate">{entry.notes || '—'}</td>
                                      {canEditDate && (
                                        <td className="px-3 py-2 text-center whitespace-nowrap">
                                          {entry.movement_type === 'purchase' && qty > 0 && (
                                            <span className="inline-flex gap-1">
                                              <button onClick={() => openEditForm(entry)} disabled={busyId === entry.id} className="px-2 py-0.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40">Edit</button>
                                              <button onClick={() => handleCancelPurchase(entry)} disabled={busyId === entry.id} className="px-2 py-0.5 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40">Cancel</button>
                                            </span>
                                          )}
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* Mobile history cards */}
                          <div className="md:hidden space-y-2">
                            {filteredEntries.map((entry) => {
                              const qty = Number(entry.quantity_change);
                              const bal = balances[item.id]?.[entry.id];
                              const pill = typePill(entry.movement_type);
                              return (
                                <div key={entry.id} className="bg-white rounded-lg border border-gray-200 p-3">
                                  <div className="flex items-start justify-between mb-2">
                                    <div>
                                      <div className="text-sm font-medium text-gray-800">{new Date(entry.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                                      <StatusPill status={pill.status} label={pill.label} size="sm" className={`${pill.className} mt-1`} />
                                    </div>
                                    <div className={`text-lg font-bold font-mono ${qty > 0 ? 'text-green-600' : qty < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                      {qty > 0 ? '+' : ''}{qty}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-3 gap-1 text-xs text-gray-500 mt-2">
                                    <div>Before: <span className="font-semibold text-gray-700">{entry.quantity_before != null ? Number(entry.quantity_before) : '—'}</span></div>
                                    <div>After: <span className="font-semibold text-gray-700">{entry.quantity_after != null ? Number(entry.quantity_after) : bal ?? '—'}</span></div>
                                    {entry.total_cost != null ? <div>Cost: <span className="font-semibold text-gray-700">{currencySymbol}{Number(entry.total_cost).toFixed(2)}</span></div> : <div />}
                                  </div>
                                  {(entry.vendor || entry.reference || entry.reference_order_id) && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      {entry.vendor || entry.reference || `#${entry.reference_order_id!.slice(0, 8)}`}
                                    </div>
                                  )}
                                  {entry.notes && <p className="text-xs text-gray-500 mt-1">{entry.notes}</p>}
                                  {canEditDate && entry.movement_type === 'purchase' && qty > 0 && (
                                    <div className="flex gap-2 mt-2">
                                      <button onClick={() => openEditForm(entry)} disabled={busyId === entry.id} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40">Edit</button>
                                      <button onClick={() => handleCancelPurchase(entry)} disabled={busyId === entry.id} className="px-2 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40">Cancel</button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Purchase modal */}
      <Modal
        open={showPurchaseForm}
        onClose={() => setShowPurchaseForm(false)}
        title="Add Purchase"
        size="md"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setShowPurchaseForm(false)}>Cancel</Button>
            <Button variant="primary" style={{ backgroundColor: theme.primaryColor }} onClick={handlePurchase} loading={saving}>
              Add Purchase
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Item</label>
            <select value={purchaseItemId} onChange={(e) => setPurchaseItemId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
              <option value="">-- Select --</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>{item.name} ({Number(item.current_stock)} {item.unit})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Quantity</label>
              <input type="number" step="any" min="0" value={purchaseQty} onChange={(e) => setPurchaseQty(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Cost per Unit ({currencySymbol})</label>
              <input type="number" step="0.01" min="0" value={purchaseUnitCost} onChange={(e) => setPurchaseUnitCost(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
          </div>
          {purchaseQty && purchaseUnitCost && (() => {
            const totalCost = parseFloat(purchaseQty) * parseFloat(purchaseUnitCost);
            return totalCost > 0 ? (
              <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded border border-gray-200">
                Total Cost: <span className="font-semibold" style={{ color: theme.primaryColor }}>{currencySymbol}{totalCost.toFixed(2)}</span>
              </div>
            ) : null;
          })()}
          <div>
            <label className="block text-sm text-gray-600 mb-1">Vendor (optional)</label>
            <input type="text" value={purchaseVendor} onChange={(e) => setPurchaseVendor(e.target.value)} placeholder="e.g. ABC Suppliers" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Date</label>
            <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Notes (optional)</label>
            <input type="text" value={purchaseNotes} onChange={(e) => setPurchaseNotes(e.target.value)} placeholder="e.g. Monthly flour order" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={purchaseLogExpense} onChange={(e) => setPurchaseLogExpense(e.target.checked)} />
            Also log as an expense
          </label>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
      </Modal>

      {/* Edit Purchase modal */}
      <Modal
        open={editingId !== null}
        onClose={() => setEditingId(null)}
        title="Edit Purchase"
        size="md"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
            <Button variant="primary" style={{ backgroundColor: theme.primaryColor }} onClick={handleEditPurchase} loading={editSaving}>
              Save Changes
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Quantity</label>
              <input type="number" step="any" min="0" value={editQty} onChange={(e) => setEditQty(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Cost per Unit ({currencySymbol})</label>
              <input type="number" step="0.01" min="0" value={editUnitCost} onChange={(e) => setEditUnitCost(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Vendor (optional)</label>
            <input type="text" value={editVendor} onChange={(e) => setEditVendor(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Notes (optional)</label>
            <input type="text" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </div>
          {editingError && <p className="text-red-600 text-sm">{editingError}</p>}
        </div>
      </Modal>
    </div>
  );
}