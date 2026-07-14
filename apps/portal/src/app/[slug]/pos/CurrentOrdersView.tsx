'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import { MenuGrid, CartSidebar } from '@sat-sys/pos-ui';
import type { MenuItem, CartItem, ThemeConfig } from '@sat-sys/pos-ui';
import type { SupabaseClient, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import ReceiptView from './ReceiptView';
import { deductInventory } from './inventory-utils';
import { updateCustomerLoyalty, searchCustomers } from './customer-utils';

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
  order_type?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  pickup_time?: string | null;
  customer_id?: string | null;
  order_items: OrderItem[];
}

interface TableRecord {
  id: string;
  table_number: string;
  status: string;
}

export interface ViewConfig {
  title: string;
  orderType: string | null;
  showCustomerFields: boolean;
}

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
  theme: ThemeConfig;
  brandName: string;
  viewConfig?: Partial<ViewConfig>;
}

type OrderTypeOption = 'dine_in' | 'takeaway' | 'delivery' | 'drive_thru';

const ORDER_TYPE_LABELS: Record<OrderTypeOption, string> = {
  dine_in: 'Dine In',
  takeaway: 'Take Away',
  delivery: 'Delivery',
  drive_thru: 'Drive Thru',
};

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

const SELECT_ORDER_FIELDS = 'id, order_number, status, total, tax_amount, created_at, order_type, customer_name, customer_phone, pickup_time, customer_id, order_items (menu_item_id, quantity, price_at_order, menu_items (name))';

export default function CurrentOrdersView({ supabaseUrl, supabaseAnonKey, theme, brandName, viewConfig }: Props) {
  const cfg: ViewConfig = { title: 'Active Orders', orderType: null, showCustomerFields: false, ...viewConfig };

  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [authReady, setAuthReady] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  // Customer fields (takeaway / delivery / drive_thru)
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [pickupASAP, setPickupASAP] = useState(true);
  const [pickupScheduledTime, setPickupScheduledTime] = useState('');

  // Order type selector (all-orders view only)
  const [selectedOrderType, setSelectedOrderType] = useState<OrderTypeOption>('dine_in');
  const [orderedTables, setOrderedTables] = useState<TableRecord[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  // Mobile panel navigation
  const [mobilePanel, setMobilePanel] = useState<'list' | 'detail' | 'new-order'>('list');

  // Print bill
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  // Edit order
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
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const isScoped = cfg.orderType !== null;
  const effectiveOrderType: string = cfg.orderType || selectedOrderType;

  const selectedOrder = orders.find((o) => o.id === selectedId) ?? null;

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
    getSupabaseClient()
      .then((client) => {
        if (cancelled) return null;
        return client.from('menu_items').select('id, name, description, price, category, available').order('name').not('available', 'eq', false);
      })
      .then((r: any) => { console.log('[MenuFetch] response:', JSON.stringify(r, null, 2)); console.log('[MenuFetch] count:', r?.data?.length); if (!cancelled && r && !r.error) setMenuItems(r.data ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authReady, getSupabaseClient]);

  // Fetch tables (for dine_in table selector)
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    getSupabaseClient()
      .then((client) => {
        if (cancelled) return null;
        return client.from('tables').select('id, table_number, status').order('table_number');
      })
      .then((r: any) => { if (!cancelled && r && !r.error) setOrderedTables(r.data ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authReady, getSupabaseClient]);

  // Fetch settings
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    (async () => {
      try {
        const client = await getSupabaseClient();
        const { data } = await client.from('settings').select('tax_enabled, tax_rate, currency_symbol, receipt_footer_text').limit(1).single();
        if (cancelled || !data) return;
        setSettings({
          taxEnabled: data.tax_enabled,
          taxRate: Number(data.tax_rate),
          currencySymbol: data.currency_symbol,
          footerText: data.receipt_footer_text,
        });
      } catch (e) {}
    })();
    return () => { cancelled = true; };
  }, [authReady, getSupabaseClient]);

  // Fetch most ordered items (top 10 by total quantity sold)
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    (async () => {
      setMostOrderedLoading(true);
      try {
        const client = await getSupabaseClient();
        const { data } = await client
          .from('order_items')
          .select('menu_item_id, quantity, menu_items!inner(id, name, description, price, category, available)')
          .limit(5000);
        if (cancelled || !data) return;
        const grouped = new Map<string, { item: MenuItem; qty: number }>();
        for (const row of data) {
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
  }, [authReady, getSupabaseClient]);

  // Customer search debounce
  useEffect(() => {
    if (!authReady) return;
    const timer = setTimeout(async () => {
      if (!customerSearch.trim()) { setCustomerResults([]); return; }
      setCustomerSearchLoading(true);
      try {
        const client = await getSupabaseClient();
        const results = await searchCustomers(client, customerSearch);
        setCustomerResults(results);
      } catch (e) {}
      setCustomerSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, authReady, getSupabaseClient]);

  // Fetch orders + realtime
  const fetchOrderWithItems = useCallback(async (client: SupabaseClient, orderId: string) => {
    const { data } = await client
      .from('orders')
      .select(SELECT_ORDER_FIELDS)
      .eq('id', orderId)
      .single();
    return data as unknown as Order | null;
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    let channel: ReturnType<SupabaseClient['channel']> | null = null;

    const init = async () => {
      const client = await getSupabaseClient();
      if (cancelled) return;

      // Build initial query
      let query = client
        .from('orders')
        .select(SELECT_ORDER_FIELDS);
      if (cfg.orderType) {
        query = query.eq('order_type', cfg.orderType);
      }
      const { data, error } = await query
        .not('status', 'in', '("completed","cancelled")')
        .order('created_at', { ascending: true });

      if (!cancelled && !error && data) setOrders(data as unknown as Order[]);

      // Realtime — subscribe with optional order_type filter on INSERT
      const insertFilter = cfg.orderType
        ? `order_type=eq.${cfg.orderType}`
        : 'status=neq.completed';

      channel = client
        .channel(cfg.orderType ? `orders-${cfg.orderType}` : 'current-orders')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: insertFilter },
          async (payload: RealtimePostgresChangesPayload<{ id: string }>) => {
            const rec = payload.new as { id?: string } | null;
            if (!rec?.id) return;
            const o = await fetchOrderWithItems(client, rec.id);
            if (o && o.status !== 'completed' && o.status !== 'cancelled') {
              setOrders((prev) => (prev.some((x) => x.id === o.id) ? prev : [...prev, o]));
            }
          })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' },
          (payload: RealtimePostgresChangesPayload<{ id: string; status: string; order_type?: string }>) => {
            const rec = payload.new as { id?: string; status?: string; order_type?: string } | null;
            if (!rec?.id) return;
            const { id, status, order_type } = rec;
            // Only process if this order matches our filter (or no filter)
            if (cfg.orderType && order_type !== cfg.orderType) {
              setOrders((prev) => prev.filter((o) => o.id !== id));
              return;
            }
            if (status === 'completed' || status === 'cancelled') {
              setOrders((prev) => prev.filter((o) => o.id !== id));
              setSelectedId((prev) => (prev === id ? null : prev));
            } else if (status) {
              setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
            }
          })
        .subscribe();
    };

    init();
    return () => { cancelled = true; if (channel) channel.unsubscribe(); };
  }, [authReady, getSupabaseClient, fetchOrderWithItems, cfg.orderType]);

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

  // Reset customer fields
  const resetCustomerFields = useCallback(() => {
    setCustomerName('');
    setCustomerPhone('');
    setPickupASAP(true);
    setPickupScheduledTime('');
  }, []);

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0) return;
    setCheckingOut(true);
    try {
      const client = await getSupabaseClient();
      const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      let taxAmount = 0;
      if (settings?.taxEnabled && settings.taxRate > 0) {
        taxAmount = subtotal * (settings.taxRate / 100);
      }
      const total = subtotal + taxAmount;

      // Build pickup_time (takeaway only)
      let pickupTime: string | null = null;
      if (!pickupASAP && pickupScheduledTime && effectiveOrderType === 'takeaway') {
        const [h, m] = pickupScheduledTime.split(':').map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        pickupTime = d.toISOString();
      }

      // Build order payload based on effective order type
      const shouldCaptureCustomer = isScoped
        ? cfg.showCustomerFields
        : effectiveOrderType !== 'dine_in';

      const orderPayload: Record<string, any> = { status: 'pending', source: 'pos', total, tax_amount: taxAmount, order_type: effectiveOrderType, customer_id: selectedCustomer?.id || null };
      if (shouldCaptureCustomer) {
        if (customerName) orderPayload.customer_name = customerName;
        if (customerPhone) orderPayload.customer_phone = customerPhone;
        if (effectiveOrderType === 'takeaway') orderPayload.pickup_time = pickupTime;
      }
      if (effectiveOrderType === 'dine_in' && selectedTableId) {
        orderPayload.table_id = selectedTableId;
      }

      const { data: order, error: orderError } = await client
        .from('orders').insert(orderPayload).select('id, order_number, created_at').single();
      if (orderError || !order) { console.error('[Checkout]', orderError); setCheckingOut(false); return; }

      const items = cart.map((item) => ({ order_id: order.id, menu_item_id: item.id, quantity: item.quantity, price_at_order: item.price }));
      const { error: itemsError } = await client.from('order_items').insert(items);
      if (itemsError) { console.error('[Checkout items]', itemsError); setCheckingOut(false); return; }

      // Deduct inventory for linked ingredients
      await deductInventory(client, cart).catch((e) => console.error('[Inventory deduct]', e));

      // Update table to occupied for dine_in orders
      if (effectiveOrderType === 'dine_in' && selectedTableId) {
        await client.from('tables').update({ status: 'occupied', current_order_id: order.id }).eq('id', selectedTableId);
        setOrderedTables((prev) => prev.map((t) => (t.id === selectedTableId ? { ...t, status: 'occupied' } : t)));
      }

      const newOrder: Order = {
        id: order.id,
        order_number: order.order_number,
        status: 'pending',
        total,
        tax_amount: taxAmount,
        created_at: order.created_at,
        order_type: effectiveOrderType,
        customer_id: selectedCustomer?.id || null,
        customer_name: shouldCaptureCustomer ? (customerName || null) : undefined,
        customer_phone: shouldCaptureCustomer ? (customerPhone || null) : undefined,
        pickup_time: shouldCaptureCustomer && effectiveOrderType === 'takeaway' ? pickupTime : undefined,
        order_items: cart.map((item) => ({
          menu_item_id: item.id,
          quantity: item.quantity,
          price_at_order: item.price,
          menu_items: { name: item.name },
        })),
      };
      setOrders((prev) => [newOrder, ...prev]);
      setCart([]);
      setSelectedTableId(null);
      setSelectedCustomer(null);
      setCustomerSearch('');
      setCustomerResults([]);
      resetCustomerFields();
    } catch (e) { console.error('[Checkout]', e); }
    setCheckingOut(false);
  }, [cart, effectiveOrderType, isScoped, cfg.showCustomerFields, customerName, customerPhone, pickupASAP, pickupScheduledTime, selectedTableId, selectedCustomer, settings, getSupabaseClient, resetCustomerFields]);

  // Status update
  const updateStatus = useCallback(async (orderId: string, newStatus: string) => {
    setUpdating(orderId);
    try {
      const client = await getSupabaseClient();
      const { error } = await client.from('orders').update({ status: newStatus }).eq('id', orderId);
      if (error) { console.error('[Status]', error.message); setUpdating(null); return; }

      // Award loyalty points when order is completed and linked to a customer
      if (newStatus === 'completed') {
        const { data: completedOrder } = await client
          .from('orders')
          .select('customer_id, total')
          .eq('id', orderId)
          .single();
        if (completedOrder?.customer_id) {
          await updateCustomerLoyalty(client, completedOrder.customer_id, Number(completedOrder.total));
        }
      }

      if (newStatus === 'completed' || newStatus === 'cancelled') {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
        setSelectedId((prev) => (prev === orderId ? null : prev));
      } else {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
      }
    } catch (e) { console.error('[Status]', e); }
    setUpdating(null);
  }, [getSupabaseClient]);

  const handleNewOrder = useCallback(() => {
    setCart([]);
    setSelectedId(null);
    setSelectedTableId(null);
    resetCustomerFields();
  }, [resetCustomerFields]);

  const handlePrintBill = useCallback((order: Order) => {
    setReceiptOrder(order);
  }, []);

  const handleStartEdit = useCallback(() => {
    if (!selectedOrder) return;
    setEditCart(
      selectedOrder.order_items.map((oi) => ({
        id: oi.menu_item_id,
        name: oi.menu_items?.name || 'Unknown',
        price: Number(oi.price_at_order),
        quantity: oi.quantity,
      }))
    );
    setEditingOrder(true);
  }, [selectedOrder]);

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
    if (!selectedOrder || !selectedId) return;
    setUpdating(selectedId);
    try {
      const client = await getSupabaseClient();
      const subtotal = editCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      let taxAmount = 0;
      if (settings?.taxEnabled && settings.taxRate > 0) {
        taxAmount = subtotal * (settings.taxRate / 100);
      }
      const total = subtotal + taxAmount;

      await client.from('order_items').delete().eq('order_id', selectedId);
      if (editCart.length > 0) {
        const items = editCart.map((item) => ({
          order_id: selectedId,
          menu_item_id: item.id,
          quantity: item.quantity,
          price_at_order: item.price,
        }));
        await client.from('order_items').insert(items);
      }
      await client.from('orders').update({ total, tax_amount: taxAmount }).eq('id', selectedId);

      setOrders((prev) =>
        prev.map((o) =>
          o.id === selectedId
            ? { ...o, total, tax_amount: taxAmount, order_items: editCart.map((ci) => ({ menu_item_id: ci.id, quantity: ci.quantity, price_at_order: ci.price, menu_items: { name: ci.name } })) }
            : o
        )
      );
      setEditingOrder(false);
    } catch (e) { console.error('[Edit Order]', e); }
    setUpdating(null);
  }, [selectedOrder, selectedId, editCart, settings, getSupabaseClient]);

  const handleCancelEdit = useCallback(() => {
    setEditingOrder(false);
    setEditCart([]);
  }, []);

  if (!isLoaded || !authReady) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading...</p></div>;
  }

  const availableTables = orderedTables.filter((t) => t.status === 'available');
  const orderTypeBadge: Record<string, string> = {
    dine_in: 'bg-purple-100 text-purple-800',
    takeaway: 'bg-blue-100 text-blue-800',
    delivery: 'bg-orange-100 text-orange-800',
    drive_thru: 'bg-teal-100 text-teal-800',
  };
  const orderTypeDisplay: Record<string, string> = {
    dine_in: 'Dine In',
    takeaway: 'Take Away',
    delivery: 'Delivery',
    drive_thru: 'Drive Thru',
    third_party: '3rd Party',
  };

  // Mobile panel navigation
  const pc = (panel: 'list' | 'detail' | 'new-order', base: string) =>
    `${mobilePanel === panel ? 'flex' : 'hidden md:flex'} ${base}`;

  return (
    <><div className="flex-1 flex overflow-hidden min-w-0">
      {/* ── LEFT PANEL: Order list ── */}
      <div className={`${pc('list', 'w-full md:w-72 flex-shrink-0 bg-white border-r border-gray-200 flex-col overflow-hidden')}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{cfg.title}</h2>
          <button
            onClick={() => { handleNewOrder(); setMobilePanel('new-order'); }}
            className="text-xs px-3 py-1.5 rounded text-white font-semibold"
            style={{ backgroundColor: theme.primaryColor }}
          >
            + New Order
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-2">
          {orders.length === 0 && (
            <p className="text-gray-400 text-sm text-center pt-8">No active orders</p>
          )}
          {orders.map((order) => (
            <button
              key={order.id}
              onClick={() => { setSelectedId(order.id); setMobilePanel('detail'); }}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selectedId === order.id ? '' : 'hover:bg-gray-50'
              }`}
              style={selectedId === order.id ? { borderColor: theme.primaryColor, boxShadow: `0 0 0 2px ${theme.primaryColor}20` } : { borderColor: '#e5e7eb' }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm">#{order.order_number}</span>
                <div className="flex items-center gap-1">
                  {order.order_type && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${orderTypeBadge[order.order_type] || 'bg-gray-100 text-gray-600'}`}>
                      {orderTypeDisplay[order.order_type] || order.order_type}
                    </span>
                  )}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${statusColor[order.status] || ''}`}>
                    {statusDisplay[order.status] || order.status}
                  </span>
                </div>
              </div>
              {order.customer_name ? (
                <div className="text-xs text-gray-500">
                  {order.customer_name}
                  {order.customer_phone ? ` · ${order.customer_phone}` : ''}
                </div>
              ) : (
                <div className="text-xs text-gray-500">
                  {new Date(order.created_at).toLocaleTimeString()}
                </div>
              )}
              <div className="flex text-xs text-gray-400">
                {order.pickup_time
                  ? `Pickup ${new Date(order.pickup_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · `
                  : order.order_type === 'takeaway' ? 'ASAP · ' : ''}
                {order.order_items?.length || 0} item{(order.order_items?.length || 0) !== 1 ? 's' : ''}
                <span className="ml-auto font-semibold text-gray-700">{settings?.currencySymbol}{Number(order.total).toFixed(2)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── CENTER PANEL: Selected order detail ── */}
      <div className={`${pc('detail', 'flex-1 bg-gray-50 flex-col overflow-hidden')}`}>
        {/* Mobile back button */}
        <button
          onClick={() => setMobilePanel('list')}
          className="md:hidden flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-gray-200"
        >
          ← Orders
        </button>
        {selectedOrder ? (
          <div className="flex-1 overflow-y-auto scrollbar-hide p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold">Order #{selectedOrder.order_number}</h2>
                <p className="text-sm text-gray-500">
                  {new Date(selectedOrder.created_at).toLocaleString()}
                  {selectedOrder.customer_name ? ` · ${selectedOrder.customer_name}` : ''}
                  {selectedOrder.customer_phone ? ` · ${selectedOrder.customer_phone}` : ''}
                  {selectedOrder.pickup_time
                    ? ` · Pickup ${new Date(selectedOrder.pickup_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : selectedOrder.order_type === 'takeaway' ? ' · ASAP' : ''}
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusColor[selectedOrder.status] || ''}`}>
                {statusDisplay[selectedOrder.status] || selectedOrder.status}
              </span>
            </div>

            {editingOrder ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Edit header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Editing Order #{selectedOrder.order_number}</h3>
                  <div className="flex gap-2">
                    <button onClick={handleCancelEdit} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded">Cancel</button>
                    <button onClick={handleSaveEdit} disabled={updating === selectedOrder.id} className="px-3 py-1.5 text-xs font-semibold text-white rounded disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>
                      {updating === selectedOrder.id ? '...' : 'Save'}
                    </button>
                  </div>
                </div>
                {/* Edit cart items */}
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
                {/* Edit total */}
                <div className="px-4 py-2 border-b border-gray-100 text-right text-sm font-bold">
                  Total: {settings?.currencySymbol}{editCart.reduce((s, ci) => s + ci.price * ci.quantity, 0).toFixed(2)}
                </div>
                {/* Menu grid for adding items */}
                {menuItems.length > 0 ? (
                  <MenuGrid menuItems={menuItems} onAddToCart={handleEditAdd} theme={theme} />
                ) : (
                  <div className="flex-1 flex items-center justify-center"><p className="text-gray-400">Loading menu...</p></div>
                )}
              </div>
            ) : (
              <>
                <table className="w-full text-sm mb-6">
                  <thead>
                    <tr className="text-gray-500 border-b">
                      <th className="text-left py-2 font-medium">Item</th>
                      <th className="text-right py-2 font-medium">Qty</th>
                      <th className="text-right py-2 font-medium">Price</th>
                      <th className="text-right py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.order_items.map((item, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2">{item.menu_items?.name || 'Unknown'}</td>
                        <td className="text-right py-2">{item.quantity}</td>
                        <td className="text-right py-2">{settings?.currencySymbol}{Number(item.price_at_order).toFixed(2)}</td>
                        <td className="text-right py-2 font-medium">{settings?.currencySymbol}{(item.quantity * Number(item.price_at_order)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold text-base">
                      <td colSpan={3} className="text-right py-2">Total</td>
                      <td className="text-right py-2">{settings?.currencySymbol}{Number(selectedOrder.total).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>

                <div className="flex flex-wrap gap-3">
                  {selectedOrder.status === 'pending' && (
                    <ActionButton label="Start Cooking" color="bg-blue-600 hover:bg-blue-700" disabled={updating === selectedOrder.id} onClick={() => updateStatus(selectedOrder.id, 'in_kitchen')} updating={updating === selectedOrder.id} />
                  )}
                  {selectedOrder.status === 'in_kitchen' && (
                    <ActionButton label="Mark Ready" color="bg-amber-600 hover:bg-amber-700" disabled={updating === selectedOrder.id} onClick={() => updateStatus(selectedOrder.id, 'ready')} updating={updating === selectedOrder.id} />
                  )}
                  {selectedOrder.status === 'ready' && (
                    <ActionButton label="Complete Order" color="bg-green-600 hover:bg-green-700" disabled={updating === selectedOrder.id} onClick={() => updateStatus(selectedOrder.id, 'completed')} updating={updating === selectedOrder.id} />
                  )}
                  <ActionButton label="Print Bill" color="bg-gray-600 hover:bg-gray-700" disabled={false} onClick={() => handlePrintBill(selectedOrder)} updating={false} />
                  {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                    <ActionButton label="Edit Order" color="bg-indigo-600 hover:bg-indigo-700" disabled={false} onClick={handleStartEdit} updating={false} />
                  )}
                  {selectedOrder.status !== 'cancelled' && (
                    <ActionButton label="Cancel Order" color="bg-red-600 hover:bg-red-700" disabled={updating === selectedOrder.id} onClick={() => updateStatus(selectedOrder.id, 'cancelled')} updating={updating === selectedOrder.id} />
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-400 text-lg">Select an order from the list to view details</p>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL: New order builder ── */}
      <div className={`${pc('new-order', 'w-full md:w-[480px] flex-shrink-0 bg-white border-l border-gray-200 flex-col overflow-hidden')}`}>
        {/* Mobile back button */}
        <button
          onClick={() => setMobilePanel('list')}
          className="md:hidden flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-gray-200"
        >
          ← Back
        </button>
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">New {cfg.title}</h3>
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Order type selector (all-orders view only) */}
          {!isScoped && (
            <div className="flex px-4 border-b border-gray-200">
              {(Object.keys(ORDER_TYPE_LABELS) as OrderTypeOption[]).map((type) => (
                <button
                  key={type}
                  onClick={() => { setSelectedOrderType(type); setSelectedTableId(null); resetCustomerFields(); }}
                  className={`flex-1 min-w-0 px-1 py-2 text-xs font-semibold transition-colors border-b-2 ${
                    selectedOrderType === type ? '' : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                  style={selectedOrderType === type ? { borderBottomColor: theme.primaryColor, color: theme.primaryColor } : {}}
                >
                  {ORDER_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          )}
          {/* Dine In: table selector */}
          {effectiveOrderType === 'dine_in' && (
            <div className="px-4 py-3 border-b border-gray-200">
              <label className="block text-xs font-medium text-gray-600 mb-1">Table</label>
              {availableTables.length > 0 ? (
                <select
                  value={selectedTableId || ''}
                  onChange={(e) => setSelectedTableId(e.target.value || null)}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                >
                  <option value="">-- Select table --</option>
                  {availableTables.map((t) => (
                    <option key={t.id} value={t.id}>Table {t.table_number}</option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-gray-400">No available tables</p>
              )}
            </div>
          )}
          {/* Take Away: customer fields + pickup time */}
          {effectiveOrderType === 'takeaway' && (
            <div className="px-4 py-3 border-b border-gray-200 space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Walk-in"
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="(Optional)"
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pickup Time</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="radio" name="pickup" checked={pickupASAP} onChange={() => setPickupASAP(true)} />
                    ASAP
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="radio" name="pickup" checked={!pickupASAP} onChange={() => setPickupASAP(false)} />
                    Schedule
                  </label>
                  {!pickupASAP && (
                    <input
                      type="time"
                      value={pickupScheduledTime}
                      onChange={(e) => setPickupScheduledTime(e.target.value)}
                      className="px-2 py-1 text-sm border border-gray-300 rounded w-28"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
          {/* Delivery / Drive Thru: customer name + phone only */}
          {(effectiveOrderType === 'delivery' || effectiveOrderType === 'drive_thru') && (
            <div className="px-4 py-3 border-b border-gray-200 space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Walk-in"
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="(Optional)"
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          )}
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
            {/* Save as customer suggestion for walk-in name/phone */}
            {!selectedCustomer && customerName.trim() && (
              <button
                onClick={async () => {
                  try {
                    const client = await getSupabaseClient();
                    const { data: existing } = await client
                      .from('customers')
                      .select('id')
                      .or(`name.eq.${customerName.replace(/'/g, "''")}${customerPhone ? `,phone.eq.${customerPhone.replace(/'/g, "''")}` : ''}`)
                      .limit(1);
                    let custId: string;
                    if (existing && existing.length > 0) {
                      custId = existing[0].id;
                    } else {
                      const { data: newCust } = await client
                        .from('customers')
                        .insert({ name: customerName, phone: customerPhone || null })
                        .select('id')
                        .single();
                      if (!newCust) return;
                      custId = newCust.id;
                    }
                    setSelectedCustomer({ id: custId, name: customerName, phone: customerPhone || null });
                  } catch (e) { console.error('Save customer error', e); }
                }}
                className="w-full mt-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium text-left"
              >
                + Save &ldquo;{customerName}&rdquo; as customer
              </button>
            )}
          </div>
          {menuItems.length > 0 ? (
            <MenuGrid menuItems={menuItems} onAddToCart={handleAddToCart} theme={theme} currencySymbol={settings?.currencySymbol} searchQuery={menuSearch} onSearchChange={setMenuSearch} mostOrderedItems={mostOrderedItems} />
          ) : (
            <div className="flex-1 flex items-center justify-center"><p className="text-gray-400">Loading menu...</p></div>
          )}
        </div>
        <CartSidebar
          cartItems={cart}
          onUpdateQuantity={handleUpdateQuantity}
          onRemoveItem={handleRemoveItem}
          onCheckout={handleCheckout}
          disabled={cart.length === 0 || checkingOut}
          theme={theme}
          currencySymbol={settings?.currencySymbol}
        />
      </div>
    </div>
    {receiptOrder && (
      <ReceiptView
        data={{
          orderNumber: receiptOrder.order_number,
          status: receiptOrder.status,
          total: Number(receiptOrder.total),
          taxAmount: Number(receiptOrder.tax_amount ?? 0),
          createdAt: receiptOrder.created_at,
          orderType: receiptOrder.order_type,
          customerName: receiptOrder.customer_name,
          customerPhone: receiptOrder.customer_phone,
          pickupTime: receiptOrder.pickup_time,
          tableNumber: null,
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
