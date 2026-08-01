'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { usePOS } from './pos-context';
import { useAuth } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { StatCard } from '@sat-sys/pos-ui';
import { useEvent, usePublish } from './use-event';
import { supa, supaBatch } from './supa-query';

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

const ORDER_TYPE_ICONS: Record<string, string> = {
  dine_in: '🍽', takeaway: '🛍', delivery: '🚚', drive_thru: '🚗',
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

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      const start = todayStart.toISOString();
      const end = todayEnd.toISOString();

      const [completedOrdersRes, activeRes, kitchenRes, tablesRes, recentRes] = await supaBatch(slug, [
        { table: 'orders', select: 'total, order_type', eq: ['status', 'completed'], gte: ['created_at', start], lte: ['created_at', end], limit: 5000 },
        { table: 'orders', select: 'id', notIn: ['status', ['completed', 'cancelled']], head: true },
        { table: 'orders', select: 'status', in: ['status', ['pending', 'in_kitchen', 'ready']] },
        { table: 'tables', select: 'id, status' },
        { table: 'orders', select: 'id, order_number, customer_name, order_type, total, status, created_at', order: { column: 'created_at', ascending: false }, limit: 10 },
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
  }, [slug]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setAuthReady(true);
  }, [isLoaded, isSignedIn]);

  const { setPageTitle } = usePOS();
  useEffect(() => { setPageTitle('Dashboard'); }, [setPageTitle]);
  useEffect(() => {
    if (!authReady) return;
    fetchAll();
  }, [authReady, fetchAll]);

  useEvent('orders', () => { fetchAll(); });
  useEvent('tables', () => { fetchAll(); });
  const publish = usePublish();

  if (!isLoaded || !authReady) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
          <p className="text-sm text-[var(--text-muted)]">Loading...</p>
        </div>
      </div>
    );
  }

  const maxTypeRevenue = Math.max(...orderTypes.map(t => t.revenue), 1);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide p-4 md:p-6" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-6xl mx-auto space-y-5 anim-fade-up">
        {/* Header */}
        <div className="flex items-center justify-end">
          <button onClick={fetchAll} disabled={fetchingRef.current} className="btn btn-outline btn-sm text-xs">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard
            label="Orders"
            value={summary.totalOrders}
            hint="completed today"
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
          />
          <StatCard
            label="Revenue"
            value={`${currencySymbol}${summary.totalRevenue.toFixed(2)}`}
            hint="earned today"
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            label="Active"
            value={summary.activeOrders}
            hint="orders in progress"
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />
          <StatCard
            label="Avg Order"
            value={`${currencySymbol}${summary.avgOrderValue.toFixed(2)}`}
            hint="per completed order"
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
          />
        </div>

        {/* Middle Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {/* Tables */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--primary-soft)' }}>
                <svg className="w-4 h-4" style={{ color: 'var(--primary)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text)]">Open Tables</h3>
            </div>
            {tables.total === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No tables configured.</p>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold" style={{ color: tables.occupied === tables.total ? 'var(--danger)' : 'var(--success)' }}>
                  {tables.occupied}
                </span>
                <span className="text-lg text-[var(--text-muted)]">/ {tables.total}</span>
                <span className="text-sm text-[var(--text-faint)] ml-2">tables occupied</span>
              </div>
            )}
          </div>

          {/* Kitchen */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--warning-soft)]">
                <svg className="w-4 h-4 text-[var(--warning)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8V4l8 4-8 4V4l-8 4 8 4v4l-8-4 8 4v4" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text)]">Kitchen Status</h3>
            </div>
            {kitchen.pending + kitchen.in_kitchen + kitchen.ready === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No active orders in kitchen.</p>
            ) : (
              <div className="space-y-2.5">
                {([['pending', 'Pending', 'bg-[var(--info)]'], ['in_kitchen', 'In Kitchen', 'bg-[var(--warning)]'], ['ready', 'Ready', 'bg-[var(--success)]']] as const).map(([key, label, dotClass]) => (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${dotClass}`} />
                      <span className="text-sm text-[var(--text-soft)]">{label}</span>
                    </div>
                    <span className="text-lg font-bold text-[var(--text)] tabular-nums">{kitchen[key]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {/* Sales by Type */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--primary-soft)' }}>
                <svg className="w-4 h-4" style={{ color: 'var(--primary)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text)]">Sales by Type (Today)</h3>
            </div>
            {orderTypes.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No completed orders today.</p>
            ) : (
              <div className="space-y-3">
                {orderTypes.map((row) => (
                  <div key={row.order_type}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="flex items-center gap-2 text-[var(--text-soft)]">
                        <span className="text-sm">{ORDER_TYPE_ICONS[row.order_type] || '📋'}</span>
                        {ORDER_TYPE_LABELS[row.order_type] || row.order_type}
                      </span>
                      <span className="text-[var(--text)] font-semibold tabular-nums">{currencySymbol}{row.revenue.toFixed(2)}</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden bg-[var(--surface-3)]">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${(row.revenue / maxTypeRevenue) * 100}%`,
                          backgroundColor: 'var(--primary)',
                          opacity: 0.5 + (row.revenue / maxTypeRevenue) * 0.5,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--success-soft)]">
                <svg className="w-4 h-4 text-[var(--success)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text)]">Recent Activity</h3>
            </div>
            {recentOrders.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No recent orders.</p>
            ) : (
              <div className="space-y-1">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xs text-[var(--text-faint)] font-mono tabular-nums">#{order.order_number}</span>
                      {order.customer_name && <span className="text-xs text-[var(--text-soft)] font-medium truncate">{order.customer_name}</span>}
                      <span className="text-xs text-[var(--text-muted)]">{ORDER_TYPE_LABELS[order.order_type] || order.order_type}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="badge text-[10px] py-0.5 px-1.5">{order.status}</span>
                      <span className="text-xs font-semibold text-[var(--text)] tabular-nums w-16 text-right">{currencySymbol}{Number(order.total).toFixed(2)}</span>
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
