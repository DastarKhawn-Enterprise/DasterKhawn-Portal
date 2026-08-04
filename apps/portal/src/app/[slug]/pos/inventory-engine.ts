'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { getTenantBySlug, getStaffByTenant } from '@sat-sys/gateway-sdk';
import { supa } from './supa-query';

export interface OrderEditItem {
  menu_item_id: string;
  quantity: number;
}

export interface SaleCartItem {
  id: string;
  quantity: number;
}

export interface PurchaseInput {
  inventory_item_id: string;
  quantity: number;
  unit_cost: number;
  vendor?: string | null;
  notes?: string | null;
  purchase_date: string;
  log_expense: boolean;
  created_by?: string | null;
}

export interface PurchaseEditInput {
  quantity: number;
  unit_cost: number;
  vendor?: string | null;
  notes?: string | null;
}

export type OrderEditResult =
  | { ok: true; blocked?: false; noop?: boolean; message?: string; historyId?: string; ledgerIds?: string[] }
  | { ok: false; blocked?: boolean; error: string };

interface AccessCtx {
  tenant: { id: string; supabase_url: string; slug: string };
  userId: string;
}

async function checkAccess(slug: string, write: boolean): Promise<AccessCtx> {
  const { userId } = auth();
  if (!userId) throw new Error('Unauthorized');
  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error('Tenant not found');
  const staff = await getStaffByTenant(tenant.id);
  const me = staff.find((s) => s.clerk_user_id === userId);
  if (me && (me.role === 'owner' || me.role === 'super_admin')) {
    return { tenant: { id: tenant.id, supabase_url: tenant.supabase_url, slug: tenant.slug }, userId };
  }
  if (!me) {
    const user = await currentUser();
    const role = (user?.publicMetadata as Record<string, any> | undefined)?.role;
    if (role === 'super_admin') return { tenant: { id: tenant.id, supabase_url: tenant.supabase_url, slug: tenant.slug }, userId };
    throw new Error('Forbidden: no access to this tenant');
  }
  if (write) {
    const required = 'menu:edit';
    if (!me.permissions.includes(required)) throw new Error('Forbidden: missing ' + required);
  }
  return { tenant: { id: tenant.id, supabase_url: tenant.supabase_url, slug: tenant.slug }, userId };
}

export interface MovementChange {
  inventory_item_id: string;
  // Signed stock delta. Positive = stock increases, negative = stock decreases.
  change: number;
}

type Movement = MovementChange;

interface RowFields {
  movementType: string;
  changes: MovementChange[];
  orderId?: string | null;
  unitCost?: number | null;
  totalCost?: number | null;
  vendor?: string | null;
  notes?: string | null;
  reference?: string | null;
}

// Writes exactly ONE item_ledger row per inventory item and updates running stock with
// accurate before/after values. Never duplicates; callers pass aggregated per-item changes.
async function applyMovement(
  slug: string,
  ctx: AccessCtx,
  p: RowFields
): Promise<{ ok: true; ledgerIds: string[] } | { ok: false; error: string }> {
  const invIds = [...new Set(p.changes.map((c) => c.inventory_item_id))];
  if (invIds.length === 0) return { ok: true, ledgerIds: [] };

  const stockRes = await supa(slug, {
    table: 'inventory_items',
    select: 'id, current_stock',
    in: ['id', invIds],
    limit: 5000,
  });
  if (!stockRes.ok) return { ok: false, error: stockRes.error || 'Failed to load stock' };

  const running = new Map<string, number>();
  for (const r of stockRes.data ?? []) running.set(r.id, Number(r.current_stock ?? 0));

  const ledgerIds: string[] = [];
  const updates: Promise<any>[] = [];

  for (const c of p.changes) {
    if (!running.has(c.inventory_item_id)) continue;
    const before = running.get(c.inventory_item_id) ?? 0;
    const after = Math.max(0, before + c.change);
    running.set(c.inventory_item_id, after);

    updates.push(
      supa(slug, {
        table: 'inventory_items',
        method: 'update',
        eq: ['id', c.inventory_item_id],
        body: { current_stock: after },
      })
    );

    const row: Record<string, unknown> = {
      inventory_item_id: c.inventory_item_id,
      movement_type: p.movementType,
      quantity_change: c.change,
      quantity_before: before,
      quantity_after: after,
      reference_order_id: p.orderId ?? null,
      unit_cost: p.unitCost ?? null,
      total_cost: p.totalCost ?? null,
      vendor: p.vendor ?? null,
      notes: p.notes ?? null,
      tenant_id: ctx.tenant.id,
      created_by: ctx.userId,
    };
    if (p.reference) row.reference = p.reference;

    const ins = await supa(slug, { table: 'item_ledger', method: 'insert', single: true, body: row });
    if (ins.ok && ins.data?.id) ledgerIds.push(ins.data.id);
  }

  await Promise.all(updates);
  return { ok: true, ledgerIds };
}

// Adjusts inventory current_stock WITHOUT writing any ledger rows. Used when amending an
// existing journal entry so that edits never produce duplicate ledger records.
async function adjustStockOnly(
  slug: string,
  changes: Movement[],
  orderId?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const invIds = [...new Set(changes.map((c) => c.inventory_item_id))];
  if (invIds.length === 0) return { ok: true };
  const stockRes = await supa(slug, {
    table: 'inventory_items',
    select: 'id, current_stock',
    in: ['id', invIds],
    limit: 5000,
  });
  if (!stockRes.ok) return { ok: false, error: stockRes.error || 'Failed to load stock' };
  const cur = new Map<string, number>();
  for (const r of stockRes.data ?? []) cur.set(r.id, Number(r.current_stock ?? 0));
  const ops = changes
    .filter((c) => cur.has(c.inventory_item_id))
    .map((c) => {
      const before = cur.get(c.inventory_item_id) ?? 0;
      const after = Math.max(0, before + c.change);
      cur.set(c.inventory_item_id, after);
      return supa(slug, { table: 'inventory_items', method: 'update', eq: ['id', c.inventory_item_id], body: { current_stock: after } });
    });
  await Promise.all(ops);
  return { ok: true };
}

async function computeCartChanges(
  slug: string,
  cart: SaleCartItem[]
): Promise<{ ok: true; changes: Movement[] } | { ok: false; error: string }> {
  const menuIds = [...new Set(cart.map((c) => c.id))];
  const ing = await supa(slug, {
    table: 'menu_item_ingredients',
    select: 'menu_item_id, inventory_item_id, quantity_used',
    in: ['menu_item_id', menuIds],
    limit: 5000,
  });
  if (!ing.ok) return { ok: false, error: ing.error || 'Failed to load recipes' };
  const net = new Map<string, number>();
  for (const item of cart) {
    for (const r of ing.data ?? []) {
      if (r.menu_item_id !== item.id) continue;
      const d = Number(r.quantity_used) * Number(item.quantity);
      net.set(r.inventory_item_id, (net.get(r.inventory_item_id) ?? 0) + d);
    }
  }
  const changes: Movement[] = [...net.entries()].map(([inventory_item_id, q]) => ({ inventory_item_id, change: -q }));
  return { ok: true, changes };
}

// ============================================================================
// NEW ORDER PLACEMENT — deduct inventory the moment an order is created (the "New
// Order" placement), recorded as a SALE ledger entry, idempotent.
// ============================================================================
export async function recordOrderSale(
  slug: string,
  orderId: string,
  cart: SaleCartItem[],
  createdBy?: string | null,
  device?: string | null
): Promise<OrderEditResult> {
  const ctx = await checkAccess(slug, true);
  if (!cart || cart.length === 0) return { ok: true, noop: true, message: 'No items to deduct' };

  // Idempotency: never deduct twice for the same order.
  const dup = await supa(slug, {
    table: 'item_ledger',
    select: 'id',
    filter: { reference_order_id: orderId, movement_type: 'sale' },
    limit: 1,
  });
  if (dup.ok && (dup.data?.length ?? 0) > 0) {
    return { ok: true, noop: true, message: 'Sale already recorded for this order' };
  }

  const c = await computeCartChanges(slug, cart);
  if (!c.ok) return { ok: false, error: c.error };
  if (c.changes.length === 0) return { ok: true, noop: true, message: 'No inventory recipes found' };

  const res = await applyMovement(slug, ctx, {
    movementType: 'sale',
    changes: c.changes,
    orderId,
    notes: `Order deduction: ${cart.length} line item(s)${device ? ' | ' + device : ''}`,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, ledgerIds: res.ledgerIds, message: `Deducted ${res.ledgerIds.length} inventory item(s)` };
}

// ============================================================================
// ORDER EDIT — only the diff between current and new items is moved. Restores are
// ORDER_EDIT_REMOVE (stock up), deductions are ORDER_EDIT_ADD (stock down).
// ============================================================================
export async function applyOrderEditInventory(
  slug: string,
  orderId: string,
  oldItems: OrderEditItem[],
  newItems: OrderEditItem[],
  device?: string | null
): Promise<OrderEditResult> {
  const ctx = await checkAccess(slug, true);

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

  const oldMap = new Map((oldItems ?? []).map((i) => [i.menu_item_id, Number(i.quantity)]));
  const newMap = new Map((newItems ?? []).map((i) => [i.menu_item_id, Number(i.quantity)]));
  const menuIds = new Set([...oldMap.keys(), ...newMap.keys()]);

  const adds: OrderEditItem[] = [];
  const removes: OrderEditItem[] = [];
  for (const id of menuIds) {
    const diff = (newMap.get(id) || 0) - (oldMap.get(id) || 0);
    if (diff > 0) adds.push({ menu_item_id: id, quantity: diff });
    else if (diff < 0) removes.push({ menu_item_id: id, quantity: -diff });
  }
  if (adds.length === 0 && removes.length === 0) return { ok: true, noop: true, message: 'No inventory change' };

  const menuList = [...new Set([...adds, ...removes].map((a) => a.menu_item_id))];
  const ing = await supa(slug, {
    table: 'menu_item_ingredients',
    select: 'menu_item_id, inventory_item_id, quantity_used',
    in: ['menu_item_id', menuList],
    limit: 5000,
  });
  if (!ing.ok) return { ok: false, error: ing.error };
  const recipes = ing.data ?? [];
  if (recipes.length === 0) return { ok: true, noop: true, message: 'No inventory recipes found' };

  // Build raw ops then aggregate per inventory item so edits produce exactly one row per item/type.
  const netReduce = new Map<string, number>(); // deduction => ORDER_EDIT_ADD
  const netRestore = new Map<string, number>(); // restore   => ORDER_EDIT_REMOVE
  for (const a of adds) {
    for (const r of recipes) {
      if (r.menu_item_id !== a.menu_item_id) continue;
      netReduce.set(r.inventory_item_id, (netReduce.get(r.inventory_item_id) ?? 0) + Number(r.quantity_used) * a.quantity);
    }
  }
  for (const rm of removes) {
    for (const r of recipes) {
      if (r.menu_item_id !== rm.menu_item_id) continue;
      netRestore.set(r.inventory_item_id, (netRestore.get(r.inventory_item_id) ?? 0) + Number(r.quantity_used) * rm.quantity);
    }
  }

  const addChanges: Movement[] = [...netReduce.entries()].map(([inventory_item_id, q]) => ({ inventory_item_id, change: -q }));
  const remChanges: Movement[] = [...netRestore.entries()].map(([inventory_item_id, q]) => ({ inventory_item_id, change: q }));

  const ledgerIds: string[] = [];
  if (addChanges.length > 0) {
    const r = await applyMovement(slug, ctx, {
      movementType: 'ORDER_EDIT_ADD',
      changes: addChanges,
      orderId,
      notes: `Order edit add${device ? ' | ' + device : ''}`,
    });
    if (!r.ok) return { ok: false, error: r.error };
    ledgerIds.push(...r.ledgerIds);
  }
  if (remChanges.length > 0) {
    const r = await applyMovement(slug, ctx, {
      movementType: 'ORDER_EDIT_REMOVE',
      changes: remChanges,
      orderId,
      notes: `Order edit remove${device ? ' | ' + device : ''}`,
    });
    if (!r.ok) return { ok: false, error: r.error };
    ledgerIds.push(...r.ledgerIds);
  }

  const inventoryDelta: { inventory_item_id: string; quantity: number }[] = [
    ...addChanges.map((c) => ({ inventory_item_id: c.inventory_item_id, quantity: -c.change })),
    ...remChanges.map((c) => ({ inventory_item_id: c.inventory_item_id, quantity: c.change })),
  ];

  const historyRes = await supa(slug, {
    table: 'order_edit_history',
    method: 'insert',
    single: true,
    body: {
      order_id: orderId,
      action: 'edit',
      branch_id: null,
      edited_by: ctx.userId,
      edited_at: new Date().toISOString(),
      items_added: adds,
      items_removed: removes,
      inventory_delta: inventoryDelta,
      ledger_reference: ledgerIds,
    },
  });
  const historyId = historyRes.ok && historyRes.data?.id ? historyRes.data.id : undefined;
  if (historyId && ledgerIds.length > 0) {
    await Promise.all(
      ledgerIds.map((id) =>
        supa(slug, { table: 'item_ledger', method: 'update', eq: ['id', id], body: { edit_history_id: historyId } })
      )
    );
  }
  return { ok: true, historyId, ledgerIds, message: `Adjusted ${ledgerIds.length} ledger entr${ledgerIds.length === 1 ? 'y' : 'ies'}` };
}

// ============================================================================
// ORDER CANCEL — restores ONLY what was actually deducted (the SALE entries), writes a
// SALE_CANCELLED row per item, and zeroes the original SALE rows so it can never double.
// ============================================================================
export async function restoreOrderInventoryOnCancel(
  slug: string,
  orderId: string,
  device?: string | null
): Promise<OrderEditResult> {
  const ctx = await checkAccess(slug, true);

  const hist = await supa(slug, {
    table: 'order_edit_history',
    select: 'id',
    filter: { order_id: orderId, action: 'cancel' },
    limit: 1,
  });
  if (hist.ok && (hist.data?.length ?? 0) > 0) {
    return { ok: true, noop: true, message: 'Inventory already restored for this cancel' };
  }

  const sales = await supa(slug, {
    table: 'item_ledger',
    select: 'id, inventory_item_id, quantity_change',
    filter: { reference_order_id: orderId, movement_type: 'sale' },
    limit: 5000,
  });
  if (!sales.ok) return { ok: false, error: sales.error };
  const rows: { id: string; inventory_item_id: string; quantity_change: number }[] = sales.data ?? [];
  if (rows.length === 0) return { ok: true, noop: true, message: 'No sale inventory recorded for this order' };

  const net = new Map<string, number>();
  for (const r of rows) net.set(r.inventory_item_id, (net.get(r.inventory_item_id) ?? 0) + Number(r.quantity_change));
  const changes: Movement[] = [...net.entries()].map(([inventory_item_id, q]) => ({ inventory_item_id, change: -q }));

  const res = await applyMovement(slug, ctx, {
    movementType: 'sale_cancelled',
    changes,
    orderId,
    notes: `Order cancelled — inventory restored${device ? ' | ' + device : ''}`,
  });
  if (!res.ok) return { ok: false, error: res.error };

  // Zero original sale rows so a re-cancel cannot double-restore. Keep for audit.
  await Promise.all(
    rows.map((r) => supa(slug, { table: 'item_ledger', method: 'update', eq: ['id', r.id], body: { quantity_change: 0 } }))
  );

  const inventoryDelta = changes.map((c) => ({ inventory_item_id: c.inventory_item_id, quantity: -c.change }));
  await supa(slug, {
    table: 'order_edit_history',
    method: 'insert',
    single: true,
    body: {
      order_id: orderId,
      action: 'cancel',
      branch_id: null,
      edited_by: ctx.userId,
      edited_at: new Date().toISOString(),
      items_added: [],
      items_removed: [],
      inventory_delta: inventoryDelta,
      ledger_reference: res.ledgerIds,
    },
  });

  return { ok: true, ledgerIds: res.ledgerIds, message: `Restored ${res.ledgerIds.length} inventory item(s)` };
}

// ============================================================================
// PURCHASES — journal the stock in as a PURCHASE row + expense, and support amending /
// cancelling the SAME journal row (never a duplicate ledger entry).
// ============================================================================
export async function createPurchaseEntry(slug: string, input: PurchaseInput, device?: string | null): Promise<OrderEditResult> {
  const ctx = await checkAccess(slug, true);
  const qty = Number(input.quantity);
  const unitCost = Number(input.unit_cost);
  if (!input.inventory_item_id || !(qty > 0)) return { ok: false, error: 'Enter a valid quantity' };
  if (isNaN(unitCost) || unitCost < 0) return { ok: false, error: 'Enter a valid unit cost' };

  const totalCost = qty * unitCost;
  const reference = `PUR-${Date.now().toString(36).toUpperCase()}`;
  const res = await applyMovement(slug, ctx, {
    movementType: 'purchase',
    changes: [{ inventory_item_id: input.inventory_item_id, change: qty }],
    unitCost,
    totalCost,
    vendor: input.vendor || null,
    notes: input.notes || null,
    reference,
  });
  if (!res.ok) return { ok: false, error: res.error };

  if (input.log_expense) {
    const item = await supa(slug, {
      table: 'inventory_items',
      select: 'name, unit',
      eq: ['id', input.inventory_item_id],
      single: true,
    });
    const name = item.ok && item.data?.name ? item.data.name : 'Item';
    const unit = item.ok && item.data?.unit ? item.data.unit : '';
    const desc = `Purchase: ${name} x${qty} ${unit}${input.vendor ? ` from ${input.vendor}` : ''}`;
    await supa(slug, {
      table: 'expenses',
      method: 'insert',
      body: {
        category: 'purchases',
        description: desc,
        amount: totalCost,
        expense_date: input.purchase_date || new Date().toISOString().split('T')[0],
        created_by: input.created_by || ctx.userId,
      },
    });
  }
  return { ok: true, ledgerIds: res.ledgerIds, message: 'Purchase recorded' };
}

export async function editPurchaseEntry(slug: string, ledgerId: string, input: PurchaseEditInput): Promise<OrderEditResult> {
  const ctx = await checkAccess(slug, true);
  const qty = Number(input.quantity);
  const unitCost = Number(input.unit_cost);
  if (!(qty > 0)) return { ok: false, error: 'Enter a valid quantity' };
  if (isNaN(unitCost) || unitCost < 0) return { ok: false, error: 'Enter a valid unit cost' };

  const existing = await supa(slug, {
    table: 'item_ledger',
    select: 'id, inventory_item_id, quantity_change, quantity_before, total_cost, unit_cost, vendor, notes, reference',
    eq: ['id', ledgerId],
    single: true,
  });
  if (!existing.ok || !existing.data) return { ok: false, error: 'Purchase entry not found' };
  const row = existing.data;

  const oldQty = Number(row.quantity_change);
  const diff = qty - oldQty;

  if (Math.abs(diff) > 1e-9) {
    const adj = await adjustStockOnly(slug, [{ inventory_item_id: row.inventory_item_id, change: diff }]);
    if (!adj.ok) return { ok: false, error: adj.error };
  }

  const before = Number(row.quantity_before ?? (Number(row.quantity_change ?? 0) > 0 ? 0 : 0));
  const after = before + qty;
  const update = await supa(slug, {
    table: 'item_ledger',
    method: 'update',
    eq: ['id', ledgerId],
    body: {
      quantity_change: qty,
      quantity_after: after,
      unit_cost: unitCost,
      total_cost: qty * unitCost,
      vendor: input.vendor || null,
      notes: input.notes || null,
    },
  });
  if (!update.ok) return { ok: false, error: update.error };
  return { ok: true, ledgerIds: [ledgerId], message: 'Purchase updated' };
}

export async function cancelPurchaseEntry(slug: string, ledgerId: string): Promise<OrderEditResult> {
  const ctx = await checkAccess(slug, true);
  const existing = await supa(slug, {
    table: 'item_ledger',
    select: 'id, inventory_item_id, quantity_change, quantity_before, vendor, reference, notes',
    eq: ['id', ledgerId],
    single: true,
  });
  if (!existing.ok || !existing.data) return { ok: false, error: 'Purchase entry not found' };
  const row = existing.data;
  const oldQty = Number(row.quantity_change);

  // Already reversed (or an adjustment row) — no-op.
  if (oldQty <= 0) return { ok: true, noop: true, message: 'Purchase already reversed' };

  // Reverse the stock without a new ledger row (stock only), then journal a PURCHASE_RETURN.
  await adjustStockOnly(slug, [{ inventory_item_id: row.inventory_item_id, change: -oldQty }]);
  await applyMovement(slug, ctx, {
    movementType: 'purchase_return',
    changes: [{ inventory_item_id: row.inventory_item_id, change: -oldQty }],
    unitCost: Number(row.total_cost && oldQty ? row.total_cost / oldQty : 0),
    totalCost: Number(row.total_cost),
    vendor: row.vendor || null,
    notes: 'Purchase cancelled',
    reference: row.reference || null,
  });

  await supa(slug, {
    table: 'item_ledger',
    method: 'update',
    eq: ['id', ledgerId],
    body: { quantity_change: 0, quantity_after: Number(row.quantity_before ?? 0) },
  });
  return { ok: true, message: 'Purchase cancelled' };
}