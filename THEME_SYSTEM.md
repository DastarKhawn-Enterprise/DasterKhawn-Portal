# THEME_SYSTEM.md

Audit of the theming architecture in the **SAT SYS** monorepo (Dastarkhwan POS portal).
Generated from a read-only analysis of the codebase. No files were modified.

---

## 1. Theme Architecture

### 1.1 How themes are implemented

Themes are implemented as a **plain TypeScript configuration object** (`ThemeConfig`)
that is **stored in the gateway database** as a `jsonb` column on the `tenants` table and
**injected into the React tree via a Context Provider**. There is **no CSS-variable
system**, **no Tailwind theme extension**, **no dark-mode engine**, and **no state
library** (no Redux/Zustand/next-themes). Theme values are applied through **inline
`style` props** on the handful of components that use them; the overwhelming majority of
the UI is styled with hard-coded Tailwind utility classes.

The complete theme token set is only four fields:

```ts
interface ThemeConfig {
  primaryColor: string;   // hex, e.g. '#ff6600'
  secondaryColor: string; // hex, e.g. '#1a1a1a'
  logoUrl: string;        // URL string — stored but NEVER rendered
  fontFamily: string;     // font name — stored but NEVER applied
}
```

> **Critical finding:** `logoUrl` and `fontFamily` are collected in the admin Theme
> editor, persisted to the DB, and previewed in the admin modal, but **no POS component
> ever reads them**. They are effectively dead tokens today.

### 1.2 Where theme state lives

| Concern | Location |
|---|---|
| Source of truth (DB) | Gateway Supabase `tenants.theme_config` (jsonb) — `001_gateway_schema.sql` |
| Server fetch | `apps/portal/src/app/[slug]/pos/layout.tsx` via `getTenantBySlug()` |
| Client runtime state | React Context — `pos-context.tsx` `POSProvider` |
| Editor | Admin panel `ThemeModal` — `apps/portal/src/app/admin/AdminDashboard.tsx` |
| Type definition (dup #1) | `packages/gateway-sdk/src/index.ts` |
| Type definition (dup #2) | `packages/pos-ui/src/types.ts` |

### 1.3 How the active theme is selected

There is **exactly one theme per tenant**, selected implicitly by the tenant slug in the
URL (`/[slug]/pos/...`):

1. `[slug]/pos/layout.tsx` (Server Component) calls `getTenantBySlug(params.slug)`.
2. It passes `tenant.theme_config` as the `theme` prop into `<POSShell>`.
3. `POSShell` places it into the `POSProvider` context value.
4. Pages read `usePOS()` and forward `theme` to their view component as a prop.

There is **no theme switching UI in the POS** — changing a theme requires a super-admin
to edit it in the admin panel (which writes back to the gateway DB). The browser theme
color (`manifest.json` / `layout.tsx` `viewport.themeColor`) is hard-coded to `#1e293b`
and does **not** follow the tenant theme.

### 1.4 How components read theme values

Two patterns coexist:

- **Context hook:** `const { theme } = usePOS()` — used by shell-level widgets
  (`POSShell`, `business-date-picker`).
- **Prop drilling:** page wrapper reads `theme` from `usePOS()` and passes it down:
  `<DashboardView theme={theme} … />`. View components declare `theme: ThemeConfig` in
  their `Props` interface.

In both cases values are applied as inline styles, e.g.
`style={{ backgroundColor: theme.primaryColor }}`, or as string concatenation with hex
alpha suffixes, e.g. `theme.primaryColor + '20'`.

### 1.5 System used (summary)

- **CSS variables:** none — zero `--*` custom properties exist in the repo.
- **Tailwind:** default palette only; `tailwind.config.ts` has an empty `theme.extend`.
- **Context:** yes — `POSProvider` / `usePOS()`.
- **Zustand/Redux:** no.
- **next-themes / dark-mode:** no — the `dark_mode` flag in POS Settings is stored but
  never applied to the UI.
- **CSS Modules / styled-components / Emotion:** no.

---

## 2. Theme Files

### Core theme files

| # | File path | Purpose | Imports | Exports |
|---|---|---|---|---|
| 1 | `packages/gateway-sdk/src/index.ts` | Server-side SDK. Defines `ThemeConfig`, fetches/saves `theme_config` on the gateway `tenants` table. | `server-only`, `@supabase/supabase-js` | `ThemeConfig` (type), `getTenantBySlug`, `getTenantById`, `getAllTenants`, `getAllTenantsWithBilling`, `updateTenantTheme`, `insertTenant`, `getTenantEnabledModules`, `DEFAULT_ENABLED_MODULES`, staff/role helpers |
| 2 | `packages/pos-ui/src/types.ts` | Client component package. Duplicate `ThemeConfig` interface + cart/menu item types. | (none) | `ThemeConfig`, `MenuItem`, `CartItem` (types) |
| 3 | `packages/pos-ui/src/index.ts` | Barrel re-export of the POS UI component package. | `./MenuGrid`, `./CartSidebar`, `./CheckoutButton`, `./types` | `MenuGrid`, `CartSidebar`, `CheckoutButton`, `ThemeConfig/MenuItem/CartItem` |
| 4 | `packages/pos-ui/src/MenuGrid.tsx` | Searchable menu grid used in POS order flows. Uses `theme.primaryColor` for prices, "+" badge, category headings. | `react`, `./types` | `MenuGrid` (default) |
| 5 | `packages/pos-ui/src/CartSidebar.tsx` | Cart drawer/sidebar (desktop + mobile). Uses `theme.primaryColor` / `theme.secondaryColor`. | `react`, `./types`, `./CheckoutButton` | `CartSidebar` (default) |
| 6 | `packages/pos-ui/src/CheckoutButton.tsx` | Full-width checkout button. `backgroundColor: theme.primaryColor`. | `react`, `./types` | `CheckoutButton` (default) |
| 7 | `packages/gateway-sdk/migrations/001_gateway_schema.sql` | Gateway schema. Defines `tenants.theme_config jsonb default '{}'`. | — | (SQL DDL) |
| 8 | `apps/portal/src/app/[slug]/pos/layout.tsx` | POS layout server component; loads tenant + theme, suspends/denies access, renders `POSShell`. | `@clerk/nextjs/server`, `@sat-sys/gateway-sdk`, `next/navigation`, `./POSShell` | `POSLayout` (default) |
| 9 | `apps/portal/src/app/[slug]/pos/POSShell.tsx` | App shell: header, sidebar, providers. Applies `theme.secondaryColor` (header brand text), `theme.primaryColor` (border/link), passes `accentColor={theme.primaryColor}` to Sidebar. | `@clerk/nextjs`, `./Sidebar`, `./pos-context`, `./event-context`, `./business-date-context`, `./business-date-picker`, `./realtime-indicator`, `./supa-query`, `@sat-sys/pos-ui` | `POSShell` (default), `computeHiddenViews` |
| 10 | `apps/portal/src/app/[slug]/pos/pos-context.tsx` | Theme/context runtime. `POSProvider` + `usePOS()` hook exposing `theme`. | `react`, `@sat-sys/pos-ui` | `POSContextValue`, `POSContext`, `usePOS`, `POSProvider` |
| 11 | `apps/portal/src/app/[slug]/pos/Sidebar.tsx` | Dark sidebar nav. Receives `accentColor` (theme.primaryColor) for active-item tint; otherwise fully hard-coded dark hex colors (`#1A1A1A`, `#B8B6B0`, `#252525`). | `react`, `next/link`, `next/navigation` | `ViewId` (type), `Sidebar` (default) |
| 12 | `apps/portal/src/app/[slug]/pos/design-tokens.ts` | **Dead code.** Declares status/order-type/table/reservation badge class maps + layout constants. **Never imported anywhere.** | (none) | `STATUS_BADGE`, `ORDER_TYPE_BADGE`, `TABLE_BADGE`, `TABLE_BORDER`, `TABLE_BG`, `RESERVATION_BADGE`, `CARD_CLASS`, `CARD_NESTED_CLASS`, `PAGE_PADDING`, `SECTION_GAP`, `CARD_GAP`, `STATUS_LEFT_BORDER` |
| 13 | `apps/portal/src/app/admin/AdminDashboard.tsx` | Super-admin tenant manager. Contains `ThemeModal` (the only theme editor) + `ColorField`/`TextField`. | `react`, `next/link`, `./actions`, `@sat-sys/gateway-sdk`, `./CreateTenantModal` | `AdminDashboard` (default) + internal modals |
| 14 | `apps/portal/src/app/admin/actions.ts` | Server actions. `saveTenantTheme` → `updateTenantTheme`; `createTenant` builds `themeConfig` from wizard colors. | Clerk, `fs`, `pg`, `@sat-sys/gateway-sdk`, `@supabase/supabase-js` | `toggleTenantStatus`, `saveTenantTheme`, `saveTenantModules`, `getRevenueStats`, `createTenant` |
| 15 | `apps/portal/src/app/admin/CreateTenantModal.tsx` | New-tenant wizard; collects `primaryColor` / `secondaryColor` color pickers. | `react`, `./actions`, `@sat-sys/gateway-sdk` | `CreateTenantModal` (default) |
| 16 | `apps/portal/tailwind.config.ts` | Tailwind config. **Empty `theme.extend`**, no plugins, no custom colors, no dark mode. | `tailwindcss` | (config) |
| 17 | `apps/portal/src/app/globals.css` | Global CSS. Only `@tailwind` directives + `.scrollbar-hide` + a `slideIn` keyframe. **No CSS variables / dark-mode rules.** | — | (global styles) |
| 18 | `apps/portal/src/app/layout.tsx` | Root layout. Hard-coded `viewport.themeColor: '#1e293b'`. | `next`, `@clerk/nextjs`, `./globals.css`, `./PwaRegister` | `RootLayout` (default) |
| 19 | `apps/portal/public/manifest.json` | PWA manifest. Hard-coded `theme_color: '#1e293b'`, `background_color: '#f8fafc'`. | — | (static asset) |
| 20 | `apps/portal/public/icons/*.svg` | App icons, hard-coded slate `#1e293b` background. | — | (static assets) |
| 21 | `apps/portal/src/app/page.tsx` | Public landing page. Fully hard-coded brand colors (`#F5F1EA`, `#1A1A1A`, `#D97B3F`). No theme system. | `next/link` | `HomePage` (default) |

### Theme-consuming view files

Every module page under `apps/portal/src/app/[slug]/pos/*/page.tsx` follows the same
pattern: `const { theme, slug } = usePOS()` → `<XxxView theme={theme} slug={slug} />`.
The view files that consume `theme.primaryColor` via inline styles:

`AccountsView.tsx`, `CurrentOrdersView.tsx`, `CustomersView.tsx`, `DashboardView.tsx`,
`DineInView.tsx`, `ExpensesView.tsx`, `InventoryView.tsx`, `ItemLedgerView.tsx`,
`KDSView.tsx`, `MenuManagementView.tsx`, `PaymentModal.tsx`, `ReceiptView.tsx`,
`ReportsView.tsx`, `ReservationsView.tsx`, `SettingsView.tsx`, `business-date-picker.tsx`.

**Views with ZERO theme usage:** `NewOrderView.tsx` (hard-codes `#C9972B`),
`StaffManagementView.tsx` (all Tailwind blue/gray), `ThirdPartyView.tsx` (static
platform colors), `reports-charts.tsx` / `reports-actions.ts` (chart palettes),
`PaymentMethodLogo.tsx` (payment-method colors).

---

## 3. Theme Tokens

### 3.1 Actual tokens (the only ones that exist)

| Token | Type | Purpose | Used where |
|---|---|---|---|
| `primaryColor` | string (hex) | Brand/CTA color: buttons, active tabs/filters, selected borders, chart bars, price text, accent ring on sidebar | 16 view files + `pos-ui` package + sidebar accent |
| `secondaryColor` | string (hex) | Secondary brand color: header brand text, date-picker text, cart borders | `POSShell`, `business-date-picker`, `CartSidebar` |
| `logoUrl` | string | Logo — **stored only, never rendered** | none |
| `fontFamily` | string | Font — **stored only, never applied** | none |

### 3.2 Semantic tokens requested vs. reality

The following common theme tokens **do NOT exist** as theme tokens. Instead they exist
as **hard-coded Tailwind palette usage spread across ~30 files**:

| Desired token | Reality |
|---|---|
| Background | hard-coded `bg-gray-50`, `bg-white` |
| Foreground / Text | hard-coded `text-gray-400/500/600/700/800/900` |
| Card | hard-coded `bg-white rounded-xl border border-gray-200` |
| Border | hard-coded `border-gray-100/200/300` |
| Muted | hard-coded `text-gray-400/500` |
| Success | hard-coded `text-green-600/700`, `bg-green-50` |
| Warning | hard-coded `text-amber-600/700`, `bg-amber-50` |
| Danger | hard-coded `text-red-600/700`, `bg-red-50` |
| Sidebar | hard-coded `#1A1A1A` / `#252525` / `#B8B6B0` in `Sidebar.tsx` |
| Header | hard-coded `bg-white border-b border-gray-200` in `POSShell.tsx` |
| Chart colors | hard-coded palettes in `reports-actions.ts` / `reports-charts.tsx` |
| Order status colors | hard-coded in each view (duplicated maps: `CurrentOrdersView.tsx:106`, `KDSView.tsx:77`, `DashboardView.tsx:26`, `design-tokens.ts`) |
| Payment colors | hard-coded in `PaymentMethodLogo.tsx` and `AccountsView.tsx:58` |
| Kitchen (KDS) action colors | hard-coded hex in `KDSView.tsx` (`#2563eb`, `#d97706`, `#16a34a`, `#6366f1`) |
| New-order brand gold | hard-coded `#C9972B` in `NewOrderView.tsx` |

---

## 4. CSS Variables

**There are no CSS variables anywhere in the repository.** A repo-wide search for
`--primary`, `--background`, `--foreground`, `:root`, `var(--`, etc. returned zero
matches.

- No `:root {}` block.
- No `@layer` design tokens.
- No `--tw-*` overrides.
- No dark-mode variable swapping.

Where colors "would" be defined, they are instead written inline (either as Tailwind
utilities in `className` or as raw hex/rgb in `style={{}}`).

---

## 5. Tailwind Integration

### 5.1 `tailwind.config.ts`

```ts
const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/*/src/**/*.{ts,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
};
```

- **Custom colors:** none.
- **Semantic colors:** none.
- **Dark mode:** not configured — no `darkMode` key, no `dark:` variants used anywhere
  in the source.
- **Utilities:** only the stock Tailwind set; one custom helper class
  (`.scrollbar-hide`) lives in `globals.css`.
- **Plugins:** none (`@tailwindcss/forms`, `@tailwindcss/typography`, etc. absent).

### 5.2 What this means

Every color in the app is a **raw Tailwind palette token** (`bg-gray-50`, `text-blue-600`,
`border-red-300`, …) or a **raw hex** in an inline `style`. Because the config has no
theme extensions, there is no way for a tenant theme to influence Tailwind classes — the
theme can only affect the small set of elements that explicitly read
`theme.primaryColor`/`theme.secondaryColor`.

---

## 6. Theme Provider

### 6.1 `pos-context.tsx`

- `POSContext = createContext<POSContextValue | null>(null)`
- `POSContextValue` carries: `supabaseUrl`, `supabaseAnonKey`, `brandName`, `theme`,
  `slug`, `enabledModules`, `currencySymbol`, `hiddenViews`, `pageTitle`,
  `setPageTitle`.
- `POSProvider({ value, children })` — renders `<POSContext.Provider>`.
- `usePOS()` — reads context; throws if used outside the provider.

### 6.2 Provider wiring (data flow)

```
Gateway DB (tenants.theme_config jsonb)
   │  getTenantBySlug(slug)                         [server]
   ▼
[slug]/pos/layout.tsx  ──theme──▶  POSShell
                                      │  POSProvider value={{ ...theme }}
                                      ▼
                          usePOS()  ◀── pages & widgets
                                      │  theme prop
                                      ▼
                          <XxxView theme={theme} />
```

### 6.3 How switching themes updates the app

1. Super-admin edits the theme in `ThemeModal` (`AdminDashboard.tsx`).
2. `saveTenantTheme` → `updateTenantTheme` writes the new `theme_config` to the gateway
   DB. The modal optimistically updates the local tenant row only.
3. Because `[slug]/pos/layout.tsx` is `dynamic = 'force-dynamic'` and re-fetches the
   tenant on every request, the **next page load** picks up the new theme.
4. There is **no live/hot update**: already-mounted POS screens keep the old theme until
   a hard refresh or navigation that re-runs the server layout.

### 6.4 Custom hooks

There is **no dedicated `useTheme` hook**. The only relevant hook is `usePOS()`. A
`usePageGuard()` hook (in `page-guard.tsx`) reads `hiddenViews` from the same context but
has nothing to do with theming.

---

## 7. Component Usage

How components consume theme values (all inline styles):

### 7.1 Buttons
Primary/CTA buttons: `style={{ backgroundColor: theme.primaryColor }}` with white text —
seen in `AccountsView`, `CustomersView`, `ExpensesView`, `InventoryView`, `ItemLedgerView`,
`MenuManagementView`, `PaymentModal`, `ReservationsView`, `SettingsView`, `CurrentOrdersView`,
`KDSView`, and `pos-ui/CheckoutButton`.

### 7.2 Cards / Summary cards
Card chrome is hard-coded (`bg-white rounded-xl border border-gray-200`). Icon chips use
the theme: `backgroundColor: theme.primaryColor + '20'` / `+ '15'` with
`color: theme.primaryColor` (`AccountsView:391`, `CustomersView:799`).

### 7.3 Sidebar
Dark, hard-coded (`bg-[#1A1A1A]`, `text-[#B8B6B0]`, `hover:bg-[#252525]`). The only theme
input is `accentColor` (primaryColor) used with a hex-alpha suffix for the active item:
`backgroundColor: accentColor + '26'`, `color: accentColor` (`Sidebar.tsx:135,155,174`).

### 7.4 Header
`POSShell` header is hard-coded `bg-white border-b border-gray-200`. Brand text uses
`theme.secondaryColor`; the "← All POS" link uses `theme.primaryColor`.

### 7.5 Tables
All tables (`AdminDashboard`, `CustomersView`, `InventoryView`, `ItemLedgerView`, …) use
hard-coded gray borders/header fills. No theme involvement.

### 7.6 Dialogs / modals
Modal chrome is hard-coded. Confirmation/submit buttons use `theme.primaryColor`.

### 7.7 Charts
`reports-charts.tsx` components accept a `color`/`barColor` prop (default `#3b82f6`);
`ReportsView` passes `theme.primaryColor` for the line chart but hard-codes others
(`#f59e0b` for by-hour bars). Donut/heatmap palettes are hard-coded in
`reports-actions.ts`.

### 7.8 Badges
Status/order-type badges are per-view hard-coded Tailwind maps (duplicated across
`CurrentOrdersView`, `KDSView`, `DashboardView`). The centralized `design-tokens.ts` maps
are unused.

### 7.9 Inputs
All inputs are hard-coded gray (`border-gray-300`, `focus:ring-blue-500`) — focus rings
use **Tailwind blue**, not the tenant primary color.

### 7.10 Kitchen cards
`KDSView` order cards are hard-coded; status **action** buttons use hard-coded hex
(`#2563eb` Accept, `#d97706` Ready, `#16a34a` Complete, `#6366f1` +Item). The
Generate-Invoice button uses `theme.primaryColor`.

### 7.11 Order cards
`CurrentOrdersView` list cards use hard-coded grays; the **selected** card gets a themed
border/ring: `{ borderColor: theme.primaryColor, boxShadow: 0 0 0 2px primaryColor+'20' }`.

### 7.12 Receipt
`ReceiptView` prints the brand name in `theme.primaryColor`; everything else hard-coded.

---

## 8. Hardcoded Colors

The app contains ~**2,500+ hard-coded color tokens** across `apps/portal/src`. Below are
the notable raw-hex/`rgb()` occurrences (Tailwind classes such as `text-gray-500`,
`bg-blue-600`, `border-red-300` are pervasive and summarized per file in Section 9).

### 8.1 Raw hex in TS constants (chart/data palettes)

| File | Line | Color | Purpose | Recommended token |
|---|---|---|---|---|
| `AccountsView.tsx` | 58–59 | `#10b981 #3b82f6 #f59e0b #8b5cf6 #ef4444 #6b7280` | Account-type colors | `token.account.*` / `token.chart.*` |
| `CustomersView.tsx` | 35 | `#6366f1 #8b5cf6 #ec4899 …` (10) | Avatar colors | `token.avatar.*` |
| `CustomersView.tsx` | 771 | `#dc2626` | Delete button bg | `token.danger` |
| `CustomersView.tsx` | 845 | `#6366f1` | Pagination active | `token.primary` |
| `CustomersView.tsx` | 948 | `#1f2937` | Metric fallback text | `token.foreground` |
| `NewOrderView.tsx` | 65,79,413,435,451,478,504,646,658,695,715,720 | `#C9972B` / `#9CA3AF` | Brand gold buttons & disabled gray — **ignores tenant theme** | `token.primary` / `token.disabled` |
| `KDSView.tsx` | 229,239,249,261,424 | `#2563eb #d97706 #16a34a #6366f1` | Kitchen action buttons | `token.kitchen.accept/ready/complete/add` |
| `DashboardView.tsx` | 157 | `#059669` | Occupied-tables metric | `token.success` |
| `ReportsView.tsx` | 354,371–377,385,412 | `#3b82f6 #9ca3af #f3f4f6 #dbeafe #93c5fd #60a5fa #f59e0b` | Ranking, heatmap, bars | `token.chart.*` |
| `reports-actions.ts` | 76–80,205,301,312 | `#3b82f6 …` palettes | Chart + order/payment colors | `token.chart.*` |
| `PaymentMethodLogo.tsx` | 10–11,19 | `#10b981 #3b82f6 #f59e0b #8b5cf6 #ef4444 #6b7280` | Payment method logos | `token.payment.*` |
| `ThirdPartyView.tsx` | 11–14 | `#D70F64 #06C167 #00CCBC #F37320` | Platform brand colors (deliberate) | `token.platform.*` |
| `reports-charts.tsx` | 27,36,45,48,55,84,112,113,129,159,164 | `#e5e7eb #f3f4f6 #374151 #9ca3af #3b82f6 #6b7280` | Chart chrome/gridlines/defaults | `token.chart.grid/axis/series` |
| `AccountsView.tsx` | 96,105,114,115,245 | `#e5e7eb #f3f4f6 #374151 #9ca3af #6b7280` | Donut chrome + fallback | `token.chart.*` |

### 8.2 Raw hex in components

| File | Line(s) | Color | Purpose | Recommended token |
|---|---|---|---|---|
| `Sidebar.tsx` | 118,133,153,172,192,200,206 | `#1A1A1A`, `#B8B6B0`, `#252525` | Sidebar bg / inactive text / hover | `token.sidebar.bg/text/hover` |
| `CurrentOrdersView.tsx` | 975 | `#e5e7eb` | Unselected order card border | `token.border` |
| `DineInView.tsx` | 490,497,500 | `rgba(34,197,94,…)`, `#86efac`, `#fca5a5`, `#fcd34d`, `#166534`, `#991b1b`, `#92400e` | Table status colors | `token.table.available/occupied/reserved` |
| `app/page.tsx` | 3,7,22,30,41 | `#F5F1EA #1A1A1A #D97B3F` | Landing page brand | `token.primary/secondary` |
| `app/layout.tsx` | 19 | `#1e293b` | Browser theme color | `token.primary` |
| `manifest.json` | 7–8 | `#f8fafc #1e293b` | PWA theme | `token.primary` |

### 8.3 Inline-style `rgba()` in DineInView

- `DineInView.tsx:490` — `rgba(34,197,94,0.08)`, `rgba(239,68,68,0.08)`,
  `rgba(245,158,11,0.08)` — table availability tints. Recommend `token.table.*`.

### 8.4 Tailwind hard-coded color class volume (top files)

Counts of `bg-/text-/border-/ring-<color>-<shade>` classes per file (representative
subset; full repo is ~2,500):

| File | Occurrences |
|---|---|
| `CurrentOrdersView.tsx` | 346 |
| `StaffManagementView.tsx` | 277 |
| `NewOrderView.tsx` | 243 |
| `AccountsView.tsx` | 216 |
| `CustomersView.tsx` | 210 |
| `SettingsView.tsx` | 171 |
| `KDSView.tsx` | 159 |
| `DineInView.tsx` | 117 |
| `ItemLedgerView.tsx` | 114 |
| `ReservationsView.tsx` | 108 |
| `ReportsView.tsx` | 103 |
| `InventoryView.tsx` | 90 |
| `ExpensesView.tsx` | 78 |
| `DashboardView.tsx` | 64 |
| `MenuManagementView.tsx` | 57 |
| `PaymentModal.tsx` | 60 |

The most common hard-coded palette families: `gray-50..900` (backgrounds, borders,
text), `blue-50..800` (accents/focus/staff roles), `red-50..700` (danger/negative),
`green-50..700` (success), `amber-50..800` (warnings/pending), plus `indigo/purple/
teal/orange` for status variety.

---

## 9. Theme Compliance Report

Compliance scoring method: ratio of theme-driven styling to total color usage. Only
`theme.primaryColor`/`theme.secondaryColor` count as "themed" today, since no other token
exists. Status colors and semantic states are **all** hard-coded, so even modules that use
the primary color for CTAs are not "fully compliant."

| Module | View file | Theme Variables Used | Hardcoded Colors | Needs Refactoring | Compliance |
|---|---|---|---|---|---|
| Sidebar | `Sidebar.tsx` | `accentColor` (primary) for active item | `#1A1A1A`, `#B8B6B0`, `#252525` (7×) | High — hard-coded dark shell | **~20%** |
| Dashboard | `DashboardView.tsx` | `primaryColor` (2×) | ~64 (incl. `#059669`) | Medium | **~15%** |
| Kitchen (Orders) | `KDSView.tsx` | `primaryColor` (4×) | ~159 (incl. 4 action hex) | High — action colors hard-coded | **~10%** |
| Orders (Current) | `CurrentOrdersView.tsx` | `primaryColor` (12×) | ~346 | Medium | **~10%** |
| Orders (New) | `NewOrderView.tsx` | **none** | ~243 (`#C9972B`) | **High — ignores theme entirely** | **0%** |
| Customers | `CustomersView.tsx` | `primaryColor` (12×) | ~210 (avatar/pagination hex) | Medium | **~15%** |
| Inventory | `InventoryView.tsx` | `primaryColor` (3×) | ~90 | Medium | **~10%** |
| Item Ledger | `ItemLedgerView.tsx` | `primaryColor` (4×) | ~114 | Medium | **~10%** |
| Reports | `ReportsView.tsx` | `primaryColor` (3×) | ~103 + chart palettes | High — chart palettes hard-coded | **~10%** |
| Accounts | `AccountsView.tsx` | `primaryColor` (9×) | ~216 (account-type colors) | High — TYPE_COLORS hard-coded | **~12%** |
| Settings | `SettingsView.tsx` | `primaryColor` (4×) | ~171 | Low (settings is low-visibility) | **~10%** |
| Staff | `StaffManagementView.tsx` | **none** | ~277 (all blue/gray) | **High — no theme at all** | **0%** |
| Menu | `MenuManagementView.tsx` | `primaryColor` (2×) | ~57 | Low | **~10%** |
| Reservations | `ReservationsView.tsx` | `primaryColor` (4×) | ~108 | Medium | **~12%** |
| Expenses | `ExpensesView.tsx` | `primaryColor` (6×) | ~78 | Medium | **~15%** |
| Dine In | `DineInView.tsx` | `primaryColor` (1×) | ~117 (table status hex/rgba) | Medium | **~8%** |
| Third Party | `ThirdPartyView.tsx` | **none** | ~9 (platform brand colors) | Low (brand colors intentional) | **0%** |
| Receipt | `ReceiptView.tsx` | `primaryColor` (1×) | ~15 | Low | **~10%** |
| Payment | `PaymentModal.tsx` | `primaryColor` (1×) | ~60 | Medium | **~8%** |
| Shell/Header | `POSShell.tsx` | `primaryColor`, `secondaryColor` | ~12 | Medium | **~30%** |
| pos-ui components | `MenuGrid/CartSidebar/CheckoutButton` | `primaryColor`, `secondaryColor` | ~40 | Low (they already accept theme) | **~40%** |

**Overall theme compliance: ≈ 12%** — only CTAs, active-tab states, and a handful of
accents react to a tenant's theme. There is currently **no light/dark/custom switching**
and the majority of the design language (grays, status colors, charts, sidebar) is fixed.

---

## 10. Theme Extension Guide

> Note: this describes the *recommended* target architecture. **None of this exists yet.**

To build new pages that automatically support Light/Dark/Custom/Brand themes without
writing custom colors:

1. **Introduce CSS custom properties as the single source of truth.** Define tokens in
   `globals.css` on `:root` (light) and `.dark` (dark), generated from the tenant
   `ThemeConfig` at runtime by injecting a `<style>` tag with the tenant's colors (e.g.
   `--primary: {primaryColor}`).

   ```css
   :root {
     --background: #f9fafb; --foreground: #111827;
     --primary: #ff6600; --primary-foreground: #ffffff;
     --card: #ffffff; --border: #e5e7eb; --muted: #6b7280;
     --success: #16a34a; --warning: #d97706; --danger: #dc2626;
     --sidebar: #1a1a1a; --header: #ffffff;
   }
   ```

2. **Map tokens into Tailwind** via `theme.extend.colors`:

   ```ts
   extend: {
     colors: {
       background: 'rgb(var(--background) / <alpha-value>)',
       foreground: 'rgb(var(--foreground) / <alpha-value>)',
       primary: { DEFAULT: 'rgb(var(--primary) / <alpha-value>)', foreground: '…' },
       card: '…', border: '…', muted: '…',
       success: '…', warning: '…', danger: '…', sidebar: '…', header: '…',
     },
   }
   ```

3. **Use only semantic classes** in components: `bg-background`, `text-foreground`,
   `bg-card border-border`, `text-muted`, `bg-primary text-primary-foreground`,
   `text-success`, `text-warning`, `text-danger`, `bg-sidebar`, etc. Never write
   `bg-gray-50` or `text-blue-600` in new code.

4. **Map status/order/payment/chart/kitchen colors to tokens** once (see the token map
   in Sections 3 & 12) and reuse everywhere instead of duplicating per-view maps.

5. **Add a dark-mode toggle** that toggles the `dark` class on `<html>` (or a tenant
   setting that does the same). The `dark_mode` flag already exists in POS Settings but
   is unimplemented.

6. **Wire tenant colors at runtime** in `POSShell`/layout: convert `theme_config` →
   CSS variables before first paint (inline `<style>` or a small client effect) so every
   new page is brand-tinted automatically.

---

## 11. Component Design Rules

These are the **de-facto** conventions observed (none are enforced by tokens):

| Rule | Current convention |
|---|---|
| Spacing system | Tailwind default scale: `p-1/2/3/4/6`, `gap-1.5/2/3/4`, `px-2.5`, `py-1.5`, `space-y-2/3/4`. Standard card padding `p-3 md:p-4`, page `p-4 md:p-6`. |
| Border radius | `rounded` (4px) for inputs/buttons, `rounded-lg` (8px) for cards/inputs, `rounded-xl` (12px) for large cards, `rounded-full` for pills/avatars, `rounded-2xl` for mobile sheets. |
| Shadows | Mostly `shadow-sm`/`shadow-md`/`shadow-lg`; cards commonly `shadow-sm` or none + `border`. |
| Typography | Text sizes: `text-[9px]/[10px]/[11px]/xs` (dense labels), `text-sm` (body), `text-lg/xl/2xl` (headings). Headings `font-bold`/`font-semibold`. Uppercase tracking labels: `text-[10px] uppercase tracking-wider text-gray-400`. |
| Animation | `transition-colors`, `transition-all duration-200/300`, `hover:scale-[1.02] active:scale-[0.98]` on buttons. Custom `slideIn` keyframe in `globals.css`. |
| Hover states | `hover:bg-gray-50`, `hover:bg-gray-100`, `hover:text-red-600`, `hover:bg-red-50`. |
| Focus states | `focus:ring-2 focus:ring-blue-500 focus:border-transparent` (blue — not themed). |
| Selected states | `backgroundColor: theme.primaryColor` for active tabs/filters; `borderColor: theme.primaryColor` + ring for selected order cards; sidebar uses `accentColor+'26'`. |
| Cards | `bg-white rounded-xl border border-gray-200` (POS) / `rounded-lg border-gray-200` (admin/settings). |
| Tables | `divide-y divide-gray-200`, header `bg-gray-100 text-gray-600 uppercase text-sm`, row `hover:bg-gray-50`. |
| Buttons | Primary = themed `backgroundColor: theme.primaryColor` + white text + `rounded-lg/xl`; secondary = `border border-gray-300 text-gray-600 hover:bg-gray-50`; danger = `bg-red-*`. |
| Inputs | `border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm` + blue focus ring; `disabled:bg-gray-100`. |

---

## 12. Theme API

### 12.1 Types

```ts
// packages/gateway-sdk/src/index.ts  AND  packages/pos-ui/src/types.ts  (duplicated)
export interface ThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  fontFamily: string;
}
```

### 12.2 Server functions (gateway-sdk)

| Function | Signature | Purpose |
|---|---|---|
| `getTenantBySlug` | `(slug) => TenantResult \| null` | Loads tenant incl. `theme_config` |
| `getTenantById` | `(id) => TenantResult \| null` | Loads tenant by id incl. `theme_config` |
| `getAllTenants` | `() => TenantResult[]` | List all tenants + themes |
| `getAllTenantsWithBilling` | `() => TenantWithBilling[]` | Tenants + theme + billing |
| `updateTenantTheme` | `(id, themeConfig) => { success, error? }` | Persist new theme_config |
| `insertTenant` | `(data) => { success, tenantId? }` | Create tenant with `theme_config` |

### 12.3 Client hooks / helpers

| API | Location | Purpose |
|---|---|---|
| `usePOS()` | `pos-context.tsx` | Returns `{ theme, slug, brandName, currencySymbol, enabledModules, hiddenViews, pageTitle, setPageTitle, … }` |
| `POSProvider` | `pos-context.tsx` | Context provider |
| `ThemeConfig` (type) | `@sat-sys/pos-ui` + `@sat-sys/gateway-sdk` | Shape of theme object |
| `pos-ui` components | `MenuGrid`, `CartSidebar`, `CheckoutButton` | Accept `theme` prop |

### 12.4 Notes / gaps in the API

- `ThemeConfig` is **defined twice** with identical shape — should be a single shared type
  (currently `@sat-sys/ui` exists but exports nothing, and no shared types package exists).
- `design-tokens.ts` provides an unused token API (`STATUS_BADGE`, `CARD_CLASS`, etc.)
  that is a good starting point for the future token system but is not wired in.
- There is no `useTheme`, no `setTheme`, no theme persistence hook on the client.

---

## 13. Best Practices (for future pages)

1. **Never write raw color utilities in new components.** Use semantic tokens only:
   `bg-card`, `text-foreground`, `text-muted`, `border-border`, `bg-primary`,
   `text-danger`, `text-success`, `text-warning`. Reserve `gray-*` for nothing that should
   follow a theme.

2. **Consume the theme from `usePOS()` and pass it down** exactly as existing pages do
   (`const { theme, slug } = usePOS()` → `<View theme={theme} />`), but **stop using
   inline `style={{ backgroundColor: theme.primaryColor }}`** in favor of generated CSS
   variables / Tailwind semantic classes once the token system lands.

3. **Centralize status / order-type / payment / chart / kitchen color maps** in one file
   (fix the duplication across `CurrentOrdersView`, `KDSView`, `DashboardView`,
   `design-tokens.ts`). Map them to tokens rather than per-view hard-coded classes.

4. **Implement dark mode via a class on `<html>` + CSS variables**, and honor the existing
   `dark_mode` settings flag (`SettingsView` already collects it). Add `darkMode: 'class'`
   to `tailwind.config`.

5. **Add the missing tokens before building new surfaces:** background, foreground, card,
   border, muted, success, warning, danger, sidebar, header, chart palette, payment
   palette, kitchen/status palette.

6. **Wire tenant brand colors dynamically** (from `theme_config`) into CSS variables at
   render time so brand themes, light and dark all flow through the same classes.

7. **For new order/kitchen surfaces specifically:** replace `#C9972B` in `NewOrderView`
   and the `#2563eb/#d97706/#16a34a/#6366f1` kitchen action buttons with `token.primary` /
   status tokens.

8. **Kill duplicate `ThemeConfig` definitions** — export the type from one place
   (e.g. `@sat-sys/gateway-sdk` or a shared `@sat-sys/ui`) and import it everywhere.

9. **Follow the existing layout/spacing conventions** (Section 11) so pages look
   consistent, but express them with tokens so they stay theme-consistent too.

10. **Do not add `dark:`/`light:` Tailwind variants or CSS variables ad hoc** — define them
    once in `globals.css` + `tailwind.config.ts` and reuse across the app so switching
    themes updates every page automatically.
