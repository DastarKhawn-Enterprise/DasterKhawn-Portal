'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasPermission, decodeJwt } from './permissions';

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
  theme: ThemeConfig;
}

type DateRangePreset = 'today' | 'week' | 'month' | 'custom';

interface SummaryData {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
}

interface OrderTypeRow {
  order_type: string;
  count: number;
  revenue: number;
}

interface TopItem {
  name: string;
  quantity_sold: number;
  revenue: number;
}

interface DailyRevenue {
  date: string;
  revenue: number;
}

function getDateRange(preset: DateRangePreset, customStart?: string, customEnd?: string) {
  const now = new Date();
  let start: Date;
  let end: Date;

  switch (preset) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = now;
      break;
    case 'week':
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
      end = now;
      break;
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = now;
      break;
    case 'custom':
      start = customStart ? new Date(customStart) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = customEnd ? new Date(customEnd + 'T23:59:59') : now;
      break;
  }

  return { start: start.toISOString(), end: end.toISOString() };
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: 'Dine In',
  takeaway: 'Take Away',
  delivery: 'Delivery',
  drive_thru: 'Drive Thru',
};

export default function ReportsView({ supabaseUrl, supabaseAnonKey, theme }: Props) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [authReady, setAuthReady] = useState(false);
  const [hasReportsView, setHasReportsView] = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(false);

  const [preset, setPreset] = useState<DateRangePreset>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [orderTypeBreakdown, setOrderTypeBreakdown] = useState<OrderTypeRow[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);
  const [loading, setLoading] = useState(false);
  const [currencySymbol, setCurrencySymbol] = useState('$');

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

  useEffect(() => {
    if (!authReady) return;
    getToken({ template: 'supabase' })
      .then((token) => {
        if (!token) return;
        const decoded = decodeJwt(token);
        if (decoded) setHasReportsView(hasPermission(decoded.permissions, decoded.tenant_role, 'reports:view'));
      })
      .finally(() => setPermissionChecked(true));
  }, [authReady, getToken]);

  const fetchReports = useCallback(async () => {
    const { start, end } = getDateRange(preset, customStart, customEnd);
    setLoading(true);

    try {
      const client = await getSupabaseClient();

      const [summaryRes, orderTypeRes, topItemsRes, dailyRes] = await Promise.all([
        client.from('orders')
          .select('id, total', { count: 'exact', head: false })
          .eq('status', 'completed')
          .gte('created_at', start)
          .lte('created_at', end),

        client.from('orders')
          .select('order_type, total')
          .eq('status', 'completed')
          .gte('created_at', start)
          .lte('created_at', end),

        client.from('order_items')
          .select('quantity, price_at_order, menu_items!inner(name), orders!inner(status, created_at)')
          .eq('orders.status', 'completed')
          .gte('orders.created_at', start)
          .lte('orders.created_at', end)
          .order('quantity', { ascending: false })
          .limit(1000),

        client.from('orders')
          .select('created_at, total')
          .eq('status', 'completed')
          .gte('created_at', start)
          .lte('created_at', end)
          .order('created_at', { ascending: true }),
      ]);

      // Summary
      if (!summaryRes.error && summaryRes.data) {
        const orders = summaryRes.data;
        const totalOrders = orders.length;
        const totalRevenue = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
        setSummary({ totalOrders, totalRevenue, avgOrderValue });
      }

      // Order type breakdown
      if (!orderTypeRes.error && orderTypeRes.data) {
        const grouped = new Map<string, { count: number; revenue: number }>();
        for (const o of orderTypeRes.data) {
          const key = o.order_type || 'unknown';
          const prev = grouped.get(key) || { count: 0, revenue: 0 };
          prev.count += 1;
          prev.revenue += Number(o.total) || 0;
          grouped.set(key, prev);
        }
        setOrderTypeBreakdown(
          Array.from(grouped.entries())
            .map(([order_type, v]) => ({ order_type, count: v.count, revenue: v.revenue }))
            .sort((a, b) => b.revenue - a.revenue)
        );
      }

      // Top selling items
      if (!topItemsRes.error && topItemsRes.data) {
        const grouped = new Map<string, { qty: number; rev: number }>();
        for (const item of topItemsRes.data) {
          const name = (item.menu_items as any)?.name || 'Unknown';
          const prev = grouped.get(name) || { qty: 0, rev: 0 };
          prev.qty += item.quantity;
          prev.rev += item.quantity * Number(item.price_at_order);
          grouped.set(name, prev);
        }
        setTopItems(
          Array.from(grouped.entries())
            .map(([name, v]) => ({ name, quantity_sold: v.qty, revenue: v.rev }))
            .sort((a, b) => b.quantity_sold - a.quantity_sold)
            .slice(0, 10)
        );
      }

      // Daily revenue
      if (!dailyRes.error && dailyRes.data) {
        const grouped = new Map<string, number>();
        for (const o of dailyRes.data) {
          const date = o.created_at?.split('T')[0] || 'unknown';
          grouped.set(date, (grouped.get(date) || 0) + (Number(o.total) || 0));
        }
        setDailyRevenue(
          Array.from(grouped.entries())
            .map(([date, revenue]) => ({ date, revenue }))
            .sort((a, b) => a.date.localeCompare(b.date))
        );
      }
    } catch (e) {
      console.error('[Reports] fetch error:', e);
    }

    setLoading(false);
  }, [preset, customStart, customEnd, getSupabaseClient]);

  useEffect(() => {
    if (!authReady || !hasReportsView) return;
    fetchReports();
  }, [authReady, hasReportsView, fetchReports]);

  useEffect(() => {
    if (!authReady) return;
    getSupabaseClient().then((client) => {
      client.from('settings').select('currency_symbol').single().then(({ data, error }) => {
        if (!error && data?.currency_symbol) setCurrencySymbol(data.currency_symbol);
      });
    });
  }, [authReady, getSupabaseClient]);

  if (!isLoaded || !authReady || !permissionChecked) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading...</p></div>;
  }

  if (!hasReportsView) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-400 mb-2">Reports</h2>
          <p className="text-gray-300">You do not have permission to view reports.</p>
        </div>
      </div>
    );
  }

  const maxDailyRevenue = Math.max(...dailyRevenue.map(d => d.revenue), 1);
  const maxItemQty = Math.max(...topItems.map(i => i.quantity_sold), 1);
  const barCount = dailyRevenue.length;

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header + Date range selector */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <h2 className="text-lg font-bold text-gray-700 uppercase tracking-wider">Reports</h2>
          <div className="flex flex-wrap items-center gap-2">
            {(['today', 'week', 'month', 'custom'] as DateRangePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                  preset === p ? 'text-white' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                }`}
                style={preset === p ? { backgroundColor: theme.primaryColor } : {}}
              >
                {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'Custom'}
              </button>
            ))}
            {preset === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded"
                />
              </div>
            )}
            <button
              onClick={fetchReports}
              disabled={loading}
              className="px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: theme.primaryColor }}
            >
              {loading ? '...' : 'Refresh'}
            </button>
          </div>
        </div>

        {loading && !summary ? (
          <p className="text-gray-400 text-center pt-12">Loading reports...</p>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <SummaryCard label="Total Orders" value={summary?.totalOrders ?? 0} format="number" currencySymbol={currencySymbol} theme={theme} />
              <SummaryCard label="Total Revenue" value={summary?.totalRevenue ?? 0} format="currency" currencySymbol={currencySymbol} theme={theme} />
              <SummaryCard label="Avg Order Value" value={summary?.avgOrderValue ?? 0} format="currency" currencySymbol={currencySymbol} theme={theme} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
              {/* Sales by Order Type */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Sales by Order Type</h3>
                {orderTypeBreakdown.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-6">No completed orders in this period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 border-b">
                        <th className="text-left py-2 font-medium">Type</th>
                        <th className="text-right py-2 font-medium">Orders</th>
                        <th className="text-right py-2 font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderTypeBreakdown.map((row) => (
                        <tr key={row.order_type} className="border-b border-gray-100">
                          <td className="py-2 font-medium">{ORDER_TYPE_LABELS[row.order_type] || row.order_type}</td>
                          <td className="py-2 text-right">{row.count}</td>
                          <td className="py-2 text-right font-semibold">{currencySymbol}{row.revenue.toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold text-sm">
                        <td className="py-2 text-gray-700">Total</td>
                        <td className="py-2 text-right">{orderTypeBreakdown.reduce((s, r) => s + r.count, 0)}</td>
                        <td className="py-2 text-right">{currencySymbol}{orderTypeBreakdown.reduce((s, r) => s + r.revenue, 0).toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>

              {/* Top Selling Items */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Top Selling Items</h3>
                {topItems.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-6">No items sold in this period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 border-b">
                        <th className="text-left py-2 font-medium">Item</th>
                        <th className="text-right py-2 font-medium">Sold</th>
                        <th className="text-right py-2 font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topItems.map((item, i) => (
                        <tr key={item.name} className="border-b border-gray-100">
                          <td className="py-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold text-white ${i < 3 ? '' : 'bg-gray-300'}`}
                                style={i < 3 ? { backgroundColor: theme.primaryColor } : {}}
                              >
                                {i + 1}
                              </span>
                              <span className="truncate">{item.name}</span>
                            </div>
                          </td>
                          <td className="py-1.5 text-right">{item.quantity_sold}</td>
                          <td className="py-1.5 text-right font-semibold">{currencySymbol}{item.revenue.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Sales Over Time chart */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Sales Over Time</h3>
              {dailyRevenue.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">No revenue data in this period.</p>
              ) : (
                <div className="relative">
                  {/* Y-axis labels */}
                  <div className="flex mb-1">
                    <div className="w-12 flex-shrink-0" />
                    <div className="flex-1 flex justify-between text-[10px] text-gray-400">
                      <span>{currencySymbol}{Math.round(maxDailyRevenue)}</span>
                      <span>{currencySymbol}{Math.round(maxDailyRevenue / 2)}</span>
                      <span>{currencySymbol}0</span>
                    </div>
                  </div>
                  {/* Bars */}
                  <div className="flex items-end gap-1" style={{ height: '160px' }}>
                    <div className="w-12 flex-shrink-0 text-right text-[10px] text-gray-400 self-stretch flex flex-col justify-between pb-0.5">
                      <span>{maxDailyRevenue > 0 ? currencySymbol + Math.round(maxDailyRevenue) : ''}</span>
                      <span>{maxDailyRevenue > 0 ? currencySymbol + Math.round(maxDailyRevenue / 2) : ''}</span>
                      <span>{currencySymbol}0</span>
                    </div>
                    {dailyRevenue.map((day) => {
                      const pct = (day.revenue / maxDailyRevenue) * 100;
                      const dayLabel = day.date.split('-').slice(1).join('/');
                      return (
                        <div key={day.date} className="flex-1 flex flex-col items-center min-w-0">
                          <div className="flex-1 w-full flex items-end justify-center">
                            <div
                              className="w-full max-w-[40px] rounded-t transition-all"
                              style={{
                                height: `${Math.max(pct, 2)}%`,
                                backgroundColor: theme.primaryColor,
                                opacity: 0.7 + (pct / 100) * 0.3,
                              }}
                              title={`${day.date}: ${currencySymbol}${day.revenue.toFixed(2)}`}
                            />
                          </div>
                          <span className="text-[9px] text-gray-400 mt-1 truncate w-full text-center">
                            {barCount > 14 ? dayLabel.split('/')[1] : dayLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, format, currencySymbol, theme }: { label: string; value: number; format: 'number' | 'currency'; currencySymbol: string; theme: ThemeConfig }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color: theme.primaryColor }}>
        {format === 'currency' ? `${currencySymbol}${value.toFixed(2)}` : value}
      </div>
    </div>
  );
}
