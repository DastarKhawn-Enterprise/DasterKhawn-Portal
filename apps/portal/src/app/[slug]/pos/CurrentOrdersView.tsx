'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import { MenuGrid, CartSidebar } from '@sat-sys/pos-ui';
import type { MenuItem, CartItem, ThemeConfig } from '@sat-sys/pos-ui';
import type { SupabaseClient, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface OrderItem {
  quantity: number;
  price_at_order: number;
  menu_items: { name: string };
}

interface Order {
  id: string;
  order_number: number;
  status: string;
  total: number;
  created_at: string;
  order_items: OrderItem[];
}

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
  theme: ThemeConfig;
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

export default function CurrentOrdersView({ supabaseUrl, supabaseAnonKey, theme }: Props) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [authReady, setAuthReady] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

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
        return client.from('menu_items').select('id, name, description, price, category, available').order('name');
      })
      .then((r: any) => { if (!cancelled && r && !r.error) setMenuItems(r.data ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authReady, getSupabaseClient]);

  // Fetch orders + realtime
  const fetchOrderWithItems = useCallback(async (client: SupabaseClient, orderId: string) => {
    const { data } = await client
      .from('orders')
      .select('id, order_number, status, total, created_at, order_items (quantity, price_at_order, menu_items (name))')
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

      const { data, error } = await client
        .from('orders')
        .select('id, order_number, status, total, created_at, order_items (quantity, price_at_order, menu_items (name))')
        .not('status', 'in', '("completed","cancelled")')
        .order('created_at', { ascending: true });

      if (!cancelled && !error && data) setOrders(data as unknown as Order[]);

      channel = client
        .channel('current-orders')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: 'status=neq.completed' },
          async (payload: RealtimePostgresChangesPayload<{ id: string }>) => {
            const rec = payload.new as { id?: string } | null;
            if (!rec?.id) return;
            const o = await fetchOrderWithItems(client, rec.id);
            if (o) setOrders((prev) => (prev.some((x) => x.id === o.id) ? prev : [...prev, o]));
          })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' },
          (payload: RealtimePostgresChangesPayload<{ id: string; status: string }>) => {
            const rec = payload.new as { id?: string; status?: string } | null;
            if (!rec?.id) return;
            const { id, status } = rec;
            if (status === 'completed' || status === 'cancelled') {
              setOrders((prev) => prev.filter((o) => o.id !== id));
            } else if (status) {
              setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
            }
          })
        .subscribe();
    };

    init();
    return () => { cancelled = true; if (channel) channel.unsubscribe(); };
  }, [authReady, getSupabaseClient, fetchOrderWithItems]);

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

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0) return;
    setCheckingOut(true);
    try {
      const client = await getSupabaseClient();
      const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const { data: order, error: orderError } = await client
        .from('orders').insert({ status: 'pending', source: 'pos', total }).select('id, order_number').single();
      if (orderError || !order) { console.error('[Checkout]', orderError); setCheckingOut(false); return; }
      const items = cart.map((item) => ({ order_id: order.id, menu_item_id: item.id, quantity: item.quantity, price_at_order: item.price }));
      const { error: itemsError } = await client.from('order_items').insert(items);
      if (itemsError) { console.error('[Checkout items]', itemsError); setCheckingOut(false); return; }
      setCart([]);
    } catch (e) { console.error('[Checkout]', e); }
    setCheckingOut(false);
  }, [cart, getSupabaseClient]);

  // Status update
  const updateStatus = useCallback(async (orderId: string, newStatus: string) => {
    setUpdating(orderId);
    try {
      const client = await getSupabaseClient();
      const { error } = await client.from('orders').update({ status: newStatus }).eq('id', orderId);
      if (error) { console.error('[Status]', error.message); setUpdating(null); return; }
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
  }, []);

  if (!isLoaded || !authReady) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading...</p></div>;
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ── LEFT PANEL: Order list ── */}
      <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Active Orders</h2>
          <button
            onClick={handleNewOrder}
            className="text-xs px-3 py-1.5 rounded text-white font-semibold"
            style={{ backgroundColor: theme.primaryColor }}
          >
            + New Order
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {orders.length === 0 && (
            <p className="text-gray-400 text-sm text-center pt-8">No active orders</p>
          )}
          {orders.map((order) => (
            <button
              key={order.id}
              onClick={() => setSelectedId(order.id)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selectedId === order.id ? '' : 'hover:bg-gray-50'
              }`}
              style={selectedId === order.id ? { borderColor: theme.primaryColor, boxShadow: `0 0 0 2px ${theme.primaryColor}20` } : { borderColor: '#e5e7eb' }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm">#{order.order_number}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${statusColor[order.status] || ''}`}>
                  {statusDisplay[order.status] || order.status}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {new Date(order.created_at).toLocaleTimeString()} &middot; {order.order_items?.length || 0} item{(order.order_items?.length || 0) !== 1 ? 's' : ''}
              </div>
              <div className="text-xs font-semibold text-gray-700 mt-1">${Number(order.total).toFixed(2)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── CENTER PANEL: Selected order detail ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {selectedOrder ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold">Order #{selectedOrder.order_number}</h2>
                <p className="text-sm text-gray-500">
                  {new Date(selectedOrder.created_at).toLocaleString()}
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusColor[selectedOrder.status] || ''}`}>
                {statusDisplay[selectedOrder.status] || selectedOrder.status}
              </span>
            </div>

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
                    <td className="text-right py-2">${Number(item.price_at_order).toFixed(2)}</td>
                    <td className="text-right py-2 font-medium">${(item.quantity * Number(item.price_at_order)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold text-base">
                  <td colSpan={3} className="text-right py-2">Total</td>
                  <td className="text-right py-2">${Number(selectedOrder.total).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>

            {/* Notes field (visual only) */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Order Notes</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-500"
                rows={2}
                placeholder="Add notes (coming soon)..."
                disabled
              />
            </div>

            {/* Action buttons */}
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
              <ActionButton label="Print Bill" color="bg-gray-600 hover:bg-gray-700" disabled onClick={() => {}} updating={false} />
              <ActionButton label="Edit Order" color="bg-gray-600 hover:bg-gray-700" disabled onClick={() => {}} updating={false} />
              {selectedOrder.status !== 'cancelled' && (
                <ActionButton label="Cancel Order" color="bg-red-600 hover:bg-red-700" disabled={updating === selectedOrder.id} onClick={() => updateStatus(selectedOrder.id, 'cancelled')} updating={updating === selectedOrder.id} />
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-400 text-lg">Select an order from the list to view details</p>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL: New order builder ── */}
      <div className="w-[400px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">New Order</h3>
        </div>
        {menuItems.length > 0 ? (
          <div className="flex-1 overflow-y-auto">
            <MenuGrid menuItems={menuItems} onAddToCart={handleAddToCart} theme={theme} />
          </div>
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
        />
      </div>
    </div>
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
