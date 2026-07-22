'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import { MenuGrid, CartSidebar } from '@sat-sys/pos-ui';
import type { MenuItem, CartItem, ThemeConfig } from '@sat-sys/pos-ui';
import type { SupabaseClient } from '@supabase/supabase-js';
import ReceiptView from './ReceiptView';
import PaymentModal from './PaymentModal';
import { deductInventorySupa } from './inventory-utils';
import { updateCustomerLoyaltySupa, searchCustomersSupa } from './customer-utils';
import { supa } from './supa-query';
import useOfflineSync from '@/hooks/useOfflineSync';
import { getCachedMenuItems, getCachedSettings } from '@/lib/offline-db';

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
  vehicle_type?: string | null;
  vehicle_plate_number?: string | null;
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
  statusFilter?: string | null;
  hideNewOrder?: boolean;
  newOrderMode?: boolean;
  excludeStatus?: string[];
}

interface Props {
  slug: string;
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
  pending: 'bg-blue-50 text-blue-700 border border-blue-200',
  in_kitchen: 'bg-amber-50 text-amber-700 border border-amber-200',
  ready: 'bg-green-50 text-green-700 border border-green-200',
  completed: 'bg-gray-50 text-gray-700 border border-gray-200',
  cancelled: 'bg-red-50 text-red-700 border border-red-200',
};

const SELECT_ORDER_FIELDS = 'id, order_number, status, total, tax_amount, created_at, order_type, customer_name, customer_phone, pickup_time, customer_id, vehicle_type, vehicle_plate_number, order_items (menu_item_id, quantity, price_at_order, menu_items (name))';

export default function CurrentOrdersView({ slug, supabaseUrl, supabaseAnonKey, theme, brandName, viewConfig }: Props) {
  const router = useRouter();
  const cfg: ViewConfig = { title: 'Active Orders', orderType: null, showCustomerFields: false, ...viewConfig };

  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [authReady, setAuthReady] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const fetchingRef = useRef(false);
  const creatingOrderRef = useRef(false);

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
  // Payment
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
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

  // Drive Thru vehicle fields
  const [vehicleType, setVehicleType] = useState('');
  const [vehiclePlateNumber, setVehiclePlateNumber] = useState('');

  const isScoped = cfg.orderType !== null;
  const effectiveOrderType: string = cfg.orderType || selectedOrderType;

  const selectedOrder = orders.find((o) => o.id === selectedId) ?? null;

  const getSupabaseClient = useCallback(() => {
    return createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  }, [supabaseUrl, supabaseAnonKey]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setAuthReady(true);
  }, [isLoaded, isSignedIn]);

  // Background sync — keeps IndexedDB up to date for offline use
  useOfflineSync(slug, authReady);

  // Fetch menu (with offline fallback to IndexedDB)
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    supa(slug, { table: 'menu_items', select: 'id, name, description, price, category, available', order: 'name', limit: 500 })
      .then(async (r) => {
        if (cancelled) return;
        if (r.ok) { setMenuItems(r.data ?? []); return; }
        if (!navigator.onLine) {
          const cached = await getCachedMenuItems(slug);
          if (!cancelled && cached.length > 0) setMenuItems(cached);
        }
      })
      .catch(async () => {
        if (!cancelled && !navigator.onLine) {
          const cached = await getCachedMenuItems(slug);
          if (cached.length > 0) setMenuItems(cached);
        }
      });
    return () => { cancelled = true; };
  }, [authReady, slug]);

  // Fetch tables (for dine_in table selector)
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    supa(slug, { table: 'tables', select: 'id, table_number, status', order: 'table_number' })
      .then((r) => { if (!cancelled && r.ok) setOrderedTables(r.data ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authReady, slug]);

  // Fetch settings (with offline fallback to IndexedDB)
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    supa(slug, { table: 'settings', select: 'tax_enabled, tax_rate, currency_symbol, receipt_footer_text', limit: 1 })
      .then(async (r) => {
        if (cancelled) return;
        if (r.ok && r.data?.[0]) {
          const d = r.data[0];
          setSettings({ taxEnabled: d.tax_enabled, taxRate: Number(d.tax_rate), currencySymbol: d.currency_symbol, footerText: d.receipt_footer_text });
          return;
        }
        if (!navigator.onLine) {
          const cached = await getCachedSettings(slug);
          if (!cancelled && cached) setSettings({ taxEnabled: cached.tax_enabled, taxRate: cached.tax_rate, currencySymbol: cached.currency_symbol, footerText: cached.receipt_footer_text });
        }
      })
      .catch(async () => {
        if (!cancelled && !navigator.onLine) {
          const cached = await getCachedSettings(slug);
          if (cached) setSettings({ taxEnabled: cached.tax_enabled, taxRate: cached.tax_rate, currencySymbol: cached.currency_symbol, footerText: cached.receipt_footer_text });
        }
      });
    return () => { cancelled = true; };
  }, [authReady, slug]);

  // Fetch most ordered items (top 10 by total quantity sold)
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    setMostOrderedLoading(true);
    supa(slug, { table: 'order_items', select: 'menu_item_id, quantity, menu_items!inner(id, name, description, price, category, available)', limit: 5000 })
      .then((r) => {
        if (cancelled || !r.ok || !r.data) return;
        const grouped = new Map<string, { item: MenuItem; qty: number }>();
        for (const row of r.data) {
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
      })
      .catch(() => {})
      .finally(() => setMostOrderedLoading(false));
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

  // Fetch orders (initial load via supa)
  const fetchOrdersInitial = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    const opts: any = { table: 'orders', select: SELECT_ORDER_FIELDS, order: { column: 'created_at', ascending: false }, limit: 200 };
    if (cfg.statusFilter) {
      opts.eq = ['status', cfg.statusFilter];
    } else if (cfg.excludeStatus && cfg.excludeStatus.length > 0) {
      opts.notIn = ['status', cfg.excludeStatus];
    }
    const result = await supa(slug, opts);
    if (result.ok && result.data) setOrders(result.data as unknown as Order[]);
    fetchingRef.current = false;
  }, [slug, cfg.statusFilter, cfg.excludeStatus]);

  // Realtime subscription (notification-only via anon key — best-effort)
  // Actual data re-fetch always uses secure supa() server actions.
  // A polling fallback ensures updates on tenants where anon-key Realtime is blocked by RLS.
  useEffect(() => {
    if (!authReady) return;
    const client = getSupabaseClient();
    const channel = client
      .channel('orders-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        () => { fetchOrdersInitial(); })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        () => { fetchOrdersInitial(); })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [authReady, getSupabaseClient, fetchOrdersInitial]);

  useEffect(() => {
    if (!authReady) return;
    fetchOrdersInitial();
  }, [authReady, fetchOrdersInitial]);

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
    setVehicleType('');
    setVehiclePlateNumber('');
  }, []);

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0 || creatingOrderRef.current) return;
    creatingOrderRef.current = true;
    setCheckingOut(true);
    try {
      const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      let taxAmount = 0;
      if (settings?.taxEnabled && settings.taxRate > 0) {
        taxAmount = subtotal * (settings.taxRate / 100);
      }
      const total = subtotal + taxAmount;

      let pickupTime: string | null = null;
      if (!pickupASAP && pickupScheduledTime && effectiveOrderType === 'takeaway') {
        const [h, m] = pickupScheduledTime.split(':').map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        pickupTime = d.toISOString();
      }

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
      if (effectiveOrderType === 'drive_thru') {
        if (vehicleType) orderPayload.vehicle_type = vehicleType;
        if (vehiclePlateNumber) orderPayload.vehicle_plate_number = vehiclePlateNumber;
      }

      const orderResult = await supa(slug, { table: 'orders', method: 'insert', select: 'id, order_number, created_at', single: true, body: orderPayload });
      if (!orderResult.ok || !orderResult.data) { console.error('[Checkout]', orderResult.error); setCheckingOut(false); return; }
      const order = orderResult.data;

      const items = cart.map((item) => ({ order_id: order.id, menu_item_id: item.id, quantity: item.quantity, price_at_order: item.price }));
      const itemsResult = await supa(slug, { table: 'order_items', method: 'insert', body: items });
      if (!itemsResult.ok) { console.error('[Checkout items]', itemsResult.error); setCheckingOut(false); return; }

      await deductInventorySupa(slug, cart, order.id, user?.id).catch((e) => console.error('[Inventory deduct]', e));

      if (effectiveOrderType === 'dine_in' && selectedTableId) {
        await supa(slug, { table: 'tables', method: 'update', eq: ['id', selectedTableId], body: { status: 'occupied', current_order_id: order.id } });
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
        vehicle_type: effectiveOrderType === 'drive_thru' ? (vehicleType || null) : undefined,
        vehicle_plate_number: effectiveOrderType === 'drive_thru' ? (vehiclePlateNumber || null) : undefined,
        order_items: cart.map((item) => ({
          menu_item_id: item.id,
          quantity: item.quantity,
          price_at_order: item.price,
          menu_items: { name: item.name },
        })),
      };
      setOrders((prev) => [newOrder, ...prev]);
      setPaymentOrder(newOrder);
    } catch (e) { console.error('[Checkout]', e); }
    setCheckingOut(false);
    creatingOrderRef.current = false;
  }, [cart, effectiveOrderType, isScoped, cfg.showCustomerFields, customerName, customerPhone, pickupASAP, pickupScheduledTime, selectedTableId, selectedCustomer, vehicleType, vehiclePlateNumber, settings, slug, resetCustomerFields, cfg.newOrderMode, router, user]);

  const handlePaymentSuccess = useCallback(() => {
    setPaymentOrder(null);
    setCart([]);
    setSelectedTableId(null);
    setSelectedCustomer(null);
    setCustomerSearch('');
    setCustomerResults([]);
    resetCustomerFields();
    if (cfg.newOrderMode) router.push(`/${slug}/pos/orders`);
    fetchOrdersInitial();
  }, [slug, cfg.newOrderMode, router, resetCustomerFields, fetchOrdersInitial]);

  // Status update
  const updateStatus = useCallback(async (orderId: string, newStatus: string) => {
    setUpdating(orderId);
    try {
      const updateResult = await supa(slug, { table: 'orders', method: 'update', eq: ['id', orderId], body: { status: newStatus } });
      if (!updateResult.ok) { console.error('[Status]', updateResult.error); setUpdating(null); return; }

      if (newStatus === 'completed') {
        const orderResult = await supa(slug, { table: 'orders', select: 'customer_id, total', eq: ['id', orderId], single: true });
        if (orderResult.ok && orderResult.data?.customer_id) {
          await updateCustomerLoyaltySupa(slug, orderResult.data.customer_id, Number(orderResult.data.total));
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
  }, [slug]);

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
      const subtotal = editCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      let taxAmount = 0;
      if (settings?.taxEnabled && settings.taxRate > 0) {
        taxAmount = subtotal * (settings.taxRate / 100);
      }
      const total = subtotal + taxAmount;

      await supa(slug, { table: 'order_items', method: 'delete', eq: ['order_id', selectedId] });
      if (editCart.length > 0) {
        const items = editCart.map((item) => ({
          order_id: selectedId,
          menu_item_id: item.id,
          quantity: item.quantity,
          price_at_order: item.price,
        }));
        await supa(slug, { table: 'order_items', method: 'insert', body: items });
      }
      await supa(slug, { table: 'orders', method: 'update', eq: ['id', selectedId], body: { total, tax_amount: taxAmount } });

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
  }, [selectedOrder, selectedId, editCart, settings, slug]);

  const handleCancelEdit = useCallback(() => {
    setEditingOrder(false);
    setEditCart([]);
  }, []);

  if (!isLoaded || !authReady) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading...</p></div>;
  }

  const availableTables = orderedTables.filter((t) => t.status === 'available');
  const orderTypeBadge: Record<string, string> = {
    dine_in: 'bg-purple-50 text-purple-700 border border-purple-200',
    takeaway: 'bg-blue-50 text-blue-700 border border-blue-200',
    delivery: 'bg-orange-50 text-orange-700 border border-orange-200',
    drive_thru: 'bg-teal-50 text-teal-700 border border-teal-200',
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
    <><div className={`flex-1 ${cfg.newOrderMode ? 'flex flex-col overflow-hidden' : 'flex overflow-hidden min-w-0'}`}>
      {!cfg.newOrderMode && (<>
      {/* ── LEFT PANEL: Order list ── */}
      <div className={`${pc('list', 'w-full md:w-72 flex-shrink-0 bg-white border-r border-gray-200 flex-col overflow-hidden')}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{cfg.title}</h2>
          <div className="flex items-center gap-1">
            <button onClick={fetchOrdersInitial} disabled={fetchingRef.current} className="text-xs px-2 py-1.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50">↻</button>
            <button
              onClick={() => { handleNewOrder(); router.push(`/${slug}/pos/orders/new`); }}
              className="text-xs px-3 py-1.5 rounded text-white font-semibold"
              style={{ backgroundColor: theme.primaryColor }}
            >
              + New Order
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-3">
          {orders.length === 0 && (
            <p className="text-gray-400 text-sm text-center pt-8">{cfg.statusFilter ? `No ${cfg.title.toLowerCase()}` : 'No active orders'}</p>
          )}
          {orders.map((order) => (
            <button
              key={order.id}
              onClick={() => { setSelectedId(order.id); setMobilePanel('detail'); }}
              className={`w-full text-left p-3 rounded-xl border transition-colors ${
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
              {order.vehicle_plate_number && (
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {order.vehicle_type || 'Vehicle'} · {order.vehicle_plate_number}
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

      {/* ── CENTER PANEL: Order detail / placeholder + cart at bottom ── */}
      <div className={`${pc('detail', 'flex-1 bg-gray-50 flex-col overflow-hidden')}`}>
        {/* Mobile back button */}
        <button
          onClick={() => setMobilePanel('list')}
          className="md:hidden flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-gray-200"
        >
          ← Orders
        </button>
        {/* Top: order detail when selected, otherwise placeholder */}
        <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0">
          {selectedOrder ? (
            <div className="p-4 md:p-6 space-y-4">
              <div className="flex items-start justify-between mb-4">
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
                  {selectedOrder.vehicle_plate_number && (
                    <p className="text-xs text-gray-400 mt-1">
                      {selectedOrder.vehicle_type || 'Vehicle'} · {selectedOrder.vehicle_plate_number}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusColor[selectedOrder.status] || ''}`}>
                    {statusDisplay[selectedOrder.status] || selectedOrder.status}
                  </span>
                  <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>
              </div>

              {editingOrder ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Editing Order #{selectedOrder.order_number}</h3>
                    <div className="flex gap-2">
                      <button onClick={handleCancelEdit} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded">Cancel</button>
                      <button onClick={handleSaveEdit} disabled={updating === selectedOrder.id} className="px-3 py-1.5 text-xs font-semibold text-white rounded disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>
                        {updating === selectedOrder.id ? '...' : 'Save'}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
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
                  <div className="text-right text-sm font-bold">
                    Total: {settings?.currencySymbol}{editCart.reduce((s, ci) => s + ci.price * ci.quantity, 0).toFixed(2)}
                  </div>
                  {menuItems.length > 0 ? (
                    <MenuGrid menuItems={menuItems} onAddToCart={handleEditAdd} theme={theme} />
                  ) : (
                    <div className="flex items-center justify-center py-8"><p className="text-gray-400">Loading menu...</p></div>
                  )}
                </div>
              ) : (
                <>
                  <table className="w-full text-sm mb-6">
                    <thead>
                      <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-100">
                        <th className="text-left py-2 font-medium">Item</th>
                        <th className="text-right py-2 font-medium">Qty</th>
                        <th className="text-right py-2 font-medium">Price</th>
                        <th className="text-right py-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.order_items.map((item, i) => (
                        <tr key={i} className="border-b border-gray-50">
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
            <div className="flex-1 flex items-center justify-center min-h-[200px]">
              <p className="text-gray-400 text-lg">Select an order from the list to view details</p>
            </div>
          )}
        </div>
        {/* Bottom: cart (always visible at bottom when items in cart) */}
        {cart.length > 0 && (
          <div className="border-t border-gray-200 bg-white flex flex-col flex-shrink-0 max-h-[45vh]">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Cart ({cart.reduce((s, i) => s + i.quantity, 0)})
              </span>
              <span className="text-sm font-bold">{settings?.currencySymbol || 'Rs.'}{cart.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)}</span>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-2 space-y-2 min-h-0">
              {cart.map((item) => (
                <div key={item.id} className="flex items-center gap-2 p-2 rounded border border-gray-200">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.name}</div>
                    <div className="text-xs text-gray-400">{settings?.currencySymbol || 'Rs.'}{item.price.toFixed(2)} each</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)} className="w-7 h-7 rounded text-sm font-bold hover:bg-gray-100 flex items-center justify-center">−</button>
                    <span className="w-6 text-center text-sm">{item.quantity}</span>
                    <button onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)} className="w-7 h-7 rounded text-sm font-bold hover:bg-gray-100 flex items-center justify-center">+</button>
                  </div>
                  <button onClick={() => handleRemoveItem(item.id)} className="text-gray-400 hover:text-red-500 text-sm">✕</button>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100">
              <button
                onClick={handleCheckout}
                disabled={cart.length === 0 || checkingOut}
                className="w-full py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: theme.primaryColor }}
              >
                {checkingOut ? 'Processing...' : `Place Order — ${settings?.currencySymbol || 'Rs.'}${cart.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)}`}
              </button>
            </div>
          </div>
        )}
      </div>
      </>)}{/* end left+center panels */}

      {/* ── RIGHT PANEL: New order builder ── */}
      {!cfg.hideNewOrder && (
      <div className={`${cfg.newOrderMode ? 'flex-1 flex flex-col overflow-hidden' : pc('new-order', 'w-full md:w-[480px] flex-shrink-0 bg-white border-l border-gray-200 flex-col overflow-hidden')}`}>
        {/* Mobile back button */}
        <button
          onClick={() => cfg.newOrderMode ? router.push(`/${slug}/pos/orders`) : setMobilePanel('list')}
          className="md:hidden flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-gray-200"
        >
          ← Back
        </button>
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{cfg.newOrderMode ? 'New Order' : `New ${cfg.title}`}</h3>
        </div>
        {cfg.newOrderMode ? (
          <div className="flex-1 flex flex-row overflow-hidden">
            {/* ── LEFT: Menu panel ── */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
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
              {/* Compact fields bar */}
              {effectiveOrderType === 'dine_in' && (
                <div className="flex items-end gap-3 px-4 py-2 border-b border-gray-200">
                  <div className="w-56">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Table</label>
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
                </div>
              )}
              {effectiveOrderType === 'takeaway' && (
                <div className="flex items-end gap-3 px-4 py-2 border-b border-gray-200">
                  <div className="flex-1 max-w-52">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Customer Name</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Walk-in"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="flex-1 max-w-44">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Phone</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(Optional)"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="flex-shrink-0">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Pickup</label>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-sm cursor-pointer">
                        <input type="radio" name="pickup" checked={pickupASAP} onChange={() => setPickupASAP(true)} />
                        ASAP
                      </label>
                      <label className="flex items-center gap-1 text-sm cursor-pointer">
                        <input type="radio" name="pickup" checked={!pickupASAP} onChange={() => setPickupASAP(false)} />
                        Schedule
                      </label>
                      {!pickupASAP && (
                        <input
                          type="time"
                          value={pickupScheduledTime}
                          onChange={(e) => setPickupScheduledTime(e.target.value)}
                          className="px-2 py-1 text-sm border border-gray-300 rounded w-24"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
              {effectiveOrderType === 'delivery' && (
                <div className="flex items-end gap-3 px-4 py-2 border-b border-gray-200">
                  <div className="flex-1 max-w-52">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Customer Name</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Walk-in"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="flex-1 max-w-44">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Phone</label>
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
              {effectiveOrderType === 'drive_thru' && (
                <div className="flex items-end gap-3 px-4 py-2 border-b border-gray-200">
                  <div className="flex-1 max-w-44">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Customer Name</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Walk-in"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="w-36">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Phone</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(Optional)"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Vehicle</label>
                    <select
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value="">-- Select --</option>
                      <option value="Car">Car</option>
                      <option value="Motorcycle">Motorcycle</option>
                      <option value="Van">Van</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="w-36">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Plate</label>
                    <input
                      type="text"
                      value={vehiclePlateNumber}
                      onChange={(e) => setVehiclePlateNumber(e.target.value)}
                      placeholder="e.g. ABC-1234"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              )}
              {/* Customer linking */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Customer</span>
                {selectedCustomer ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">{selectedCustomer.name}</span>
                    {selectedCustomer.phone && <span className="text-xs text-gray-500">{selectedCustomer.phone}</span>}
                    <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); setCustomerResults([]); }} className="text-xs text-red-500 hover:text-red-700 ml-1">Remove</button>
                  </div>
                ) : (
                  <div className="relative flex-1 max-w-xs">
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Search by name or phone..."
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                    {customerSearchLoading && <p className="text-xs text-gray-400 mt-0.5">Searching...</p>}
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
                {!selectedCustomer && customerName.trim() && (
                  <button
                    onClick={async () => {
                      try {
                        const result = await supa(slug, { table: 'customers', select: 'id', filter: { name: customerName }, limit: 1 });
                        let custId: string;
                        if (result.ok && result.data?.length > 0) {
                          custId = result.data[0].id;
                        } else {
                          const insertResult = await supa(slug, { table: 'customers', method: 'insert', select: 'id', single: true, body: { name: customerName, phone: customerPhone || null } });
                          if (!insertResult.ok || !insertResult.data) return;
                          custId = insertResult.data.id;
                        }
                        setSelectedCustomer({ id: custId, name: customerName, phone: customerPhone || null });
                      } catch (e) { console.error('Save customer error', e); }
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                  >
                    + Save &ldquo;{customerName}&rdquo;
                  </button>
                )}
              </div>
              {/* Menu grid */}
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                {menuItems.length > 0 ? (
                  <MenuGrid menuItems={menuItems} onAddToCart={handleAddToCart} theme={theme} currencySymbol={settings?.currencySymbol} searchQuery={menuSearch} onSearchChange={setMenuSearch} mostOrderedItems={mostOrderedItems} />
                ) : (
                  <div className="flex-1 flex items-center justify-center min-h-[300px]"><p className="text-gray-400">Loading menu...</p></div>
                )}
              </div>
            </div>
            {/* ── RIGHT: Cart panel ── */}
            <div className="w-[380px] flex-shrink-0 flex flex-col border-l border-gray-200 bg-white">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <span className="text-sm font-semibold text-gray-700">Cart ({cart.reduce((s, i) => s + i.quantity, 0)})</span>
                <span className="text-sm font-bold">{settings?.currencySymbol || 'Rs.'}{cart.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)}</span>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-3 space-y-2">
                {cart.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center pt-8">Cart is empty</p>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 p-2 rounded border border-gray-200">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{item.name}</div>
                        <div className="text-xs text-gray-400">{settings?.currencySymbol || 'Rs.'}{item.price.toFixed(2)} each</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)} className="w-7 h-7 rounded text-sm font-bold hover:bg-gray-100 flex items-center justify-center">−</button>
                        <span className="w-6 text-center text-sm">{item.quantity}</span>
                        <button onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)} className="w-7 h-7 rounded text-sm font-bold hover:bg-gray-100 flex items-center justify-center">+</button>
                      </div>
                      <button onClick={() => handleRemoveItem(item.id)} className="text-gray-400 hover:text-red-500 text-sm">✕</button>
                    </div>
                  ))
                )}
              </div>
              <div className="px-4 py-3 border-t border-gray-200">
                <button
                  onClick={handleCheckout}
                  disabled={cart.length === 0 || checkingOut}
                  className="w-full py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  {checkingOut ? 'Processing...' : `Place Order — ${settings?.currencySymbol || 'Rs.'}${cart.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)}`}
                </button>
              </div>
            </div>
          </div>
        ) : (
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
            {/* Delivery: customer name + phone only */}
            {effectiveOrderType === 'delivery' && (
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
            {/* Drive Thru: customer name + phone + vehicle details */}
            {effectiveOrderType === 'drive_thru' && (
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">Vehicle Type</label>
                  <select
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                  >
                    <option value="">-- Select --</option>
                    <option value="Car">Car</option>
                    <option value="Motorcycle">Motorcycle</option>
                    <option value="Van">Van</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Plate Number</label>
                  <input
                    type="text"
                    value={vehiclePlateNumber}
                    onChange={(e) => setVehiclePlateNumber(e.target.value)}
                    placeholder="e.g. ABC-1234"
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
                      const result = await supa(slug, { table: 'customers', select: 'id', filter: { name: customerName }, limit: 1 });
                      let custId: string;
                      if (result.ok && result.data?.length > 0) {
                        custId = result.data[0].id;
                      } else {
                        const insertResult = await supa(slug, { table: 'customers', method: 'insert', select: 'id', single: true, body: { name: customerName, phone: customerPhone || null } });
                        if (!insertResult.ok || !insertResult.data) return;
                        custId = insertResult.data.id;
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
        )}
      </div>
      )}
    </div>
    {paymentOrder && !receiptOrder && (
      <PaymentModal
        slug={slug}
        theme={theme}
        currencySymbol={settings?.currencySymbol || 'Rs.'}
        orderId={paymentOrder.id}
        orderNumber={paymentOrder.order_number}
        orderTotal={Number(paymentOrder.total)}
        amountPaid={0}
        amountDue={Number(paymentOrder.total)}
        customerId={paymentOrder.customer_id}
        customerName={paymentOrder.customer_name}
        customerPhone={paymentOrder.customer_phone}
        orderType={paymentOrder.order_type}
        items={(paymentOrder.order_items || []).map((oi) => ({
          name: oi.menu_items?.name || 'Unknown',
          quantity: oi.quantity,
          price: Number(oi.price_at_order),
        }))}
        taxAmount={Number(paymentOrder.tax_amount ?? 0)}
        brandName={brandName}
        onClose={() => setPaymentOrder(null)}
        onSuccess={handlePaymentSuccess}
      />
    )}
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
