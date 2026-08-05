'use server';

import { supa, supaBatch } from './supa-query';

function fmt(v: number): string { return v.toFixed(2); }

export interface DateRange { start: string; end: string }
export interface ReportFilters {
  orderType?: string; paymentMethod?: string; status?: string;
  includeCancelled?: boolean; includeRefunded?: boolean;
  category?: string; itemId?: string;
}

export interface OverviewData {
  summary: { totalSales: number; totalOrders: number; totalCustomers: number; avgOrderValue: number; grossProfit: number };
  prevSummary: { totalSales: number; totalOrders: number };
  salesChart: { label: string; value: number }[];
  orderTypeData: { label: string; value: number; count: number; color: string }[];
  statusCounts: { status: string; count: number }[];
  categoryData: { label: string; value: number; color: string }[];
  paymentData: { label: string; value: number; color: string; count: number }[];
  topItems: { name: string; qty: number; revenue: number }[];
  heatmapData: { row: string; col: string; value: number }[];
}

export interface SalesData {
  totalSales: number; netSales: number; taxCollected: number; serviceCharge: number;
  discounts: number; refunds: number;
  byHour: { label: string; value: number }[];
  byDay: { label: string; value: number }[];
  byWeek: { label: string; value: number }[];
  byMonth: { label: string; value: number }[];
  byPaymentMethod: { label: string; value: number; color: string }[];
  byOrderType: { label: string; value: number; color: string }[];
}

export interface OrdersData {
  total: number; completed: number; cancelled: number; refunded: number;
  avgOrderValue: number; orders: OrderRow[];
}

export interface OrderRow {
  id: string; orderNumber: number; date: string; customer: string;
  orderType: string; status: string; paymentStatus: string;
  paymentMethod: string; total: number; totalPaid: number;
}

export interface ItemsData {
  topByQty: { name: string; category: string; qty: number; revenue: number; avgPrice: number; lastSold: string }[];
  topByRevenue: { name: string; qty: number; revenue: number }[];
  categorySummary: { label: string; value: number; color: string }[];
}

export interface InventoryData {
  stockValue: number; lowStockItems: any[]; outOfStockItems: any[];
  consumption: { name: string; used: number }[];
  itemLedger: any[];
}

export interface StaffData {
  salesByCashier: { name: string; orders: number; total: number; avg: number }[];
}

export interface CustomerData {
  totalActive: number; newCustomers: number; customerSales: number;
  topCustomers: { name: string; phone: string; orders: number; spent: number; lastOrder: string; points: number }[];
}

export interface PnLData {
  totalSales: number; discounts: number; netSales: number; taxCollected: number;
  serviceCharge: number; cogs: number; grossProfit: number;
  expenses: number; netProfit: number;
  expenseBreakdown: { category: string; amount: number }[];
}

export interface WastageReportData {
  summary: { totalQty: number; totalAmount: number; entries: number };
  byItem: { name: string; unit: string; qty: number; amount: number }[];
  byCategory: { label: string; qty: number; amount: number; color: string }[];
  byReason: { label: string; qty: number; amount: number; color: string }[];
  byEmployee: { name: string; qty: number; amount: number }[];
  byDate: { label: string; value: number }[];
  topItems: { name: string; qty: number; amount: number }[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];
const ORDER_COLORS: Record<string, string> = { dine_in: '#3b82f6', takeaway: '#10b981', delivery: '#f59e0b', drive_thru: '#8b5cf6', third_party: '#ec4899' };
const PAYMENT_COLORS: Record<string, string> = {
  cash: '#10b981', jazzcash: '#8b5cf6', easypaisa: '#ec4899',
  bank_transfer: '#3b82f6', card: '#f59e0b', credit: '#ef4444', split: '#14b8a6', other: '#6b7280',
};

async function fetchOrders(slug: string, start: string, end: string, filters?: ReportFilters) {
  const opts: any = {
    table: 'orders', select: 'id, order_number, status, order_type, total, payment_status, primary_payment_method, amount_paid, customer_name, customer_id, created_at, tax_amount',
    gte: ['created_at', start], lte: ['created_at', end],
    order: 'created_at',
    limit: 10000,
  };
  if (!filters?.includeCancelled) opts.neq = ['status', 'cancelled'];
  return supa(slug, opts);
}

export async function getOverviewData(slug: string, dr: DateRange, filters?: ReportFilters): Promise<OverviewData> {
  const { start, end } = dr;
  const prevEnd = start;
  const dur = new Date(end).getTime() - new Date(start).getTime();
  const prevStart = new Date(new Date(start).getTime() - dur).toISOString();

  const [res, paymentsRes, prevRes, menuRes] = await Promise.all([
    fetchOrders(slug, start, end, filters),
    supa(slug, { table: 'payments', select: 'payment_method, amount, order_id, created_at', gte: ['created_at', start], lte: ['created_at', end], limit: 20000 }),
    supa(slug, { table: 'orders', select: 'total', gte: ['created_at', prevStart], lte: ['created_at', prevEnd], eq: ['status', 'completed'] }),
    supa(slug, { table: 'menu_items', select: 'id, name, category', limit: 5000 }),
  ]);

  const orderTypes: Record<string, string> = { dine_in: 'Dine In', takeaway: 'Take Away', delivery: 'Delivery', drive_thru: 'Drive Thru', third_party: 'Third Party' };

  // Summary
  const orders = res.ok && res.data ? res.data.filter((o: any) => o.status === 'completed') : [];
  const totalSales = orders.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

  // Distinct customers
  const customerIds = new Set(orders.map((o: any) => o.customer_id).filter(Boolean));
  const totalCustomers = customerIds.size;

  // Gross Profit (COGS from menu_item_ingredients * latest item_ledger unit_cost)
  const cogs = await calcCOGS(slug, start, end);
  const grossProfit = totalSales - cogs;

  // Previous period comparison
  const prevOrders = prevRes.ok && prevRes.data ? prevRes.data.filter((o: any) => o.status === 'completed') : [];
  const prevTotalSales = prevOrders.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
  const prevTotalOrders = prevOrders.length;

  // Sales chart (daily)
  const salesChartMap = new Map<string, number>();
  for (const o of orders) {
    const d = (o.created_at || '').split('T')[0];
    salesChartMap.set(d, (salesChartMap.get(d) || 0) + Number(o.total || 0));
  }
  const salesChart = Array.from(salesChartMap.entries())
    .map(([label, value]) => ({ label: label.slice(5), value }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Order type breakdown
  const typeMap = new Map<string, { value: number; count: number }>();
  for (const o of orders) {
    const t = o.order_type || 'unknown';
    const prev = typeMap.get(t) || { value: 0, count: 0 };
    prev.value += Number(o.total || 0);
    prev.count += 1;
    typeMap.set(t, prev);
  }
  const orderTypeData = Array.from(typeMap.entries()).map(([key, v]) => ({
    label: orderTypes[key] || key, value: v.value, count: v.count,
    color: ORDER_COLORS[key] || COLORS[COLORS.length - 1],
  }));

  // Status counts (from all orders in range, not just completed)
  const statusCounts: Record<string, number> = {};
  if (res.ok && res.data) {
    for (const o of res.data) {
      const s = o.status || 'unknown';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }
  }

  // Category sales
  const catMap = new Map<string, number>();
  const itemCatMap = new Map<string, string>();
  if (menuRes.ok && menuRes.data) {
    for (const m of menuRes.data) {
      itemCatMap.set(m.id, m.category || 'Uncategorized');
    }
  }
  const orderItemsRes = await supa(slug, {
    table: 'order_items', select: 'menu_item_id, quantity, price_at_order, orders!inner(status, created_at)',
    filter: { 'orders.status': 'completed' },
    gte: ['orders.created_at', start], lte: ['orders.created_at', end],
    limit: 20000,
  });
  if (orderItemsRes.ok && orderItemsRes.data) {
    for (const oi of orderItemsRes.data) {
      const cat = itemCatMap.get(oi.menu_item_id) || 'Uncategorized';
      catMap.set(cat, (catMap.get(cat) || 0) + Number(oi.price_at_order || 0) * Number(oi.quantity || 0));
    }
  }
  const catTotal = Array.from(catMap.values()).reduce((s, v) => s + v, 0);
  const categoryData = Array.from(catMap.entries())
    .map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length] }))
    .sort((a, b) => b.value - a.value);

  // Payment methods
  const payMap = new Map<string, { value: number; count: number }>();
  if (paymentsRes.ok && paymentsRes.data) {
    for (const p of paymentsRes.data) {
      if (p.status === 'refunded') continue;
      const pm = p.payment_method || 'other';
      const labels: Record<string, string> = {
        cash: 'Cash', jazzcash: 'JazzCash', easypaisa: 'Easypaisa',
        bank_transfer: 'Bank Transfer', card: 'Card', credit: 'Credit', split: 'Split', other: 'Other',
      };
      const prev = payMap.get(pm) || { value: 0, count: 0 };
      prev.value += Number(p.amount || 0);
      prev.count += 1;
      payMap.set(pm, prev);
    }
  }
  const paymentData = Array.from(payMap.entries()).map(([key, v]) => ({
    label: ({ cash: 'Cash', jazzcash: 'JazzCash', easypaisa: 'Easypaisa', bank_transfer: 'Bank Transfer', card: 'Card', credit: 'Credit', split: 'Split', other: 'Other' })[key] || key,
    value: v.value, count: v.count,
    color: PAYMENT_COLORS[key] || '#6b7280',
  })).sort((a, b) => b.value - a.value);

  // Top items
  const itemMap = new Map<string, { qty: number; revenue: number }>();
  if (orderItemsRes.ok && orderItemsRes.data) {
    for (const oi of orderItemsRes.data) {
      const name = itemCatMap.get(oi.menu_item_id) || 'Unknown';
      const prev = itemMap.get(name) || { qty: 0, revenue: 0 };
      prev.qty += Number(oi.quantity || 0);
      prev.revenue += Number(oi.price_at_order || 0) * Number(oi.quantity || 0);
      itemMap.set(name, prev);
    }
  }
  const topItems = Array.from(itemMap.entries())
    .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Heatmap (day x hour)
  const hourMap = new Map<string, number>();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (res.ok && res.data) {
    for (const o of res.data) {
      if (o.status !== 'completed') continue;
      const d = new Date(o.created_at);
      const day = dayNames[d.getDay()];
      const hour = d.getHours();
      const key = `${day}|${hour}`;
      hourMap.set(key, (hourMap.get(key) || 0) + Number(o.total || 0));
    }
  }
  const heatmapRows = dayNames;
  const heatmapCols = Array.from({ length: 12 }, (_, i) => `${i * 2}`);
  const heatmapData = heatmapRows.flatMap(row =>
    heatmapCols.map(col => ({ row, col, value: hourMap.get(`${row}|${col}`) || 0 }))
  );

  return {
    summary: { totalSales, totalOrders, totalCustomers, avgOrderValue, grossProfit },
    prevSummary: { totalSales: prevTotalSales, totalOrders: prevTotalOrders },
    salesChart,
    orderTypeData,
    statusCounts: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
    categoryData,
    paymentData,
    topItems,
    heatmapData,
  };
}

export async function getSalesData(slug: string, dr: DateRange, filters?: ReportFilters): Promise<SalesData> {
  const { start, end } = dr;
  const res = await fetchOrders(slug, start, end, filters);
  const orders = res.ok && res.data ? res.data.filter((o: any) => o.status === 'completed') : [];
  const allOrders = res.ok && res.data ? res.data : [];

  const totalSales = orders.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
  const netSales = totalSales;
  const taxCollected = orders.reduce((s: number, o: any) => s + Number(o.tax_amount || 0), 0);
  const serviceCharge = 0; // service_charge_amount column not confirmed
  const refunds = allOrders.filter((o: any) => o.status === 'cancelled' || o.payment_status === 'refunded')
    .reduce((s: number, o: any) => s + Number(o.total || 0), 0);

  // By hour
  const hourMap = new Array(24).fill(0);
  for (const o of orders) {
    const h = new Date(o.created_at).getHours();
    hourMap[h] += Number(o.total || 0);
  }
  const byHour = hourMap.map((v, i) => ({ label: `${i}:00`, value: v }));

  // By day
  const dayMap = new Map<string, number>();
  for (const o of orders) {
    const d = (o.created_at || '').split('T')[0];
    dayMap.set(d, (dayMap.get(d) || 0) + Number(o.total || 0));
  }
  const byDay = Array.from(dayMap.entries()).map(([label, value]) => ({ label: label.slice(5), value })).sort((a, b) => a.label.localeCompare(b.label));

  // By month
  const monthMap = new Map<string, number>();
  for (const o of orders) {
    const m = (o.created_at || '').slice(0, 7);
    monthMap.set(m, (monthMap.get(m) || 0) + Number(o.total || 0));
  }
  const byMonth = Array.from(monthMap.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));

  // By payment method
  const pmMap = new Map<string, number>();
  for (const o of orders) {
    const pm = o.primary_payment_method || 'other';
    pmMap.set(pm, (pmMap.get(pm) || 0) + Number(o.total || 0));
  }
  const pmLabels: Record<string, string> = { cash: 'Cash', jazzcash: 'JazzCash', easypaisa: 'Easypaisa', bank_transfer: 'Bank Transfer', card: 'Card', credit: 'Credit', split: 'Split', other: 'Other' };
  const byPaymentMethod = Array.from(pmMap.entries()).map(([key, value]) => ({
    label: pmLabels[key] || key, value, color: PAYMENT_COLORS[key] || '#6b7280',
  }));

  // By order type
  const otMap = new Map<string, number>();
  const otLabels: Record<string, string> = { dine_in: 'Dine In', takeaway: 'Take Away', delivery: 'Delivery', drive_thru: 'Drive Thru', third_party: 'Third Party' };
  for (const o of orders) {
    const t = o.order_type || 'unknown';
    otMap.set(t, (otMap.get(t) || 0) + Number(o.total || 0));
  }
  const byOrderType = Array.from(otMap.entries()).map(([key, value]) => ({
    label: otLabels[key] || key, value, color: ORDER_COLORS[key] || '#6b7280',
  }));

  return { totalSales, netSales, taxCollected, serviceCharge, discounts: 0, refunds, byHour, byDay, byWeek: [], byMonth, byPaymentMethod, byOrderType };
}

export async function getOrdersData(slug: string, dr: DateRange, filters?: ReportFilters): Promise<OrdersData> {
  const { start, end } = dr;
  const res = await fetchOrders(slug, start, end, { ...filters, includeCancelled: true, includeRefunded: true });
  const allOrders = res.ok && res.data ? res.data : [];
  const completed = allOrders.filter((o: any) => o.status === 'completed');
  const cancelled = allOrders.filter((o: any) => o.status === 'cancelled');
  const refunded = allOrders.filter((o: any) => o.payment_status === 'refunded');

  const totalSales = completed.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
  const avgOrderValue = completed.length > 0 ? totalSales / completed.length : 0;

  const orders: OrderRow[] = allOrders
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 500)
    .map((o: any) => ({
      id: o.id, orderNumber: o.order_number || 0,
      date: o.created_at ? new Date(o.created_at).toLocaleString() : '',
      customer: o.customer_name || (o.customer_id ? 'Walk-in' : 'Walk-in'),
      orderType: o.order_type || 'dine_in',
      status: o.status, paymentStatus: o.payment_status || 'unpaid',
      paymentMethod: o.primary_payment_method || '-', total: Number(o.total || 0),
      totalPaid: Number(o.amount_paid || 0),
    }));

  return { total: allOrders.length, completed: completed.length, cancelled: cancelled.length, refunded: refunded.length, avgOrderValue, orders };
}

export async function getItemsData(slug: string, dr: DateRange): Promise<ItemsData> {
  const { start, end } = dr;
  const [menuRes, oiRes] = await Promise.all([
    supa(slug, { table: 'menu_items', select: 'id, name, category', limit: 5000 }),
    supa(slug, {
      table: 'order_items', select: 'menu_item_id, quantity, price_at_order, orders!inner(status, created_at)',
      filter: { 'orders.status': 'completed' },
      gte: ['orders.created_at', start], lte: ['orders.created_at', end],
      limit: 20000,
    }),
  ]);

  const itemMap = new Map<string, { name: string; cat: string; qty: number; rev: number; last: string }>();
  const itemCat = new Map<string, string>();
  if (menuRes.ok && menuRes.data) {
    for (const m of menuRes.data) {
      itemCat.set(m.id, m.category || 'Uncategorized');
      itemMap.set(m.id, { name: m.name, cat: m.category || 'Uncategorized', qty: 0, rev: 0, last: '' });
    }
  }

  if (oiRes.ok && oiRes.data) {
    for (const oi of oiRes.data) {
      const id = oi.menu_item_id;
      const prev = itemMap.get(id) || { name: 'Unknown', cat: 'Uncategorized', qty: 0, rev: 0, last: '' };
      prev.qty += Number(oi.quantity || 0);
      prev.rev += Number(oi.price_at_order || 0) * Number(oi.quantity || 0);
      itemMap.set(id, prev);
    }
  }

  const all = Array.from(itemMap.values());
  const topByQty = all.filter(i => i.qty > 0).sort((a, b) => b.qty - a.qty).slice(0, 20).map(i => ({
    name: i.name, category: i.cat, qty: i.qty, revenue: i.rev,
    avgPrice: i.qty > 0 ? i.rev / i.qty : 0, lastSold: i.last,
  }));
  const topByRevenue = all.filter(i => i.rev > 0).sort((a, b) => b.rev - a.rev).slice(0, 20).map(i => ({
    name: i.name, qty: i.qty, revenue: i.rev,
  }));

  const catMap = new Map<string, number>();
  for (const i of all) {
    catMap.set(i.cat, (catMap.get(i.cat) || 0) + i.rev);
  }
  const catTotal = Array.from(catMap.values()).reduce((s, v) => s + v, 0);
  const categorySummary = Array.from(catMap.entries())
    .map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length] }))
    .sort((a, b) => b.value - a.value);

  return { topByQty, topByRevenue, categorySummary };
}

export async function getInventoryData(slug: string): Promise<InventoryData> {
  const [invRes, ledRes] = await Promise.all([
    supa(slug, { table: 'inventory_items', select: 'id, name, current_stock, unit, low_stock_threshold', limit: 5000 }),
    supa(slug, { table: 'item_ledger', select: 'inventory_item_id, movement_type, quantity_change, total_cost, created_at', limit: 20000, order: 'created_at' }),
  ]);

  const items = invRes.ok && invRes.data ? invRes.data : [];
  const ledger = ledRes.ok && ledRes.data ? ledRes.data : [];

  // Latest cost per item
  const costMap = new Map<string, number>();
  for (const l of ledger) {
    if (l.movement_type === 'purchase' && l.total_cost) {
      costMap.set(l.inventory_item_id, Number(l.total_cost) / Math.abs(Number(l.quantity_change || 1)));
    }
  }

  const stockValue = items.reduce((s: number, i: any) => {
    const cost = costMap.get(i.id) || 0;
    return s + Number(i.current_stock || 0) * cost;
  }, 0);

  const lowStockItems = items.filter((i: any) => Number(i.current_stock) > 0 && Number(i.current_stock) <= Number(i.low_stock_threshold));
  const outOfStockItems = items.filter((i: any) => Number(i.current_stock) <= 0);

  // Consumption (sales)
  const consumptionMap = new Map<string, number>();
  for (const l of ledger) {
    if (l.movement_type === 'sale') {
      const id = l.inventory_item_id;
      consumptionMap.set(id, (consumptionMap.get(id) || 0) + Math.abs(Number(l.quantity_change || 0)));
    }
  }
  const itemNameMap = new Map<string, string>(items.map((i: any) => [i.id, String(i.name || i.id)]));
  const consumption = Array.from(consumptionMap.entries()).map(([id, used]) => ({
    name: itemNameMap.get(id) || id, used,
  })).sort((a, b) => b.used - a.used).slice(0, 20);

  return { stockValue, lowStockItems, outOfStockItems, consumption, itemLedger: ledger };
}

export async function getStaffData(slug: string, dr: DateRange): Promise<StaffData> {
  const { start, end } = dr;
  const res = await supa(slug, {
    table: 'orders', select: 'total, created_by, created_at',
    eq: ['status', 'completed'], gte: ['created_at', start], lte: ['created_at', end],
    limit: 10000,
  });

  const staffMap = new Map<string, { orders: number; total: number }>();
  if (res.ok && res.data) {
    for (const o of res.data) {
      const uid = o.created_by || 'unknown';
      const prev = staffMap.get(uid) || { orders: 0, total: 0 };
      prev.orders += 1;
      prev.total += Number(o.total || 0);
      staffMap.set(uid, prev);
    }
  }

  const salesByCashier = Array.from(staffMap.entries())
    .map(([id, v]) => ({ name: id, orders: v.orders, total: v.total, avg: v.orders > 0 ? v.total / v.orders : 0 }))
    .sort((a, b) => b.total - a.total);

  return { salesByCashier };
}

export async function getCustomersData(slug: string, dr: DateRange): Promise<CustomerData> {
  const { start, end } = dr;
  const prevStart = new Date(new Date(start).getTime() - (new Date(end).getTime() - new Date(start).getTime())).toISOString();

  const [custRes, ordersRes] = await Promise.all([
    supa(slug, { table: 'customers', select: 'id, name, phone, total_orders, total_spent, loyalty_points, last_order_date, created_at', limit: 5000 }),
    supa(slug, {
      table: 'orders', select: 'customer_id, total, created_at',
      eq: ['status', 'completed'], notNull: ['customer_id'],
      gte: ['created_at', start], lte: ['created_at', end],
      limit: 10000,
    }),
  ]);

  const totalActive = custRes.ok && custRes.data ? custRes.data.filter((c: any) => c.status !== 'inactive').length : 0;
  const newCustomers = custRes.ok && custRes.data
    ? custRes.data.filter((c: any) => c.created_at && c.created_at >= start && c.created_at <= end).length
    : 0;

  const customerSalesMap = new Map<string, number>();
  let totalCustSales = 0;
  if (ordersRes.ok && ordersRes.data) {
    for (const o of ordersRes.data) {
      if (o.customer_id) {
        customerSalesMap.set(o.customer_id, (customerSalesMap.get(o.customer_id) || 0) + Number(o.total || 0));
        totalCustSales += Number(o.total || 0);
      }
    }
  }

  const customers = custRes.ok && custRes.data ? custRes.data : [];
  const topCustomers = customers
    .filter((c: any) => customerSalesMap.has(c.id))
    .map((c: any) => ({
      name: c.name, phone: c.phone || '', orders: Number(c.total_orders || 0),
      spent: Number(c.total_spent || 0), lastOrder: c.last_order_date || '',
      points: Number(c.loyalty_points || 0),
    }))
    .sort((a: any, b: any) => b.spent - a.spent)
    .slice(0, 10);

  return { totalActive, newCustomers, customerSales: totalCustSales, topCustomers };
}

export async function getPnLData(slug: string, dr: DateRange): Promise<PnLData> {
  const { start, end } = dr;
  const [ordersRes, expRes, oiRes] = await Promise.all([
    supa(slug, {
      table: 'orders', select: 'total, tax_amount, status',
      gte: ['created_at', start], lte: ['created_at', end], limit: 10000,
    }),
    supa(slug, { table: 'expenses', select: 'amount, category', gte: ['created_at', start], lte: ['created_at', end], limit: 5000 }),
    supa(slug, {
      table: 'order_items', select: 'price_at_order, quantity, menu_items!inner(id), orders!inner(status, created_at)',
      filter: { 'orders.status': 'completed' },
      gte: ['orders.created_at', start], lte: ['orders.created_at', end], limit: 20000,
    }),
  ]);

  const completedOrders = ordersRes.ok && ordersRes.data ? ordersRes.data.filter((o: any) => o.status === 'completed') : [];
  const totalSales = completedOrders.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
  const taxCollected = completedOrders.reduce((s: number, o: any) => s + Number(o.tax_amount || 0), 0);
  const serviceCharge = 0;

  const cogs = await calcCOGS(slug, start, end);

  const grossProfit = totalSales - cogs;
  const netSales = totalSales;
  const discounts = 0;

  const expenses = expRes.ok && expRes.data ? expRes.data.reduce((s: number, e: any) => s + Number(e.amount || 0), 0) : 0;
  const expenseBreakdown: Record<string, number> = {};
  if (expRes.ok && expRes.data) {
    for (const e of expRes.data) {
      const cat = e.category || 'other';
      expenseBreakdown[cat] = (expenseBreakdown[cat] || 0) + Number(e.amount || 0);
    }
  }

  const netProfit = grossProfit - expenses;

  return {
    totalSales, discounts, netSales, taxCollected, serviceCharge, cogs, grossProfit,
    expenses, netProfit,
    expenseBreakdown: Object.entries(expenseBreakdown).map(([category, amount]) => ({ category, amount })),
  };
}

function extractTag(notes: string | null | undefined, tag: string): string {
  if (!notes) return '';
  const m = notes.match(new RegExp(`${tag}:\\s*([^·;|]*?)(?:\\s*·|\\s*;|\\s*$)`));
  return m ? m[1].trim() : '';
}

export async function getWastageReports(slug: string, dr: DateRange): Promise<WastageReportData> {
  const { start, end } = dr;
  const [ledgerRes, invRes] = await Promise.all([
    supa(slug, {
      table: 'item_ledger', select: 'inventory_item_id, quantity_change, total_cost, unit_cost, notes, created_by, created_at',
      eq: ['movement_type', 'wastage'],
      gte: ['created_at', start], lte: ['created_at', end], limit: 20000,
    }),
    supa(slug, { table: 'inventory_items', select: 'id, name, unit', limit: 5000 }),
  ]);

  const items = invRes.ok && invRes.data ? invRes.data : [];
  const itemMap = new Map<string, { name: string; unit: string }>();
  for (const it of items) itemMap.set(it.id, { name: it.name || it.id, unit: it.unit || '' });

  const rows = ledgerRes.ok && ledgerRes.data ? ledgerRes.data : [];
  let totalQty = 0;
  let totalAmount = 0;

  const itemAgg = new Map<string, number>();
  const catAgg = new Map<string, number>();
  const reasonAgg = new Map<string, number>();
  const empAgg = new Map<string, number>();
  const dateAgg = new Map<string, number>();
  const costOf = new Map<string, number>();

  // Latest recorded per-unit cost per item (fallback when a row has no unit_cost).
  for (const r of rows) {
    if (r.unit_cost != null && Number(r.unit_cost) > 0) costOf.set(r.inventory_item_id, Number(r.unit_cost));
  }

  for (const r of rows) {
    const qty = Math.abs(Number(r.quantity_change ?? 0));
    const unitCost = Number(r.unit_cost) || costOf.get(r.inventory_item_id) || 0;
    const amount = qty * unitCost;
    totalQty += qty;
    totalAmount += amount;
    itemAgg.set(r.inventory_item_id, (itemAgg.get(r.inventory_item_id) || 0) + qty);
    const cat = extractTag(r.notes, 'Category') || 'Uncategorized';
    catAgg.set(cat, (catAgg.get(cat) || 0) + amount);
    const reason = extractTag(r.notes, 'Reason') || 'Other';
    reasonAgg.set(reason, (reasonAgg.get(reason) || 0) + amount);
    const emp = extractTag(r.notes, 'Employee') || r.created_by || 'Unknown';
    empAgg.set(emp, (empAgg.get(emp) || 0) + amount);
    const d = (r.created_at || '').split('T')[0];
    dateAgg.set(d, (dateAgg.get(d) || 0) + amount);
  }

  const byItem = Array.from(itemAgg.entries()).map(([id, q]) => {
    const meta = itemMap.get(id) || { name: id, unit: '' };
    const unitCost = costOf.get(id) || 0;
    return { name: meta.name, unit: meta.unit, qty: q, amount: unitCost > 0 ? q * unitCost : 0 };
  }).filter((i) => i.qty > 0).sort((a, b) => b.amount - a.amount);

  const byCategory = Array.from(catAgg.entries()).map(([label, value], i) => ({ label, qty: 0, amount: value, color: COLORS[i % COLORS.length] })).sort((a, b) => b.amount - a.amount);
  const byReason = Array.from(reasonAgg.entries()).map(([label, value], i) => ({ label, qty: 0, amount: value, color: COLORS[i % COLORS.length] })).sort((a, b) => b.amount - a.amount);
  const byEmployee = Array.from(empAgg.entries()).map(([name, amount]) => ({ name, qty: 0, amount })).sort((a, b) => b.amount - a.amount);
  const byDate = Array.from(dateAgg.entries()).map(([label, value]) => ({ label: label.slice(5), value })).sort((a, b) => a.label.localeCompare(b.label));

  return {
    summary: { totalQty, totalAmount, entries: rows.length },
    byItem: byItem.slice(0, 50),
    byCategory: byCategory.slice(0, 20),
    byReason,
    byEmployee: byEmployee.slice(0, 20),
    byDate,
    topItems: byItem.slice(0, 10).map((i) => ({ name: i.name, qty: i.qty, amount: i.amount })),
  };
}

async function calcCOGS(slug: string, start: string, end: string): Promise<number> {
  const [ingredientsRes, ledgerRes] = await Promise.all([
    supa(slug, { table: 'menu_item_ingredients', select: 'menu_item_id, inventory_item_id, quantity_used', limit: 5000 }),
    supa(slug, { table: 'item_ledger', select: 'inventory_item_id, total_cost, quantity_change, created_at', gte: ['created_at', start], lte: ['created_at', end], limit: 20000 }),
  ]);

  if (!ingredientsRes.ok || !ledgerRes.ok) return 0;

  // Get latest purchase cost per inventory item
  const latestCost = new Map<string, number>();
  if (ledgerRes.data) {
    // filter purchase type
    const allLedger = ledgerRes.data as any[];
    for (const l of allLedger) {
      if (l.movement_type === 'purchase' && l.total_cost && l.quantity_change) {
        latestCost.set(l.inventory_item_id, Number(l.total_cost) / Math.abs(Number(l.quantity_change)));
      }
    }
  }

  // Get order items in period for item quantities
  const oiRes = await supa(slug, {
    table: 'order_items', select: 'menu_item_id, quantity, orders!inner(status, created_at)',
    filter: { 'orders.status': 'completed' },
    gte: ['orders.created_at', start], lte: ['orders.created_at', end],
    limit: 20000,
  });
  if (!oiRes.ok || !oiRes.data) return 0;

  // Build ingredient cost per menu item
  const ingMap = new Map<string, { itemId: string; qty: number }[]>();
  if (ingredientsRes.data) {
    for (const ing of ingredientsRes.data) {
      const list = ingMap.get(ing.menu_item_id) || [];
      list.push({ itemId: ing.inventory_item_id, qty: Number(ing.quantity_used || 0) });
      ingMap.set(ing.menu_item_id, list);
    }
  }

  let totalCogs = 0;
  const itemCount = new Map<string, number>();
  for (const oi of oiRes.data) {
    const mid = oi.menu_item_id;
    const qty = Number(oi.quantity || 0);
    itemCount.set(mid, (itemCount.get(mid) || 0) + qty);
  }

  for (const [menuItemId, count] of itemCount) {
    const ingredients = ingMap.get(menuItemId) || [];
    let itemCost = 0;
    for (const ing of ingredients) {
      const cost = latestCost.get(ing.itemId) || 0;
      itemCost += ing.qty * cost;
    }
    totalCogs += itemCost * count;
  }

  return totalCogs;
}
