'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { getTenantBySlug, getTenantServiceCredentials } from '@sat-sys/gateway-sdk';
import { revalidatePath } from 'next/cache';

interface RestaurantSettings {
  restaurant_name?: string;
  restaurant_type?: string;
  currency?: string;
  default_language?: string;
  timezone?: string;
  date_format?: string;
  time_format?: string;
  default_landing_page?: string;
  dark_mode?: boolean;
  email?: string;
  phone?: string;
  secondary_phone?: string;
  additional_emails?: string;
  website?: string;
  business_name?: string;
  business_type?: string;
  ntn?: string;
  tagline?: string;
  description?: string;
  tax_name?: string;
  tax_rate?: number;
  tax_enabled?: boolean;
  tax_inclusive?: boolean;
  service_charge_enabled?: boolean;
  service_charge_name?: string;
  service_charge_rate?: number;
  service_charge_dine_in?: boolean;
  service_charge_takeaway?: boolean;
  service_charge_delivery?: boolean;
  service_charge_drive_thru?: boolean;
  tax_service_charge?: boolean;
  currency_symbol?: string;
  receipt_header?: string;
  receipt_footer_text?: string;
  show_logo?: boolean;
  show_branch_address?: boolean;
  show_phone?: boolean;
  show_ntn?: boolean;
  show_cashier_name?: boolean;
  show_payment_method?: boolean;
  show_tax_breakdown?: boolean;
  show_service_charge?: boolean;
  thank_you_message?: string;
  default_order_status?: string;
  auto_send_to_kitchen?: boolean;
  require_customer_delivery?: boolean;
  require_customer_credit?: boolean;
  allow_edit_before_payment?: boolean;
  allow_edit_after_payment?: boolean;
  auto_print_receipt?: boolean;
  default_payment_method?: string;
  low_stock_alerts?: boolean;
  default_low_stock_threshold?: number;
  allow_negative_stock?: boolean;
  auto_deduct_ingredients?: boolean;
  write_item_ledger?: boolean;
}

interface BranchInput {
  id?: string;
  name: string;
  address?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  phone?: string;
  email?: string;
  is_default?: boolean;
  is_active?: boolean;
}

interface BusinessHoursInput {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

async function getServiceKey(slug: string) {
  const creds = await getTenantServiceCredentials(slug);
  if (!creds) throw new Error('Service credentials not found');
  return creds.supabase_service_key;
}

async function checkEditAccess(slug: string) {
  const { userId } = auth();
  if (!userId) throw new Error('Unauthorized');

  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error('Tenant not found');

  const { getStaffByTenant } = await import('@sat-sys/gateway-sdk');
  const staff = await getStaffByTenant(tenant.id);
  const me = staff.find((s) => s.clerk_user_id === userId);

  if (me && (me.role === 'owner' || me.role === 'super_admin')) {
    return { tenant, userId };
  }
  if (me && me.permissions.includes('settings:edit')) {
    return { tenant, userId };
  }

  const user = await currentUser();
  const role = (user?.publicMetadata as Record<string, any> | undefined)?.role;
  if (role === 'super_admin') return { tenant, userId };

  throw new Error('Forbidden: missing settings:edit');
}

export async function loadSettings(slug: string) {
  const { tenant } = await checkEditAccess(slug);
  const key = await getServiceKey(slug);
  const baseUrl = tenant.supabase_url.replace(/\/+$/, '');

  const [settingsRes, branchesRes, hoursRes] = await Promise.all([
    fetch(`${baseUrl}/rest/v1/settings?select=*&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    }),
    fetch(`${baseUrl}/rest/v1/branches?select=*&order=name.asc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    }),
    fetch(`${baseUrl}/rest/v1/business_hours?select=*&order=day_of_week.asc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    }),
  ]);

  const settings = settingsRes.ok ? (await settingsRes.json())[0] || {} : {};
  const branches = branchesRes.ok ? await branchesRes.json() : [];
  const businessHours = hoursRes.ok ? await hoursRes.json() : [];

  return { settings, branches, businessHours };
}

export async function saveSettings(
  slug: string,
  data: {
    restaurant: RestaurantSettings;
  },
) {
  const { tenant, userId } = await checkEditAccess(slug);
  const key = await getServiceKey(slug);
  const baseUrl = tenant.supabase_url.replace(/\/+$/, '');

  // Re-read current settings to merge enabled_modules
  const curRes = await fetch(`${baseUrl}/rest/v1/settings?select=id,enabled_modules&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const curSettings = curRes.ok ? (await curRes.json())[0] : null;
  if (!curSettings) throw new Error('Settings not found');

  const currentModules = curSettings.enabled_modules || {};

  const restaurant = data.restaurant;

  // Map tax/currency/receipt to top-level columns (existing schema)
  const topLevel: Record<string, any> = {
    tax_enabled: !!restaurant.tax_enabled,
    tax_rate: Number(restaurant.tax_rate) || 0,
    currency_symbol: restaurant.currency_symbol || 'Rs.',
    receipt_footer_text: restaurant.receipt_footer_text || 'Thank you for your order!',
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };

  // Merge restaurant settings into enabled_modules.restaurant
  const mergedModules = {
    ...currentModules,
    modules: currentModules.modules || {},
    restaurant: {
      ...restaurant,
      tax_enabled: undefined, // stored at top level
      tax_rate: undefined,
      currency_symbol: undefined,
      receipt_footer_text: undefined,
    },
  };

  const saveRes = await fetch(
    `${baseUrl}/rest/v1/settings?id=eq.${curSettings.id}`,
    {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...topLevel,
        enabled_modules: mergedModules,
      }),
    },
  );

  if (!saveRes.ok) {
    const txt = await saveRes.text();
    throw new Error(`Save failed: ${txt.slice(0, 200)}`);
  }

  revalidatePath(`/${slug}/pos/settings`);
  return { success: true };
}

export async function saveBranch(
  slug: string,
  branch: BranchInput,
) {
  const { tenant } = await checkEditAccess(slug);
  const key = await getServiceKey(slug);
  const baseUrl = tenant.supabase_url.replace(/\/+$/, '');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  if (branch.is_default) {
    await fetch(`${baseUrl}/rest/v1/branches?is_default=eq.true`, {
      method: 'PATCH', headers, body: JSON.stringify({ is_default: false }),
    });
  }

  if (branch.id) {
    const res = await fetch(`${baseUrl}/rest/v1/branches?id=eq.${branch.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({
        name: branch.name, address: branch.address, city: branch.city,
        province: branch.province, postal_code: branch.postal_code,
        country: branch.country, phone: branch.phone, email: branch.email,
        is_default: !!branch.is_default, updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(t.slice(0, 200)); }
  } else {
    const res = await fetch(`${baseUrl}/rest/v1/branches`, {
      method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        name: branch.name, address: branch.address, city: branch.city,
        province: branch.province, postal_code: branch.postal_code,
        country: branch.country || 'Pakistan', phone: branch.phone, email: branch.email,
        is_default: !!branch.is_default,
      }),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(t.slice(0, 200)); }
  }

  revalidatePath(`/${slug}/pos/settings`);
  return { success: true };
}

export async function deleteBranch(slug: string, branchId: string) {
  const { tenant } = await checkEditAccess(slug);
  const key = await getServiceKey(slug);
  const res = await fetch(`${tenant.supabase_url.replace(/\/+$/, '')}/rest/v1/branches?id=eq.${branchId}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) { const t = await res.text(); throw new Error(t.slice(0, 200)); }
  revalidatePath(`/${slug}/pos/settings`);
  return { success: true };
}

export async function saveBusinessHours(
  slug: string,
  hours: BusinessHoursInput[],
) {
  const { tenant } = await checkEditAccess(slug);
  const key = await getServiceKey(slug);
  const baseUrl = tenant.supabase_url.replace(/\/+$/, '');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  for (const h of hours) {
    const existing = await fetch(`${baseUrl}/rest/v1/business_hours?day_of_week=eq.${h.day_of_week}&select=id`, {
      method: 'GET', headers,
    });
    const rows = existing.ok ? await existing.json() : [];
    const body = {
      day_of_week: h.day_of_week,
      open_time: h.open_time,
      close_time: h.close_time,
      is_closed: h.is_closed,
      updated_at: new Date().toISOString(),
    };
    if (rows.length > 0) {
      await fetch(`${baseUrl}/rest/v1/business_hours?id=eq.${rows[0].id}`, {
        method: 'PATCH', headers, body: JSON.stringify(body),
      });
    } else {
      await fetch(`${baseUrl}/rest/v1/business_hours`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
    }
  }

  revalidatePath(`/${slug}/pos/settings`);
  return { success: true };
}
