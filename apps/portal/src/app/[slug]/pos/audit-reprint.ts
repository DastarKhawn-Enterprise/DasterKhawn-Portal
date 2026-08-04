'use server';

import { auth } from '@clerk/nextjs/server';
import { getTenantBySlug, getTenantServiceCredentials, getStaffByTenant } from '@sat-sys/gateway-sdk';

interface ReprintOrder {
  id: string;
  order_number?: number | string | null;
}

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
  if (me && (me.role === 'owner' || me.role === 'super_admin')) return { tenant, userId };
  if (!me) throw new Error('Forbidden: no access to this tenant');
  if (write && !me.permissions.includes('orders:create')) throw new Error('Forbidden: missing orders:create');
  return { tenant, userId };
}

/**
 * Record a non-financial "invoice reprinted" audit entry.
 *
 * This only writes an `audit_logs` row — it must NEVER touch orders, payments,
 * invoices, ledger, inventory or accounts. Reprints are intentionally
 * idempotent and create no financial transaction.
 */
export async function recordInvoiceReprint(
  slug: string,
  order: ReprintOrder,
  device?: string | null,
): Promise<void> {
  try {
    const { tenant, userId } = await checkAccess(slug, true);
    const key = await getSvcKey(slug);
    const url = `${tenant.supabase_url.replace(/\/+$/, '')}/rest/v1/audit_logs`;
    await fetch(url, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        action: 'invoice_reprinted',
        order_id: order.id,
        order_number: order.order_number ?? null,
        created_by: userId,
        device: device ?? null,
      }),
    });
  } catch (e) {
    console.error('[invoice audit] failed to record reprint', e);
  }
}