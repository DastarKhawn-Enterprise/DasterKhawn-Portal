import type { SupabaseClient } from '@supabase/supabase-js';
import { supa, supaBatch } from './supa-query';

interface CartItem {
  id: string;
  quantity: number;
}

// Old version using Supabase client (works on Bao-G)
export async function deductInventory(client: SupabaseClient, cart: CartItem[]): Promise<void> {
  const menuItemIds = [...new Set(cart.map((c) => c.id))];

  const { data: ingredients } = await client
    .from('menu_item_ingredients')
    .select('menu_item_id, inventory_item_id, quantity_used')
    .in('menu_item_id', menuItemIds);

  if (!ingredients || ingredients.length === 0) return;

  const deductions = new Map<string, number>();
  for (const ing of ingredients) {
    const cartItem = cart.find((c) => c.id === ing.menu_item_id);
    if (!cartItem) continue;
    const deductAmount = Number(ing.quantity_used) * cartItem.quantity;
    const current = deductions.get(ing.inventory_item_id) ?? 0;
    deductions.set(ing.inventory_item_id, current + deductAmount);
  }

  for (const [inventoryItemId, amount] of deductions) {
    const { data: item } = await client
      .from('inventory_items')
      .select('current_stock')
      .eq('id', inventoryItemId)
      .single();

    if (!item) continue;

    const newStock = Math.max(0, Number(item.current_stock) - amount);
    await client
      .from('inventory_items')
      .update({ current_stock: newStock })
      .eq('id', inventoryItemId);
  }
}

// New version using supa proxy (works on any tenant)
export async function deductInventorySupa(slug: string, cart: CartItem[]): Promise<void> {
  const menuItemIds = [...new Set(cart.map((c) => c.id))];

  const ingResult = await supa(slug, {
    table: 'menu_item_ingredients',
    select: 'menu_item_id, inventory_item_id, quantity_used',
    filter: { menu_item_id: menuItemIds.join(',') },
    limit: 5000,
  });
  if (!ingResult.ok || !ingResult.data) return;

  const deductions = new Map<string, number>();
  for (const ing of ingResult.data) {
    const cartItem = cart.find((c) => c.id === ing.menu_item_id);
    if (!cartItem) continue;
    const deductAmount = Number(ing.quantity_used) * cartItem.quantity;
    const current = deductions.get(ing.inventory_item_id) ?? 0;
    deductions.set(ing.inventory_item_id, current + deductAmount);
  }

  const inventoryIds = [...deductions.keys()];
  if (inventoryIds.length === 0) return;
  const itemsResult = await supa(slug, {
    table: 'inventory_items',
    select: 'id, current_stock',
    in: ['id', inventoryIds],
    limit: 5000,
  });
  if (!itemsResult.ok || !itemsResult.data) return;
  const stockMap = new Map<string, number>(itemsResult.data.map((r: any) => [r.id, Number(r.current_stock)]));
  const updates = [...deductions.entries()]
    .filter(([id]) => stockMap.has(id))
    .map(([id, amount]) => {
      const stock = stockMap.get(id) ?? 0;
      return supa(slug, {
        table: 'inventory_items',
        method: 'update',
        eq: ['id', id],
        body: { current_stock: Math.max(0, stock - amount) },
      });
    });
  await Promise.all(updates);
}
