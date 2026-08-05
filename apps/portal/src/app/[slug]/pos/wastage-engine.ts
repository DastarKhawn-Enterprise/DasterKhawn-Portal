'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { getTenantBySlug, getStaffByTenant } from '@sat-sys/gateway-sdk';
import { supa } from './supa-query';

export interface WastageInput {
  inventory_item_id: string;
  /** Positive quantity being written off. */
  quantity: number;
  unit?: string | null;
  reason: string;
  category?: string | null;
  employee?: string | null;
  branch?: string | null;
  notes?: string | null;
  /** ISO timestamp for when the waste occurred (defaults to now). */
  occurred_at?: string | null;
}

export type WastageResult =
  | { ok: true; ledgerId?: string; noop?: boolean; message?: string }
  | { ok: false; error: string };

interface AccessCtx {
  tenant: { id: string; supabase_url: string; slug: string };
  userId: string;
}

async function checkAccess(slug: string): Promise<AccessCtx> {
  const { userId } = auth();
  if (!userId) throw new Error('Unauthorized');
  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error('Tenant not found');
  const staff = await getStaffByTenant(tenant.id);
  const me = staff.find((s) => s.clerk_user_id === userId);
  if (me && (me.role === 'owner' || me.role === 'super_admin')) {
    return { tenant: { id: tenant.id, supabase_url: tenant.supabase_url, slug: tenant.slug }, userId };
  }
  if (me) {
    // Module gating is enforced at the route layer (Inventory module). Any assigned
    // staff member working under the enabled Inventory module may manage wastage.
    return { tenant: { id: tenant.id, supabase_url: tenant.supabase_url, slug: tenant.slug }, userId };
  }
  const user = await currentUser();
  const role = (user?.publicMetadata as Record<string, any> | undefined)?.role;
  if (role === 'super_admin') return { tenant: { id: tenant.id, supabase_url: tenant.supabase_url, slug: tenant.slug }, userId };
  throw new Error('Forbidden: no access to this tenant');
}

async function latestUnitCost(slug: string, inventoryItemId: string): Promise<number> {
  const res = await supa(slug, {
    table: 'item_ledger',
    select: 'unit_cost',
    eq: ['inventory_item_id', inventoryItemId],
    in: ['movement_type', ['purchase']],
    order: { column: 'created_at', ascending: false },
    limit: 1,
  });
  if (!res.ok || !res.data?.[0]?.unit_cost) return 0;
  const cost = Number(res.data[0].unit_cost);
  return Number.isFinite(cost) ? Math.max(0, cost) : 0;
}

function reasonNotes(reason: string, category: string | null | undefined, employee: string | null | undefined, notes: string | null | undefined): string {
  const parts: string[] = ['Wastage'];
  if (reason) parts.push(`Reason: ${reason}`);
  if (category) parts.push(`Category: ${category}`);
  if (employee) parts.push(`Employee: ${employee}`);
  if (notes) parts.push(`Notes: ${notes}`);
  return parts.join(' · ');
}

export async function createWastageEntry(slug: string, input: WastageInput): Promise<WastageResult> {
  const ctx = await checkAccess(slug);
  const qty = Number(input.quantity);
  if (!input.inventory_item_id || !(qty > 0)) return { ok: false, error: 'Enter a valid quantity' };
  if (!input.reason) return { ok: false, error: 'Select a reason' };

  const stockRes = await supa(slug, {
    table: 'inventory_items',
    select: 'current_stock, unit',
    eq: ['id', input.inventory_item_id],
    single: true,
  });
  if (!stockRes.ok || !stockRes.data) return { ok: false, error: 'Inventory item not found' };
  const before = Number(stockRes.data.current_stock ?? 0);
  const unit = input.unit || stockRes.data.unit || '';
  const after = Math.max(0, before - qty);

  const unitCost = await latestUnitCost(slug, input.inventory_item_id);
  const totalCost = qty * unitCost;
  const reference = `WST-${Date.now().toString(36).toUpperCase()}`;
  const occurredAt = input.occurred_at || new Date().toISOString();

  const stockUpdate = await supa(slug, {
    table: 'inventory_items',
    method: 'update',
    eq: ['id', input.inventory_item_id],
    body: { current_stock: after },
  });
  if (!stockUpdate.ok) return { ok: false, error: stockUpdate.error || 'Failed to update stock' };

  const ins = await supa(slug, {
    table: 'item_ledger',
    method: 'insert',
    single: true,
    body: {
      inventory_item_id: input.inventory_item_id,
      movement_type: 'wastage',
      quantity_change: -qty,
      quantity_before: before,
      quantity_after: after,
      unit_cost: unitCost || null,
      total_cost: unitCost ? totalCost : null,
      reference,
      notes: reasonNotes(input.reason, input.category, input.employee, input.notes),
      branch_name: input.branch || null,
      tenant_id: ctx.tenant.id,
      created_by: input.employee || ctx.userId,
      created_at: occurredAt,
    },
  });
  if (!ins.ok) return { ok: false, error: ins.error || 'Failed to record wastage ledger entry' };

  return { ok: true, ledgerId: ins.data?.id, message: `Wastage recorded (${qty} ${unit})` };
}

export async function editWastageEntry(slug: string, ledgerId: string, input: WastageInput): Promise<WastageResult> {
  const ctx = await checkAccess(slug);
  const qty = Number(input.quantity);
  if (!(qty > 0)) return { ok: false, error: 'Enter a valid quantity' };
  if (!input.reason) return { ok: false, error: 'Select a reason' };

  const existing = await supa(slug, {
    table: 'item_ledger',
    select: 'id, inventory_item_id, quantity_change, quantity_before, unit_cost, reference',
    eq: ['id', ledgerId],
    single: true,
  });
  if (!existing.ok || !existing.data) return { ok: false, error: 'Wastage entry not found' };
  const row = existing.data;
  const oldQty = Number(row.quantity_change);

  const diff = Math.abs(oldQty) - qty;
  if (Math.abs(diff) > 1e-9) {
    const stockRes = await supa(slug, {
      table: 'inventory_items',
      select: 'current_stock',
      eq: ['id', row.inventory_item_id],
      single: true,
    });
    if (!stockRes.ok || !stockRes.data) return { ok: false, error: 'Inventory item not found' };
    const updated = Math.max(0, Number(stockRes.data.current_stock) + diff);
    const upd = await supa(slug, { table: 'inventory_items', method: 'update', eq: ['id', row.inventory_item_id], body: { current_stock: updated } });
    if (!upd.ok) return { ok: false, error: upd.error || 'Failed to update stock' };
  }

  const unitCost = await latestUnitCost(slug, row.inventory_item_id);
  const after = Math.max(0, Number(row.quantity_before ?? 0) - qty);
  const update = await supa(slug, {
    table: 'item_ledger',
    method: 'update',
    eq: ['id', ledgerId],
    body: {
      quantity_change: -qty,
      quantity_after: after,
      unit_cost: unitCost || null,
      total_cost: unitCost ? qty * unitCost : null,
      notes: reasonNotes(input.reason, input.category, input.employee, input.notes),
      branch_name: input.branch || null,
      created_by: input.employee || ctx.userId,
    },
  });
  if (!update.ok) return { ok: false, error: update.error || 'Failed to update entry' };
  return { ok: true, ledgerId, message: 'Wastage entry updated' };
}

export async function cancelWastageEntry(slug: string, ledgerId: string): Promise<WastageResult> {
  await checkAccess(slug);
  const existing = await supa(slug, {
    table: 'item_ledger',
    select: 'id, inventory_item_id, quantity_change, quantity_before',
    eq: ['id', ledgerId],
    single: true,
  });
  if (!existing.ok || !existing.data) return { ok: false, error: 'Wastage entry not found' };
  const row = existing.data;
  const qty = Math.abs(Number(row.quantity_change));
  if (qty <= 0) return { ok: true, noop: true, message: 'Wastage already cancelled' };

  // Reverse the stock reduction (waste quantity is returned to inventory).
  const stockRes = await supa(slug, { table: 'inventory_items', select: 'current_stock', eq: ['id', row.inventory_item_id], single: true });
  if (stockRes.ok && stockRes.data) {
    const updated = Number(stockRes.data.current_stock) + qty;
    await supa(slug, { table: 'inventory_items', method: 'update', eq: ['id', row.inventory_item_id], body: { current_stock: updated } });
  }

  const update = await supa(slug, {
    table: 'item_ledger',
    method: 'update',
    eq: ['id', ledgerId],
    body: {
      quantity_change: 0,
      quantity_after: Number(row.quantity_before ?? 0),
      notes: `${row.notes ? row.notes + ' · ' : ''}Cancelled: stock returned`,
    },
  });
  if (!update.ok) return { ok: false, error: update.error || 'Failed to cancel entry' };
  return { ok: true, message: 'Wastage entry cancelled, stock returned' };
}