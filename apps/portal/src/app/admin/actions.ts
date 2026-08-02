'use server';

import { auth, currentUser, clerkClient } from '@clerk/nextjs/server';
import { randomBytes } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import {
  updateTenantStatus,
  updateTenantTheme,
  updateTenantModules,
  getTenantBySlug,
  getTenantServiceCredentials,
  insertTenant,
  updateTenantOwnerClerkId,
  getTenantMenuItemsForTemplate,
  addStaffRole,
  DEFAULT_ENABLED_MODULES,
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

export async function saveTenantModules(
  tenantId: string,
  enabledModules: Record<string, boolean>,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
    return await updateTenantModules(tenantId, enabledModules);
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

function generatePassword(): string {
  return randomBytes(18)
    .toString('base64')
    .replace(/[/+]/g, () => '!@#$%^&*'[Math.floor(Math.random() * 8)]);
}

function getProjectRef(supabaseUrl: string): string | null {
  try {
    const hostname = new URL(supabaseUrl).hostname;
    const match = hostname.match(/^([^.]+)\.supabase\.co$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function buildConnectionString(supabaseUrl: string, dbPassword: string): string {
  const ref = getProjectRef(supabaseUrl);
  if (!ref) throw new Error('Invalid Supabase URL — could not extract project ref');
  return `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${ref}.supabase.co:5432/postgres`;
}

// Exclude gateway-only migrations and seed files from the tenant migration list
function getTenantMigrationFiles(): { name: string; content: string }[] {
  const migrationsDir = join(process.cwd(), '../../packages/gateway-sdk/migrations');
  const allFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

  // Files to skip — gateway-only or seed data
  const skipPatterns = [/^001_gateway/, /^021_staff_metadata/, /^012_add_enabled_modules/, /^seed-/];

  const tenantFiles = allFiles.filter(
    (f) => !skipPatterns.some((p) => p.test(f)),
  );

  // pos-schema.sql must run before numbered migrations (002+ depend on its temp policies)
  const posSchema = tenantFiles.filter((f) => f === 'pos-schema.sql');
  const numbered = tenantFiles
    .filter((f) => f !== 'pos-schema.sql')
    .sort();

  return [...posSchema, ...numbered].map((name) => ({
    name,
    content: readFileSync(join(migrationsDir, name), 'utf-8'),
  }));
}

export interface CreateTenantInput {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  dbPassword: string;
  brandName: string;
  slug: string;
  primaryColor: string;
  secondaryColor: string;
  templateTenantSlug?: string;
  ownerEmail: string;
  ownerPassword: string;
}

export interface CreateTenantResult {
  success: boolean;
  step?: string;
  error?: string;
  tenantSlug?: string;
  ownerEmail?: string;
  password?: string;
}

/* ─── Future Supabase Pro improvement ───
   If we upgrade to Supabase Pro (removing the 2-project-per-account limit),
   the Management API can be used to automate project creation itself.
   At that point, add a "create Supabase project" step before Step 1,
   using POST https://api.supabase.com/v1/projects with a PAT.
   The manual "paste credentials" step would then be replaced.
   This is out of scope for the current free-tier hybrid approach.
*/

export async function createTenant(
  input: CreateTenantInput,
): Promise<CreateTenantResult> {
  try {
    await requireSuperAdmin();
    const {
      supabaseUrl, supabaseServiceKey, dbPassword,
      brandName, slug, primaryColor, secondaryColor,
      templateTenantSlug, ownerEmail, ownerPassword,
    } = input;

    const themeConfig: ThemeConfig = {
      primaryColor,
      secondaryColor,
      logoUrl: '',
      fontFamily: 'Inter',
    };

    // ── Step 1: Validate credentials ──
    // 1a. Test REST API with service key
    let restClient;
    try {
      restClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
      });
      const { error: testErr } = await restClient
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .limit(1);
      if (testErr) {
        const msg = testErr.message?.toLowerCase() || '';
        if (msg.includes('jwt') || msg.includes('401') || msg.includes('invalid') || msg.includes('unauthorized') || msg.includes('key')) {
          return { success: false, step: 'Validating Supabase credentials', error: 'Supabase URL or Service Role Key is invalid — the REST API rejected the connection.' };
        }
      }
    } catch {
      return { success: false, step: 'Validating Supabase credentials', error: 'Could not connect to Supabase — check the Project URL.' };
    }

    // 1b. Test direct PostgreSQL connection with DB password
    const connectionString = buildConnectionString(supabaseUrl, dbPassword);
    let pool;
    try {
      pool = new Pool({ connectionString, connectionTimeoutMillis: 8000 });
      const ping = await pool.query('SELECT 1');
      if (!ping.rows?.length) {
        return { success: false, step: 'Validating database connection', error: 'Database connection succeeded but returned no data — possible password/permission issue.' };
      }
    } catch {
      return { success: false, step: 'Validating database connection', error: 'Could not connect to the PostgreSQL database — check the Database Password. (The service key works for the REST API, but DDL migrations need a direct DB connection.)' };
    }

    // ── Step 2: Run all tenant migrations in order ──
    const migrations = getTenantMigrationFiles();
    if (migrations.length === 0) {
      return { success: false, step: 'Running migrations', error: 'No migration files found.' };
    }

    for (const m of migrations) {
      try {
        await pool.query(m.content);
      } catch (e: any) {
        await pool.end().catch(() => {});
        return {
          success: false,
          step: `Running migration: ${m.name}`,
          error: `Migration "${m.name}" failed: ${e.message}`,
        };
      }
    }
    await pool.end().catch(() => {});

    // ── Step 3: Copy template menu or leave blank ──
    if (templateTenantSlug) {
      const templateItems = await getTenantMenuItemsForTemplate(templateTenantSlug);
      if (templateItems.length > 0 && restClient) {
        const batch = templateItems.map((item) => ({
          name: item.name,
          description: item.description,
          category: item.category,
          available: item.available,
          price: 0,
        }));
        // Insert in batches of 50 to stay within request size limits
        for (let i = 0; i < batch.length; i += 50) {
          const { error: insertErr } = await restClient
            .from('menu_items')
            .insert(batch.slice(i, i + 50));
          if (insertErr) {
            return { success: false, step: 'Copying template menu', error: `Failed to copy menu items: ${insertErr.message}` };
          }
        }
      }
    }

    // ── Step 4: Insert gateway tenant row ──
    const insertResult = await insertTenant({
      slug,
      brand_name: brandName,
      supabase_url: supabaseUrl,
      supabase_anon_key: input.supabaseAnonKey,
      supabase_service_key: supabaseServiceKey,
      theme_config: themeConfig,
      enabled_modules: { ...DEFAULT_ENABLED_MODULES },
    });

    if (!insertResult.success || !insertResult.tenantId) {
      return { success: false, step: 'Creating tenant record', error: insertResult.error || 'Failed to create tenant in gateway database.' };
    }

    const tenantId = insertResult.tenantId;

    // ── Step 5: Create Clerk owner account ──
    const finalPassword = ownerPassword || generatePassword();
    const client = await clerkClient();
    const permissions = [
      'orders:create', 'orders:view', 'orders:update',
      'menu:view', 'menu:edit', 'reports:view',
      'staff:manage', 'settings:edit',
      'accounts:view', 'accounts:manage', 'accounts:transactions',
      'accounts:transfer', 'accounts:adjust',
    ];

    let ownerClerkId: string;
    const existing = await client.users.getUserList({ emailAddress: [ownerEmail] });

    if (existing.data.length > 0) {
      ownerClerkId = existing.data[0].id;
      try {
        await client.users.updateUserMetadata(ownerClerkId, {
          publicMetadata: { tenant_id: tenantId, role: 'owner', permissions },
        });
      } catch (e2: any) {
        return { success: false, step: 'Creating owner account', error: `Failed to assign owner role to existing user: ${e2.message}` };
      }
    } else {
      try {
        const created = await client.users.createUser({
          emailAddress: [ownerEmail],
          password: finalPassword,
          skipPasswordChecks: true,
        });
        await client.users.updateUserMetadata(created.id, {
          publicMetadata: { tenant_id: tenantId, role: 'owner', permissions },
        });
        ownerClerkId = created.id;
      } catch (e2: any) {
        return { success: false, step: 'Creating owner account', error: `Failed to create owner account: ${e2.message}` };
      }
    }

    // ── Step 6: Add staff_role row and update tenant's owner_clerk_id ──
    const staffRoleResult = await addStaffRole(ownerClerkId, tenantId, 'owner', permissions);
    if (!staffRoleResult.success) {
      return { success: false, step: 'Assigning owner permissions', error: staffRoleResult.error };
    }

    const updateResult = await updateTenantOwnerClerkId(tenantId, ownerClerkId);
    if (!updateResult.success) {
      return { success: false, step: 'Finalizing tenant setup', error: updateResult.error };
    }

    return {
      success: true,
      tenantSlug: slug,
      ownerEmail,
      password: existing.data.length > 0 ? '(existing user — password unchanged)' : finalPassword,
    };
  } catch (e: any) {
    return { success: false, step: 'Unknown', error: e.message || 'Unexpected error' };
  }
}
