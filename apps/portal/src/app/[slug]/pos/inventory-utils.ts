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
// When orderId and createdBy are provided, also logs 'sale' ledger rows
export async function deductInventorySupa(slug: string, cart: CartItem[], orderId?: string, createdBy?: string): Promise<void> {
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
  const ops: Promise<any>[] = [];
  for (const [id, amount] of deductions.entries()) {
    if (!stockMap.has(id)) continue;
    const stock = stockMap.get(id) ?? 0;
    ops.push(supa(slug, {
      table: 'inventory_items',
      method: 'update',
      eq: ['id', id],
      body: { current_stock: Math.max(0, stock - amount) },
    }));
    if (orderId && createdBy) {
      ops.push(supa(slug, {
        table: 'item_ledger',
        method: 'insert',
        body: {
          inventory_item_id: id,
          movement_type: 'sale',
          quantity_change: -amount,
          reference_order_id: orderId,
          notes: `Order deduction: ${amount} units`,
          created_by: createdBy,
        },
      }));
    }
  }
  await Promise.all(ops);
}
