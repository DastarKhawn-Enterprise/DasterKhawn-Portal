# MODULE REGISTRY AUDIT

Status: **DONE** — refactor complete, typecheck + ESLint + production build pass.
Commit: *(uncommitted — awaiting review)*

## Design: Single Source of Truth

`apps/portal/src/lib/sidebar-nav.ts` is the **only** place that defines modules.
`apps/portal/src/lib/module-registry.ts` derives everything from it. Rules:

- Every sidebar item feels like a module. Namespace **groups** (`Orders`, `Inventory`)
  are *not* modules — each of their children is an independent, toggleable module.
- Adding a new sidebar tab automatically surfaces it in **Module Management**, the
  **Permissions** panel, **route protection**, and **dashboard** hiding. No other edits.
- A disabled module: hides its sidebar tab, blocks its route (Permission Denied),
  and hides its dashboard card / report tab.
- A missing/unknown stored key always falls back to `defaultEnabled: true` — a deleted
  key can never silently re-enable a module someone switched off. Unknown stored keys
  are ignored.

---

## Registry (sidebar-nav.ts → module-registry.ts)

`MODULES` is emitted in sidebar order. `key` == `ViewId` == sidebar tab id.

| key | label | POS route | permission | parent | sort | namespace? |
|-----|-------|-----------|------------|--------|------|------------|
| `dashboard` | Dashboard | `/dashboard` | — | | 1 | |
| `current-orders` | Current Orders | `/orders` | `orders:view` | orders | 10 | |
| `orders-new` | New Order | `/orders/new` | `orders:create` | orders | 20 | |
| `orders-completed` | Completed | `/orders/completed` | `orders:view` | orders | 30 | |
| `orders-cancelled` | Cancelled | `/orders/cancelled` | `orders:view` | orders | 40 | |
| `orders-draft` | Draft | `/orders/draft` | `orders:view` | orders | 50 | |
| `dine-in` | Dine In | `/dine-in` | `orders:create` | 200 | |
| `take-away` | Take Away | `/take-away` | `orders:create` | 210 | |
| `delivery` | Delivery | `/delivery` | `orders:create` | 220 | |
| `drive-thru` | Drive Thru | `/drive-thru` | `orders:create` | 230 | |
| `third-party` | Third Party | `/third-party` | `orders:create` | 240 | |
| `reservations` | Reservations | `/reservations` | `orders:create` | 300 | |
| `menu` | Menu | `/menu` | `menu:view` | 400 | |
| `inventory` | Inventory | `/inventory` | `menu:edit` | inventory | 10 | |
| `item-ledger` | Item Ledger | `/item-ledger` | `menu:edit` | inventory | 20 | |
| `wastage-management` | Wastage Mgmt | `/wastage-management` | `menu:edit` | inventory | 30 | |
| `customers` | Customers | `/customers` | `customers:view` | 600 | |
| `reports` | Reports | `/reports` | `reports:view` | 700 | |
| `expenses` | Expenses | `/expenses` | `settings:edit` | 800 | |
| `accounts` | Accounts | `/accounts` | `accounts:view` | 900 | |
| `staff` | Staff | `/staff` | `staff:manage` | 1000 | |
| `settings` | Settings | `/settings` | `settings:edit` | 1100 | |

> Not in `MODULES` (namespaces only): `orders`, `inventory`.

> Registry API exported: `MODULES`, `MODULE_BY_KEY`, `MODULE_GROUPS` (single "Modules" group),
> `MODULE_LABELS`, `defaultModules`, `resolveEnabledModules`, `hiddenViewsForModules`,
> `disabledRoutesForModules`, `moduleEnabled`, `effectiveDetailed`, `modulePermission`, `moduleFeature`.

---

## Consumers in sync (all read from the registry)

| Surface | File | Source of truth | Auto-derived? |
|---|---|---|---|
| Sidebar rendering | `pos/Sidebar.tsx` | `SIDEBAR_NAV` + `viewIdForPath` | ✅ yes |
| Route → module map (guard) | `pos/page-guard.tsx` | `viewIdForPath` (was `PATH_TO_VIEW`) | ✅ |
| Permission-Denied label | `POSShell.tsx` | `MODULE_BY_KEY[ routes].label` | ✅ |
| Module Management editor | `admin/AdminDashboard.tsx` | `MODULE_GROUPS/MODULE_BY_KEY/defaultModules/effectiveDetailed` | ✅ |
| Dashboard card hiding | `DashboardView.tsx` | `resolveEnabledModules` (keys: `current-orders`, `wastage-management`, `reservations`) | ✅ fixed namespace bug |
| Report subtab hiding | `ReportsView.tsx` | `resolveEnabledModules` (keys + `wastage-management`) | ✅ fixed namespace bug |
| Permission panel | `pos/staff-types.ts` | `PERMISSION_PAGES` derived from `MODULES` | ✅ (was hard-coded) |
| Persistence | gateway-sdk `saveTenantModules` | persists full `enabled_modules: Record<string, boolean>` per tenant | ✅ inherent |

---

## Verification

- `npx tsc --noEmit` — **clean**.
- `npx eslint` (changed files) — **clean**.
- `npx next build` — **clean** (only supabase Node-version warnings, unrelated).
- Built POS routes cover every module (incl. `/wastage-management`, `/item-ledger`, per-order-type routes).

---

## Known gaps (not regressions — explicitly out of scope)

1. **No permission-level hiding inside enabled modules.** Within an enabled module the
   user has full access; per-feature permission keys exist metadata-only. This is the
   intended model per Module Management copy ("full access to everything inside it").
2. **No global-search / quick-action surface** in the POS / admin. If one is added
   later it must consume `MODULE_BY_KEY` so the audit stays truthful; today nothing
   to hide.
3. **Dashboard "Orders" card** is gated on `current-orders` (the main `/orders` page),
   not on the whole `orders` namespace. Disabling only, e.g. `delivery` will keep the
   card (correct), disabling `current-orders` hides it.