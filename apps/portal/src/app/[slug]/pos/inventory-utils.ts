import type { SupabaseClient } from '@supabase/supabase-js';

interface CartItem {
  id: string;
  quantity: number;
}

export async function deductInventory(client: SupabaseClient, cart: CartItem[]): Promise<void> {
  const menuItemIds = [...new Set(cart.map((c) => c.id))];

  const { data: ingredients } = await client
    .from('menu_item_ingredients')
    .select('menu_item_id, inventory_item_id, quantity_used')
    .in('menu_item_id', menuItemIds);

  if (!ingredients || ingredients.length === 0) return;

  // Group by inventory_item_id and sum the deductions
  const deductions = new Map<string, number>();
  for (const ing of ingredients) {
    const cartItem = cart.find((c) => c.id === ing.menu_item_id);
    if (!cartItem) continue;
    const deductAmount = Number(ing.quantity_used) * cartItem.quantity;
    const current = deductions.get(ing.inventory_item_id) ?? 0;
    deductions.set(ing.inventory_item_id, current + deductAmount);
  }

  // Apply each deduction in sequence (we keep it simple)
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
