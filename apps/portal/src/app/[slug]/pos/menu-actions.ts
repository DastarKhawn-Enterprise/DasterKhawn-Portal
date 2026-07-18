'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { getTenantBySlug, getTenantServiceCredentials, getStaffByTenant } from '@sat-sys/gateway-sdk';
import { createClient } from '@supabase/supabase-js';

async function getClient(slug: string) {
  const { userId } = auth();
  if (!userId) throw new Error('Unauthorized');

  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error('Tenant not found');

  const staff = await getStaffByTenant(tenant.id);
  const me = staff.find((s) => s.clerk_user_id === userId);
  const hasEdit = me
    ? (me.permissions.includes('menu:edit') || me.role === 'owner' || me.role === 'super_admin')
    : false;

  if (!hasEdit) {
    const user = await currentUser();
    const role = (user?.publicMetadata as Record<string, any> | undefined)?.role;
    if (role !== 'super_admin') throw new Error('Forbidden');
  }

  const creds = await getTenantServiceCredentials(slug);
  if (!creds) throw new Error('Service credentials not found');

  return createClient(tenant.supabase_url, creds.supabase_service_key);
}

export interface MenuItemPayload {
  name: string;
  description?: string | null;
  price: number;
  category?: string | null;
  available?: boolean | null;
}

export async function getMenuItems(slug: string) {
  try {
    const client = await getClient(slug);
    const { data, error } = await client
      .from('menu_items')
      .select('id, name, description, price, category, available')
      .order('name');
    if (error) throw error;
    return data as MenuItemPayload[];
  } catch (e: any) {
    console.error('[Menu actions] get error:', e.message);
    return [];
  }
}

export async function addMenuItem(slug: string, payload: MenuItemPayload) {
  const client = await getClient(slug);
  const { data, error } = await client
    .from('menu_items')
    .insert(payload)
    .select('id')
    .single();
  if (error) throw error;
  return data as { id: string };
}

export async function updateMenuItem(slug: string, id: string, payload: Partial<MenuItemPayload>) {
  const client = await getClient(slug);
  const { error } = await client.from('menu_items').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteMenuItem(slug: string, id: string) {
  const client = await getClient(slug);
  const { error } = await client.from('menu_items').delete().eq('id', id);
  if (error) throw error;
}

export async function toggleMenuItem(slug: string, id: string, available: boolean) {
  const client = await getClient(slug);
  const { error } = await client.from('menu_items').update({ available }).eq('id', id);
  if (error) throw error;
}

export interface IngredientRow {
  inventory_item_id: string;
  inventory_name: string;
  quantity_used: number;
}

export async function getMenuItemIngredients(slug: string, menuItemId: string) {
  try {
    const client = await getClient(slug);
    const { data, error } = await client
      .from('menu_item_ingredients')
      .select('inventory_item_id, quantity_used, inventory_items!inner(name)')
      .eq('menu_item_id', menuItemId);
    if (error) throw error;
    return (data || []).map((r: any) => ({
      inventory_item_id: r.inventory_item_id,
      inventory_name: r.inventory_items?.name || 'Unknown',
      quantity_used: Number(r.quantity_used),
    })) as IngredientRow[];
  } catch { return []; }
}

export async function getInventoryItems(slug: string) {
  try {
    const client = await getClient(slug);
    const { data, error } = await client
      .from('inventory_items')
      .select('id, name, unit')
      .order('name');
    if (error) throw error;
    return data as { id: string; name: string; unit: string }[];
  } catch { return []; }
}

export async function getSettingsCurrency(slug: string) {
  try {
    const client = await getClient(slug);
    const { data, error } = await client
      .from('settings')
      .select('currency_symbol')
      .single();
    if (!error && data?.currency_symbol) return data.currency_symbol as string;
  } catch {}
  return 'Rs.';
}

export async function checkMenuEditPermission(slug: string): Promise<boolean> {
  try {
    const { userId } = auth();
    if (!userId) return false;
    const tenant = await getTenantBySlug(slug);
    if (!tenant) return false;
    const staff = await getStaffByTenant(tenant.id);
    const me = staff.find((s) => s.clerk_user_id === userId);
    if (me) return me.permissions.includes('menu:edit') || me.role === 'owner' || me.role === 'super_admin';
    const user = await currentUser();
    const role = (user?.publicMetadata as Record<string, any> | undefined)?.role;
    return role === 'super_admin';
  } catch { return false; }
}

export async function saveIngredients(slug: string, menuItemId: string, ingredients: { inventory_item_id: string; quantity_used: number }[]) {
  const client = await getClient(slug);
  await client.from('menu_item_ingredients').delete().eq('menu_item_id', menuItemId);
  if (ingredients.length > 0) {
    const rows = ingredients.map((ing) => ({
      menu_item_id: menuItemId,
      inventory_item_id: ing.inventory_item_id,
      quantity_used: ing.quantity_used,
    }));
    const { error } = await client.from('menu_item_ingredients').insert(rows);
    if (error) throw error;
  }
}
