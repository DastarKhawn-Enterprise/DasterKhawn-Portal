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
}

export async function getTenantBySlug(slug: string): Promise<TenantResult | null> {
  const client = getGatewayClient();
  const { data, error } = await client
    .from('tenants')
    .select('id, slug, brand_name, supabase_url, supabase_anon_key, status, theme_config')
    .eq('slug', slug)
    .single();

  if (error || !data) return null;
  return data as TenantResult;
}

export async function getTenantById(id: string): Promise<TenantResult | null> {
  const client = getGatewayClient();
  const { data, error } = await client
    .from('tenants')
    .select('id, slug, brand_name, supabase_url, supabase_anon_key, status, theme_config')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as TenantResult;
}

export async function getAllTenants(): Promise<TenantResult[]> {
  const client = getGatewayClient();
  const { data, error } = await client
    .from('tenants')
    .select('id, slug, brand_name, supabase_url, supabase_anon_key, status, theme_config');

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
    .select('id, slug, brand_name, supabase_url, supabase_anon_key, status, theme_config, created_at, billing(id, payment_status, last_paid_at, due_date, amount_due)');

  if (error) return [];
  return (data as any[]).map((t) => ({
    id: t.id,
    slug: t.slug,
    brand_name: t.brand_name,
    supabase_url: t.supabase_url,
    supabase_anon_key: t.supabase_anon_key,
    status: t.status,
    theme_config: t.theme_config,
    created_at: t.created_at,
    billing: t.billing?.[0] ?? null,
  }));
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


