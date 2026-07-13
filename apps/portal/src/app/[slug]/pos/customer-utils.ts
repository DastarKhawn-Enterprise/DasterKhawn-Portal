import type { SupabaseClient } from '@supabase/supabase-js';

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

  // Loyalty: 1 point per $1 spent (hardcoded ratio; move to Settings later)
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
