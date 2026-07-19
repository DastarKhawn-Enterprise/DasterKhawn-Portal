import 'server-only';
import { createClient } from '@supabase/supabase-js';

function getGatewayClient() {
  const url = process.env.GATEWAY_SUPABASE_URL;
  const serviceKey = process.env.GATEWAY_SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new Error('GATEWAY_SUPABASE_URL and GATEWAY_SUPABASE_SERVICE_KEY must be set');
  }
  return createClient(url, serviceKey);
}

export interface ThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  fontFamily: string;
}

export const PERMISSIONS = {
  owner: [
    'orders:create',
    'orders:view',
    'orders:update',
    'menu:view',
    'menu:edit',
    'reports:view',
    'staff:manage',
    'settings:edit',
  ],
  staff: [
    'orders:create',
    'orders:view',
    'orders:update',
    'menu:view',
  ],
  customer: [
    'orders:create:own',
    'orders:view:own',
  ],
} as const;

export type Role = keyof typeof PERMISSIONS;
export type Permission = typeof PERMISSIONS[Role][number];

export interface TenantResult {
  id: string;
  slug: string;
  brand_name: string;
  supabase_url: string;
  supabase_anon_key: string;
  status: 'active' | 'suspended';
  theme_config: ThemeConfig;
  enabled_modules?: Record<string, boolean>;
}

export async function getTenantBySlug(slug: string): Promise<TenantResult | null> {
  const client = getGatewayClient();
  const { data, error } = await client
    .from('tenants')
    .select('id, slug, brand_name, supabase_url, supabase_anon_key, status, theme_config, enabled_modules')
    .eq('slug', slug)
    .single();

  if (error || !data) return null;
  return data as TenantResult;
}

export async function getTenantById(id: string): Promise<TenantResult | null> {
  const client = getGatewayClient();
  const { data, error } = await client
    .from('tenants')
    .select('id, slug, brand_name, supabase_url, supabase_anon_key, status, theme_config, enabled_modules')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as TenantResult;
}

export async function getAllTenants(): Promise<TenantResult[]> {
  const client = getGatewayClient();
  const { data, error } = await client
    .from('tenants')
    .select('id, slug, brand_name, supabase_url, supabase_anon_key, status, theme_config, enabled_modules');

  if (error) return [];
  return data as TenantResult[];
}

export interface TenantWithBilling extends TenantResult {
  created_at: string;
  billing: {
    payment_status: string;
    last_paid_at: string | null;
    due_date: string | null;
    amount_due: number | null;
  } | null;
}

export async function getAllTenantsWithBilling(): Promise<TenantWithBilling[]> {
  const client = getGatewayClient();
  const { data, error } = await client
    .from('tenants')
    .select('id, slug, brand_name, supabase_url, supabase_anon_key, status, theme_config, enabled_modules, created_at, billing(id, payment_status, last_paid_at, due_date, amount_due)');

  if (error) return [];
  return (data as any[]).map((t) => ({
    id: t.id,
    slug: t.slug,
    brand_name: t.brand_name,
    supabase_url: t.supabase_url,
    supabase_anon_key: t.supabase_anon_key,
    status: t.status,
    theme_config: t.theme_config,
    enabled_modules: t.enabled_modules,
    created_at: t.created_at,
    billing: t.billing?.[0] ?? null,
  }));
}

export const DEFAULT_ENABLED_MODULES: Record<string, boolean> = {
  dashboard: true, orders: true, dine_in: true, take_away: true,
  delivery: true, drive_thru: true, third_party: true,
  reservations: true, menu: true, inventory: true,
  customers: true, reports: true, expenses: true, staff: true,
  settings: true, loyalty_points: true,
};

export async function getTenantEnabledModules(tenantId: string): Promise<Record<string, boolean>> {
  try {
    const client = getGatewayClient();
    const { data, error } = await client
      .from('tenants')
      .select('enabled_modules')
      .eq('id', tenantId)
      .single();
    if (error || !data) return { ...DEFAULT_ENABLED_MODULES };
    const modules = (data as any).enabled_modules;
    return modules && typeof modules === 'object' ? { ...DEFAULT_ENABLED_MODULES, ...modules } : { ...DEFAULT_ENABLED_MODULES };
  } catch {
    return { ...DEFAULT_ENABLED_MODULES };
  }
}

export async function updateTenantStatus(
  id: string,
  status: 'active' | 'suspended',
): Promise<{ success: boolean; error?: string }> {
  const client = getGatewayClient();
  const { error } = await client.from('tenants').update({ status }).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updateTenantModules(
  id: string,
  enabledModules: Record<string, boolean>,
): Promise<{ success: boolean; error?: string }> {
  const client = getGatewayClient();
  const { error } = await client
    .from('tenants')
    .update({ enabled_modules: enabledModules as any })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updateTenantTheme(
  id: string,
  themeConfig: ThemeConfig,
): Promise<{ success: boolean; error?: string }> {
  const client = getGatewayClient();
  const { error } = await client
    .from('tenants')
    .update({ theme_config: themeConfig as any })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getTenantServiceCredentials(slug: string): Promise<{ supabase_service_key: string } | null> {
  const client = getGatewayClient();
  const { data, error } = await client
    .from('tenants')
    .select('supabase_service_key')
    .eq('slug', slug)
    .single();

  if (error || !data) return null;
  return { supabase_service_key: (data as { supabase_service_key: string }).supabase_service_key };
}

export interface MenuItemTemplate {
  name: string;
  description: string | null;
  category: string | null;
  available: boolean;
}

export async function insertTenant(
  data: {
    slug: string;
    brand_name: string;
    supabase_url: string;
    supabase_anon_key: string;
    supabase_service_key: string;
    theme_config: ThemeConfig;
    enabled_modules: Record<string, boolean>;
  },
): Promise<{ success: boolean; error?: string; tenantId?: string }> {
  const client = getGatewayClient();
  const { data: inserted, error } = await client
    .from('tenants')
    .insert({
      slug: data.slug,
      brand_name: data.brand_name,
      supabase_url: data.supabase_url,
      supabase_anon_key: data.supabase_anon_key,
      supabase_service_key: data.supabase_service_key,
      theme_config: data.theme_config as any,
      enabled_modules: data.enabled_modules as any,
      status: 'active',
      owner_clerk_id: '',
    })
    .select('id')
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, tenantId: inserted?.id };
}

export async function updateTenantOwnerClerkId(
  tenantId: string,
  clerkUserId: string,
): Promise<{ success: boolean; error?: string }> {
  const client = getGatewayClient();
  const { error } = await client
    .from('tenants')
    .update({ owner_clerk_id: clerkUserId })
    .eq('id', tenantId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getTenantMenuItemsForTemplate(
  slug: string,
): Promise<MenuItemTemplate[]> {
  try {
    const tenant = await getTenantBySlug(slug);
    if (!tenant) return [];

    const creds = await getTenantServiceCredentials(slug);
    if (!creds) return [];

    const client = createClient(tenant.supabase_url, creds.supabase_service_key, {
      auth: { persistSession: false },
    });

    const { data, error } = await client
      .from('menu_items')
      .select('name, description, category, available')
      .order('name');

    if (error || !data) return [];
    return data as MenuItemTemplate[];
  } catch {
    return [];
  }
}

export interface StaffRoleRow {
  id: string;
  clerk_user_id: string;
  tenant_id: string;
  role: string;
  permissions: string[];
  created_at: string;
}

export async function getStaffByTenant(tenantId: string): Promise<StaffRoleRow[]> {
  const client = getGatewayClient();
  const { data, error } = await client
    .from('staff_roles')
    .select('id, clerk_user_id, tenant_id, role, permissions, created_at')
    .eq('tenant_id', tenantId);

  if (error) return [];
  return data as StaffRoleRow[];
}

export async function addStaffRole(
  clerkUserId: string,
  tenantId: string,
  role: string,
  permissions: string[],
): Promise<{ success: boolean; error?: string }> {
  const client = getGatewayClient();
  const { error } = await client.from('staff_roles').insert({
    clerk_user_id: clerkUserId,
    tenant_id: tenantId,
    role,
    permissions,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function removeStaffRole(
  clerkUserId: string,
  tenantId: string,
): Promise<{ success: boolean; error?: string }> {
  const client = getGatewayClient();
  const { error } = await client
    .from('staff_roles')
    .delete()
    .eq('clerk_user_id', clerkUserId)
    .eq('tenant_id', tenantId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}


