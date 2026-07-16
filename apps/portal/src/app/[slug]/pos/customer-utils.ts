import type { SupabaseClient } from '@supabase/supabase-js';
import { supa } from './supa-query';

// Old version using Supabase client (works on Bao-G)
export async function updateCustomerLoyalty(
  client: SupabaseClient,
  customerId: string,
  orderTotal: number,
): Promise<void> {
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
    })
    .eq('id', customerId);
}

// New version using supa proxy (works on any tenant)
export async function updateCustomerLoyaltySupa(slug: string, customerId: string, orderTotal: number): Promise<void> {
  const custResult = await supa(slug, {
    table: 'customers',
    select: 'total_orders, total_spent, loyalty_points',
    eq: ['id', customerId],
    single: true,
  });
  if (!custResult.ok || !custResult.data) return;

  const pointsToAdd = Math.floor(orderTotal);
  await supa(slug, {
    table: 'customers',
    method: 'update',
    eq: ['id', customerId],
    body: {
      total_orders: Number(custResult.data.total_orders) + 1,
      total_spent: Number(custResult.data.total_spent) + orderTotal,
      loyalty_points: Number(custResult.data.loyalty_points) + pointsToAdd,
    },
  });
}

export async function searchCustomers(
  client: SupabaseClient,
  term: string,
): Promise<{ id: string; name: string; phone: string | null }[]> {
  if (!term.trim()) return [];
  const q = `%${term.trim()}%`;
  const { data } = await client
    .from('customers')
    .select('id, name, phone')
    .or(`name.ilike.${q},phone.ilike.${q}`)
    .order('name')
    .limit(10);
  return (data ?? []) as { id: string; name: string; phone: string | null }[];
}

export async function searchCustomersSupa(slug: string, term: string): Promise<{ id: string; name: string; phone: string | null }[]> {
  if (!term.trim()) return [];
  const q = `%${term.trim()}%`;
  const result = await supa(slug, {
    table: 'customers',
    select: 'id, name, phone',
    order: 'name',
    limit: 10,
  });
  if (!result.ok) return [];
  return (result.data ?? []) as { id: string; name: string; phone: string | null }[];
}
