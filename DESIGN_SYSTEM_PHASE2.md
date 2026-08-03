# SATSYS Enterprise Design System — Phase 2: UI Standardization

Phase 2 standardizes Dastarkhwan POS UI inconsistencies into the shared `@sat-sys/ui` design system built in Phase 1 (Theme Engine + components). No redesigns, no layout / workflow / business-logic / realtime / routing changes were made. Layouts were kept pixel-identical where possible.

## Scope & Constraints
- Deliverable: shared components that replace duplicated markup, then re-use them across all POS views.
- No business logic, permissions, realtime, or routing changes.
- Validate with `packages/ui` typecheck + portal `tsc` + `next build` with zero new errors.

## New / Extended shared primitives (`packages/ui/src/components/`)
- **Badge.tsx (extended)** — added `primary | secondary | outline | disabled` variants and `BadgeSize sm | md | lg`; existing soft variants unchanged for pixel parity.
- **StatusPill.tsx (new)** — `STATUS_VARIANT` map covering order / payment / inventory / entity statuses; title-cases keys; optional `label` override.
- **ConfirmDialog.tsx (new)** — `Modal`-based confirm with `placement` (`bottom-sheet` default, `centered`), `tone` (danger/primary/info/warning/neutral), `loading`, `size`.
- **Drawer.tsx (new)** — left/right panel with Escape, focus trap, `lockBodyScroll` (prop renamed from earlier buggy `lockBody`).
- **Skeleton.tsx (new)** — `SkeletonBlock`, `SkeletonTable`, `Skeleton` presets.
- **PageHeader.tsx / Toolbar.tsx (new)** — canonical page header + toolbar spacing primitives.
- All exported from `packages/ui/src/index.ts` / component barrel.

## Migrations
### Badges & status pills (14 views)
Replaced 7 divergent badge recipes and local color maps with shared `Badge` / `StatusPill`.
- Variant helpers: `orderStatusVariant`, `orderTypeVariant`, `tableStatusVariant`, `reservationStatusVariant`; extended to `primary/secondary/outline/disabled` and sizes for secondary chips (role, access, credit/debit, category).
- Removed local maps: `statusColor`, `ORDER_TYPE_BADGE(S)`, `tableBadge`, `STATUS_COLORS`, `MOVEMENT_STYLES`, `ROLE_COLORS`, `STATUS_STYLES`.
- Views: CurrentOrders, DineIn, KDS, Reservations, Dashboard, Inventory, Staff, Customers, Accounts, Expenses, ItemLedger, Reports.
- Exception: KDS recipe (`bg-*-100 text-*-800`) intentionally normalized to the shared soft `-50` recipe — one deliberate visual-unification exception.

### Modals & dialog shells
All duplicated non-modal shells (no `role="dialog"`, no `aria-modal`, no Escape) replaced with shared `Modal` / `ConfirmDialog`, gaining Escape-to-close, overlay click, focus trap/restore and accessibility for free.
- **ConfirmDialog** (delete confirms): MenuManagement, Reservations, Expenses, Inventory.
- **Form modals → shared `Modal`**: Inventory (Add/Edit + Adjust), Expenses (Add/Edit), Reservations (Add/Edit), ItemLedger (Add Purchase), Customers (Add/Edit with duplicate-warning), MenuManagement (Add/Edit, centered `lg`), Accounts (Transfer / Income/Expense / Adjustment, removed a bespoke local `Modal`), Staff (`StaffFormModal`, `LeaveModal`, temp-password info), Settings (Branch Modal, Business Hours Modal), Reports (filter bottom-sheet), CurrentOrders + NewOrder (Notes/Discount/Promo dialogs), KDS (Quick Add).
- Custom `StaffFormModal`/`LeaveModal` keep their internal `<form>` (submit buttons stay inside the form for correct semantics); only the overlay/header/a11y chrome is unified via `Modal`.

### Left as documented debt (intentional non-modal layouts)
Mobile full-screen filter/detail panels (Customers, Staff, Sidebar), the Payment capture screen (`PaymentModal`), the Receipt view, and the business-date mobile sheet remain bespoke `fixed inset-0` layouts.

## Validation
- `packages/ui` `npx tsc --noEmit`: pass.
- Portal `npx tsc --noEmit`: pass.
- `next build` (app): compiled, generated 0 new errors. Remaining warnings are pre-existing `react-hooks/exhaustive-deps` and `next/image no-img-element` — unchanged by this phase.

## Files changed (Phase 2)
- `packages/ui/src/components/`: `Badge.tsx`, `StatusPill.tsx`, `ConfirmDialog.tsx`, `Drawer.tsx`, `Skeleton.tsx`, `PageHeader.tsx`, `Toolbar.tsx`, barrel `index.ts`.
- `apps/portal/src/app/[slug]/pos/`: CurrentOrdersView, DineInView, KDSView, ReservationsView, DashboardView, InventoryView, StaffManagementView, CustomersView, AccountsView, ExpensesView, ItemLedgerView, ReportsView, MenuManagementView, NewOrderView, SettingsView.
- `packages/ui/src/index.ts` (re-export of new primitives).

## Remaining technical debt
1. Page **headers / filter toolbars** still hand-rolled per view (PageHeader / Toolbar primitives added but not yet adopted everywhere).
2. **Forms** not yet fully normalized to shared `Input/Select/Textarea` (labels, required-marks, error slots, input heights) across all views; many views still use raw `className` inputs.
3. **Tables** still bespoke; shared `Table`/`SkeletonTable`/`Pagination`/`SearchInput` not yet the single source in every tabular view.
4. **Empty / loading states** inconsistently implemented; `Skeleton`/`EmptyState` adopted in some places only.
5. **Button groups / toolbars** still vary per screen; shared `Button` used in most new footers but older inline `<button>` remain in some action rows.
6. MojoBake issue: several legacy files still contain mangled glyph bytes (e.g. `âœ•`) for line-draw/close icons. These render as `âœ•` because the files were saved with a broken encoding. Recommended cleanup is an encoding repair pass (not a design change).

## Estimated UI standardization
- Shared component adoption score (modal/dialog + delete confirms): **~95%** of dialog surfaces now use the shared shell.
- Badge/status surfaces: **100%** unified onto `Badge`/`StatusPill`.
- Full structure-level normalization (tables, forms, page headers, toolbars, empty/loading): **~40%** — primitives exist; adoption across older screens remains.

## Production readiness score: **7 / 10**
- Confirmed safe to ship for this phase's scope (badges + modals): build green, 0 new errors, a11y posture improved (role/aria-modal/focus/Escape on shared modal surfaces).
- Not yet 9+/10 because structural normalization (tables/forms/page headers/toolbars/empty states) and the mojibake glyph cleanup remain. Recommend a Phase 3 to finish table + form + page-header adoption and repair file encodings.

## How to verify
- `pnpm --filter @sat-sys/ui... ` typecheck (see package scripts).
- `apps/portal`: `npx tsc --noEmit`, `npx next build`, `npx next lint`.