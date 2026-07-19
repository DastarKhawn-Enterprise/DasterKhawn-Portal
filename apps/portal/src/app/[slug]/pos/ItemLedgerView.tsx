'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { hasPermission } from './permissions';
import { supa } from './supa-query';

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
  const { user, isLoaded } = useUser();
  const meta = user?.publicMetadata as Record<string, any> | undefined;
  const perms = (meta?.permissions ?? []) as string[];
  const role = (meta?.role ?? '') as string;
  const canEdit = hasPermission(perms, role, 'menu:edit');

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [purchaseItemId, setPurchaseItemId] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('');
  const [purchaseUnitCost, setPurchaseUnitCost] = useState('');
  const [purchaseVendor, setPurchaseVendor] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [purchaseLogExpense, setPurchaseLogExpense] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchItems = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const result = await supa(slug, { table: 'inventory_items', select: 'id, name, unit, current_stock', order: 'name' });
      if (result.ok && result.data) setItems(result.data as InventoryItem[]);
    } catch (e) { console.error('[Ledger] fetch items', e); }
    setLoading(false);
  }, [isLoaded, slug]);

  const fetchLedger = useCallback(async (itemId: string) => {
    if (!itemId) { setLedger([]); return; }
    setLedgerLoading(true);
    try {
      const result = await supa(slug, {
        table: 'item_ledger',
        select: '*',
        eq: ['inventory_item_id', itemId],
        order: { column: 'created_at', ascending: false },
        limit: 1000,
      });
      if (result.ok && result.data) setLedger(result.data as LedgerEntry[]);
    } catch (e) { console.error('[Ledger] fetch', e); }
    setLedgerLoading(false);
  }, [slug]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => { fetchLedger(selectedItemId); }, [fetchLedger, selectedItemId]);

  const selectedItem = items.find((i) => i.id === selectedItemId) || null;

  // Running balance — calculate cumulative stock over entries ascending
  const ascending = [...ledger].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  let running = selectedItem ? Number(selectedItem.current_stock) : 0;
  // Walk backwards from the last entry: subtract each change to get prior stock
  // Actually: start from current and subtract changes from newest to oldest
  const runningBalance = new Map<string, number>();
  let bal = running;
  for (let i = ascending.length - 1; i >= 0; i--) {
    runningBalance.set(ascending[i].id, bal);
    bal -= Number(ascending[i].quantity_change);
  }

  const totalCost = purchaseQty && purchaseUnitCost
    ? (parseFloat(purchaseQty) * parseFloat(purchaseUnitCost))
    : 0;

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

      // 1. Update stock
      const stockResult = await supa(slug, {
        table: 'inventory_items',
        method: 'update',
        eq: ['id', purchaseItemId],
        body: { current_stock: Number(theItem.current_stock) + qty },
      });
      if (!stockResult.ok) { setError(stockResult.error); setSaving(false); return; }

      // 2. Insert ledger row
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

      // 3. Optionally log as expense
      if (purchaseLogExpense) {
        const desc = `Purchase: ${theItem.name} x${qty} ${theItem.unit}${vendor ? ` from ${vendor}` : ''}`;
        const expResult = await supa(slug, {
          table: 'expenses',
          method: 'insert',
          body: {
            category: 'purchases',
            description: desc,
            amount: totalCost,
            expense_date: purchaseDate || new Date().toISOString().split('T')[0],
            created_by: user?.id || null,
          },
        });
        if (!expResult.ok) console.error('[Ledger] expense log failed', expResult.error);
      }

      // 4. Refresh
      setItems((prev) => prev.map((i) =>
        i.id === purchaseItemId ? { ...i, current_stock: Number(i.current_stock) + qty } : i
      ));
      await fetchLedger(purchaseItemId);
      setShowPurchaseForm(false);
      setPurchaseQty('');
      setPurchaseUnitCost('');
      setPurchaseVendor('');
      setPurchaseNotes('');
    } catch (e: any) { setError(e.message || 'Purchase failed'); }
    setSaving(false);
  };

  const openPurchaseForm = (itemId?: string) => {
    setPurchaseItemId(itemId || selectedItemId || (items.length > 0 ? items[0].id : ''));
    setPurchaseQty('');
    setPurchaseUnitCost('');
    setPurchaseVendor('');
    setPurchaseDate(new Date().toISOString().split('T')[0]);
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h1 className="text-2xl font-bold text-gray-800">Item Ledger</h1>
          {canEdit && (
            <button onClick={() => openPurchaseForm()} className="px-4 py-2 text-white rounded text-sm font-medium transition-colors" style={{ backgroundColor: theme.primaryColor }}>
              + Add Purchase
            </button>
          )}
        </div>

        {/* Item selector */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-600 mb-1">Select Inventory Item</label>
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
              >
                <option value="">-- Select an item --</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({Number(item.current_stock)} {item.unit})
                  </option>
                ))}
              </select>
            </div>
            {selectedItem && (
              <div className="flex items-center gap-4 text-sm">
                <div className="bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
                  <span className="text-gray-400 text-xs uppercase tracking-wider">Current Stock</span>
                  <p className="text-xl font-bold" style={{ color: theme.primaryColor }}>
                    {Number(selectedItem.current_stock)} {selectedItem.unit}
                  </p>
                </div>
                {canEdit && (
                  <button onClick={() => openPurchaseForm(selectedItem.id)} className="px-3 py-2 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100">
                    + Purchase for this item
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">{error}</div>}

        {/* Transaction history */}
        {!selectedItemId ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400 text-sm">Select an inventory item to view its transaction history.</p>
          </div>
        ) : ledgerLoading ? (
          <p className="text-gray-400 text-sm">Loading ledger...</p>
        ) : ledger.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400 text-sm">No transactions yet for this item.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">Date</th>
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
                    const bal = runningBalance.get(entry.id) ?? 0;
                    const qty = Number(entry.quantity_change);
                    return (
                      <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {new Date(entry.created_at).toLocaleDateString()}{' '}
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
            <div className="md:hidden space-y-3">
              {ledger.map((entry) => {
                const bal = runningBalance.get(entry.id) ?? 0;
                const qty = Number(entry.quantity_change);
                return (
                  <div key={entry.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${MOVEMENT_STYLES[entry.movement_type] || ''}`}>
                          {MOVEMENT_LABELS[entry.movement_type] || entry.movement_type}
                        </span>
                        <div className="text-xs text-gray-400 mt-1">
                          {new Date(entry.created_at).toLocaleDateString()}{' '}
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
