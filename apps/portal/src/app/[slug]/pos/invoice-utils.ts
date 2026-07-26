'use server';

import { auth } from '@clerk/nextjs/server';
import { getTenantBySlug, getTenantServiceCredentials, getStaffByTenant } from '@sat-sys/gateway-sdk';

async function getSvcKey(slug: string) {
  const creds = await getTenantServiceCredentials(slug);
  if (!creds) throw new Error('Service credentials not found');
  return creds.supabase_service_key;
}

async function checkAccess(slug: string) {
  const { userId } = auth();
  if (!userId) throw new Error('Unauthorized');
  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error('Tenant not found');
  const staff = await getStaffByTenant(tenant.id);
  const me = staff.find((s) => s.clerk_user_id === userId);
  if (me && (me.role === 'owner' || me.role === 'super_admin')) return { tenant, userId };
  if (!me) throw new Error('Forbidden: no access to this tenant');
  return { tenant, userId };
}

export async function generateInvoiceNumber(slug: string): Promise<string | null> {
  try {
    const { tenant, userId } = await checkAccess(slug);
    const key = await getSvcKey(slug);
    const baseUrl = tenant.supabase_url.replace(/\/+$/, '');

    // Get invoice prefix from settings
    const settingsUrl = `${baseUrl}/rest/v1/settings?select=fiscal_invoice_prefix&limit=1`;
    const settingsRes = await fetch(settingsUrl, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const settingsData = settingsRes.ok ? await settingsRes.json() : [];
    const prefix = settingsData?.[0]?.fiscal_invoice_prefix || 'INV-';

    // Get the last invoice number created
    const ordersUrl = `${baseUrl}/rest/v1/orders?select=invoice_number&invoice_number=not.is.null&order=created_at.desc&limit=1`;
    const ordersRes = await fetch(ordersUrl, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const orderData = ordersRes.ok ? await ordersRes.json() : [];

    const lastNum = orderData?.[0]?.invoice_number
      ? parseInt(String(orderData[0].invoice_number).replace(prefix, ''), 10) || 0
      : 0;

    return `${prefix}${String(lastNum + 1).padStart(5, '0')}`;
  } catch (e) {
    console.error('[generateInvoiceNumber]', e);
    return null;
  }
}
