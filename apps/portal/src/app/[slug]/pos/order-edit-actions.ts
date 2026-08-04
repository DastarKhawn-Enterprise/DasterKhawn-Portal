'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { getTenantBySlug, getStaffByTenant } from '@sat-sys/gateway-sdk';
import { supa } from './supa-query';

async function checkAccess(slug: string, write: boolean) {
  const { userId } = auth();
  if (!userId) throw new Error('Unauthorized');
  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error('Tenant not found');
  const staff = await getStaffByTenant(tenant.id);
  const me = staff.find((s) => s.clerk_user_id === userId);
  if (me && (me.role === 'owner' || me.role === 'super_admin')) {
    return { tenant, userId };
  }
  if (!me) {
    const user = await currentUser();
    const role = (user?.publicMetadata as Record<string, any> | undefined)?.role;
    if (role === 'super_admin') return { tenant, userId };
    throw new Error('Forbidden: no access to this tenant');
  }
  if (write) {
    const required = 'menu:edit';
    if (!me.permissions.includes(required)) throw new Error('Forbidden: missing ' + required);
  }
  return { tenant, userId };
}

export interface OrderEditItem {
  menu_item_id: string;
  quantity: number;
}

interface LedgerRow {
  inventory_item_id: string;
  movement_type: 'ORDER_EDIT_ADD' | 'ORDER_EDIT_REMOVE';
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
}

export type OrderEditResult =
  | { ok: true; blocked?: false; noop?: boolean; message?: string; historyId?: string; ledgerIds?: string[] }
  | { ok: false; blocked?: boolean; error: string };

// Core delta engine: never reprocesses the whole order, only the diff.
async function applyInventoryDelta(
  slug: string,
  tenantId: string,
  userId: string,
  orderId: string,
  oldItems: OrderEditItem[],
  newItems: OrderEditItem[],
  action: 'edit' | 'cancel',
  device: string | null
): Promise<OrderEditResult> {
  const oldMap = new Map(oldItems.map((i) => [i.menu_item_id, Number(i.quantity)]));
  const newMap = new Map(newItems.map((i) => [i.menu_item_id, Number(i.quantity)]));
  const menuIds = new Set([...oldMap.keys(), ...newMap.keys()]);

  const adds: OrderEditItem[] = [];
  const removes: OrderEditItem[] = [];
  for (const id of menuIds) {
    const diff = (newMap.get(id) || 0) - (oldMap.get(id) || 0);
    if (diff > 0) adds.push({ menu_item_id: id, quantity: diff });
    else if (diff < 0) removes.push({ menu_item_id: id, quantity: -diff });
  }

  const hasChange = adds.length > 0 || removes.length > 0;
  if (!hasChange) return { ok: true, noop: true, message: 'No inventory change' };

  const affectedMenus = [...new Set([...adds, ...removes].map((a) => a.menu_item_id))];
  const ingRes = await supa(slug, {
    table: 'menu_item_ingredients',
    select: 'menu_item_id, inventory_item_id, quantity_used',
    in: ['menu_item_id', affectedMenus],
    limit: 5000,
  });
  const recipes = ingRes.ok && ingRes.data ? ingRes.data : [];
  if (recipes.length === 0) return { ok: true, noop: true, message: 'No inventory recipes found' };

  // Ordered operations: positive `change` reduces stock (add), negative restores (remove).
  const ops: { invId: string; menuItemId: string; change: number }[] = [];
  for (const add of adds) {
    for (const ing of recipes) {
      if (ing.menu_item_id !== add.menu_item_id) continue;
      ops.push({ invId: ing.inventory_item_id, menuItemId: add.menu_item_id, change: Number(ing.quantity_used) * add.quantity });
    }
  }
  for (const rm of removes) {
    for (const ing of recipes) {
      if (ing.menu_item_id !== rm.menu_item_id) continue;
      ops.push({ invId: ing.inventory_item_id, menuItemId: rm.menu_item_id, change: -Number(ing.quantity_used) * rm.quantity });
    }
  }

  const invIds = [...new Set(ops.map((o) => o.invId))];
  const stockRes = await supa(slug, {
    table: 'inventory_items',
    select: 'id, current_stock',
    in: ['id', invIds],
    limit: 5000,
  });
  const running = new Map<string, number>();
  if (stockRes.ok && stockRes.data) {
    for (const r of stockRes.data) running.set(r.id, Number(r.current_stock));
  }

  const ledgerRows: { row: Record<string, unknown>; invId: string }[] = [];
  const inventoryDelta: { inventory_item_id: string; quantity: number }[] = [];

  for (const op of ops) {
    if (!running.has(op.invId)) continue;
    const before = running.get(op.invId) ?? 0;
    const after = Math.max(0, before - op.change);
    running.set(op.invId, after);
    const movementType: 'ORDER_EDIT_ADD' | 'ORDER_EDIT_REMOVE' = op.change > 0 ? 'ORDER_EDIT_ADD' : 'ORDER_EDIT_REMOVE';
    ledgerRows.push({
      invId: op.invId,
      row: {
        inventory_item_id: op.invId,
        menu_item_id: op.menuItemId,
        movement_type: movementType,
        quantity_change: -op.change,
        quantity_before: before,
        quantity_after: after,
        reference_order_id: orderId,
        tenant_id: tenantId,
        created_by: userId,
        notes: `${movementType} (${action}): ${Math.abs(op.change)} unit${Math.abs(op.change) === 1 ? '' : 's'}${device ? ' | ' + device : ''}`,
      },
    });
  }

  const netDelta = new Map<string, number>();
  for (const op of ops) {
    netDelta.set(op.invId, (netDelta.get(op.invId) || 0) - op.change);
  }
  for (const [invId, qty] of netDelta) {
    inventoryDelta.push({ inventory_item_id: invId, quantity: qty });
  }

  // Apply final stock per inventory item (handles mixed add/remove netting).
  const stockOps = [...running.entries()].map(([invId, stock]) =>
    supa(slug, { table: 'inventory_items', method: 'update', eq: ['id', invId], body: { current_stock: stock } })
  );
  await Promise.all(stockOps);

  // Insert ledger rows (one per menu/ingredient movement) to capture ids.
  const ledgerIds: string[] = [];
  for (const { row } of ledgerRows) {
    const ledRes = await supa(slug, { table: 'item_ledger', method: 'insert', single: true, body: row });
    if (ledRes.ok && ledRes.data?.id) ledgerIds.push(ledRes.data.id);
  }

  // Insert order edit history.
  const historyRes = await supa(slug, {
    table: 'order_edit_history',
    method: 'insert',
    single: true,
    body: {
      order_id: orderId,
      action,
      edited_by: userId,
      edited_at: new Date().toISOString(),
      items_added: adds.map((a) => ({ menu_item_id: a.menu_item_id, quantity: a.quantity })),
      items_removed: removes.map((r) => ({ menu_item_id: r.menu_item_id, quantity: r.quantity })),
      inventory_delta: inventoryDelta,
      ledger_reference: ledgerIds,
    },
  });
  const historyId = historyRes.ok && historyRes.data?.id ? historyRes.data.id : undefined;

  // Link ledger rows back to the history record.
  if (historyId && ledgerIds.length > 0) {
    await Promise.all(
      ledgerIds.map((id) =>
        supa(slug, { table: 'item_ledger', method: 'update', eq: ['id', id], body: { edit_history_id: historyId } })
      )
    );
  }

  return { ok: true, historyId, ledgerIds, message: `Adjusted ${ledgerIds.length} ledger entr${ledgerIds.length === 1 ? 'y' : 'ies'}` };
}

export async function applyOrderEditInventory(
  slug: string,
  orderId: string,
  oldItems: OrderEditItem[],
  newItems: OrderEditItem[],
  device?: string | null
): Promise<OrderEditResult> {
  const { tenant, userId } = await checkAccess(slug, true);

  // Payment protection: invoiced/paid orders cannot have inventory-affecting edits.
  const orderRes = await supa(slug, {
    table: 'orders',
    select: 'payment_status, invoice_number',
    eq: ['id', orderId],
    single: true,
  });
  if (!orderRes.ok || !orderRes.data) return { ok: false, error: 'Order not found' };
  if (orderRes.data.payment_status === 'paid' || orderRes.data.invoice_number) {
    return {
      ok: false,
      blocked: true,
      error: 'Order is already paid/invoiced. Inventory-affecting edits require Void, Refund, or Manager Override.',
    };
  }

  return applyInventoryDelta(slug, tenant.id, userId, orderId, oldItems || [], newItems || [], 'edit', device || null);
}

export async function restoreOrderInventoryOnCancel(
  slug: string,
  orderId: string,
  device?: string | null
): Promise<OrderEditResult> {
  const { tenant, userId } = await checkAccess(slug, true);

  // Idempotency guard: a cancel can only be restored once.
  const histRes = await supa(slug, {
    table: 'order_edit_history',
    select: 'id',
    eq: ['order_id', orderId],
    filter: { action: 'cancel' },
    limit: 1,
  });
  if (histRes.ok && histRes.data && histRes.data.length > 0) {
    return { ok: true, noop: true, message: 'Inventory already restored for this cancel' };
  }

  const ordRes = await supa(slug, {
    table: 'orders',
    select: 'order_items(menu_item_id, quantity)',
    eq: ['id', orderId],
    single: true,
  });
  if (!ordRes.ok || !ordRes.data) return { ok: false, error: 'Order not found' };

  const currentItems: OrderEditItem[] = (ordRes.data.order_items || []).map((oi: any) => ({
    menu_item_id: oi.menu_item_id,
    quantity: Number(oi.quantity),
  }));
  if (currentItems.length === 0) return { ok: true, noop: true, message: 'Order has no items to restore' };

  return applyInventoryDelta(slug, tenant.id, userId, orderId, currentItems, [], 'cancel', device || null);
}
