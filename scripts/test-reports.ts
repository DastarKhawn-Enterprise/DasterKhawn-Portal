import { createClient } from '@supabase/supabase-js';

// Node 20 has no native WebSocket; stub it (realtime not needed for queries)
(globalThis as any).WebSocket = class {};

const GATEWAY_URL = process.env.GATEWAY_SUPABASE_URL!;
const GATEWAY_SERVICE_KEY = process.env.GATEWAY_SUPABASE_SERVICE_KEY!;

async function main() {
  const gateway = createClient(GATEWAY_URL, GATEWAY_SERVICE_KEY, { auth: { persistSession: false }, realtime: { disabled: true } });

  const { data: tenant, error: tErr } = await gateway
    .from('tenants')
    .select('supabase_url, supabase_service_key')
    .eq('slug', 'bao-g')
    .single();
  if (tErr || !tenant) throw new Error('Tenant not found: ' + JSON.stringify(tErr));

  const client = createClient(tenant.supabase_url, tenant.supabase_service_key, {
    auth: { persistSession: false },
    realtime: { disabled: true },
  });

  const { data: orders, error } = await client
    .from('orders')
    .select('id, order_number, status, total, created_at, order_type')
    .eq('status', 'completed')
    .order('created_at', { ascending: true });

  if (error) throw error;

  console.log(`\n=== TOTAL COMPLETED ORDERS: ${orders?.length ?? 0} ===\n`);
  if (!orders || orders.length === 0) {
    console.log('No completed orders found.');
    return;
  }

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const avg = totalRevenue / totalOrders;
  console.log('SUMMARY (all-time, completed):');
  console.log('  Total Orders:', totalOrders);
  console.log('  Total Revenue: $' + totalRevenue.toFixed(2));
  console.log('  Avg Order Value: $' + avg.toFixed(2));

  const byType = new Map<string, { count: number; revenue: number }>();
  for (const o of orders) {
    const k = o.order_type || 'unknown';
    const prev = byType.get(k) || { count: 0, revenue: 0 };
    prev.count += 1;
    prev.revenue += Number(o.total) || 0;
    byType.set(k, prev);
  }
  console.log('\nSALES BY ORDER TYPE:');
  for (const [type, v] of [...byType.entries()].sort((a, b) => b[1].revenue - a[1].revenue)) {
    console.log(`  ${type}: ${v.count} orders, $${v.revenue.toFixed(2)}`);
  }

  const { data: items, error: itemsErr } = await client
    .from('order_items')
    .select('quantity, price_at_order, menu_items!inner(name), orders!inner(status)')
    .eq('orders.status', 'completed');
  if (itemsErr) throw itemsErr;

  const topMap = new Map<string, { qty: number; rev: number }>();
  for (const it of items ?? []) {
    const name = (it.menu_items as any)?.name || 'Unknown';
    const prev = topMap.get(name) || { qty: 0, rev: 0 };
    prev.qty += it.quantity;
    prev.rev += it.quantity * Number(it.price_at_order);
    topMap.set(name, prev);
  }
  console.log('\nTOP SELLING ITEMS (top 10 by qty):');
  const top = [...topMap.entries()].sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);
  for (const [name, v] of top) {
    console.log(`  ${name}: ${v.qty} sold, $${v.rev.toFixed(2)}`);
  }

  const daily = new Map<string, number>();
  for (const o of orders) {
    const d = (o.created_at || '').split('T')[0];
    daily.set(d, (daily.get(d) || 0) + (Number(o.total) || 0));
  }
  console.log('\nDAILY REVENUE:');
  for (const [d, rev] of [...daily.entries()].sort()) {
    console.log(`  ${d}: $${rev.toFixed(2)}`);
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayOrders = orders.filter((o) => o.created_at >= todayStart);
  console.log(`\nTODAY (since ${todayStart}): ${todayOrders.length} completed orders, $${todayOrders.reduce((s, o) => s + Number(o.total), 0).toFixed(2)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
