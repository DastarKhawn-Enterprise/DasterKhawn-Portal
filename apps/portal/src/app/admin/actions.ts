'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import {
  updateTenantStatus,
  updateTenantTheme,
  getTenantBySlug,
  getTenantServiceCredentials,
  type ThemeConfig,
} from '@sat-sys/gateway-sdk';
import { createClient } from '@supabase/supabase-js';

async function requireSuperAdmin() {
  const { userId } = auth();
  if (!userId) throw new Error('Not authenticated');

  // Use currentUser() instead of sessionClaims to avoid stale JWT claims
  const user = await currentUser();
  const metadata = (user?.publicMetadata ?? {}) as Record<string, any>;
  if (metadata.role !== 'super_admin') {
    throw new Error('Forbidden: super_admin role required');
  }
}

export async function toggleTenantStatus(
  tenantId: string,
  currentStatus: 'active' | 'suspended',
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    return await updateTenantStatus(tenantId, newStatus);
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function saveTenantTheme(
  tenantId: string,
  theme: ThemeConfig,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
    return await updateTenantTheme(tenantId, theme);
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getRevenueStats(
  slug: string,
  dateRange: 'today' | 'week' | 'month' | 'all',
): Promise<{
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  error?: string;
}> {
  try {
    await requireSuperAdmin();

    const tenant = await getTenantBySlug(slug);
    if (!tenant) return { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0, error: 'Tenant not found' };

    const creds = await getTenantServiceCredentials(slug);
    if (!creds) return { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0, error: 'Service credentials not found' };

    const client = createClient(tenant.supabase_url, creds.supabase_service_key, {
      auth: { persistSession: false },
    });

    let since: string | null = null;
    const now = new Date();
    switch (dateRange) {
      case 'today':
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        break;
      case 'week': {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        since = weekAgo.toISOString();
        break;
      }
      case 'month': {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        since = monthAgo.toISOString();
        break;
      }
    }

    let query = client.from('orders').select('total', { count: 'exact', head: false }).eq('status', 'completed');
    if (since) query = query.gte('created_at', since);
    const { data, error, count } = await query;

    if (error) return { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0, error: error.message };

    const totalRevenue = (data ?? []).reduce((sum: number, o: any) => sum + Number(o.total), 0);
    const totalOrders = count ?? 0;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return { totalOrders, totalRevenue, avgOrderValue };
  } catch (e: any) {
    return { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0, error: e.message };
  }
}
