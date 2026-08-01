import type { SupabaseClient } from '@supabase/supabase-js';
import { supa } from './supa-query';

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[\s\-\+\(\)]/g, '').replace(/^0/, '92').replace(/^92/, '');
  if (digits.length === 9 && /^\d{9}$/.test(digits)) return `92${digits}`;
  if (digits.length === 10 && /^\d{10}$/.test(digits)) return digits;
  if (digits.length === 12 && /^\d{12}$/.test(digits)) return digits;
  return digits;
}

export function formatPhone(phone: string): string {
  const d = phone.replace(/[\s\-\+\(\)]/g, '');
  if (d.length === 12 && d.startsWith('92')) return `0${d.slice(2, 5)}-${d.slice(5)}`;
  return phone;
}

export async function checkDuplicatePhone(slug: string, phone: string, excludeId?: string): Promise<{ id: string; name: string; phone: string | null } | null> {
  if (!phone.trim()) return null;
  const normalized = normalizePhone(phone);
  const result = await supa(slug, {
    table: 'customers',
    select: 'id, name, phone',
    limit: 10,
  });
  if (!result.ok || !result.data) return null;
  const dup = result.data.find((c: any) => {
    if (excludeId && c.id === excludeId) return false;
    return c.phone && normalizePhone(c.phone) === normalized;
  });
  return dup || null;
}

export async function updateCustomerLoyalty(client: SupabaseClient, customerId: string, orderTotal: number): Promise<void> {
  const { data: cust } = await client
    .from('customers')
    .select('total_orders, total_spent, loyalty_points')
    .eq('id', customerId)
    .single();
  if (!cust) return;
  const pointsToAdd = Math.floor(orderTotal);
  await client
    .from('customers')
    .update({
      total_orders: Number(cust.total_orders) + 1,
      total_spent: Number(cust.total_spent) + orderTotal,
      loyalty_points: Number(cust.loyalty_points) + pointsToAdd,
      last_order_date: new Date().toISOString(),
    })
    .eq('id', customerId);
}

export async function updateCustomerLoyaltySupa(slug: string, customerId: string, orderTotal: number): Promise<void> {
  const custResult = await supa(slug, {
    table: 'customers',
    select: 'total_orders, total_spent, loyalty_points',
    eq: ['id', customerId],
    single: true,
  });
  if (!custResult.ok || !custResult.data) return;
  const pointsToAdd = Math.floor(orderTotal);
  const body: any = {
    total_orders: Number(custResult.data.total_orders) + 1,
    total_spent: Number(custResult.data.total_spent) + orderTotal,
    loyalty_points: Number(custResult.data.loyalty_points) + pointsToAdd,
  };
  const result = await supa(slug, {
    table: 'customers', method: 'update', eq: ['id', customerId], body: { ...body, last_order_date: new Date().toISOString() },
  });
  if (!result.ok) {
    await supa(slug, { table: 'customers', method: 'update', eq: ['id', customerId], body });
  }
}

export async function searchCustomers(client: SupabaseClient, term: string): Promise<{ id: string; name: string; phone: string | null }[]> {
  if (!term.trim()) return [];
  const q = `%${term.trim()}%`;
  const { data } = await client
    .from('customers')
    .select('id, name, phone')
    .or(`name.ilike.${q},phone.ilike.${q}`)
    .eq('status', 'active')
    .order('name')
    .limit(10);
  return (data ?? []) as { id: string; name: string; phone: string | null }[];
}

export async function searchCustomersSupa(slug: string, term: string): Promise<{ id: string; name: string; phone: string | null }[]> {
  if (!term.trim()) return [];
  const q = `%${term.trim()}%`;
  const opts = {
    table: 'customers' as const,
    select: 'id, name, phone',
    order: 'name',
    limit: 10,
    or: `name.ilike.${q},phone.ilike.${q}`,
  };
  let result = await supa(slug, { ...opts, filter: { status: 'active' } });
  if (!result.ok && /status/i.test(result.error || '')) {
    result = await supa(slug, opts);
  }
  if (!result.ok) return [];
  return (result.data ?? []) as { id: string; name: string; phone: string | null }[];
}
