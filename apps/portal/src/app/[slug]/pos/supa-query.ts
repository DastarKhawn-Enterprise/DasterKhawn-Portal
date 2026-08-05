'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { getTenantBySlug, getTenantServiceCredentials, getStaffByTenant } from '@sat-sys/gateway-sdk';

interface QueryOptions {
  table: string;
  select?: string;
  eq?: [string, any];
  neq?: [string, any];
  gte?: [string, any];
  lte?: [string, any];
  in?: [string, any[]];
  notIn?: [string, any[]];
  notEq?: [string, any];
  isNull?: [string];
  notNull?: [string];
  order?: string | { column: string; ascending?: boolean } | (string | { column: string; ascending?: boolean })[];
  limit?: number;
  offset?: number;
  single?: boolean;
  method?: 'select' | 'insert' | 'update' | 'delete';
  body?: any;
  filter?: Record<string, any>;
  or?: string;
  head?: boolean;
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
  count?: undefined;
}

type QueryResult = QueryResultOk | QueryResultErr;

const ALLOWED_TABLES = new Set([
  'menu_items', 'orders', 'order_items', 'tables',
  'settings', 'customers', 'inventory_items',
  'menu_item_ingredients', 'expenses', 'reservations',
  'item_ledger', 'accounts', 'payments', 'account_transactions',
  'branches', 'business_hours', 'audit_logs', 'order_edit_history', 'staff_branches',
]);

const TABLE_READ_PERMISSION: Record<string, string> = {};

const TABLE_WRITE_PERMISSION: Record<string, string> = {};

type CheckAccessResult = { authorized: false; reason: string } | { authorized: true; tenant: { id: string; supabase_url: string; slug: string }; serviceKey: string };

// Short-lived cache of resolved tenant + staff + service credentials so bursts of
// supa()/supaBatch() calls (menu + settings + tax reads, order placement pipelines)
// stop hammering the gateway DB with N identical lookups. Permissions/roles are
// re-resolved when the cache expires.
const AUTH_CACHE_TTL = 15_000;
interface AuthCacheEntry { tenant: { id: string; supabase_url: string; slug: string }; staff: any[]; serviceKey: string; savedAt: number; }
const authCache = new Map<string, AuthCacheEntry>();

async function getAuth(slug: string): Promise<{ tenant: { id: string; supabase_url: string; slug: string }; staff: any[]; serviceKey: string } | { error: string }> {
  const now = Date.now();
  const hit = authCache.get(slug);
  if (hit && now - hit.savedAt < AUTH_CACHE_TTL) {
    return { tenant: hit.tenant, staff: hit.staff, serviceKey: hit.serviceKey };
  }
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { error: 'Tenant not found' };
  let staff: any[] = [];
  try { staff = await getStaffByTenant(tenant.id); } catch {}
  let serviceKey = '';
  try {
    const creds = await getTenantServiceCredentials(slug);
    serviceKey = creds?.supabase_service_key || '';
  } catch {}
  if (!serviceKey) return { error: 'Service credentials not found' };
  const entry: AuthCacheEntry = { tenant: { id: tenant.id, supabase_url: tenant.supabase_url, slug }, staff, serviceKey, savedAt: now };
  authCache.set(slug, entry);
  return { tenant: entry.tenant, staff, serviceKey };
}

async function checkAccess(slug: string, table: string, write: boolean): Promise<CheckAccessResult> {
  const { userId } = auth();
  if (!userId) return { authorized: false, reason: 'Unauthorized' };

  // Reject unknown tables before any gateway call.
  if (!ALLOWED_TABLES.has(table)) {
    return { authorized: false, reason: `Table '${table}' not allowed` };
  }

  const resolved = await getAuth(slug);
  if ('error' in resolved) return { authorized: false, reason: resolved.error };
  const { tenant, staff, serviceKey } = resolved;

  const me = staff.find((s) => s.clerk_user_id === userId);
  if (me) {
    if (me.role === 'owner' || me.role === 'super_admin') {
      return { authorized: true, tenant, serviceKey };
    }
    if (write) {
      const required = TABLE_WRITE_PERMISSION[table];
      if (required && !me.permissions.includes(required)) {
        return { authorized: false, reason: `Forbidden: missing ${required}` };
      }
    } else {
      const readRequired = TABLE_READ_PERMISSION[table];
      if (readRequired && !me.permissions.includes(readRequired)) {
        return { authorized: false, reason: `Forbidden: missing ${readRequired}` };
      }
    }
    return { authorized: true, tenant, serviceKey };
  }

  // Not in staff_roles — check if super_admin via Clerk metadata
  const user = await currentUser();
  const role = (user?.publicMetadata as Record<string, any> | undefined)?.role;
  if (role === 'super_admin') {
    return { authorized: true, tenant, serviceKey };
  }

  return { authorized: false, reason: 'Forbidden: no access to this tenant' };
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

  if (opts.gte) {
    params.push(`${encodeURIComponent(opts.gte[0])}=gte.${encodeURIComponent(String(opts.gte[1]))}`);
  }

  if (opts.lte) {
    params.push(`${encodeURIComponent(opts.lte[0])}=lte.${encodeURIComponent(String(opts.lte[1]))}`);
  }

  if (opts.in) {
    const vals = opts.in[1].map((v) => String(v)).join(',');
    params.push(`${encodeURIComponent(opts.in[0])}=in.(${vals})`);
  }

  if (opts.notIn) {
    const vals = opts.notIn[1].map((v) => String(v)).join(',');
    params.push(`${encodeURIComponent(opts.notIn[0])}=not.in.(${vals})`);
  }

  if (opts.notEq) {
    params.push(`${encodeURIComponent(opts.notEq[0])}=not.eq.${encodeURIComponent(String(opts.notEq[1]))}`);
  }

  if (opts.isNull) {
    params.push(`${encodeURIComponent(opts.isNull[0])}=is.null`);
  }

  if (opts.notNull) {
    params.push(`${encodeURIComponent(opts.notNull[0])}=not.is.null`);
  }

  if (opts.order) {
    const orders = Array.isArray(opts.order) ? opts.order : [opts.order];
    for (const o of orders) {
      const orderStr = typeof o === 'string' ? o : `${o.column}.${o.ascending !== false ? 'asc' : 'desc'}`;
      params.push(`order=${encodeURIComponent(orderStr)}`);
    }
  }

  if (opts.limit) {
    params.push(`limit=${opts.limit}`);
  }

  if (opts.offset) {
    params.push(`offset=${opts.offset}`);
  }

  if (opts.filter) {
    for (const [key, val] of Object.entries(opts.filter)) {
      params.push(`${encodeURIComponent(key)}=eq.${encodeURIComponent(String(val))}`);
    }
  }

  if (opts.or) {
    const orVal = opts.or.trim();
    const wrapped = orVal.startsWith('(') ? orVal : `(${orVal})`;
    params.push(`or=${encodeURIComponent(wrapped)}`);
  }

  return `${base}/rest/v1/${table}?${params.join('&')}`;
}

const FETCH_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url: string, options: RequestInit & { signal?: AbortSignal }, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function execQuery(baseUrl: string, key: string, opts: QueryOptions): Promise<QueryResult> {
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  const url = buildUrl(baseUrl, opts.table, opts);

  if (!opts.method || opts.method === 'select') {
    const prefer: string[] = [];
    if (opts.single) prefer.push('return=representation');
    if (opts.head) prefer.push('count=exact');
    const res = await fetchWithTimeout(url, {
      headers: { ...headers, ...(prefer.length ? { Prefer: prefer.join(',') } : {}) },
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `${res.status}: ${txt.slice(0, 200)}` };
    }
    const ct = res.headers.get('content-range');
    const count = ct?.split('/')?.[1] ? parseInt(ct.split('/')[1]) : undefined;
    if (opts.head) return { ok: true, data: null, count };
    const data = await res.json();
    if (opts.single) return { ok: true, data: data?.[0] ?? null };
    return { ok: true, data, count };
  }

  if (opts.method === 'insert') {
    const res = await fetchWithTimeout(url, {
      method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(opts.body),
    });
    if (!res.ok) { const t = await res.text(); return { ok: false, error: `${res.status}: ${t.slice(0, 200)}` }; }
    const data = await res.json();
    return { ok: true, data: opts.single ? data?.[0] ?? null : data };
  }

  if (opts.method === 'update') {
    const res = await fetchWithTimeout(url, { method: 'PATCH', headers, body: JSON.stringify(opts.body) });
    if (!res.ok) { const t = await res.text(); return { ok: false, error: `${res.status}: ${t.slice(0, 200)}` }; }
    return { ok: true, data: null };
  }

  if (opts.method === 'delete') {
    const res = await fetchWithTimeout(url, { method: 'DELETE', headers });
    if (!res.ok) { const t = await res.text(); return { ok: false, error: `${res.status}: ${t.slice(0, 200)}` }; }
    return { ok: true, data: null };
  }

  return { ok: false, error: 'Unknown method' };
}

export async function supa(slug: string, opts: QueryOptions): Promise<QueryResult> {
  try {
    const write = opts.method === 'insert' || opts.method === 'update' || opts.method === 'delete';
    const access = await checkAccess(slug, opts.table, write);
    if (!access.authorized) return { ok: false, error: access.reason || 'Forbidden' };
    return execQuery(access.tenant.supabase_url, access.serviceKey, opts);
  } catch (e: any) {
    return { ok: false, error: e.message || 'Internal error' };
  }
}

export async function supaBatch(slug: string, queries: QueryOptions[]): Promise<QueryResult[]> {
  try {
    for (const q of queries) {
      if (!ALLOWED_TABLES.has(q.table)) return queries.map(() => ({ ok: false, error: `Table '${q.table}' not allowed` }));
    }
    const resolved = await getAuth(slug);
    if ('error' in resolved) return queries.map(() => ({ ok: false, error: resolved.error }));
    const { tenant, staff, serviceKey } = resolved;

    const { userId } = auth();
    if (!userId) return queries.map(() => ({ ok: false, error: 'Unauthorized' }));
    const me = staff.find((s) => s.clerk_user_id === userId);
    if (!me) {
      const user = await currentUser();
      const role = (user?.publicMetadata as Record<string, any> | undefined)?.role;
      if (role !== 'super_admin') return queries.map(() => ({ ok: false, error: 'Forbidden: no access to this tenant' }));
    }

    return Promise.all(queries.map(q => execQuery(tenant.supabase_url, serviceKey, q)));
  } catch (e: any) {
    return queries.map(() => ({ ok: false, error: e.message || 'Internal error' }));
  }
}

type RpcResult = { ok: true; data: any } | { ok: false; error: string };

export async function supaRpc(slug: string, fnName: string, params: Record<string, any>): Promise<RpcResult> {
  try {
    const resolved = await getAuth(slug);
    if ('error' in resolved) return { ok: false, error: resolved.error };
    const { tenant, staff, serviceKey } = resolved;

    const { userId } = auth();
    if (!userId) return { ok: false, error: 'Unauthorized' };
    const me = staff.find((s) => s.clerk_user_id === userId);
    if (!me) {
      const user = await currentUser();
      const role = (user?.publicMetadata as Record<string, any> | undefined)?.role;
      if (role !== 'super_admin') return { ok: false, error: 'Forbidden: no access to this tenant' };
    }

    const url = `${tenant.supabase_url.replace(/\/+$/, '')}/rest/v1/rpc/${encodeURIComponent(fnName)}`;

    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `${res.status}: ${txt.slice(0, 300)}` };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e.message || 'RPC call failed' };
  }
}
