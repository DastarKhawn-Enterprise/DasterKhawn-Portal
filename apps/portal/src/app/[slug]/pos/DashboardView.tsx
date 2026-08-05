'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { usePOS } from './pos-context';
import { useAuth } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { useEvent, usePublish } from './use-event';
import { supa, supaBatch } from './supa-query';
import { useBusinessDate } from './business-date-context';
import { resolveEnabledModules } from '@/lib/module-registry';
import { Badge, Skeleton, SkeletonTable, orderStatusVariant } from '@sat-sys/ui';

interface Props {
  theme: ThemeConfig;
  slug: string;
  currencySymbol: string;
}

interface SummaryData { totalOrders: number; totalRevenue: number; activeOrders: number; avgOrderValue: number; }
interface KitchenCounts { pending: number; in_kitchen: number; ready: number; }
interface TableCounts { total: number; occupied: number; }
interface OrderTypeRow { order_type: string; count: number; revenue: number; }
interface RecentOrder { id: string; order_number: number; customer_name: string | null; order_type: string; total: number; status: string; created_at: string; }

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: 'Dine In', takeaway: 'Take Away', delivery: 'Delivery', drive_thru: 'Drive Thru',
};

export default function DashboardView({ theme, slug, currencySymbol }: Props) {
  const { isLoaded, isSignedIn } = useAuth();
  const [authReady, setAuthReady] = useState(false);

  const [summary, setSummary] = useState<SummaryData>({ totalOrders: 0, totalRevenue: 0, activeOrders: 0, avgOrderValue: 0 });
  const [kitchen, setKitchen] = useState<KitchenCounts>({ pending: 0, in_kitchen: 0, ready: 0 });
  const [tables, setTables] = useState<TableCounts>({ total: 0, occupied: 0 });
  const [orderTypes, setOrderTypes] = useState<OrderTypeRow[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const fetchingRef = useRef(false);
  const bd = useBusinessDate();

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const start = bd.start;
      const end = bd.end;

      const [completedOrdersRes, activeRes, kitchenRes, tablesRes, recentRes] = await supaBatch(slug, [
        { table: 'orders', select: 'total, order_type', eq: ['status', 'completed'], gte: ['created_at', start], lte: ['created_at', end], limit: 5000 },
        { table: 'orders', select: 'id', notIn: ['status', ['completed', 'cancelled']], head: true },
        { table: 'orders', select: 'status', in: ['status', ['pending', 'in_kitchen', 'ready']] },
        { table: 'tables', select: 'id, status' },
        { table: 'orders', select: 'id, order_number, customer_name, order_type, total, status, created_at', gte: ['created_at', start], lte: ['created_at', end], order: { column: 'created_at', ascending: false }, limit: 10 },
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
    fetchingRef.current = false;
  }, [slug, bd.start, bd.end]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setAuthReady(true);
  }, [isLoaded, isSignedIn]);

  const { setPageTitle, enabledModules } = usePOS();
  useEffect(() => { setPageTitle('Dashboard'); }, [setPageTitle]);
  const effModules = resolveEnabledModules(enabledModules);
  const showOpenTables = effModules.reservations !== false;
  const showKitchen = effModules.kitchen_display !== false;
  useEffect(() => {
    if (!authReady) return;
    fetchAll();
  }, [authReady, fetchAll]);

  // Realtime subscriptions — refresh on any orders/tables change (only when viewing today)
  useEvent('orders', () => { if (bd.isToday) fetchAll(); });
  useEvent('tables', () => { if (bd.isToday) fetchAll(); });
  const publish = usePublish();

  if (!isLoaded || !authReady) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="card" />)}
          </div>
          <SkeletonTable rows={6} cols={5} />
        </div>
      </div>
    );
  }

  const maxTypeRevenue = Math.max(...orderTypes.map(t => t.revenue), 1);
  const periodText = bd.isToday ? 'today' : bd.label.toLowerCase();

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-end mb-5">
          <button onClick={fetchAll} disabled={fetchingRef.current} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50">Refresh</button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Orders</p>
              <p className="text-2xl font-medium text-gray-800">{summary.totalOrders}</p>
              <p className="text-xs text-gray-400 mt-1">completed {periodText}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Revenue</p>
              <p className="text-2xl font-medium text-gray-800">{currencySymbol}{summary.totalRevenue.toFixed(2)}</p>
              <p className="text-xs text-gray-400 mt-1">earned {periodText}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Active</p>
              <p className="text-2xl font-medium text-gray-800">{summary.activeOrders}</p>
              <p className="text-xs text-gray-400 mt-1">orders in progress</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Avg Order</p>
              <p className="text-2xl font-medium text-gray-800">{currencySymbol}{summary.avgOrderValue.toFixed(2)}</p>
              <p className="text-xs text-gray-400 mt-1">per completed order</p>
            </div>
          </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {showOpenTables && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
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
          )}

          {showKitchen && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Kitchen Status</h3>
            {kitchen.pending + kitchen.in_kitchen + kitchen.ready === 0 ? (
              <p className="text-sm text-gray-400">No active orders in kitchen.</p>
            ) : (
              <div className="space-y-2">
                {([['pending', 'Pending', 'bg-blue-100'],
                  ['in_kitchen', 'In Kitchen', 'bg-amber-100'],
                  ['ready', 'Ready', 'bg-green-100']] as const).map(([key, label, bg]) => (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${bg} border`} /><span className="text-sm text-gray-600">{label}</span></div>
                    <span className="text-lg font-bold text-gray-800">{kitchen[key]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Sales by Type ({bd.label})</h3>
            {orderTypes.length === 0 ? (
              <p className="text-sm text-gray-400">No completed orders {periodText === 'today' ? 'today' : `for ${periodText}`}.</p>
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

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Activity</h3>
            {recentOrders.length === 0 ? (
              <p className="text-sm text-gray-400">No recent orders.</p>
            ) : (
              <div className="space-y-1">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-gray-400 font-mono">#{order.order_number}</span>
                      {order.customer_name && <span className="text-xs text-gray-700 font-medium truncate">{order.customer_name}</span>}
                      <span className="text-xs text-gray-500">{ORDER_TYPE_LABELS[order.order_type] || order.order_type}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge variant={orderStatusVariant(order.status)} size="sm" pill>{order.status}</Badge>
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
