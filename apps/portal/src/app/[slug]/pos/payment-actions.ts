'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { getTenantBySlug, getTenantServiceCredentials, getStaffByTenant } from '@sat-sys/gateway-sdk';

async function getSvcKey(slug: string) {
  const creds = await getTenantServiceCredentials(slug);
  if (!creds) throw new Error('Service credentials not found');
  return creds.supabase_service_key;
}

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
    const required = 'orders:create';
    if (!me.permissions.includes(required)) throw new Error('Forbidden: missing ' + required);
  }
  return { tenant, userId };
}

async function callRpc(slug: string, fn: string, params: Record<string, any>) {
  const { tenant } = await checkAccess(slug, true);
  const key = await getSvcKey(slug);
  const url = `${tenant.supabase_url.replace(/\/+$/, '')}/rest/v1/rpc/${encodeURIComponent(fn)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status}: ${txt.slice(0, 300)}`);
  }
  return res.json();
}

export interface PaymentInput {
  account_id: string;
  payment_method: string;
  amount: number;
  cash_received?: number | null;
  change_due?: number | null;
  reference_number?: string | null;
  notes?: string | null;
  customer_id?: string | null;
  idempotency_key?: string | null;
}

export async function processPayments(
  slug: string,
  orderId: string,
  payments: PaymentInput[],
) {
  const { userId } = await checkAccess(slug, true);
  return callRpc(slug, 'process_payments', {
    p_order_id: orderId,
    p_payments: payments.map((p) => ({
      account_id: p.account_id,
      payment_method: p.payment_method,
      amount: p.amount,
      cash_received: p.cash_received ?? null,
      change_due: p.change_due ?? null,
      reference_number: p.reference_number ?? null,
      notes: p.notes ?? null,
      customer_id: p.customer_id ?? null,
      idempotency_key: p.idempotency_key ?? null,
    })),
    p_created_by: userId,
  });
}

export async function processExpense(
  slug: string,
  accountId: string,
  category: string,
  description: string | null,
  amount: number,
  expenseDate: string,
) {
  const { userId } = await checkAccess(slug, true);
  return callRpc(slug, 'process_expense', {
    p_account_id: accountId,
    p_category: category,
    p_description: description,
    p_amount: amount,
    p_expense_date: expenseDate,
    p_created_by: userId,
  });
}

export async function processTransfer(
  slug: string,
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  referenceNumber?: string | null,
  description?: string | null,
) {
  const { userId } = await checkAccess(slug, true);
  return callRpc(slug, 'process_transfer', {
    p_from_account_id: fromAccountId,
    p_to_account_id: toAccountId,
    p_amount: amount,
    p_reference_number: referenceNumber ?? null,
    p_description: description ?? null,
    p_created_by: userId,
  });
}

export async function processRefund(
  slug: string,
  orderId: string,
  accountId: string,
  amount: number,
  reason: string,
) {
  const { userId } = await checkAccess(slug, true);
  return callRpc(slug, 'process_refund', {
    p_order_id: orderId,
    p_account_id: accountId,
    p_amount: amount,
    p_reason: reason,
    p_created_by: userId,
  });
}

export interface AdjustmentInput {
  account_id: string;
  adjustment_type: 'increase' | 'decrease' | 'set_exact';
  amount?: number;
  target_balance?: number;
  reason: string;
  reference_number?: string | null;
  notes?: string | null;
  adjustment_date?: string;
}

export async function processAdjustment(
  slug: string,
  input: AdjustmentInput,
) {
  const { userId } = await checkAccess(slug, true);
  return callRpc(slug, 'process_adjustment', {
    p_account_id: input.account_id,
    p_adjustment_type: input.adjustment_type,
    p_amount: input.amount ?? null,
    p_target_balance: input.target_balance ?? null,
    p_reason: input.reason,
    p_reference_number: input.reference_number ?? null,
    p_notes: input.notes ?? null,
    p_adjustment_date: input.adjustment_date ?? null,
    p_created_by: userId,
    p_idempotency_key: `${input.account_id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  });
}
