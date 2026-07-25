'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePOS } from './pos-context';
import { useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { hasPermission } from './permissions';
import { supa } from './supa-query';
import { useEvent, usePublish } from './use-event';

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

interface LedgerEntry {
  id: string;
  inventory_item_id: string;
  movement_type: 'purchase' | 'sale' | 'adjustment' | 'wastage';
  quantity_change: number;
  unit_cost: number | null;
  total_cost: number | null;
  reference_order_id: string | null;
  vendor: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

const MOVEMENT_STYLES: Record<string, string> = {
  purchase: 'bg-green-50 text-green-700 border border-green-200',
  sale: 'bg-blue-50 text-blue-700 border border-blue-200',
  adjustment: 'bg-amber-50 text-amber-700 border border-amber-200',
  wastage: 'bg-red-50 text-red-700 border border-red-200',
};

const MOVEMENT_LABELS: Record<string, string> = {
  purchase: 'Purchase',
  sale: 'Sale',
  adjustment: 'Adjustment',
  wastage: 'Wastage',
};

export default function ItemLedgerView({ slug, theme, currencySymbol }: Props) {
  const publish = usePublish();
  const { user, isLoaded } = useUser();
  const meta = user?.publicMetadata as Record<string, any> | undefined;
  const perms = (meta?.permissions ?? []) as string[];
  const role = (meta?.role ?? '') as string;
  const canEdit = hasPermission(perms, role, 'menu:edit');
  const isSuperAdmin = role === 'super_admin';

  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const isToday = selectedDate === today;
  const canEditDate = canEdit && (isToday || isSuperAdmin);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [purchaseItemId, setPurchaseItemId] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('');
  const [purchaseUnitCost, setPurchaseUnitCost] = useState('');
  const [purchaseVendor, setPurchaseVendor] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [purchaseLogExpense, setPurchaseLogExpense] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const itemsMap = new Map(items.map(i => [i.id, i]));

  const fetchItems = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const result = await supa(slug, { table: 'inventory_items', select: 'id, name, unit, current_stock', order: 'name' });
      if (result.ok && result.data) setItems(result.data as InventoryItem[]);
    } catch (e) { console.error('[Ledger] fetch items', e); }
    setLoading(false);
  }, [isLoaded, slug]);

  const fetchLedger = useCallback(async (date: string) => {
    setLedgerLoading(true);
    try {
      const dayStart = `${date}T00:00:00`;
      const dayEnd = `${date}T23:59:59.999`;
      const result = await supa(slug, {
        table: 'item_ledger',
        select: '*',
        gte: ['created_at', dayStart],
        lte: ['created_at', dayEnd],
        order: { column: 'created_at', ascending: false },
        limit: 1000,
      });
      if (result.ok && result.data) setLedger(result.data as LedgerEntry[]);
    } catch (e) { console.error('[Ledger] fetch', e); }
    setLedgerLoading(false);
  }, [slug]);

  const { setPageTitle } = usePOS();
  useEffect(() => { setPageTitle('Item Ledger'); }, [setPageTitle]);
  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEvent('item_ledger', () => { fetchItems(); });

  useEffect(() => {
    fetchLedger(selectedDate);
  }, [fetchLedger, selectedDate]);

  // Running balance per item — walk each item's entries backwards from current stock
  const runningBalance = new Map<string, number>();
  const ledgerByItem = new Map<string, LedgerEntry[]>();
  for (const e of ledger) {
    if (!ledgerByItem.has(e.inventory_item_id)) ledgerByItem.set(e.inventory_item_id, []);
    ledgerByItem.get(e.inventory_item_id)!.push(e);
  }
  for (const [itemId, entries] of ledgerByItem) {
    const item = itemsMap.get(itemId);
    if (!item) continue;
    let bal = Number(item.current_stock);
    const asc = [...entries].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    for (let i = asc.length - 1; i >= 0; i--) {
      runningBalance.set(asc[i].id, bal);
      bal -= Number(asc[i].quantity_change);
    }
  }

  const totalCost = purchaseQty && purchaseUnitCost
    ? (parseFloat(purchaseQty) * parseFloat(purchaseUnitCost))
    : 0;

  // Day stats across all items
  const dayStats = { purchase: 0, sale: 0, adjustment: 0, wastage: 0 };
  for (const e of ledger) {
    dayStats[e.movement_type] += Number(e.quantity_change);
  }

  const handlePurchase = async () => {
    if (!purchaseItemId) { setError('Select an item'); return; }
    const qty = parseFloat(purchaseQty);
    if (isNaN(qty) || qty <= 0) { setError('Enter a valid quantity'); return; }
    const cost = parseFloat(purchaseUnitCost);
    if (isNaN(cost) || cost < 0) { setError('Enter a valid unit cost'); return; }
    setSaving(true);
    setError('');
    try {
      const theItem = items.find((i) => i.id === purchaseItemId);
      if (!theItem) { setError('Item not found'); setSaving(false); return; }

      const stockResult = await supa(slug, {
        table: 'inventory_items',
        method: 'update',
        eq: ['id', purchaseItemId],
        body: { current_stock: Number(theItem.current_stock) + qty },
      });
      if (!stockResult.ok) { setError(stockResult.error); setSaving(false); return; }

      const vendor = purchaseVendor.trim() || null;
      const notes = purchaseNotes.trim() || null;
      const ledgerResult = await supa(slug, {
        table: 'item_ledger',
        method: 'insert',
        body: {
          inventory_item_id: purchaseItemId,
          movement_type: 'purchase',
          quantity_change: qty,
          unit_cost: cost,
          total_cost: totalCost,
          vendor,
          notes,
          created_by: user?.id || null,
        },
        single: true,
      });
      if (!ledgerResult.ok) { setError(ledgerResult.error); setSaving(false); return; }
      publish('item_ledger', 'INSERT', { id: ledgerResult.data?.id });

      if (purchaseLogExpense) {
        const desc = `Purchase: ${theItem.name} x${qty} ${theItem.unit}${vendor ? ` from ${vendor}` : ''}`;
        const expResult = await supa(slug, {
          table: 'expenses',
          method: 'insert',
          body: {
            category: 'purchases',
            description: desc,
            amount: totalCost,
            expense_date: purchaseDate || today,
            created_by: user?.id || null,
          },
        });
        if (!expResult.ok) console.error('[Ledger] expense log failed', expResult.error);
      }

      setItems((prev) => prev.map((i) =>
        i.id === purchaseItemId ? { ...i, current_stock: Number(i.current_stock) + qty } : i
      ));
      await fetchLedger(selectedDate);
      setShowPurchaseForm(false);
      setPurchaseQty('');
      setPurchaseUnitCost('');
      setPurchaseVendor('');
      setPurchaseNotes('');
    } catch (e: any) { setError(e.message || 'Purchase failed'); }
    setSaving(false);
  };

  const openPurchaseForm = (itemId: string) => {
    setPurchaseItemId(itemId);
    setPurchaseQty('');
    setPurchaseUnitCost('');
    setPurchaseVendor('');
    setPurchaseDate(today);
    setPurchaseNotes('');
    setPurchaseLogExpense(true);
    setError('');
    setShowPurchaseForm(true);
  };

  if (!isLoaded) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading...</p></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Date selector */}
        <div className="flex items-center justify-end gap-3 mb-4">
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
            />
            {!canEditDate && canEdit && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                Past date — read only
              </span>
            )}
          </div>
        </div>

        {/* Day stats across all items */}
        {ledger.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Day Stats — All Items — {selectedDate}</div>
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="bg-green-50 rounded-lg p-2 border border-green-200">
                <div className="text-lg font-bold text-green-700">+{dayStats.purchase}</div>
                <div className="text-[10px] text-green-600 uppercase tracking-wider">Purchases</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
                <div className="text-lg font-bold text-blue-700">{dayStats.sale}</div>
                <div className="text-[10px] text-blue-600 uppercase tracking-wider">Sales</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-2 border border-amber-200">
                <div className="text-lg font-bold text-amber-700">{dayStats.adjustment > 0 ? '+' : ''}{dayStats.adjustment}</div>
                <div className="text-[10px] text-amber-600 uppercase tracking-wider">Adjustments</div>
              </div>
              <div className="bg-red-50 rounded-lg p-2 border border-red-200">
                <div className="text-lg font-bold text-red-700">{dayStats.wastage}</div>
                <div className="text-[10px] text-red-600 uppercase tracking-wider">Wastage</div>
              </div>
            </div>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">{error}</div>}

        {/* Transaction history — all items */}
        {ledgerLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center mb-4">
            <p className="text-gray-400 text-sm">Loading ledger...</p>
          </div>
        ) : ledger.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center mb-4">
            <p className="text-gray-400 text-sm">No transactions on {selectedDate}.</p>
          </div>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Transaction History — {selectedDate}</h2>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">Item</th>
                    <th className="text-left px-4 py-3 font-medium">Time</th>
                    <th className="text-left px-4 py-3 font-medium">Type</th>
                    <th className="text-right px-4 py-3 font-medium">Qty Change</th>
                    <th className="text-right px-4 py-3 font-medium">Running Stock</th>
                    <th className="text-right px-4 py-3 font-medium">Cost</th>
                    <th className="text-left px-4 py-3 font-medium">Vendor / Order</th>
                    <th className="text-left px-4 py-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((entry) => {
                    const item = itemsMap.get(entry.inventory_item_id);
                    const bal = runningBalance.get(entry.id) ?? 0;
                    const qty = Number(entry.quantity_change);
                    return (
                      <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{item?.name || 'Unknown'}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${MOVEMENT_STYLES[entry.movement_type] || ''}`}>
                            {MOVEMENT_LABELS[entry.movement_type] || entry.movement_type}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-semibold ${qty > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {qty > 0 ? '+' : ''}{qty}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-700">{bal}</td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {entry.total_cost ? `${currencySymbol}${Number(entry.total_cost).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">
                          {entry.vendor || (entry.reference_order_id ? `#${entry.reference_order_id.slice(0, 8)}` : '—')}
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{entry.notes || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="md:hidden space-y-3 mb-4">
              {ledger.map((entry) => {
                const item = itemsMap.get(entry.inventory_item_id);
                const bal = runningBalance.get(entry.id) ?? 0;
                const qty = Number(entry.quantity_change);
                return (
                  <div key={entry.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-sm font-medium text-gray-800">{item?.name || 'Unknown'}</div>
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold ${MOVEMENT_STYLES[entry.movement_type] || ''}`}>
                          {MOVEMENT_LABELS[entry.movement_type] || entry.movement_type}
                        </span>
                        <div className="text-xs text-gray-400 mt-1">
                          {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div className={`text-lg font-bold font-mono ${qty > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {qty > 0 ? '+' : ''}{qty}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs text-gray-500 mt-2">
                      <div>Running Stock: <span className="font-semibold text-gray-700">{bal}</span></div>
                      {entry.total_cost ? <div>Cost: <span className="font-semibold text-gray-700">{currencySymbol}{Number(entry.total_cost).toFixed(2)}</span></div> : null}
                      {entry.vendor && <div>Vendor: {entry.vendor}</div>}
                      {entry.reference_order_id && <div>Order: #{entry.reference_order_id.slice(0, 8)}</div>}
                    </div>
                    {entry.notes && <p className="text-xs text-gray-500 mt-1">{entry.notes}</p>}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Item list with Add Purchase */}
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400 text-sm">Loading items...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400 text-sm">No inventory items found. Add items in the Inventory tab first.</p>
          </div>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Items — Add Purchase</h2>
            {/* Desktop item table */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">Item Name</th>
                    <th className="text-right px-4 py-3 font-medium">Current Stock</th>
                    <th className="text-center px-4 py-3 font-medium">Unit</th>
                    <th className="text-center px-4 py-3 font-medium w-[140px]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">{Number(item.current_stock)}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{item.unit}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openPurchaseForm(item.id)}
                          disabled={!canEditDate}
                          className="px-3 py-1.5 text-xs rounded text-white font-medium transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ backgroundColor: theme.primaryColor }}
                        >
                          + Add Purchase
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile item cards */}
            <div className="md:hidden space-y-2 mb-4">
              {items.map((item) => (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 text-sm truncate">{item.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Stock: <span className="font-mono font-semibold text-gray-700">{Number(item.current_stock)}</span> {item.unit}
                      </div>
                    </div>
                    <button
                      onClick={() => openPurchaseForm(item.id)}
                      disabled={!canEditDate}
                      className="ml-2 px-3 py-1.5 text-xs rounded text-white font-medium shrink-0 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ backgroundColor: theme.primaryColor }}
                    >
                      + Purchase
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add Purchase Modal */}
      {showPurchaseForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setShowPurchaseForm(false)}>
          <div className="bg-white md:rounded-lg shadow-xl w-full md:max-w-md md:mx-4 p-6 rounded-t-xl md:max-h-[90vh] md:overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Add Purchase</h2>
              <button onClick={() => setShowPurchaseForm(false)} className="md:hidden text-gray-400 text-xl">✕</button>
            </div>
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
              {totalCost > 0 && (
                <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded border border-gray-200">
                  Total Cost: <span className="font-semibold" style={{ color: theme.primaryColor }}>{currencySymbol}{totalCost.toFixed(2)}</span>
                </div>
              )}
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
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowPurchaseForm(false)} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handlePurchase} disabled={saving} className="px-4 py-2 text-sm rounded text-white font-medium disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>
                {saving ? 'Saving...' : 'Add Purchase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
