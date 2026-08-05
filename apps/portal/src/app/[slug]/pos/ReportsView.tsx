'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePOS } from './pos-context';
import { useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { Button, EmptyState, Modal, Skeleton, SkeletonTable, StatusPill } from '@sat-sys/ui';
import { hasPermission } from './permissions';
import { useEvent } from './use-event';
import { useBusinessDate } from './business-date-context';
import { resolveEnabledModules } from '@/lib/module-registry';
import { DonutChart, BarChart, LineChart, Heatmap } from './reports-charts';
import {
  getOverviewData, getSalesData, getOrdersData, getItemsData,
  getInventoryData, getStaffData, getCustomersData, getPnLData,
} from './reports-actions';
import type {
  OverviewData, SalesData, OrdersData, ItemsData,
  InventoryData, StaffData, CustomerData, PnLData, DateRange, ReportFilters,
} from './reports-actions';

interface Props { slug: string; theme: ThemeConfig; currencySymbol: string }

type TabId = 'overview' | 'sales' | 'orders' | 'items' | 'inventory' | 'staff' | 'customers' | 'pnl';
const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'sales', label: 'Sales' },
  { id: 'orders', label: 'Orders' },
  { id: 'items', label: 'Items' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'staff', label: 'Staff' },
  { id: 'customers', label: 'Customers' },
  { id: 'pnl', label: 'Profit & Loss' },
];

// Which module gates each report subtab.
const TAB_MODULE: Record<TabId, string> = {
  overview: 'reports',
  sales: 'reports',
  orders: 'reports',
  items: 'reports',
  inventory: 'inventory',
  staff: 'staff',
  customers: 'customers',
  pnl: 'reports',
};

function pctChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '+100%' : '—';
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
}

function fmt(n: number, sym?: string): string {
  if (!sym) return n.toLocaleString();
  return `${sym}${n.toFixed(2)}`;
}

export default function ReportsView({ slug, theme, currencySymbol }: Props) {
  const { user, isLoaded } = useUser();
  const meta = user?.publicMetadata as Record<string, any> | undefined;
  const perms = (meta?.permissions ?? []) as string[];
  const role = (meta?.role ?? '') as string;
  const canView = hasPermission(perms, role, 'reports:view');
  const [tab, setTab] = useState<TabId>('overview');
  const [filters, setFilters] = useState<ReportFilters>({ includeCancelled: false, includeRefunded: false });
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(false);
  const bd = useBusinessDate();

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [sales, setSales] = useState<SalesData | null>(null);
  const [orders, setOrders] = useState<OrdersData | null>(null);
  const [items, setItems] = useState<ItemsData | null>(null);
  const [inventory, setInventory] = useState<InventoryData | null>(null);
  const [staff, setStaff] = useState<StaffData | null>(null);
  const [customers, setCustomers] = useState<CustomerData | null>(null);
  const [pnl, setPnl] = useState<PnLData | null>(null);

  const dr = useMemo<DateRange>(() => ({ start: bd.start, end: bd.end }), [bd.start, bd.end]);

  const fetchTab = useCallback(async (t: TabId) => {
    setLoading(true);
    try {
      switch (t) {
        case 'overview': setOverview(await getOverviewData(slug, dr, filters)); break;
        case 'sales': setSales(await getSalesData(slug, dr, filters)); break;
        case 'orders': setOrders(await getOrdersData(slug, dr, filters)); break;
        case 'items': setItems(await getItemsData(slug, dr)); break;
        case 'inventory': setInventory(await getInventoryData(slug)); break;
        case 'staff': setStaff(await getStaffData(slug, dr)); break;
        case 'customers': setCustomers(await getCustomersData(slug, dr)); break;
        case 'pnl': setPnl(await getPnLData(slug, dr)); break;
      }
    } catch (e) { console.error('Reports fetch error:', e); }
    setLoading(false);
  }, [slug, dr, filters]);

  const { setPageTitle, enabledModules } = usePOS();
  useEffect(() => { setPageTitle('Reports'); }, [setPageTitle]);

  // Hide subtabs whose gating module is disabled.
  const effModules = resolveEnabledModules(enabledModules);
  const visibleTabs = TABS.filter((t) => effModules[TAB_MODULE[t.id]] !== false);
  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === tab)) setTab(visibleTabs[0]?.id ?? 'overview');
  }, [visibleTabs, tab]);

  useEffect(() => {
    if (isLoaded && canView) fetchTab(tab);
  }, [isLoaded, canView, tab, fetchTab]);

  // Auto-refresh reports when related data changes
  useEvent('orders', () => { if (bd.isToday) fetchTab(tab); });
  useEvent('item_ledger', () => { if (bd.isToday) fetchTab(tab); });

  // Export CSV
  const handleExport = useCallback(() => {
    let csv = '';
    const s = dr;

    if (tab === 'overview' && overview) {
      csv = 'Metric,Value,Change\n' +
        `Total Sales,${overview.summary.totalSales},${pctChange(overview.summary.totalSales, overview.prevSummary.totalSales)}\n` +
        `Total Orders,${overview.summary.totalOrders},${pctChange(overview.summary.totalOrders, overview.prevSummary.totalOrders)}\n` +
        `Total Customers,${overview.summary.totalCustomers},—\n` +
        `Avg Order Value,${overview.summary.avgOrderValue},—\n` +
        `Gross Profit,${overview.summary.grossProfit},—\n`;
    } else if (tab === 'orders' && orders) {
      csv = 'Order#,Date,Customer,Type,Status,Payment Status,Payment Method,Total,Paid\n' +
        orders.orders.map((o) =>
          `${o.orderNumber},"${o.date}","${o.customer}",${o.orderType},${o.status},${o.paymentStatus},${o.paymentMethod},${o.total},${o.totalPaid}`
        ).join('\n');
    } else if (tab === 'sales' && sales) {
      csv = `Total Sales,Net Sales,Tax,Service Charge,Refunds\n${sales.totalSales},${sales.netSales},${sales.taxCollected},${sales.serviceCharge},${sales.refunds}\n`;
    } else if (tab === 'items' && items) {
      csv = 'Item,Category,Qty,Revenue\n' +
        items.topByQty.map((i) => `"${i.name}","${i.category}",${i.qty},${i.revenue}`).join('\n');
    } else if (tab === 'staff' && staff) {
      csv = 'Staff,Orders,Total,Avg\n' +
        staff.salesByCashier.map((s) => `"${s.name}",${s.orders},${s.total},${s.avg}`).join('\n');
    } else if (tab === 'customers' && customers) {
      csv = 'Name,Phone,Orders,Spent,Last Order,Points\n' +
        customers.topCustomers.map((c) => `"${c.name}","${c.phone}",${c.orders},${c.spent},"${c.lastOrder}",${c.points}`).join('\n');
    } else if (tab === 'pnl' && pnl) {
      csv = 'Item,Amount\n' +
        `Total Sales,${pnl.totalSales}\nDiscounts,${pnl.discounts}\nNet Sales,${pnl.netSales}\nTax,${pnl.taxCollected}\nService Charge,${pnl.serviceCharge}\nCOGS,${pnl.cogs}\nGross Profit,${pnl.grossProfit}\nExpenses,${pnl.expenses}\nNet Profit,${pnl.netProfit}\n`;
    } else if (tab === 'inventory' && inventory) {
      csv = 'Stock Value,Low Stock Items,Out of Stock\n' +
        `${inventory.stockValue},${inventory.lowStockItems.length},${inventory.outOfStockItems.length}\n`;
    }

    if (!csv) { csv = `Reports Export - ${tab}\nDate Range: ${s.start} to ${s.end}\n`; }

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `report-${tab}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }, [tab, overview, orders, sales, items, staff, customers, pnl, inventory, dr]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (!isLoaded) return <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6"><div className="max-w-7xl mx-auto"><Skeleton variant="card" /><div className="h-4" /><SkeletonTable rows={6} cols={5} /></div></div>;
  if (!canView) return <div className="flex-1 flex items-center justify-center bg-gray-50"><EmptyState variant="permission-denied" title="Reports" description="You do not have permission to view reports." /></div>;

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 print:bg-white">
      <div className="p-3 md:p-4 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-end gap-2 mb-3 print:hidden">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="px-2.5 py-1.5 rounded text-xs font-semibold bg-white border border-gray-300 text-gray-700">
              📅 {bd.isToday ? 'Today' : bd.display}
            </span>
            <button onClick={() => setShowFilters(true)} className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-gray-300 rounded hover:bg-gray-50">Filters</button>
            <button onClick={handleExport} className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-gray-300 rounded hover:bg-gray-50">Export</button>
            <button onClick={handlePrint} className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-gray-300 rounded hover:bg-gray-50">Print</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-hide print:hidden">
          {visibleTabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === t.id ? 'text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
              style={tab === t.id ? { backgroundColor: theme.primaryColor } : {}}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="py-8"><Skeleton variant="card" rows={4} /></div>}

        {!loading && tab === 'overview' && overview && <OverviewTab data={overview} currencySymbol={currencySymbol} theme={theme} />}
        {!loading && tab === 'sales' && sales && <SalesTab data={sales} currencySymbol={currencySymbol} />}
        {!loading && tab === 'orders' && orders && <OrdersTab data={orders} currencySymbol={currencySymbol} />}
        {!loading && tab === 'items' && items && <ItemsTab data={items} currencySymbol={currencySymbol} />}
        {!loading && tab === 'inventory' && inventory && <InventoryTab data={inventory} currencySymbol={currencySymbol} />}
        {!loading && tab === 'staff' && staff && <StaffTab data={staff} currencySymbol={currencySymbol} />}
        {!loading && tab === 'customers' && customers && <CustomersTab data={customers} currencySymbol={currencySymbol} />}
        {!loading && tab === 'pnl' && pnl && <PnLTab data={pnl} currencySymbol={currencySymbol} />}

        {!loading && !overview && !sales && !orders && !items && !inventory && !staff && !customers && !pnl && (
          <p className="text-gray-400 text-sm text-center py-12">Select a date range and tab to view reports.</p>
        )}

        <p className="text-[10px] text-gray-400 mt-6 text-center print:hidden">
          All reports are based on the selected date range and current branch/filter context.
        </p>
      </div>

      {/* Filter drawer */}
      <Modal open={showFilters} placement="bottom-sheet" size="md" title="Report Filters" onClose={() => setShowFilters(false)} footer={<div className="flex justify-end gap-2 w-full"><Button onClick={() => setShowFilters(false)}>Done</Button></div>}>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Include Cancelled Orders</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!filters.includeCancelled}
                    onChange={(e) => setFilters((f) => ({ ...f, includeCancelled: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600" />
                  <span className="text-sm text-gray-700">Show cancelled orders in totals</span>
                </label>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Include Refunded Orders</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!filters.includeRefunded}
                    onChange={(e) => setFilters((f) => ({ ...f, includeRefunded: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600" />
                  <span className="text-sm text-gray-700">Show refunded orders in totals</span>
                </label>
              </div>
              <button onClick={() => { setFilters({ includeCancelled: false, includeRefunded: false }); }} className="text-sm text-red-600 font-medium hover:underline">Reset Filters</button>
            </div>
      </Modal>
    </div>
  );
}

// ─── Card helper ───
function Card({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-3 md:p-4 ${className}`}>
      {title && <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h3>}
      {children}
    </div>
  );
}

function Stat({ label, value, change, fmt }: { label: string; value: string | number; change?: string; fmt?: string }) {
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-lg md:text-xl font-bold text-gray-800">{value}{fmt === 'pct' ? '%' : ''}</p>
      {change && <p className={`text-xs ${change.startsWith('+') ? 'text-green-600' : change === '—' ? 'text-gray-400' : 'text-red-600'}`}>{change}</p>}
    </div>
  );
}

// ─── Overview Tab ───
function OverviewTab({ data, currencySymbol, theme }: { data: OverviewData; currencySymbol: string; theme: ThemeConfig }) {
  const { summary, prevSummary, salesChart, orderTypeData, statusCounts, categoryData, paymentData, topItems, heatmapData } = data;
  const [granularity, setGranularity] = useState<'hourly' | 'daily' | 'weekly' | 'monthly'>('daily');
  const chartData = granularity === 'daily' ? salesChart : salesChart;
  const profitMargin = summary.totalSales > 0 ? (summary.grossProfit / summary.totalSales) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card><Stat label="Total Sales" value={fmt(summary.totalSales, currencySymbol)} change={pctChange(summary.totalSales, prevSummary.totalSales)} /></Card>
        <Card><Stat label="Total Orders" value={summary.totalOrders} change={pctChange(summary.totalOrders, prevSummary.totalOrders)} /></Card>
        <Card><Stat label="Total Customers" value={summary.totalCustomers} /></Card>
        <Card><Stat label="Avg Order Value" value={fmt(summary.avgOrderValue, currencySymbol)} /></Card>
        <Card><Stat label="Gross Profit" value={fmt(summary.grossProfit, currencySymbol)} /></Card>
      </div>

      {/* Sales chart */}
      <Card title="Sales Overview">
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-1">
            {(['daily', 'weekly', 'monthly'] as const).map((g) => (
              <button key={g} onClick={() => setGranularity(g)}
                className={`px-2 py-1 text-xs rounded ${granularity === g ? 'text-white' : 'bg-gray-100 text-gray-600'}`}
                style={granularity === g ? { backgroundColor: theme.primaryColor } : {}}>{g.charAt(0).toUpperCase() + g.slice(1)}</button>
            ))}
          </div>
        </div>
        <LineChart data={chartData.length > 0 ? chartData : [{ label: 'No data', value: 0 }]} color={theme.primaryColor} format={(v) => `${currencySymbol}${v.toFixed(0)}`} showDots={chartData.length <= 31} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-100">
          <Stat label="Total Sales" value={fmt(summary.totalSales, currencySymbol)} />
          <Stat label="Gross Profit" value={fmt(summary.grossProfit, currencySymbol)} />
          <Stat label="Profit Margin" value={profitMargin.toFixed(1)} fmt="pct" />
          <Stat label="Total Costs" value={fmt(summary.totalSales - summary.grossProfit, currencySymbol)} />
        </div>
      </Card>

      {/* Order Summary + Category + Payment Methods */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Order Summary">
          <DonutChart data={orderTypeData} total={orderTypeData.reduce((s, d) => s + d.count, 0)} centerSub="Orders" size={140} />
          <div className="space-y-1 mt-2">
            {orderTypeData.map((d) => (
              <div key={d.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-gray-600">{d.label}</span>
                </div>
                <span className="text-gray-800 font-medium">{d.count} ({orderTypeData.reduce((s, od) => s + od.value, 0) > 0 ? ((d.value / orderTypeData.reduce((s, od) => s + od.value, 0)) * 100).toFixed(1) : 0}%)</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
            {statusCounts.map((s) => (
              <span key={s.status} className="capitalize">{s.status}: {s.count}</span>
            ))}
          </div>
        </Card>

        <Card title="Sales by Category">
          <DonutChart data={categoryData} total={categoryData.reduce((s, d) => s + d.value, 0)} currencySymbol={currencySymbol} centerSub="Total" size={140} />
          <div className="space-y-1 mt-2 max-h-36 overflow-y-auto">
            {categoryData.slice(0, 6).map((d) => (
              <div key={d.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-gray-600 truncate max-w-[100px]">{d.label}</span>
                </div>
                <span className="text-gray-800 font-medium">{currencySymbol}{d.value.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Payment Methods">
          <DonutChart data={paymentData} total={paymentData.reduce((s, d) => s + d.value, 0)} currencySymbol={currencySymbol} centerSub="Total" size={140} />
          <div className="space-y-1 mt-2 max-h-36 overflow-y-auto">
            {paymentData.map((d) => {
              const totalPay = paymentData.reduce((s, pd) => s + pd.value, 0);
              return (
                <div key={d.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-gray-600">{d.label}</span>
                  </div>
                  <span className="text-gray-800 font-medium">{totalPay > 0 ? ((d.value / totalPay) * 100).toFixed(1) : 0}%</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-3 mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
            <span>Transactions: {paymentData.reduce((s, d) => s + d.count, 0)}</span>
            <span>Avg/Order: {currencySymbol}{(paymentData.reduce((s, d) => s + d.count, 0) > 0 ? paymentData.reduce((s, d) => s + d.value, 0) / paymentData.reduce((s, d) => s + d.count, 0) : 0).toFixed(2)}</span>
          </div>
        </Card>
      </div>

      {/* Top Selling Items */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Top Selling Items">
          {topItems.length === 0 ? <p className="text-gray-400 text-sm text-center py-4">No items sold</p> : (
            <div className="space-y-1">
              {topItems.slice(0, 5).map((item, i) => (
                <div key={item.name} className="flex items-center gap-2 text-xs">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-[10px]" style={{ backgroundColor: i < 3 ? 'var(--info)' : 'var(--input-placeholder)' }}>{i + 1}</span>
                  <span className="flex-1 truncate text-gray-700">{item.name}</span>
                  <span className="text-gray-500">{item.qty} sold</span>
                  <span className="font-medium text-gray-800 w-20 text-right">{currencySymbol}{item.revenue.toFixed(0)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Heatmap */}
        <Card title="Sales by Time">
          <Heatmap
            data={heatmapData}
            rows={['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']}
            cols={Array.from({ length: 12 }, (_, i) => String(i * 2))}
            getColor={(v, max) => {
              if (max === 0) return '#f3f4f6';
              const intensity = v / max;
              if (intensity === 0) return '#f3f4f6';
              if (intensity < 0.25) return '#dbeafe';
              if (intensity < 0.5) return '#93c5fd';
              if (intensity < 0.75) return '#60a5fa';
              return '#3b82f6';
            }}
            getValue={(v) => fmt(v, currencySymbol)}
            cellSize={28}
          />
          <div className="flex items-center justify-center gap-2 mt-2 text-[10px] text-gray-500">
            <span>Low</span>
            <div className="flex gap-0.5">
              {['#f3f4f6', '#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6'].map((c) => (
                <span key={c} className="w-3 h-3 rounded" style={{ backgroundColor: c }} />
              ))}
            </div>
            <span>High</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Sales Tab ───
function SalesTab({ data, currencySymbol }: { data: SalesData; currencySymbol: string }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><Stat label="Total Sales" value={fmt(data.totalSales, currencySymbol)} /></Card>
        <Card><Stat label="Net Sales" value={fmt(data.netSales, currencySymbol)} /></Card>
        <Card><Stat label="Tax Collected" value={fmt(data.taxCollected, currencySymbol)} /></Card>
        <Card><Stat label="Service Charge" value={fmt(data.serviceCharge, currencySymbol)} /></Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Sales by Day">
          <BarChart data={data.byDay.length > 0 ? data.byDay : [{ label: 'No data', value: 0 }]} height={160} format={(v) => fmt(v, currencySymbol)} />
        </Card>
        <Card title="Sales by Hour">
          <BarChart data={data.byHour.length > 0 ? data.byHour : [{ label: 'No data', value: 0 }]} height={160} format={(v) => fmt(v, currencySymbol)} barColor="var(--chart-2)" />
        </Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Sales by Payment Method">
          {data.byPaymentMethod.map((d) => {
            const total = data.byPaymentMethod.reduce((s, pm) => s + pm.value, 0);
            return (
              <div key={d.label} className="flex items-center gap-2 text-xs py-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="w-24 text-gray-600">{d.label}</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${total > 0 ? (d.value / total) * 100 : 0}%`, backgroundColor: d.color }} />
                </div>
                <span className="w-20 text-right font-medium text-gray-800">{currencySymbol}{d.value.toFixed(0)}</span>
              </div>
            );
          })}
        </Card>
        <Card title="Sales by Order Type">
          {data.byOrderType.map((d) => {
            const total = data.byOrderType.reduce((s, ot) => s + ot.value, 0);
            return (
              <div key={d.label} className="flex items-center gap-2 text-xs py-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="w-24 text-gray-600">{d.label}</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${total > 0 ? (d.value / total) * 100 : 0}%`, backgroundColor: d.color }} />
                </div>
                <span className="w-20 text-right font-medium text-gray-800">{currencySymbol}{d.value.toFixed(0)}</span>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}

// ─── Orders Tab ───
function OrdersTab({ data, currencySymbol }: { data: OrdersData; currencySymbol: string }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><Stat label="Total Orders" value={data.total} /></Card>
        <Card><Stat label="Completed" value={data.completed} /></Card>
        <Card><Stat label="Cancelled" value={data.cancelled} /></Card>
        <Card><Stat label="Refunded" value={data.refunded} /></Card>
        <Card><Stat label="Avg Order Value" value={fmt(data.avgOrderValue, currencySymbol)} /></Card>
      </div>
      <Card title="Order List">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b"><th className="text-left py-2 font-medium">Order#</th><th className="text-left py-2 font-medium">Date</th><th className="text-left py-2 font-medium">Customer</th><th className="text-left py-2 font-medium">Type</th><th className="text-left py-2 font-medium">Status</th><th className="text-left py-2 font-medium">Payment</th><th className="text-right py-2 font-medium">Total</th></tr></thead>
            <tbody>
              {data.orders.slice(0, 100).map((o) => (
                <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-1.5 font-medium">#{o.orderNumber}</td>
                  <td className="py-1.5 text-gray-500">{o.date}</td>
                  <td className="py-1.5">{o.customer}</td>
                  <td className="py-1.5 capitalize">{o.orderType.replace('_', ' ')}</td>
                  <td className="py-1.5"><StatusPill status={o.status} size="sm" /></td>
                  <td className="py-1.5 text-gray-500">{o.paymentMethod}</td>
                  <td className="py-1.5 text-right font-medium">{currencySymbol}{o.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Items Tab ───
function ItemsTab({ data, currencySymbol }: { data: ItemsData; currencySymbol: string }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Top Selling Items (By Quantity)">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b"><th className="text-left py-1.5 font-medium">Item</th><th className="text-left py-1.5 font-medium">Category</th><th className="text-right py-1.5 font-medium">Qty</th><th className="text-right py-1.5 font-medium">Revenue</th></tr></thead>
            <tbody>
              {data.topByQty.map((i, idx) => (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="py-1 font-medium">{i.name}</td>
                  <td className="py-1 text-gray-500">{i.category}</td>
                  <td className="py-1 text-right">{i.qty}</td>
                  <td className="py-1 text-right">{currencySymbol}{i.revenue.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Category Performance">
          {data.categorySummary.map((c) => {
            const total = data.categorySummary.reduce((s, cs) => s + cs.value, 0);
            return (
              <div key={c.label} className="flex items-center gap-2 text-xs py-0.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                <span className="w-28 truncate text-gray-600">{c.label}</span>
                <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${total > 0 ? (c.value / total) * 100 : 0}%`, backgroundColor: c.color }} />
                </div>
                <span className="w-20 text-right font-medium">{currencySymbol}{c.value.toFixed(0)}</span>
                <span className="w-12 text-right text-gray-500">{total > 0 ? ((c.value / total) * 100).toFixed(1) : 0}%</span>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}

// ─── Inventory Tab ───
function InventoryTab({ data, currencySymbol }: { data: InventoryData; currencySymbol: string }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><Stat label="Stock Value" value={fmt(data.stockValue, currencySymbol)} /></Card>
        <Card><Stat label="Low Stock Items" value={data.lowStockItems.length} /></Card>
        <Card><Stat label="Out of Stock" value={data.outOfStockItems.length} /></Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Low Stock Items">
          {data.lowStockItems.length === 0 ? <p className="text-gray-400 text-sm text-center py-4">All items adequately stocked</p> : (
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b"><th className="text-left py-1.5 font-medium">Item</th><th className="text-right py-1.5 font-medium">Stock</th><th className="text-right py-1.5 font-medium">Threshold</th></tr></thead>
              <tbody>
                {data.lowStockItems.map((i: any) => (
                  <tr key={i.id} className="border-b border-gray-100">
                    <td className="py-1 font-medium">{i.name}</td>
                    <td className="py-1 text-right text-yellow-600 font-medium">{i.current_stock}</td>
                    <td className="py-1 text-right text-gray-500">{i.low_stock_threshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Inventory Consumption">
          {data.consumption.length === 0 ? <p className="text-gray-400 text-sm text-center py-4">No consumption data</p> : (
            <div className="space-y-1">
              {data.consumption.slice(0, 15).map((c) => (
                <div key={c.name} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 truncate flex-1">{c.name}</span>
                  <span className="font-medium">{c.used}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Staff Tab ───
function StaffTab({ data, currencySymbol }: { data: StaffData; currencySymbol: string }) {
  return (
    <Card title="Sales by Cashier">
      {data.salesByCashier.length === 0 ? <p className="text-gray-400 text-sm text-center py-4">No staff sales data</p> : (
        <table className="w-full text-xs">
          <thead><tr className="text-gray-500 border-b"><th className="text-left py-1.5 font-medium">Staff</th><th className="text-right py-1.5 font-medium">Orders</th><th className="text-right py-1.5 font-medium">Total Sales</th><th className="text-right py-1.5 font-medium">Avg/Order</th></tr></thead>
          <tbody>
            {data.salesByCashier.map((s) => (
              <tr key={s.name} className="border-b border-gray-100">
                <td className="py-1 font-medium">{s.name}</td>
                <td className="py-1 text-right">{s.orders}</td>
                <td className="py-1 text-right">{currencySymbol}{s.total.toFixed(2)}</td>
                <td className="py-1 text-right">{currencySymbol}{s.avg.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

// ─── Customers Tab ───
function CustomersTab({ data, currencySymbol }: { data: CustomerData; currencySymbol: string }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><Stat label="Active Customers" value={data.totalActive} /></Card>
        <Card><Stat label="New Customers" value={data.newCustomers} /></Card>
        <Card><Stat label="Customer Sales" value={fmt(data.customerSales, currencySymbol)} /></Card>
      </div>
      <Card title="Top Customers">
        {data.topCustomers.length === 0 ? <p className="text-gray-400 text-sm text-center py-4">No customer data</p> : (
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b"><th className="text-left py-1.5 font-medium">Customer</th><th className="text-left py-1.5 font-medium">Phone</th><th className="text-right py-1.5 font-medium">Orders</th><th className="text-right py-1.5 font-medium">Total Spent</th><th className="text-right py-1.5 font-medium">Last Order</th><th className="text-right py-1.5 font-medium">Points</th></tr></thead>
            <tbody>
              {data.topCustomers.map((c, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1 font-medium">{c.name}</td>
                  <td className="py-1 text-gray-500">{c.phone}</td>
                  <td className="py-1 text-right">{c.orders}</td>
                  <td className="py-1 text-right">{currencySymbol}{c.spent.toFixed(2)}</td>
                  <td className="py-1 text-right text-gray-500">{c.lastOrder ? new Date(c.lastOrder).toLocaleDateString() : '-'}</td>
                  <td className="py-1 text-right">{c.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ─── Profit & Loss Tab ───
function PnLTab({ data, currencySymbol }: { data: PnLData; currencySymbol: string }) {
  const profitMargin = data.totalSales > 0 ? (data.grossProfit / data.totalSales) * 100 : 0;
  const netMargin = data.totalSales > 0 ? (data.netProfit / data.totalSales) * 100 : 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <Card title="Profit & Loss Statement">
        <div className="space-y-2 text-sm">
          <Row label="Total Sales" value={data.totalSales} currencySymbol={currencySymbol} />
          <Row label="Discounts" value={-data.discounts} currencySymbol={currencySymbol} />
          <Row label="Net Sales" value={data.netSales} currencySymbol={currencySymbol} bold />
          <div className="border-t border-gray-200 my-1" />
          <Row label="Tax Collected" value={data.taxCollected} currencySymbol={currencySymbol} />
          <Row label="Service Charge" value={data.serviceCharge} currencySymbol={currencySymbol} />
          <Row label="COGS (Ingredients)" value={-data.cogs} currencySymbol={currencySymbol} />
          <div className="border-t border-gray-200 my-1" />
          <Row label="Gross Profit" value={data.grossProfit} currencySymbol={currencySymbol} bold />
          <Row label="Profit Margin" value={profitMargin} suffix="%" />
          <div className="border-t border-gray-200 my-1" />
          <Row label="Operating Expenses" value={-data.expenses} currencySymbol={currencySymbol} />
          {data.expenseBreakdown.map((e) => (
            <Row key={e.category} label={`  ${e.category.charAt(0).toUpperCase() + e.category.slice(1)}`} value={-e.amount} currencySymbol={currencySymbol} indent />
          ))}
          <div className="border-t-2 border-gray-300 my-1" />
          <Row label="Net Profit / Loss" value={data.netProfit} currencySymbol={currencySymbol} bold large />
          <Row label="Net Margin" value={netMargin} suffix="%" />
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, currencySymbol, suffix, bold, large, indent }: { label: string; value: number; currencySymbol?: string; suffix?: string; bold?: boolean; large?: boolean; indent?: boolean }) {
  const isNegative = value < 0;
  return (
    <div className={`flex items-center justify-between ${indent ? 'pl-4' : ''}`}>
      <span className={`text-gray-600 ${bold ? 'font-semibold text-gray-800' : ''} ${large ? 'text-base' : 'text-sm'}`}>{label}</span>
      <span className={`font-medium ${large ? 'text-base' : 'text-sm'} ${isNegative ? 'text-red-600' : value === 0 ? 'text-gray-400' : 'text-gray-800'}`}>
        {currencySymbol}{Math.abs(value).toFixed(2)}{suffix || ''}
      </span>
    </div>
  );
}
