# SAT SYS — Design System Implementation

**Application:** Dastarkhwan — Multi-brand POS Portal
**Scope:** POS views + shared `@sat-sys/ui` component library + global standards
**Phase:** Implementation. This phase migrated the codebase from hand-rolled utility
markup to the theme engine built in the previous phase, replaced hard-coded colors
with semantic tokens, standardized global focus/interaction behavior, and introduced
a shared component library. No page was redesigned, no layout was changed, and no
business logic/workflow/data access was modified.
**Validated:** `@sat-sys/ui` `tsc --noEmit` ✓ · portal `tsc --noEmit` ✓ ·
`next build` ✓ (0 errors) · `next lint` (only pre-existing warnings)

---

## 1. What Was Done

### 1.1 Shared component library (`@sat-sys/ui`)

A primitive component kit now lives in `packages/ui/src/components/` and is exported
from `@sat-sys/ui` (`export * from './components'`). Every component is:

- built on semantic CSS variables + Tailwind semantic utilities from the theme engine,
- theme-aware (renders with the tenant's resolved theme),
- accessible (aria attributes, keyboard support, focus handling),
- **visually identical to the existing POS look** (gray-50 backgrounds, white
  `rounded-xl` bordered cards, `#ff6600`-style primary actions).

| Component | Notes |
|---|---|
| `Button` | 8 variants (`primary/secondary/outline/ghost/danger/danger-outline/success/warning/info`), 6 sizes (`xs–lg`, `icon`, `icon-sm`), built-in loading spinner. |
| `ActionButton` | Legacy drop-in for the POS: accepts the old `{label, color, disabled, onClick, updating}` API (raw class passthrough) **and** the new `{tone, themePrimary, size, loading}` API. |
| `Card` + `CardHeader/CardBody/CardFooter` | Canonical `bg-white rounded-xl border border-gray-200 overflow-hidden` surface. |
| `Badge` | 9 variants (`success/warning/danger/info/neutral/purple/orange/teal/indigo`), `soft`/`solid` fills, `pill`/`dot` shapes. |
| `statusBadge` | Semantic maps: `ORDER_STATUS_VARIANT`, `ORDER_TYPE_VARIANT`, `TABLE_STATUS_VARIANT`, `RESERVATION_STATUS_VARIANT` + helpers. |
| `Input` / `Select` / `Textarea` | Label, `requiredMark`, error/hint with `aria-invalid` + `aria-describedby`, compact POS variant. |
| `SearchInput` | Magnifier, `role="searchbox"`, clear button. |
| `Modal` | Bottom-sheet on mobile / centered on `md+`, `role="dialog"`, Escape-to-close, focus trap + restore, overlay click, header close button, footer. |
| `Pagination` | Windowed page numbers, `aria-current`, FIRST/prev/next. |
| `Table` + `TableHeader/TableHead/TableBody/TableRow/TableCell` | Canonical `rounded-xl` table shell, header `bg-gray-50`, row hover/selected/cursor. |
| `Avatar` | Initials + hashed color palette + explicit `backgroundColor` prop. |
| `Switch` | `role="switch"`, checked state themed with the tenant primary color. |
| `Spinner` | `border-gray-300 border-t-gray-600`, sizes `xs–lg`. |
| `EmptyState` / `ErrorBanner` | Card and bare layouts; error tones `error/warning/success/info` + retry. |

### 1.2 Global standards (`apps/portal/src/app/globals.css`)

- **`:focus-visible` outline** using `var(--input-focus)` — every interactive element
  now shows a theme-colored focus ring even in views that previously had none.
- **Form-field focus** — `input/select/textarea:focus` gets the same ring.
- **Scrollbars** — thin, themed (`scrollbar-color: var(--border)`), 8px track.
- **`prefers-reduced-motion`** block — disables the slide-in/out animations.

### 1.3 Hard-coded colors → semantic tokens

The default theme tokens exactly mirror the existing palette, so **every replacement
is pixel-identical in the default theme** while becoming theme-driven.

| File | Before | After |
|---|---|---|
| `NewOrderView.tsx` | gold `#C9972B` | `theme.primaryColor` (component scope) / `text-primary` (MenuCard, CompactMenuItem) |
| `NewOrderView.tsx` | disabled gray `#9CA3AF` | `var(--input-placeholder)` (same hex) |
| `KDSView.tsx` | `#2563eb` / `#d97706` / `#16a34a` status buttons | `var(--info)` / `var(--warning)` / `var(--success)` |
| `Sidebar.tsx` | `#1A1A1A` / `#B8B6B0` / `#252525` | `bg-sidebar` / `text-sidebar-foreground` / `bg-sidebar-hover` |
| `POSShell.tsx` topbar | `bg-white border-gray-200` + inline brand color | `bg-navbar border-navbar-border`, `text-navbar-foreground` |
| Danger buttons (8 views) | `bg-red-600` / inline `#dc2626` | `bg-danger` + `hover:opacity-90` |
| `StaffManagementView.tsx` | `bg-blue-600 hover:bg-blue-700` | `bg-primary hover:bg-primary-hover` |
| `StaffManagementView.tsx` | `focus:ring-blue-500` | `focus:ring-input-focus` |
| `AccountsView.tsx` | account-type palette hexes | `var(--chart-1..5)`, `var(--badge-default)` |
| `PaymentMethodLogo.tsx` | duplicated account palette | same chart/`badge-default` vars |
| `reports-charts.tsx` | chart defaults `#3b82f6` etc. | `var(--chart-1)`, `var(--chart-grid)`, `var(--text-muted)` |
| `CustomersView.tsx` | indigo pagination active `#6366f1` | `var(--primary)` |
| `CurrentOrdersView.tsx` | unselected card border `#e5e7eb` | `var(--border)` |
| `ReportsView.tsx` | rank badge `#3b82f6`/`#9ca3af`, bar `#f59e0b` | `var(--info)`/`var(--input-placeholder)`, `var(--chart-2)` |

**Left untouched (deliberately):**
- `#6366f1` indigo "+Item" buttons in KDS (no semantic token exists; changing would be
  a visual regression).
- `AccountsView`/`CustomersView` avatar & metric text shades without exact tokens
  (`#374151` gray-700, `#1f2937` gray-800).
- Third-party brand colors (`Foodpanda #D70F64`, etc.).
- Reports heatmap blue ramp, DineIn table-status border/tint shades.

### 1.4 Deduplication

- **`ActionButton`** was copy-pasted verbatim in `CurrentOrdersView` and `DineInView`.
  Both now delegate to the shared `@sat-sys/ui` `ActionButton`. `CurrentOrdersView`
  keeps its `memo`-wrapped local wrapper (calling `SharedActionButton`) to preserve the
  existing renderer behavior; `DineInView` uses the shared component directly.

---

## 2. Validation

| Check | Result |
|---|---|
| `pnpm --filter @sat-sys/ui lint` (`tsc --noEmit`) | ✓ 0 errors |
| portal `npx tsc --noEmit` | ✓ 0 errors |
| portal `npx next build` | ✓ compiled, 0 errors, all 27 routes built |
| portal `next lint` (via build) | only pre-existing warnings (exhaustive-deps, no-img-element) |

---

## 3. Remaining Inconsistencies (future work)

These are **documented, not changed**, because standardizing them would alter current
pixel output and contradict the "keep layouts identical" constraint.

1. **Badge recipes** still diverge across legacy views: `bg-*-100 text-*-800` (KDS),
   `bg-*-50 text-*-700 border border-*-200` (CurrentOrders/Customers/etc.),
   `bg-*-100 text-*-700 border` (Staff), `bg-*-100 text-*-700` (Inventory).
   The shared `Badge`/`statusBadge` maps encode the recommended recipe for new code.
2. **Modal chrome** — most legacy modals are hand-rolled bottom-sheets. The shared
   `Modal` implements the standardized chrome (Escape, focus trap, close button, role);
   adopt it in the highest-drift views as a follow-up.
3. **Tables** in legacy views use varied shells; the shared `Table` kit defines the
   canonical one.
4. **`design-tokens.ts`** (`packages/pos-ui`) is still unused by views — the semantic
   Tailwind utilities + `@sat-sys/ui` components supersede it.

---

## 4. Files Changed

**New:**
- `packages/ui/src/components/*.tsx` (16 components) + `components/index.ts`
- `DESIGN_SYSTEM_IMPLEMENTATION.md` (this file)

**Modified (this phase):**
- `apps/portal/src/app/globals.css` — global focus/scrollbar/reduced-motion standards
- `apps/portal/src/app/[slug]/pos/NewOrderView.tsx`
- `apps/portal/src/app/[slug]/pos/StaffManagementView.tsx`
- `apps/portal/src/app/[slug]/pos/KDSView.tsx`
- `apps/portal/src/app/[slug]/pos/Sidebar.tsx`
- `apps/portal/src/app/[slug]/pos/POSShell.tsx`
- `apps/portal/src/app/[slug]/pos/CurrentOrdersView.tsx`
- `apps/portal/src/app/[slug]/pos/DineInView.tsx`
- `apps/portal/src/app/[slug]/pos/MenuManagementView.tsx`
- `apps/portal/src/app/[slug]/pos/InventoryView.tsx`
- `apps/portal/src/app/[slug]/pos/ReservationsView.tsx`
- `apps/portal/src/app/[slug]/pos/ExpensesView.tsx`
- `apps/portal/src/app/[slug]/pos/CustomersView.tsx`
- `apps/portal/src/app/[slug]/pos/AccountsView.tsx`
- `apps/portal/src/app/[slug]/pos/ReportsView.tsx`
- `apps/portal/src/app/[slug]/pos/reports-charts.tsx`
- `apps/portal/src/app/[slug]/pos/PaymentMethodLogo.tsx`
- `packages/ui/src/index.ts` — exports components + theme engine

**Pre-existing from the theme-engine phase (not this phase):**
- `packages/ui/src/theme/*`, `apps/portal/tailwind.config.ts`, `pos-context.tsx`,
  `packages/gateway-sdk/*`, `packages/pos-ui/*`, `DESIGN_SYSTEM.md`, `THEME_ENGINE.md`
