'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import { MenuGrid, CartSidebar } from '@sat-sys/pos-ui';
import type { MenuItem, CartItem, ThemeConfig } from '@sat-sys/pos-ui';
import type { SupabaseClient, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import ReceiptView from './ReceiptView';
import { deductInventorySupa } from './inventory-utils';
import { updateCustomerLoyaltySupa, searchCustomersSupa } from './customer-utils';
import { supa } from './supa-query';

interface TableRecord {
  id: string;
  table_number: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved';
  current_order_id: string | null;
  created_at: string;
}

interface OrderItem {
  menu_item_id: string;
  quantity: number;
  price_at_order: number;
  menu_items: { name: string };
}

interface Order {
  id: string;
  order_number: number;
  status: string;
  total: number;
  tax_amount?: number;
  created_at: string;
  customer_id?: string | null;
  order_items: OrderItem[];
}

interface Props {
  slug: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  theme: ThemeConfig;
  brandName: string;
}

const statusDisplay: Record<string, string> = {
  pending: 'Pending',
  in_kitchen: 'In Kitchen',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const statusColor: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  in_kitchen: 'bg-blue-100 text-blue-800 border-blue-300',
  ready: 'bg-green-100 text-green-800 border-green-300',
  cancelled: 'bg-red-100 text-red-800 border-red-300',
};

const tableBadge: Record<string, string> = {
  available: 'bg-green-100 text-green-800',
  occupied: 'bg-red-100 text-red-800',
  reserved: 'bg-yellow-100 text-yellow-800',
};

const tableBorder: Record<string, string> = {
  available: 'border-green-300 hover:border-green-500',
  occupied: 'border-red-300 hover:border-red-500',
  reserved: 'border-yellow-300 hover:border-yellow-500',
};

export default function DineInView({ slug, supabaseUrl, supabaseAnonKey, theme, brandName }: Props) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [authReady, setAuthReady] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableRecord | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [tableOrder, setTableOrder] = useState<Order | null>(null);
  const [tableOrderLoading, setTableOrderLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState(false);
  const [editCart, setEditCart] = useState<CartItem[]>([]);

  // Settings (tax, currency, footer)
  const [settings, setSettings] = useState<{ taxEnabled: boolean; taxRate: number; currencySymbol: string; footerText: string } | null>(null);

  // Menu search
  const [menuSearch, setMenuSearch] = useState('');
  const [mostOrderedItems, setMostOrderedItems] = useState<MenuItem[]>([]);
  const [mostOrderedLoading, setMostOrderedLoading] = useState(false);

  // Customer linking for new orders
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string; phone: string | null } | null>(null);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);

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

  // Fetch menu
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    supa(slug, { table: 'menu_items', select: 'id, name, description, price, category, available', order: 'name', limit: 500 })
      .then((r) => { if (!cancelled && r.ok) setMenuItems(r.data ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authReady, slug]);

  // Fetch tables (initial load via supa) + Realtime (via client)
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;

    supa(slug, { table: 'tables', select: '*', order: 'table_number' })
      .then((r) => { if (!cancelled && r.ok) setTables(r.data as TableRecord[]); })
      .catch(() => {});

    // Realtime subscription
    let channel: ReturnType<SupabaseClient['channel']> | null = null;
    getSupabaseClient().then((client) => {
      if (cancelled || !client) return;
      channel = client
        .channel('dine-in-tables')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'tables' },
          (payload: RealtimePostgresChangesPayload<TableRecord>) => {
            const rec = payload.new as TableRecord | null;
            if (!rec) return;
            setTables((prev) => {
              const idx = prev.findIndex((t) => t.id === rec.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = rec;
                return next;
              }
              return [...prev, rec];
            });
          })
        .subscribe();
    }).catch(() => {});

    return () => { cancelled = true; if (channel) channel.unsubscribe(); };
  }, [authReady, getSupabaseClient, slug]);

  // When selectedTable changes to occupied, fetch its order
  useEffect(() => {
    if (!selectedTable || selectedTable.status !== 'occupied' || !selectedTable.current_order_id) {
      setTableOrder(null);
      return;
    }
    setTableOrderLoading(true);
    let cancelled = false;

    supa(slug, {
      table: 'orders',
      select: 'id, order_number, status, total, tax_amount, created_at, order_items (menu_item_id, quantity, price_at_order, menu_items (name))',
      eq: ['id', selectedTable.current_order_id],
      single: true,
    })
      .then((r) => {
        if (!cancelled && r.ok) setTableOrder(r.data as unknown as Order);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTableOrderLoading(false); });

    return () => { cancelled = true; };
  }, [selectedTable, slug]);

  // Fetch settings
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    supa(slug, { table: 'settings', select: 'tax_enabled, tax_rate, currency_symbol, receipt_footer_text', limit: 1 })
      .then((r) => {
        if (cancelled || !r.ok || !r.data?.[0]) return;
        const d = r.data[0];
        setSettings({ taxEnabled: d.tax_enabled, taxRate: Number(d.tax_rate), currencySymbol: d.currency_symbol, footerText: d.receipt_footer_text });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authReady, slug]);

  // Fetch most ordered items
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    (async () => {
      setMostOrderedLoading(true);
      try {
        const r = await supa(slug, { table: 'order_items', select: 'menu_item_id, quantity, menu_items!inner(id, name, description, price, category, available)', limit: 5000 });
        if (cancelled || !r.ok || !r.data) return;
        const grouped = new Map<string, { item: MenuItem; qty: number }>();
        for (const row of r.data as any[]) {
          const mi = (row.menu_items as any);
          if (mi?.available === false) continue;
          const key = mi.id;
          const prev = grouped.get(key) || { item: mi as unknown as MenuItem, qty: 0 };
          prev.qty += row.quantity;
          grouped.set(key, prev);
        }
        setMostOrderedItems(
          Array.from(grouped.values())
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 10)
            .map((entry) => ({ id: entry.item.id, name: entry.item.name, description: entry.item.description, price: entry.item.price, category: entry.item.category, available: entry.item.available }))
        );
      } catch (e) { console.error('[MostOrdered]', e); }
      setMostOrderedLoading(false);
    })();
    return () => { cancelled = true; };
  }, [authReady, slug]);

  // Customer search debounce
  useEffect(() => {
    if (!authReady) return;
    const timer = setTimeout(async () => {
      if (!customerSearch.trim()) { setCustomerResults([]); return; }
      setCustomerSearchLoading(true);
      try {
        const results = await searchCustomersSupa(slug, customerSearch);
        setCustomerResults(results);
      } catch (e) {}
      setCustomerSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, authReady, slug]);

  const handleSelectTable = useCallback((table: TableRecord) => {
    setCart([]);
    setTableOrder(null);
    setSelectedTable(table);
    setMobilePanelOpen(true);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedTable(null);
    setCart([]);
    setTableOrder(null);
    setMobilePanelOpen(false);
  }, []);

  const toggleReserve = useCallback(async (table: TableRecord) => {
    const newStatus = table.status === 'reserved' ? 'available' : 'reserved';
    try {
      const r = await supa(slug, { table: 'tables', method: 'update', body: { status: newStatus }, eq: ['id', table.id] });
      if (!r.ok) return;
      setTables((prev) => prev.map((t) => (t.id === table.id ? { ...t, status: newStatus as TableRecord['status'] } : t)));
    } catch (e) {}
  }, [slug]);

  const handleQuickReserve = useCallback((table: TableRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleReserve(table);
  }, [toggleReserve]);

  // Cart handlers
  const handleAddToCart = useCallback((item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.id === item.id);
      if (existing) return prev.map((ci) => (ci.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci));
      return [...prev, { id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  }, []);

  const handleUpdateQuantity = useCallback((itemId: string, qty: number) => {
    if (qty <= 0) { setCart((prev) => prev.filter((ci) => ci.id !== itemId)); return; }
    setCart((prev) => prev.map((ci) => (ci.id === itemId ? { ...ci, quantity: qty } : ci)));
  }, []);

  const handleRemoveItem = useCallback((itemId: string) => {
    setCart((prev) => prev.filter((ci) => ci.id !== itemId));
  }, []);

  // Checkout — creates order with table_id, then updates table to occupied
  const handleCheckout = useCallback(async () => {
    if (cart.length === 0 || !selectedTable) return;
    setCheckingOut(true);
    try {
      const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      let taxAmount = 0;
      if (settings?.taxEnabled && settings.taxRate > 0) {
        taxAmount = subtotal * (settings.taxRate / 100);
      }
      const total = subtotal + taxAmount;

      const orderR = await supa(slug, {
        table: 'orders',
        method: 'insert',
        body: { status: 'pending', source: 'pos', total, tax_amount: taxAmount, table_id: selectedTable.id, customer_id: selectedCustomer?.id || null },
        select: 'id, order_number, created_at',
      });
      if (!orderR.ok || !orderR.data?.[0]) { console.error('[DineIn Checkout]', orderR.error); setCheckingOut(false); return; }
      const order = orderR.data[0];

      const items = cart.map((item) => ({ order_id: order.id, menu_item_id: item.id, quantity: item.quantity, price_at_order: item.price }));
      const itemsR = await supa(slug, { table: 'order_items', method: 'insert', body: items });
      if (!itemsR.ok) { console.error('[DineIn Items]', itemsR.error); setCheckingOut(false); return; }

      // Deduct inventory for linked ingredients
      await deductInventorySupa(slug, cart).catch((e) => console.error('[DineIn Inventory deduct]', e));

      // Update table to occupied
      await supa(slug, { table: 'tables', method: 'update', body: { status: 'occupied', current_order_id: order.id }, eq: ['id', selectedTable.id] });

      // Optimistic local updates
      setTables((prev) => prev.map((t) => (t.id === selectedTable.id ? { ...t, status: 'occupied' as const, current_order_id: order.id } : t)));
      setSelectedTable((prev) => prev ? { ...prev, status: 'occupied', current_order_id: order.id } : null);

      const newOrder: Order = {
        id: order.id,
        order_number: order.order_number,
        status: 'pending',
        total,
        tax_amount: taxAmount,
        created_at: order.created_at,
        customer_id: selectedCustomer?.id || null,
        order_items: cart.map((item) => ({
          menu_item_id: item.id,
          quantity: item.quantity,
          price_at_order: item.price,
          menu_items: { name: item.name },
        })),
      };
      setTableOrder(newOrder);
      setCart([]);
      setSelectedCustomer(null);
      setCustomerSearch('');
      setCustomerResults([]);
    } catch (e) { console.error('[DineIn Checkout]', e); }
    setCheckingOut(false);
  }, [cart, selectedTable, selectedCustomer, settings, slug]);

  // Status update for occupied table — also reverts table on completed/cancelled
  const handleUpdateStatus = useCallback(async (orderId: string, newStatus: string) => {
    if (!selectedTable) return;
    setUpdating(orderId);
    try {
      const orderR = await supa(slug, { table: 'orders', method: 'update', body: { status: newStatus }, eq: ['id', orderId] });
      if (!orderR.ok) { console.error('[DineIn Status]', orderR.error); setUpdating(null); return; }

      // Award loyalty points when order is completed and linked to a customer
      if (newStatus === 'completed') {
        const coR = await supa(slug, { table: 'orders', select: 'customer_id, total', eq: ['id', orderId], single: true });
        if (coR.ok && coR.data?.customer_id) {
          await updateCustomerLoyaltySupa(slug, coR.data.customer_id, Number(coR.data.total));
        }
      }

      if (newStatus === 'completed' || newStatus === 'cancelled') {
        await supa(slug, { table: 'tables', method: 'update', body: { status: 'available', current_order_id: null }, eq: ['id', selectedTable.id] });
        setTables((prev) => prev.map((t) => (t.id === selectedTable.id ? { ...t, status: 'available' as const, current_order_id: null } : t)));
        setSelectedTable(null);
        setTableOrder(null);
      } else {
        setTableOrder((prev) => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (e) { console.error('[DineIn Status]', e); }
    setUpdating(null);
  }, [selectedTable, slug]);

  const handlePrintBill = useCallback((order: Order) => {
    setReceiptOrder(order);
  }, []);

  const handleStartEdit = useCallback(() => {
    if (!tableOrder) return;
    setEditCart(
      tableOrder.order_items.map((oi) => ({
        id: oi.menu_item_id,
        name: oi.menu_items?.name || 'Unknown',
        price: Number(oi.price_at_order),
        quantity: oi.quantity,
      }))
    );
    setEditingOrder(true);
  }, [tableOrder]);

  const handleEditAdd = useCallback((item: MenuItem) => {
    setEditCart((prev) => {
      const existing = prev.find((ci) => ci.id === item.id);
      if (existing) return prev.map((ci) => (ci.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci));
      return [...prev, { id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  }, []);

  const handleEditUpdateQty = useCallback((itemId: string, qty: number) => {
    if (qty <= 0) { setEditCart((prev) => prev.filter((ci) => ci.id !== itemId)); return; }
    setEditCart((prev) => prev.map((ci) => (ci.id === itemId ? { ...ci, quantity: qty } : ci)));
  }, []);

  const handleEditRemove = useCallback((itemId: string) => {
    setEditCart((prev) => prev.filter((ci) => ci.id !== itemId));
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!tableOrder || !tableOrder.id) return;
    setUpdating(tableOrder.id);
    try {
      const subtotal = editCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      let taxAmount = 0;
      if (settings?.taxEnabled && settings.taxRate > 0) {
        taxAmount = subtotal * (settings.taxRate / 100);
      }
      const total = subtotal + taxAmount;

      await supa(slug, { table: 'order_items', method: 'delete', eq: ['order_id', tableOrder.id] });
      if (editCart.length > 0) {
        const items = editCart.map((item) => ({
          order_id: tableOrder.id,
          menu_item_id: item.id,
          quantity: item.quantity,
          price_at_order: item.price,
        }));
        await supa(slug, { table: 'order_items', method: 'insert', body: items });
      }
      await supa(slug, { table: 'orders', method: 'update', body: { total, tax_amount: taxAmount }, eq: ['id', tableOrder.id] });

      setTableOrder((prev) =>
        prev ? { ...prev, total, tax_amount: taxAmount, order_items: editCart.map((ci) => ({ menu_item_id: ci.id, quantity: ci.quantity, price_at_order: ci.price, menu_items: { name: ci.name } })) } : prev
      );
      setEditingOrder(false);
    } catch (e) { console.error('[DineIn Edit Order]', e); }
    setUpdating(null);
  }, [tableOrder, editCart, settings, slug]);

  const handleCancelEdit = useCallback(() => {
    setEditingOrder(false);
    setEditCart([]);
  }, []);

  if (!isLoaded || !authReady) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading...</p></div>;
  }

  const selectedIsAvailable = selectedTable?.status === 'available';
  const selectedIsReserved = selectedTable?.status === 'reserved';

  return (
    <><div className="flex-1 flex overflow-hidden min-w-0">
      {/* ── FLOOR PLAN ── */}
      <div className={`${mobilePanelOpen ? 'hidden md:flex' : 'flex'} flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6`}>
        <h2 className="text-lg font-bold text-gray-700 mb-4 uppercase tracking-wider">Floor Plan</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
          {tables.map((table) => (
            <button
              key={table.id}
              onClick={() => handleSelectTable(table)}
              className={`relative p-3 md:p-4 rounded-xl border-2 text-center transition-all hover:shadow-md ${tableBorder[table.status] || 'border-gray-300'} ${
                selectedTable?.id === table.id ? 'ring-2 ring-offset-2 ring-blue-400' : ''
              }`}
            >
              {/* Status badge */}
              <span className={`absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${tableBadge[table.status] || 'bg-gray-100 text-gray-600'}`}>
                {table.status}
              </span>
              {/* Table shape */}
              <div className="mx-auto mb-1 flex items-center justify-center w-12 h-9 md:w-14 md:h-10 rounded border-2 border-gray-400 bg-white/60 text-gray-600 text-xs font-bold">
                {table.table_number}
              </div>
              <div className="text-xs text-gray-500">{table.capacity} seat{table.capacity !== 1 ? 's' : ''}</div>
              {/* Reserve toggle for available/reserved */}
              {(table.status === 'available' || table.status === 'reserved') && (
                <button
                  onClick={(e) => handleQuickReserve(table, e)}
                  className={`mt-1.5 text-[10px] px-2 py-0.5 rounded font-semibold ${
                    table.status === 'reserved'
                      ? 'bg-yellow-200 text-yellow-800 hover:bg-yellow-300'
                      : 'bg-green-200 text-green-800 hover:bg-green-300'
                  }`}
                >
                  {table.status === 'reserved' ? 'Unreserve' : 'Reserve'}
                </button>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── SIDE PANEL ── */}
      {selectedTable && (
        <div className={`${mobilePanelOpen ? 'flex' : 'hidden md:flex'} w-full md:w-[480px] flex-shrink-0 bg-white border-l border-gray-200 flex-col overflow-hidden`}>
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <button
                onClick={handleClosePanel}
                className="md:hidden text-sm text-gray-500 hover:text-gray-800"
              >
                ← Back
              </button>
              <div>
                <h3 className="font-bold text-gray-800">
                  Table {selectedTable.table_number}
                </h3>
                <p className="text-xs text-gray-500">
                  {selectedTable.capacity} seats &middot;{' '}
                  <span className={`font-semibold ${selectedTable.status === 'available' ? 'text-green-600' : selectedTable.status === 'occupied' ? 'text-red-600' : 'text-yellow-600'}`}>
                    {selectedTable.status.charAt(0).toUpperCase() + selectedTable.status.slice(1)}
                  </span>
                </p>
              </div>
            </div>
            <button
              onClick={handleClosePanel}
              className="hidden md:block text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ✕
            </button>
          </div>

          {/* Panel body */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedIsAvailable && (
              <>
                <div className="px-4 py-3 border-b border-gray-100 flex gap-2">
                  <span className="text-xs font-semibold text-gray-700 uppercase">New Order</span>
                  <button
                    onClick={() => toggleReserve(selectedTable)}
                    className="ml-auto text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 font-semibold"
                  >
                    Reserve Table
                  </button>
                </div>
                {/* Customer linking */}
                <div className="px-4 py-3 border-b border-gray-200">
                  {selectedCustomer ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs text-gray-400">Customer</span>
                        <p className="text-sm font-medium text-gray-800">{selectedCustomer.name}</p>
                        {selectedCustomer.phone && <p className="text-xs text-gray-500">{selectedCustomer.phone}</p>}
                      </div>
                      <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); setCustomerResults([]); }} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Link Customer (optional)</label>
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        placeholder="Search by name or phone..."
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                      />
                      {customerSearchLoading && <p className="text-xs text-gray-400 mt-1">Searching...</p>}
                      {customerResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto">
                          {customerResults.map((r) => (
                            <button
                              key={r.id}
                              onClick={() => { setSelectedCustomer(r); setCustomerSearch(''); setCustomerResults([]); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                            >
                              <span className="font-medium text-gray-800">{r.name}</span>
                              {r.phone && <span className="text-gray-400 ml-2">{r.phone}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {menuItems.length > 0 ? (
                  <MenuGrid menuItems={menuItems} onAddToCart={handleAddToCart} theme={theme} currencySymbol={settings?.currencySymbol} searchQuery={menuSearch} onSearchChange={setMenuSearch} mostOrderedItems={mostOrderedItems} />
                ) : (
                  <div className="flex-1 flex items-center justify-center"><p className="text-gray-400">Loading menu...</p></div>
                )}
                <CartSidebar
                  cartItems={cart}
                  onUpdateQuantity={handleUpdateQuantity}
                  onRemoveItem={handleRemoveItem}
                  onCheckout={handleCheckout}
                  disabled={cart.length === 0 || checkingOut}
                  theme={theme}
                  currencySymbol={settings?.currencySymbol}
                />
              </>
            )}

            {selectedIsReserved && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
                <p className="text-gray-500 text-sm">This table is reserved.</p>
                <button
                  onClick={() => toggleReserve(selectedTable)}
                  className="px-4 py-2 rounded-lg bg-yellow-100 text-yellow-800 hover:bg-yellow-200 font-semibold text-sm"
                >
                  Unreserve Table
                </button>
              </div>
            )}

            {selectedTable.status === 'occupied' && (
              <div className="flex-1 overflow-y-auto scrollbar-hide p-4">
                {tableOrderLoading ? (
                  <div className="flex items-center justify-center h-full"><p className="text-gray-400">Loading order...</p></div>
                ) : tableOrder ? (
                  <>
                    {editingOrder ? (
                      <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
                          <h4 className="text-sm font-semibold text-gray-700">Editing Order #{tableOrder.order_number}</h4>
                          <div className="flex gap-2">
                            <button onClick={handleCancelEdit} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded">Cancel</button>
                            <button onClick={handleSaveEdit} disabled={updating === tableOrder.id} className="px-3 py-1.5 text-xs font-semibold text-white rounded disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>
                              {updating === tableOrder.id ? '...' : 'Save'}
                            </button>
                          </div>
                        </div>
                        <div className="px-4 py-3 border-b border-gray-100 space-y-2 max-h-60 overflow-y-auto">
                          {editCart.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No items in order.</p>}
                          {editCart.map((ci) => (
                            <div key={ci.id} className="flex items-center gap-2 p-1.5 rounded border border-gray-200">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{ci.name}</div>
                                <div className="text-xs text-gray-400">{settings?.currencySymbol}{ci.price.toFixed(2)} each</div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button onClick={() => handleEditUpdateQty(ci.id, ci.quantity - 1)} className="w-7 h-7 rounded text-sm font-bold hover:bg-gray-100 flex items-center justify-center">−</button>
                                <span className="w-6 text-center text-sm">{ci.quantity}</span>
                                <button onClick={() => handleEditUpdateQty(ci.id, ci.quantity + 1)} className="w-7 h-7 rounded text-sm font-bold hover:bg-gray-100 flex items-center justify-center">+</button>
                              </div>
                              <button onClick={() => handleEditRemove(ci.id)} className="text-gray-400 hover:text-red-500 text-sm">✕</button>
                            </div>
                          ))}
                        </div>
                        <div className="px-4 py-2 border-b border-gray-100 text-right text-sm font-bold">
                          Total: {settings?.currencySymbol}{editCart.reduce((s, ci) => s + ci.price * ci.quantity, 0).toFixed(2)}
                        </div>
                        {menuItems.length > 0 ? (
                          <MenuGrid menuItems={menuItems} onAddToCart={handleEditAdd} theme={theme} />
                        ) : (
                          <div className="flex-1 flex items-center justify-center"><p className="text-gray-400">Loading menu...</p></div>
                        )}
                      </div>
                    ) : (
                      <>
                        <table className="w-full text-sm mb-4">
                          <thead>
                            <tr className="text-gray-500 border-b">
                              <th className="text-left py-1.5 font-medium">Item</th>
                              <th className="text-right py-1.5 font-medium">Qty</th>
                              <th className="text-right py-1.5 font-medium">Price</th>
                              <th className="text-right py-1.5 font-medium">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tableOrder.order_items.map((item, i) => (
                              <tr key={i} className="border-b border-gray-100">
                                <td className="py-1.5">{item.menu_items?.name || 'Unknown'}</td>
                                <td className="text-right py-1.5">{item.quantity}</td>
                                <td className="text-right py-1.5">{settings?.currencySymbol}{Number(item.price_at_order).toFixed(2)}</td>
                                <td className="text-right py-1.5 font-medium">{settings?.currencySymbol}{(item.quantity * Number(item.price_at_order)).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="font-semibold text-base">
                              <td colSpan={3} className="text-right py-1.5">Total</td>
                              <td className="text-right py-1.5">{settings?.currencySymbol}{Number(tableOrder.total).toFixed(2)}</td>
                            </tr>
                          </tfoot>
                        </table>

                        <div className="flex flex-wrap gap-2">
                          {tableOrder.status === 'pending' && (
                            <ActionButton label="Start Cooking" color="bg-blue-600 hover:bg-blue-700" disabled={updating === tableOrder.id} onClick={() => handleUpdateStatus(tableOrder.id, 'in_kitchen')} updating={updating === tableOrder.id} />
                          )}
                          {tableOrder.status === 'in_kitchen' && (
                            <ActionButton label="Mark Ready" color="bg-amber-600 hover:bg-amber-700" disabled={updating === tableOrder.id} onClick={() => handleUpdateStatus(tableOrder.id, 'ready')} updating={updating === tableOrder.id} />
                          )}
                          {tableOrder.status === 'ready' && (
                            <ActionButton label="Complete Order" color="bg-green-600 hover:bg-green-700" disabled={updating === tableOrder.id} onClick={() => handleUpdateStatus(tableOrder.id, 'completed')} updating={updating === tableOrder.id} />
                          )}
                          <ActionButton label="Print Bill" color="bg-gray-600 hover:bg-gray-700" disabled={false} onClick={() => handlePrintBill(tableOrder)} updating={false} />
                          {tableOrder.status !== 'completed' && tableOrder.status !== 'cancelled' && (
                            <ActionButton label="Edit Order" color="bg-indigo-600 hover:bg-indigo-700" disabled={false} onClick={handleStartEdit} updating={false} />
                          )}
                          {tableOrder.status !== 'cancelled' && (
                            <ActionButton label="Cancel Order" color="bg-red-600 hover:bg-red-700" disabled={updating === tableOrder.id} onClick={() => handleUpdateStatus(tableOrder.id, 'cancelled')} updating={updating === tableOrder.id} />
                          )}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full"><p className="text-gray-400">No order data found for this table.</p></div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    {receiptOrder && (
      <ReceiptView
        data={{
          orderNumber: receiptOrder.order_number,
          status: receiptOrder.status,
          total: Number(receiptOrder.total),
          taxAmount: Number(receiptOrder.tax_amount ?? 0),
          createdAt: receiptOrder.created_at,
          orderType: 'dine_in',
          customerName: null,
          customerPhone: null,
          pickupTime: null,
          tableNumber: selectedTable?.table_number ?? null,
          items: receiptOrder.order_items.map((oi) => ({
            name: oi.menu_items?.name || 'Unknown',
            quantity: oi.quantity,
            price: Number(oi.price_at_order),
          })),
        }}
        brandName={brandName}
        theme={theme}
        footerText={settings?.footerText}
        currencySymbol={settings?.currencySymbol}
        onClose={() => setReceiptOrder(null)}
      />
    )}
    </>
  );
}

function ActionButton({ label, color, disabled, onClick, updating }: { label: string; color: string; disabled: boolean; onClick: () => void; updating: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-lg text-white text-sm font-semibold ${color} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {updating ? '...' : label}
    </button>
  );
}
