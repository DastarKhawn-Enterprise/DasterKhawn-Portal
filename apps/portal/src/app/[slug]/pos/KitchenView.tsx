'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import type { RealtimePostgresChangesPayload, SupabaseClient } from '@supabase/supabase-js';

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

interface KitchenViewProps {
  supabaseUrl: string;
  supabaseAnonKey: string;
  brandName: string;
}

const statusDisplay: Record<string, string> = {
  pending: 'Pending',
  in_kitchen: 'In Kitchen',
  ready: 'Ready',
  completed: 'Completed',
};

export default function KitchenView({ supabaseUrl, supabaseAnonKey, brandName }: KitchenViewProps) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

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

  const fetchOrderWithItems = useCallback(
    async (client: SupabaseClient, orderId: string) => {
      const { data } = await client
        .from('orders')
        .select(
          `id, order_number, status, total, created_at,
           order_items (quantity, price_at_order, menu_items (name))`,
        )
        .eq('id', orderId)
        .single();
      return data as unknown as Order | null;
    },
    [],
  );

  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;
    let channel: ReturnType<SupabaseClient['channel']> | null = null;

    const init = async () => {
      const client = await getSupabaseClient();
      if (cancelled) return;

      const { data, error } = await client
        .from('orders')
        .select(
          `id, order_number, status, total, created_at,
           order_items (quantity, price_at_order, menu_items (name))`,
        )
        .neq('status', 'completed')
        .order('created_at', { ascending: true });

      if (!cancelled && !error && data) {
        setOrders(data as unknown as Order[]);
      }

      channel = client
        .channel('kitchen-orders')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'orders', filter: `status=neq.completed` },
          async (payload: RealtimePostgresChangesPayload<{ id: string }>) => {
            const rec = payload.new as { id?: string } | null;
            const newId = rec?.id;
            if (!newId) return;
            const newOrder = await fetchOrderWithItems(client, newId);
            if (newOrder) {
              setOrders((prev) => {
                if (prev.some((o) => o.id === newOrder.id)) return prev;
                return [...prev, newOrder];
              });
            }
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders' },
          (payload: RealtimePostgresChangesPayload<{ id: string; status: string }>) => {
            const rec = payload.new as { id?: string; status?: string } | null;
            if (!rec?.id) return;
            const { id, status } = rec;
            if (status === 'completed') {
              setOrders((prev) => prev.filter((o) => o.id !== id));
            } else if (status) {
              setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
            }
          },
        )
        .subscribe();
    };

    init();

    return () => {
      cancelled = true;
      if (channel) channel.unsubscribe();
    };
  }, [authReady, getSupabaseClient, fetchOrderWithItems]);

  const updateStatus = async (orderId: string, newStatus: string) => {
    setUpdating(orderId);
    try {
      const client = await getSupabaseClient();
      const { error } = await client.from('orders').update({ status: newStatus }).eq('id', orderId);
      if (error) {
        console.error('[KitchenView] Status update failed:', error.message, error);
        setUpdating(null);
        return;
      }
      console.log('[KitchenView] Status updated:', orderId, '->', newStatus);
    } catch (e) {
      console.error('[KitchenView] Status update threw:', e);
    }
    setUpdating(null);
  };

  if (!isLoaded || !authReady) return null;

  return (
    <div className="flex-1 overflow-auto p-6 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <p className="text-gray-500 mb-6">
          {orders.length} active order{orders.length !== 1 ? 's' : ''}
        </p>

        {orders.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg shadow">
            <p className="text-gray-400 text-lg">
              No active orders. New orders from POS will appear here in real time.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                updating={updating === order.id}
                onUpdateStatus={updateStatus}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  updating,
  onUpdateStatus,
}: {
  order: Order;
  updating: boolean;
  onUpdateStatus: (id: string, status: string) => void;
}) {
  const badgeColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    in_kitchen: 'bg-blue-100 text-blue-800',
    ready: 'bg-green-100 text-green-800',
  };

  const action =
    order.status === 'pending'
      ? { label: 'Start Cooking', next: 'in_kitchen', bg: 'bg-blue-600 hover:bg-blue-700' }
      : order.status === 'in_kitchen'
        ? { label: 'Mark Ready', next: 'ready', bg: 'bg-amber-600 hover:bg-amber-700' }
        : order.status === 'ready'
          ? { label: 'Complete Order', next: 'completed', bg: 'bg-green-600 hover:bg-green-700' }
          : null;

  return (
    <div className="bg-white rounded-lg shadow p-5 border-l-4 border-l-blue-500">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold">Order #{order.order_number}</h2>
          <p className="text-sm text-gray-500">
            {new Date(order.created_at).toLocaleTimeString()} &mdash;{' '}
            {new Date(order.created_at).toLocaleDateString()}
          </p>
        </div>
        <span className={`px-3 py-1 rounded text-xs font-semibold ${badgeColor[order.status] || ''}`}>
          {statusDisplay[order.status] || order.status}
        </span>
      </div>

      <table className="w-full text-sm mb-4">
        <thead>
          <tr className="text-gray-500 border-b">
            <th className="text-left py-1 font-medium">Item</th>
            <th className="text-right py-1 font-medium">Qty</th>
          </tr>
        </thead>
        <tbody>
          {order.order_items.map((item, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-1.5">{item.menu_items?.name || 'Unknown item'}</td>
              <td className="text-right py-1.5 font-medium">{item.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {action && (
        <button
          onClick={() => onUpdateStatus(order.id, action.next)}
          disabled={updating}
          className={`px-4 py-2 rounded text-white text-sm font-semibold ${action.bg} disabled:opacity-50`}
        >
          {updating ? '...' : action.label}
        </button>
      )}
    </div>
  );
}
