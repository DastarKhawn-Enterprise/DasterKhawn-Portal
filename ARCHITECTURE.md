# SAT SYS — Multi-Tenant POS Portal — Architecture Plan

**Enterprise:** SAT SYS
**Product:** Multi-tenant POS SaaS portal (gateway + per-brand POS instances)

## 0. Tech Stack

| Layer | Choice |
|---|---|
| Monorepo | Turborepo |
| Frontend | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Auth | Clerk (single instance, `publicMetadata` for tenant_id/role) |
| Gateway DB | Supabase (control plane) |
| Per-brand DB | Supabase (one project per tenant) |
| Client state | Zustand |
| Image storage | Cloudflare R2 |
| Hosting | Vercel (single deployment) |
| Realtime | Supabase Realtime |
| Mobile (later) | Expo / React Native |

## 1. Overview

A single hosted portal (one Next.js deployment, one domain) serves multiple independent
restaurant brands under the SAT SYS platform. Each brand ("tenant") gets its own isolated Supabase project for its
POS data. A separate "gateway" Supabase project (SAT SYS control plane) holds tenant metadata, billing status,
theming, and staff role assignments. Super admins (you + co-founder) can access, theme,
and suspend any tenant's POS from one dashboard — without ever touching or deleting the
tenant's actual business data.

**Core principle:** the database a POS talks to is resolved *dynamically at runtime*
based on who is logged in — not hardcoded per deployment. One codebase serves every
brand.

## 2. Roles

| Role | Scope | Assigned by |
|---|---|---|
| **Super Admin** (you + friend) | All tenants. Full read access to every brand's POS, theme control, power on/off, billing view | Hardcoded/seeded, not self-service |
| **Owner** | One tenant only. Full control of their own POS: staff management, menu, reports | Created at signup, tied to one `tenant_id` |
| **Staff** | One tenant only, limited permissions (e.g. `orders:create`, `orders:view`) | Invited by the Owner of that tenant |

Role + tenant binding is stored in Clerk's `publicMetadata`:
```json
{ "tenant_id": "hen_n_slice", "role": "owner" }
```
and mirrored in the gateway DB (`staff_roles` table) for query/RLS convenience.

## 3. Database Split — Two Layers

### 3.1 Gateway Supabase (ONE project, owned by super admins)

Control-plane only. No order/menu/business data lives here.

```sql
CREATE TABLE tenants (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  brand_name        text not null,
  owner_clerk_id    text not null,
  supabase_url      text not null,
  supabase_anon_key text not null,
  supabase_service_key text not null,
  status            text not null default 'active',
  theme_config      jsonb default '{}',
  created_at        timestamptz default now()
);

CREATE TABLE staff_roles (
  id              uuid primary key default gen_random_uuid(),
  clerk_user_id   text not null,
  tenant_id       uuid references tenants(id),
  role            text not null,
  permissions     text[] default '{}',
  created_at      timestamptz default now()
);

CREATE TABLE billing (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id),
  payment_status  text not null default 'unpaid',
  last_paid_at    timestamptz,
  due_date        date,
  amount_due      numeric
);
```

### 3.2 Per-Brand Supabase (ONE project per independent business)

Actual POS data: orders, menu, inventory, branch info, order history.
Schema is the reusable POS schema (same structure across all tenants, seeded fresh
per new brand).

**Rule of thumb:** one Supabase project per *independent business*, not per UI/theme.
Two branches of the *same* brand can share one project (use `branch_id`). Two different
brands always get separate projects.

## 4. Tenant Resolution (Runtime)

On every request/session:
1. User logs in via Clerk (single Clerk instance for the whole portal).
2. Read `tenant_id` + `role` from Clerk's `publicMetadata`.
3. Look up that `tenant_id` in the gateway `tenants` table → get `supabase_url` +
   `supabase_anon_key` (+ `service_key` if server-side).
4. Initialize a Supabase client scoped to that tenant for the rest of the session.
5. If `status = suspended` → render a "service paused" screen instead of the POS.

**Security rule:** `supabase_service_key` is NEVER sent to the browser.

## 5. Routing Model

Path-based tenant routing (simpler than subdomains, no DNS wildcard config needed):
- `portal.com/hen-n-slice/pos` → tenant lookup via slug
- `portal.com/admin` → super admin dashboard

Subdomain routing can be added later.

## 6. Signup / Onboarding Flow (New Owner)

Two paths:
- **Path A — Owner added from existing tenant's admin panel:** No new POS UI
  provisioned. Added to same `tenant_id`.
- **Path B — Public self-signup:** Creates pending request. Super admin provisions
  new Supabase project, sets Clerk metadata, inserts `tenants` row.

## 7. Owner → Staff Management

### Permission Strings

Permissions are constrained tokens (no free-form strings). The complete set:

| Token | Roles with this permission |
|---|---|
| `orders:create` | owner, staff |
| `orders:view` | owner, staff |
| `orders:update` | owner, staff |
| `menu:view` | owner, staff |
| `menu:edit` | owner |
| `reports:view` | owner |
| `staff:manage` | owner |
| `settings:edit` | owner |

Customer-facing permissions (future use):
- `orders:create:own` — customer can create their own orders
- `orders:view:own` — customer can view their own orders

Default permission sets per role:
- **owner:** all tokens
- **staff:** `orders:create`, `orders:view`, `orders:update`, `menu:view`
- **customer (future):** `orders:create:own`, `orders:view:own`

### Staff Invite Flow

Owner's POS UI has a "Staff" panel:
- Invites user via Clerk Backend API by email.
- Sets `publicMetadata.tenant_id`, `role: "staff"`, `permissions: [...]` (owner picks from the fixed list above).
- Mirrors assignment into gateway `staff_roles` table.
- Tenant's Supabase RLS policies check JWT claims.

## 8. Settings Module

The `settings` table (single-row per tenant) stores:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `tax_enabled` | boolean | false | Toggle tax calculation on/off |
| `tax_rate` | numeric | 0 | Tax percentage (e.g. 10 = 10%) |
| `currency_symbol` | text | `$` | Display symbol on receipt |
| `receipt_footer_text` | text | "Thank you for your order!" | Printed at the bottom of receipts |

Tax flow:
- Checkout computes `subtotal` from cart items, then `taxAmount = subtotal * (taxRate / 100)`, then `total = subtotal + taxAmount`.
- `total` and `tax_amount` are stored on the `orders` row.
- Recalculation on edit order also factors in tax.
- Receipt shows subtotal, tax line (if > 0), and total — all using `currency_symbol`.
- Receipt footer uses `receipt_footer_text`.
- Permission gate: `settings:edit` required (owner). Users without it see a read-only view.

## 9. Theme Configuration

`theme_config` uses a constrained token set (no free-form CSS):

```typescript
interface ThemeConfig {
  primaryColor: string;   // hex, e.g. "#ff6600"
  secondaryColor: string; // hex, e.g. "#1a1a1a"
  logoUrl: string;        // URL string, empty string = no logo
  fontFamily: string;     // font name, e.g. "Inter"
}
```

Full custom CSS is explicitly NOT supported — it risks breaking the POS layout per brand. The constrained token set gives brands visual identity while keeping the UI structurally consistent.

## 9. Super Admin Dashboard

Role-gated features (`role: super_admin`):
- Tenant list (status, payment_status)
- Cross-tenant view (re-init Supabase client with that tenant's credentials)
- Theme editor (edit `theme_config` JSON via the constrained token set)
- Power switch (toggle `status` active/suspended)
- Revenue tab (live aggregation queries against tenant's project)

## 10. Monorepo Structure (Turborepo)

```
apps/
  portal/            -- Next.js, the single deployed app
packages/
  pos-ui/             -- reusable POS components (brand-agnostic, theme-driven)
  supabase-client/     -- shared client factory: createClient(url, anonKey)
  gateway-sdk/         -- typed functions for gateway DB queries
  ui/                  -- shared design system components
```

## 11. Build Sequence

1. ✅ Portal shell — Clerk auth, tenant resolution middleware, empty routes
2. ✅ Gateway Supabase project — tenants/staff_roles/billing tables
3. ✅ One brand as test tenant — Bao-G connected end-to-end
4. ✅ Build POS as packages/pos-ui — reusable, theme-driven
5. ✅ Prove end-to-end with tenant #1 — order flow, staff login, admin view
6. ✅ Add auth gating + role-based RLS + dashboard landing
7. ⬜ Staff invite UI + full admin dashboard (tenant management, theme editor, revenue tab)
8. ⬜ Add tenant #2 — config only, no new code

## Next Steps

- **Multi-tenant** — Onboard a second brand tenant (config only, no new code).

## 12. Hosting & Cost (Free-Tier Plan)

New-tenant Supabase project provisioning is **manual** for now. Automating via the Supabase Management API is premature given 1–2 real tenants. Revisit once onboarding tenants regularly.

| Component | Where | Free tier notes |
|---|---|---|
| Portal (Next.js) | Vercel Hobby | One deployment serves all tenants |
| Gateway Supabase | Supabase free tier | 500MB DB |
| Per-brand Supabase | Supabase free tier | Org limit: 2 free projects |
| Images | Cloudflare R2 | 10GB free, no egress fees |
| Domain | Namecheap/Porkbun | ~$10–15/yr |

## 13. Security Checklist

- [x] `service_role_key` never shipped to client bundle (server-only import)
- [x] Every per-brand Supabase project has RLS enabled on all tables
- [x] RLS policies check tenant/role/permission claims from JWT
- [ ] Gateway `tenants.supabase_service_key` column encrypted at rest
- [x] Suspended-tenant check happens before any DB call (middleware/page level)
- [x] Staff invites scoped to fixed permission whitelist (see §7)
- [x] Admin dashboard route protected by role check
