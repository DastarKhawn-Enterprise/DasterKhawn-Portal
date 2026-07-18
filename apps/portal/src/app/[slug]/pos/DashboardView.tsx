'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supa, supaBatch, getSupabaseRealtimeToken } from './supa-query';

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
  theme: ThemeConfig;
  slug: string;
  currencySymbol: string;
}

interface SummaryData { totalOrders: number; totalRevenue: number; activeOrders: number; avgOrderValue: number; }
interface KitchenCounts { pending: number; in_kitchen: number; ready: number; }
interface TableCounts { total: number; occupied: number; }
interface OrderTypeRow { order_type: string; count: number; revenue: number; }
interface RecentOrder { id: string; order_number: number; order_type: string; total: number; status: string; created_at: string; }

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: 'Dine In', takeaway: 'Take Away', delivery: 'Delivery', drive_thru: 'Drive Thru',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  in_kitchen: 'bg-blue-100 text-blue-800 border-blue-300',
  ready: 'bg-green-100 text-green-800 border-green-300',
  completed: 'bg-gray-100 text-gray-500 border-gray-200',
  cancelled: 'bg-red-100 text-red-800 border-red-300',
};

export default function DashboardView({ supabaseUrl, supabaseAnonKey, theme, slug, currencySymbol }: Props) {
  const { isLoaded, isSignedIn } = useAuth();
  const [authReady, setAuthReady] = useState(false);

  const [summary, setSummary] = useState<SummaryData>({ totalOrders: 0, totalRevenue: 0, activeOrders: 0, avgOrderValue: 0 });
  const [kitchen, setKitchen] = useState<KitchenCounts>({ pending: 0, in_kitchen: 0, ready: 0 });
  const [tables, setTables] = useState<TableCounts>({ total: 0, occupied: 0 });
  const [orderTypes, setOrderTypes] = useState<OrderTypeRow[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loaded, setLoaded] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      const start = todayStart.toISOString();
      const end = todayEnd.toISOString();

      const [completedOrdersRes, activeRes, kitchenRes, tablesRes, recentRes] = await supaBatch(slug, [
        { table: 'orders', select: 'total, order_type', eq: ['status', 'completed'], gte: ['created_at', start], lte: ['created_at', end] },
        { table: 'orders', select: 'id', notIn: ['status', ['completed', 'cancelled']], head: true },
        { table: 'orders', select: 'status', in: ['status', ['pending', 'in_kitchen', 'ready']] },
        { table: 'tables', select: 'id, status' },
        { table: 'orders', select: 'id, order_number, order_type, total, status, created_at', order: { column: 'created_at', ascending: false }, limit: 10 },
      ]);

      const activeCount = activeRes.ok ? (activeRes.count ?? 0) : 0;

      if (completedOrdersRes.ok && completedOrdersRes.data) {
        const orders = completedOrdersRes.data;
        const totalOrders = orders.length;
        const totalRevenue = orders.reduce((s: number, o: any) => s + (Number(o.total) || 0), 0);
        setSummary({ totalOrders, totalRevenue, activeOrders: activeCount, avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0 });

        const grouped = new Map<string, { count: number; revenue: number }>();
        for (const o of orders) {
          const key = o.order_type || 'unknown';
          const prev = grouped.get(key) || { count: 0, revenue: 0 };
          prev.count += 1; prev.revenue += Number(o.total) || 0;
          grouped.set(key, prev);
        }
        setOrderTypes(Array.from(grouped.entries()).map(([order_type, v]) => ({ order_type, count: v.count, revenue: v.revenue })).sort((a, b) => b.revenue - a.revenue));
      } else { setOrderTypes([]); }

      if (kitchenRes.ok && kitchenRes.data) {
        const counts: KitchenCounts = { pending: 0, in_kitchen: 0, ready: 0 };
        for (const o of kitchenRes.data) { const status = o.status as keyof KitchenCounts; if (status in counts) counts[status]++; }
        setKitchen(counts);
      }

      if (tablesRes.ok && tablesRes.data) {
        setTables({ total: tablesRes.data.length, occupied: tablesRes.data.filter((t: any) => t.status === 'occupied').length });
      }

      if (recentRes.ok && recentRes.data) setRecentOrders(recentRes.data as RecentOrder[]);
    } catch (e) { console.error('[Dashboard] fetch error:', e); }
    setLoaded(true);
  }, [slug]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setAuthReady(true);
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!authReady) return;
    fetchAll();
  }, [authReady, fetchAll]);

  // Realtime subscriptions — use Clerk JWT (best-effort, silently fails on tenants where JWT is invalid)
  useEffect(() => {
    if (!authReady) return;
    let channel: ReturnType<SupabaseClient['channel']> | null = null;

    getSupabaseRealtimeToken(slug).then((token) => {
      if (!token) return;
      const client = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      });
      channel = client
        .channel('dashboard-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { fetchAll(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => { fetchAll(); })
        .subscribe();
    }).catch(() => {});

    return () => { if (channel) channel.unsubscribe(); };
  }, [authReady, slug, supabaseUrl, supabaseAnonKey, fetchAll]);

  if (!isLoaded || !authReady) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading...</p></div>;
  }

  const maxTypeRevenue = Math.max(...orderTypes.map(t => t.revenue), 1);
  const cardStyle = { borderLeftColor: theme.primaryColor };

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-lg font-bold text-gray-700 uppercase tracking-wider mb-5">Today&apos;s Dashboard</h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 border-l-4 p-4" style={cardStyle}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Orders</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{summary.totalOrders}</p>
            <p className="text-xs text-gray-400 mt-1">completed today</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 border-l-4 p-4" style={cardStyle}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Revenue</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{currencySymbol}{summary.totalRevenue.toFixed(2)}</p>
            <p className="text-xs text-gray-400 mt-1">earned today</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 border-l-4 p-4" style={cardStyle}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Active</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{summary.activeOrders}</p>
            <p className="text-xs text-gray-400 mt-1">orders in progress</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 border-l-4 p-4" style={cardStyle}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Avg Order</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{currencySymbol}{summary.avgOrderValue.toFixed(2)}</p>
            <p className="text-xs text-gray-400 mt-1">per completed order</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Open Tables</h3>
            {tables.total === 0 ? (
              <p className="text-sm text-gray-400">No tables configured.</p>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold" style={{ color: tables.occupied === tables.total ? theme.primaryColor : '#059669' }}>
                  {tables.occupied}
                </span>
                <span className="text-lg text-gray-500">/ {tables.total}</span>
                <span className="text-sm text-gray-400 ml-2">tables occupied</span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Kitchen Status</h3>
            {kitchen.pending + kitchen.in_kitchen + kitchen.ready === 0 ? (
              <p className="text-sm text-gray-400">No active orders in kitchen.</p>
            ) : (
              <div className="space-y-2">
                {([['pending', 'Pending', 'bg-yellow-100'],
                  ['in_kitchen', 'In Kitchen', 'bg-blue-100'],
                  ['ready', 'Ready', 'bg-green-100']] as const).map(([key, label, bg]) => (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${bg} border`} /><span className="text-sm text-gray-600">{label}</span></div>
                    <span className="text-lg font-bold text-gray-800">{kitchen[key]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Sales by Type (Today)</h3>
            {orderTypes.length === 0 ? (
              <p className="text-sm text-gray-400">No completed orders today.</p>
            ) : (
              <div className="space-y-2">
                {orderTypes.map((row) => (
                  <div key={row.order_type}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">{ORDER_TYPE_LABELS[row.order_type] || row.order_type}</span>
                      <span className="text-gray-800 font-medium">{currencySymbol}{row.revenue.toFixed(2)}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(row.revenue / maxTypeRevenue) * 100}%`, backgroundColor: theme.primaryColor }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Activity</h3>
            {recentOrders.length === 0 ? (
              <p className="text-sm text-gray-400">No recent orders.</p>
            ) : (
              <div className="space-y-1">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-gray-400 font-mono">#{order.order_number}</span>
                      <span className="text-xs text-gray-500">{ORDER_TYPE_LABELS[order.order_type] || order.order_type}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${STATUS_COLORS[order.status] || ''}`}>{order.status}</span>
                      <span className="text-xs font-medium text-gray-700 w-14 text-right">{currencySymbol}{Number(order.total).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
