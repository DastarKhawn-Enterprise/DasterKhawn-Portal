'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { getTenantBySlug, getTenantServiceCredentials, getStaffByTenant } from '@sat-sys/gateway-sdk';

interface QueryOptions {
  table: string;
  select?: string;
  eq?: [string, any];
  neq?: [string, any];
  isNull?: [string];
  order?: string;
  limit?: number;
  single?: boolean;
  method?: 'select' | 'insert' | 'update' | 'delete';
  body?: any;
  filter?: Record<string, any>;
}

interface QueryResultOk {
  ok: true;
  data: any;
  count?: number;
  error?: undefined;
}

interface QueryResultErr {
  ok: false;
  error: string;
}

type QueryResult = QueryResultOk | QueryResultErr;

const ALLOWED_TABLES = new Set([
  'menu_items', 'orders', 'order_items', 'tables',
  'settings', 'customers', 'inventory_items',
  'menu_item_ingredients', 'expenses', 'reservations',
]);

const TABLE_WRITE_PERMISSION: Record<string, string> = {
  menu_items: 'menu:edit',
  menu_item_ingredients: 'menu:edit',
  inventory_items: 'menu:edit',
  orders: 'orders:create',
  order_items: 'orders:create',
  tables: 'orders:create',
  customers: 'orders:create',
  settings: 'settings:edit',
  expenses: 'settings:edit',
  reservations: 'orders:create',
};

const PERMISSIONS_OWNER = [
  'orders:create', 'orders:view', 'orders:update',
  'menu:view', 'menu:edit', 'reports:view',
  'staff:manage', 'settings:edit',
];

type CheckAccessResult = { authorized: false; reason: string } | { authorized: true; tenant: { id: string; supabase_url: string; slug: string } };

async function checkAccess(slug: string, table: string, write: boolean): Promise<CheckAccessResult> {
  const { userId } = auth();
  if (!userId) return { authorized: false, reason: 'Unauthorized' };

  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { authorized: false, reason: 'Tenant not found' };

  if (!ALLOWED_TABLES.has(table)) {
    return { authorized: false, reason: `Table '${table}' not allowed` };
  }

  const staff = await getStaffByTenant(tenant.id);
  const me = staff.find((s) => s.clerk_user_id === userId);

  if (me) {
    if (me.role === 'owner' || me.role === 'super_admin') {
      return { authorized: true, tenant };
    }
    if (write) {
      const required = TABLE_WRITE_PERMISSION[table];
      if (required && !me.permissions.includes(required)) {
        return { authorized: false, reason: `Forbidden: missing ${required}` };
      }
    }
    return { authorized: true, tenant };
  }

  // Not in staff_roles — check if super_admin via Clerk metadata
  const user = await currentUser();
  const role = (user?.publicMetadata as Record<string, any> | undefined)?.role;
  if (role === 'super_admin') {
    return { authorized: true, tenant };
  }

  return { authorized: false, reason: 'Forbidden: no access to this tenant' };
}

async function getSvcKey(slug: string) {
  const creds = await getTenantServiceCredentials(slug);
  if (!creds) throw new Error('Service credentials not found');
  return creds.supabase_service_key;
}

function buildUrl(baseUrl: string, table: string, opts: QueryOptions) {
  const base = baseUrl.replace(/\/+$/, '');
  const params: string[] = [];

  if (opts.select) {
    params.push(`select=${encodeURIComponent(opts.select)}`);
  }

  if (opts.eq) {
    params.push(`${encodeURIComponent(opts.eq[0])}=eq.${encodeURIComponent(String(opts.eq[1]))}`);
  }

  if (opts.neq) {
    params.push(`${encodeURIComponent(opts.neq[0])}=neq.${encodeURIComponent(String(opts.neq[1]))}`);
  }

  if (opts.isNull) {
    params.push(`${encodeURIComponent(opts.isNull[0])}=is.null`);
  }

  if (opts.order) {
    params.push(`order=${encodeURIComponent(opts.order)}`);
  }

  if (opts.limit) {
    params.push(`limit=${opts.limit}`);
  }

  if (opts.filter) {
    for (const [key, val] of Object.entries(opts.filter)) {
      params.push(`${encodeURIComponent(key)}=eq.${encodeURIComponent(String(val))}`);
    }
  }

  return `${base}/rest/v1/${table}?${params.join('&')}`;
}

export async function supa(slug: string, opts: QueryOptions): Promise<QueryResult> {
  try {
    const write = opts.method === 'insert' || opts.method === 'update' || opts.method === 'delete';
    const access = await checkAccess(slug, opts.table, write);
    if (!access.authorized) {
      return { ok: false, error: access.reason || 'Forbidden' };
    }

    const key = await getSvcKey(slug);
    const headers: Record<string, string> = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    };

    const baseUrl = access.tenant.supabase_url;
    const url = buildUrl(baseUrl, opts.table, opts);

    // SELECT
    if (!opts.method || opts.method === 'select') {
      const prefer = opts.single ? 'return=representation' : '';
      const res = await fetch(url, {
        headers: { ...headers, ...(prefer ? { Prefer: prefer } : {}) },
      });
      if (!res.ok) {
        const txt = await res.text();
        return { ok: false, error: `${res.status}: ${txt.slice(0, 200)}` };
      }
      const data = await res.json();
      const count = res.headers.get('content-range')?.split('/')?.[1];
      if (opts.single) {
        return { ok: true, data: data?.[0] ?? null };
      }
      return { ok: true, data, count: count ? parseInt(count) : undefined };
    }

    // INSERT
    if (opts.method === 'insert') {
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify(opts.body),
      });
      if (!res.ok) {
        const txt = await res.text();
        return { ok: false, error: `${res.status}: ${txt.slice(0, 200)}` };
      }
      const data = await res.json();
      return { ok: true, data: opts.single ? data?.[0] ?? null : data };
    }

    // UPDATE
    if (opts.method === 'update') {
      const res = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(opts.body),
      });
      if (!res.ok) {
        const txt = await res.text();
        return { ok: false, error: `${res.status}: ${txt.slice(0, 200)}` };
      }
      return { ok: true, data: null };
    }

    // DELETE
    if (opts.method === 'delete') {
      const res = await fetch(url, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const txt = await res.text();
        return { ok: false, error: `${res.status}: ${txt.slice(0, 200)}` };
      }
      return { ok: true, data: null };
    }

    return { ok: false, error: 'Unknown method' };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Internal error' };
  }
}
