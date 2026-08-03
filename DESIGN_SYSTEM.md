# SAT SYS — Design System Audit

**Application:** Dastarkhwan — Multi-brand POS Portal
**Scope:** Entire application (POS views, shared components, admin dashboard, landing/auth pages)
**Audit type:** Analysis only. No code was modified, no UI changed, no migration performed.
**Audited codebase:** `apps/portal` + `@sat-sys/pos-ui` + `@sat-sys/ui` (theme engine)

---

## 0. Executive Summary

The application is a functionally rich multi-tenant restaurant POS with **22 routed
views** and **~22,000 lines** of view source. It uses **Tailwind CSS (v3.4)** utility
classes exclusively — there is **no component library** (no shadcn, no Radix, no
Headless UI) and **no icon library** (no lucide, heroicons, react-icons). All UI is
hand-built utility markup.

Because there is no shared primitive layer, the same visual concept is re-implemented
per view with slightly different class recipes. This produces a **broadly coherent
visual language** (gray-50 page backgrounds, white `rounded-xl` bordered cards,
`theme.primaryColor` injected via inline styles) but with **systematic drift** across
views in radius, button padding, focus states, badge shape, modal chrome, and touch
targets.

The theme engine added to `@sat-sys/ui` now exposes semantic CSS variables and a
Tailwind extension, but **no component consumes them yet** — all accent colors are
still delivered as inline `style={{ backgroundColor: theme.primaryColor }}`.

**Top systemic findings:**
1. **No shared component library** — every card, button, input, modal, badge and table
   is hand-rolled per view (see §17 Component Inventory for the duplicate count).
2. **Primary-color mechanism is inconsistent** — inline `theme.primaryColor` in most
   views, but hardcoded Tailwind `blue-600` in Staff/Settings, hardcoded gold
   `#C9972B` in NewOrderView, and hardcoded `bg-orange-*` nowhere (the orange in the
   app is entirely theme-driven).
3. **Badge recipe diverges in 3+ ways** — `bg-*-100 text-*-800` (KDS), `bg-*-50
   text-*-700 border border-*-200` (CurrentOrders, Customers, ItemLedger, Reservations,
   Admin), `bg-*-100 text-*-700 border` (Staff), `bg-*-100 text-*-700` no border
   (Inventory).
4. **Focus states are inconsistent** — Staff/Settings/pos-ui search have
   `focus:ring-2 focus:ring-blue-500`; ~60% of inputs elsewhere have no focus styles.
5. **Modal chrome varies** — bottom-sheet (`items-end md:items-center` + `rounded-t-xl
   md:rounded-lg`) in most data views; centered (`items-center justify-center`) in
   MenuManagement, Admin, Settings; header bar + SVG close only in PaymentModal and
   Accounts; no close button in MenuManagement, Admin Theme, Settings modals.
6. **Touch targets** — `min-h-[44px]`/`min-h-[56px]` present in PaymentModal, Accounts,
   CurrentOrders, NewOrder keypad; absent everywhere else (buttons as small as
   `px-2 py-1 text-[10px]`).
7. **ARIA usage is near zero** — `aria-label`/`aria-invalid`/`aria-describedby` in a
   handful of inputs; no dialog roles, no focus traps, no Escape-to-close in most
   modals, no focus-visible styling.

---

## 1. Typography

### 1.1 Font stack

| Context | Source | Stack |
|---|---|---|
| Whole app | `globals.css` `:root` (`--font-body`, `--font-heading`) | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"` |
| Mono | `globals.css` (`--font-mono`) | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace` |
| Tenant brand | ThemeConfig `fontFamily` | Fallback to system stack; **not actually applied to any element** (only used in the admin Theme preview panel) |
| Receipt print | `ReceiptView` print CSS | `'Courier New', Courier, monospace` (thermal 80mm) |

### 1.2 Size scale in use

The default Tailwind scale is overridden centrally in `tailwind.config.ts` to CSS
variables; every size listed resolves to the standard Tailwind value:

| Token | rem / px | line-height |
|---|---|---|
| `text-xs` | 0.75rem / 12px | 1rem |
| `text-sm` | 0.875rem / 14px | 1.25rem |
| `text-base` | 1rem / 16px | 1.5rem |
| `text-lg` | 1.125rem / 18px | 1.75rem |
| `text-xl` | 1.25rem / 20px | 1.75rem |
| `text-2xl` | 1.5rem / 24px | 2rem |
| `text-3xl` | 1.875rem / 30px | default |

**Arbitrary sizes used** (Tailwind `text-[…]` / inline `fontSize`) — a clear
anti-pattern cluster:
`text-[7px]` `text-[8px]` `text-[9px]` `text-[10px]` `text-[11px]`
`text-[15px]` (inline) `text-[16px]` (inline) — NewOrder
`text-[17px]` — Sidebar icons only.

`text-[7px]` (NewOrder sidebar status chips) is at/below the practical readability
floor.

### 1.3 Heading hierarchy

| Level | Pattern (observed, NOT standardized) | Weight | Examples |
|---|---|---|---|
| H1 / page title | `text-2xl md:text-3xl font-bold text-gray-800` | 700 | Admin Dashboard, Dashboard page |
| H2 / card/module title | `text-lg font-semibold text-gray-800` **or** `text-lg font-bold text-gray-800` | 600–700 (inconsistent) | Inventory modals (`semibold`) vs MenuManagement modals (`bold`) |
| Section heading | `text-sm font-semibold text-gray-700` | 600 | Card titles in Customers/Accounts |
| Micro heading | `text-xs font-bold/semibold text-gray-400/500 uppercase tracking-wider` | 600–700 | Category headers, table titles, KDS group headers |
| Sub-micro | `text-[10px] text-gray-500 uppercase tracking-wider` | 500 | Stat labels (Customers, Accounts, Reports) |
| Chart/text labels | `text-[9px]`/`text-[10px]` SVG fills `#9ca3af` | 400 | reports-charts |

### 1.4 Body hierarchy

| Role | Pattern |
|---|---|
| Primary body | `text-sm text-gray-600` |
| Primary body (stronger) | `text-sm text-gray-800` |
| Muted body | `text-sm text-gray-500` |
| Fine print / hints | `text-xs text-gray-400` |
| Micro hints | `text-[10px] text-gray-400` |

### 1.5 Caption / label hierarchy

| Role | Pattern |
|---|---|
| Form field label | `text-sm font-medium text-gray-700` **or** `text-sm text-gray-600` (inconsistent weight) |
| Form field label (Settings) | `text-[11px] font-medium text-gray-500` |
| Compact field label (POS) | `text-xs font-medium text-gray-600` |
| Stat/column label | `text-[10px] text-gray-500 uppercase tracking-wider` |
| Badge label | `text-[10px] font-semibold` / `text-xs font-medium` (inconsistent) |

### 1.6 Button / interactive text

| Role | Pattern |
|---|---|
| Large primary button | `text-sm font-bold` (POS checkout) / `text-sm font-semibold` (ActionButton) / `text-sm font-medium` (data views) — three weights |
| Header action button | `text-sm font-medium` (Customers, Inventory, Expenses) / `text-xs font-semibold` (Reports) / `text-xs font-medium` (Staff) |
| Row action | `text-xs font-medium` or `text-[10px] font-medium` |
| Tab | `text-xs font-semibold` (Reports) / `text-sm font-semibold` (KDS) / `text-xs sm:text-sm font-medium` (Accounts) |

### 1.7 Table text

| Role | Pattern |
|---|---|
| Table header | `text-xs uppercase tracking-wider text-gray-400` (or `text-[10px]` in Accounts) |
| Table cell | `text-sm` (most) / `text-xs` (Reports, Receipt, KDS list) |
| Numeric cell | `text-sm font-medium` or `font-semibold`; amounts frequently `font-mono` (Accounts, ItemLedger) or `tabular-nums` (MenuManagement, KDS timer, Dashboard) |
| Empty cell | `text-gray-300` (`—`) |

### 1.8 Letter-spacing

Only two tracking values are used, consistently: `tracking-wider` (uppercase section
heads, table heads, stat labels) and `tracking-wide` (KDS items label, Reservations
thead). `tracking-widest` once (landing page sub-brand). Everything else inherits
`normal`.

---

## 2. Spacing

### 2.1 Page scaffolding

| Element | Pattern |
|---|---|
| POS view root | `flex-1 overflow-y-auto scrollbar-hide bg-gray-50` |
| Page horizontal/vertical padding | `p-4 md:p-6` (majority) — **exceptions:** Dashboard `p-4 md:p-6`, Inventory `p-6`, Reports `p-3 md:p-4`, Accounts `p-3 sm:p-4 md:p-6` |
| Content max-width | **Inconsistent:** `max-w-6xl` (Dashboard, Reservations), `max-w-7xl` (Customers, Reports), `max-w-5xl` (ItemLedger, Expenses), `max-w-4xl` (Inventory, ThirdParty), inline `maxWidth: 1200` (Accounts), none (MenuManagement, KDS, DineIn, NewOrder, CurrentOrders) |
| Summary grid | `grid grid-cols-2 lg:grid-cols-4 gap-3` (Customers, Staff) — `gap-3` vs Dashboard `gap-4` |
| Card list gap | `space-y-3` / `space-y-4` (inconsistent) |

### 2.2 Core spacing scale in use

| Utility | Value | Notes |
|---|---|---|
| `gap-1` / `gap-1.5` | 4 / 6px | icon clusters, qty steppers |
| `gap-2` | 8px | button clusters, icon+label |
| `gap-3` | 12px | card grids, form stacks, action rows |
| `gap-4` | 16px | summary grids, section gaps |
| `gap-5` | 20px | DineIn grid |
| `gap-6` | 24px | two-column layouts (Accounts) |
| `p-1.5` / `p-2` | 6 / 8px | compact rows, badges |
| `p-3` | 12px | order cards, panel padding |
| `p-4` | 16px | card padding (majority) |
| `p-5` / `p-6` | 20 / 24px | modals, large cards |
| `px-2 py-1` | 8×4px | micro buttons, chips |
| `px-3 py-2` | 12×8px | inputs, buttons (common) |
| `px-4 py-2` | 16×8px | header buttons, modal buttons |
| `px-4 py-3` | 16×12px | table cells, list rows |
| `space-y-2` / `space-y-3` | 8 / 12px | stacked lists |
| `space-y-4` / `space-y-5` / `space-y-6` | 16 / 20 / 24px | section spacing |

### 2.3 Section / form / table spacing

| Context | Pattern |
|---|---|
| Section gap inside view | `space-y-4` (Reports, KDS `space-y-6`, CurrentOrders `space-y-4`) |
| Header→content gap | `mb-4` / `mb-5` / `mb-6` (all three appear) |
| Form field stack | `space-y-3` (Inventory/ItemLedger/Expenses/Reservations) vs `space-y-4` (Customers/Staff/Accounts) |
| Form field label→input | `mb-1` |
| Table cell padding | `px-4 py-3` (all desktop tables) |
| Table header padding | `px-4 py-3` |
| Card internal | `p-4` standard; `p-3` compact (Settings cards, Reports cards) |
| Modal body | `p-5` (CurrentOrders, Reports drawer) / `p-6` (Inventory, Accounts body `p-4`) |

---

## 3. Cards

### 3.1 The canonical recipe

The dominant card shell across the app:
```
bg-white rounded-xl border border-gray-200 p-4
```
(with `overflow-hidden` when wrapping a table). **Exceptions:**
- `rounded-lg` instead of `rounded-xl`: Reservations mobile cards (`rounded-lg
  shadow-sm`), ThirdParty platform cards, Settings `Card`, CartSidebar line items
  (`rounded`), pos-ui drawer sheet (`rounded-t-2xl`).
- `shadow-sm` added: Accounts cards/tables (all), Reservations mobile cards.
- `shadow-md`: admin POS cards, `shadow-lg`: dashboard/landing.
- `shadow` / `shadow-lg` on hover: Dashboard `PosCard` (`hover:shadow-lg`), KDS
  ticket cards (`shadow-sm hover:shadow-md`), MenuManagement `MenuCard`
  (`hover:shadow-lg`).

### 3.2 Card type inventory

| Card type | Location | Padding | Radius | Border | Shadow | Hover | Notes |
|---|---|---|---|---|---|---|---|
| Metric/summary card | DashboardView | `p-4` | `rounded-xl` | `gray-200` | none | none | label + `text-2xl font-medium` value |
| Summary stat (colored) | Staff, Customers, ItemLedger day-tiles | `p-3 md:p-4` / `p-4` | `rounded-xl` / `rounded-lg` | `gray-200`/colored | none | none | tinted `bg-*-50` variants |
| Balance card | Accounts | `p-3 sm:p-4` | `rounded-xl` | `gray-200` | `shadow-sm` | none | icon tile + label + bold value |
| Kitchen ticket | KDSView | body `p-4` + footer `px-4 pb-4` | `rounded-2xl` | `border-2` (colored by overdue/status) | `shadow-sm hover:shadow-md` | yes | only `border-2` card in app; clickable header |
| Order list card | CurrentOrdersView | `p-3` | `rounded-xl` | inline `#e5e7eb` / primary + ring | none | `hover:bg-gray-50` | selected = inline ring |
| Menu tile | NewOrderView | `p-2.5` | `rounded-xl` | `gray-200` | `hover:shadow-lg` | yes | `aspect-[4/3]` image area |
| Customer card (mobile) | CustomersView | `p-4` | `rounded-xl` | `gray-200` | none | `hover:bg-gray-50` | avatar + pill + stats + actions |
| Staff card (mobile) | StaffManagementView | `p-4` | `rounded-xl` | `gray-200` | none | `active:bg-gray-50` | |
| Inventory/Expense/ItemLedger card (mobile) | respective views | `p-4` | `rounded-xl` | `gray-200` | none | none | meta grid `grid-cols-2` |
| Transaction card (mobile) | AccountsView | `p-3` | `rounded-lg` | `gray-200` | none | none | smaller than siblings |
| Report card | ReportsView | `p-3 md:p-4` | `rounded-xl` | `gray-200` | none | none | optional `Card` title with `border-b` |
| Reservation card (mobile) | ReservationsView | `p-4` | `rounded-lg` | `gray-200` | `shadow-sm` | none | `opacity-60` if not confirmed |
| Table tile | DineInView | `p-3 md:p-4` | `rounded-xl border-2` | status color | `hover:shadow-md` | yes | `ring-2 ring-blue-400` when selected; inline translucent bg |
| Settings card | SettingsView | `p-3` | `rounded-lg` | `gray-200` | none | none | `Card` component with optional `border-b` title |
| Platform card | ThirdPartyView | `p-5` | `rounded-lg` | `gray-200` | none | none | logo square + text + disabled button |
| Filter/toolbar card | Customers/Reports/Reservations/Expenses | `p-3`–`p-4` | `rounded-xl` | `gray-200` | none | none | |

### 3.3 Card anatomy inconsistencies

- **Headers:** some cards use an `<h3>` title (`text-sm font-semibold text-gray-700`),
  some use an uppercase micro-title (`text-xs ... uppercase tracking-wider`), some have
  none. Settings `Card` adds a `border-b` under the title; Dashboard does not.
- **Footers:** only KDS ticket cards have real footers; data cards expose actions
  inline or in an action row.
- **Hover:** only KDS, MenuCard, customer/order cards and dashboard POS cards hover;
  metric and report cards have no hover.
- **Selected state:** CurrentOrders uses an inline ring (`boxShadow: 0 0 0 2px
  primary+'20'`), Customers/Staff use `bg-blue-50` row tint, Accounts uses `bg-gray-50`,
  DineIn uses `ring-2 ring-blue-400` — four different selected-state mechanisms.

---

## 4. Buttons

### 4.1 The two primary mechanisms (major inconsistency)

1. **Theme-driven (inline):** `style={{ backgroundColor: theme.primaryColor }}` on
   `text-white` buttons. Used in: Dashboard (Refresh, action chips, keypad accents),
   CurrentOrders (New Order, Generate Invoice, Save, Place Order, modal saves),
   PaymentModal, Customers (Add, Save, Deactivate, filter chips, quick action),
   Inventory, MenuManagement, ItemLedger, Expenses, Reservations, Reports (tabs,
   granularity), DineIn (Save), Settings, pos-ui (CheckoutButton, + badge, mobile bar).
2. **Hardcoded palette classes:** `bg-blue-600 hover:bg-blue-700` primary in
   **StaffManagementView** (add staff, save, reset, copy creds, pagination) and
   **SettingsView** form fields' ring color is `blue-500`. The NewOrderView hardcodes
   **gold** `#C9972B` for ALL primary actions, and its disabled Place Order state uses
   `#9CA3AF` (gray-400).

**Result:** a single tenant's "primary" color appears as orange in 80% of views, blue
in Staff/Settings, gold in New Order, and blue-600 for various status actions
(Start Cooking / Print / +Item / pagination) everywhere.

### 4.2 Variant inventory

| Variant | Recipe (most common) | Notes |
|---|---|---|
| Primary (theme) | `px-4 py-2 text-sm text-white font-medium` + inline `theme.primaryColor` | weight varies: `font-medium` (data views) / `font-semibold` (ActionButton, MenuManagement) / `font-bold` (POS checkout, keypad actions) |
| Primary (large POS) | `w-full py-2.5 rounded-lg text-sm font-bold text-white` | CurrentOrders / NewOrder modals |
| Secondary / outline | `px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50` | universal |
| Ghost / text | `text-xs text-gray-600 hover:bg-gray-200` / link-style `text-blue-600 hover:underline` | Settings uses link-style `+ Add` |
| Danger solid | `px-4 py-2 text-sm rounded bg-red-600 text-white font-medium` | `hover:bg-red-700` present in MenuManagement/Admin, **absent** in Inventory delete modal |
| Danger outline | `px-2 py-1 text-xs rounded border border-red-300 text-red-600 hover:bg-red-50` | row-level delete |
| Success | `bg-green-600 hover:bg-green-700` (Complete, Activate, Create) | status actions |
| Status actions (KDS) | `flex-1 px-3 py-2 rounded-xl text-sm font-bold` + inline `#2563eb`/`#d97706`/`#16a34a`/`#6366f1` | grid cards; compact list variants `px-3 py-1.5 rounded-lg text-xs` |
| Ghost-danger | `text-gray-500 hover:text-red-600 hover:bg-red-50` | KDS cancel, Menu row delete |
| Disabled | `disabled:opacity-50` (majority) / `disabled:opacity-40` (pos-ui CheckoutButton, KDS? no) / `disabled:opacity-30` (Customers pagination) | three different opacity values |
| Loading | text swap (`Saving…`, `Deleting…`, `Processing…`, `...`) — no spinner inside buttons | |
| Icon button | `w-7 h-7 rounded text-sm font-bold hover:bg-gray-100` (qty steppers) / `p-1.5 hover:bg-gray-100 rounded-lg` (Accounts close) | |

### 4.3 Button size / touch-target inconsistencies

- **min-height enforced:** PaymentModal (`min-h-[44px]`, `min-h-[56px]`), Accounts
  (`min-h-[44px]`, tab `min-h-[44px]`, accordion header `min-h-[56px]`),
  CurrentOrders/NewOrder keypad (`min-h-[52px] xl:min-h-[56px]`), and PaymentModal
  method grid `min-h-[56px]`.
- **No min-height:** Customers, Staff, Inventory, ItemLedger, Expenses, Reservations,
  MenuManagement, Reports, Settings, KDS, DineIn, Dashboard — buttons as small as
  `px-2 py-1 text-[10px]` (well under 44px).
- **Row action size differs:** `px-2 py-1 text-xs` (Customers/Staff/Inventory/Expenses)
  vs `px-2.5 py-1 text-xs` (MenuManagement) vs `px-3 py-1.5 text-xs` (mobile cards).

---

## 5. Forms

### 5.1 Input recipes (three variants in active use)

| Variant | Classes | Used in |
|---|---|---|
| A (rounded) | `w-full px-3 py-2 border border-gray-300 rounded text-sm` | Inventory, ItemLedger, Expenses, Reservations, Customers, CreateTenantModal |
| B (rounded-lg) | `w-full px-3 py-2 border border-gray-300 rounded-lg text-sm` | MenuManagement, Staff (with focus), Accounts (`py-2.5`), Settings (`px-2.5 py-1.5 ... rounded text-xs`), NewOrder/CurrentOrders (`px-2.5 py-1.5`) |
| C (POS compact) | `w-full px-2.5 py-1.5 text-sm border rounded-lg border-gray-300` | CurrentOrders, NewOrder, DineIn field inputs |

**All three coexist**, with variant C used for POS order fields and variant A/B for
management CRUD.

### 5.2 Focus states — major inconsistency

| Group | Focus treatment |
|---|---|
| Staff (all inputs/selects/textarea/checkbox) | `focus:outline-none focus:ring-2 focus:ring-blue-500` ✅ |
| Settings (all `F()` fields, selects, threshold, branch-name) | `focus:ring-2 focus:ring-blue-500` (+`focus:border-blue-500`) ✅ |
| pos-ui MenuGrid search | `focus:outline-none focus:ring-2 focus:border-transparent` (default blue ring) ✅ |
| CurrentOrders search input | `focus:bg-white focus:ring-2 ... transition-all` (ring color unspecified → default blue) ✅ |
| NewOrder menu search | `focus:ring-2 focus:ring-amber-200 focus:border-amber-400` (amber, brand-specific) ⚠️ |
| Customers, Inventory, ItemLedger, Expenses, Reservations, MenuManagement, Reports, DineIn, PaymentModal, Accounts, Dashboard, KDS | **No focus styles** ❌ |

### 5.3 Input types / semantics

- Text, tel (phone), email, url, number (`step="0.01"` / `step="any"`, `min="0"`),
  date, time, color (admin), password, textarea (`rows={2-3}`), checkbox, radio.
- **`inputMode="decimal"`** present in PaymentModal and Accounts number fields; **absent**
  in Inventory/ItemLedger/Expenses/NewOrder number fields (desktop only inputs).
- **Mobile-safe 16px font:** PaymentModal inputs use `text-[16px]` explicitly;
  elsewhere inputs default to `text-sm` (14px) — iOS zoom risk on mobile.
- **Search inputs** use icon-inside pattern: `relative` wrapper + `absolute left-3`
  SVG + `pl-9`/`pl-10` padding. Consistent across Customers/Staff/MenuGrid/
  NewOrder/CurrentOrders. Icon sizes `w-4 h-4`.

### 5.4 Selects

Native `<select>` throughout (no custom dropdown). Recipes mirror inputs
(`border-gray-300 rounded`/`rounded-lg`). Empty options use `— Select —` /
`-- Select --` / `— select —` (three variants).

### 5.5 Checkboxes / radios / switches / date pickers

| Control | Notes |
|---|---|
| Checkbox | Native; `text-blue-600` accent (Staff, Reports, Settings) or none (Menu, ItemLedger) |
| Radio | Native, unstyled (Inventory adj type, NewOrder schedule) |
| Switch (custom) | Hand-built `w-10 h-5 rounded-full` track + `w-4 h-4` knob with `translate-x-5` (MenuManagement availability, Admin modules) — green/gray. No `role="switch"`/`aria-checked` |
| Date picker | Native `<input type="date">` everywhere; `BusinessDatePicker` is a custom dropdown (presets grid + native date input) |

### 5.6 Validation & errors

- Field-level: input gets `border-red-400 bg-red-50`; message `text-[11px] text-red-600
  mt-1` (CurrentOrders, NewOrder, DineIn) or `text-red-600 text-sm` (customers forms,
  Expenses, Inventory, ItemLedger). **Two message styles.**
- Required marker: `<span className="text-red-500">*</span>` (NewOrder, DineIn) vs
  `text-red-400` (Accounts) vs `*` in label text (Customers, Admin).
- Error banner: `bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm
  mb-4` — this recipe is used consistently in ~8 views.
- Server errors: `console.error` only in MenuManagement, Reports; banner + retry in
  PaymentModal/ItemLedger/CurrentOrders.

---

## 6. Tables

### 6.1 Common recipe

```
Desktop only (table + mobile-card dual rendering):
wrapper:  bg-white rounded-xl border border-gray-200 overflow-hidden
table:    w-full text-sm
thead:    bg-gray-50 (some) border-b border-gray-200 text-gray-400 text-xs uppercase tracking-wider
th:       px-4 py-3 font-medium (text-left/right/center by column)
tbody tr: border-b border-gray-100 hover:bg-gray-50
td:       px-4 py-3
```

**Header background inconsistent:** Customers, Inventory, ItemLedger, Expenses,
Reservations, Accounts thead = `bg-gray-50`; **Staff thead has no background**; KDS
list/Reports tables use no background and no `bg-gray-50` either.

### 6.2 Table inventory

| Table | Sort | Filter | Pagination | Row select | Density |
|---|---|---|---|---|---|
| Admin tenants | none | none | none | no | `px-4 py-3` |
| Customers | chips (↕/↑/↓ text glyphs) | chips + search | yes (`PAGE_SIZE 15`) | row click → detail; `bg-blue-50` | `px-4 py-3` |
| Staff | client sort select | search + role/status/login selects | yes (windowed 5) | row click → panel; `bg-blue-50` | `px-4 py-3` |
| Inventory | none | none | none | no | `px-4 py-3` |
| ItemLedger | none (server order) | date | none (`limit 200`) | no | `px-4 py-3` |
| Expenses | none | category select | none | no | `px-4 py-3` |
| Accounts | none | tab strip + row select | none (`limit 100`) | row click → `bg-gray-50` | `px-4 py-3` |
| Reservations | none | mode buttons + date | none | no | `px-4 py-3` |
| Reports (6 tables) | none | drawer filters | none (slice 100/15) | no | `py-1`–`py-2` (denser) |
| KDS list view | none | order-type select | none | no | `px-4 py-3` |
| Order items (CurrentOrders/DineIn) | none | none | none | no | `py-2`/`py-1.5` |

### 6.3 Table inconsistencies

- **Pagination recipes differ:** Customers `px-2.5 py-1.5` + active `#6366f1` (inline);
  Staff `px-2 py-1` + active `bg-blue-600`; pagination bar footer `bg-gray-50` in
  Customers but transparent in Staff.
- **Numeric formatting:** `font-mono`/`tabular-nums` in some tables, plain in others.
- **Density:** Reports tables use `py-1`/`py-1.5`; CRUD tables `py-3`.
- **Selected rows:** `bg-blue-50` (Customers, Staff) vs `bg-gray-50` (Accounts).
- Responsive behavior is universally "desktop table + mobile card list" with the
  breakpoint varying: `md:` (Customers, Inventory, Expenses, ItemLedger, Reservations)
  vs `lg:` (Staff, Accounts).

---

## 7. Dialogs

### 7.1 Modal chrome inconsistency (major)

| Style | Overlay | Panel | Close | Used in |
|---|---|---|---|---|
| **Centered card** | `fixed inset-0 z-50 flex items-center justify-center bg-black/40` | `bg-white rounded-xl shadow-xl ...` | text `✕` (or none) | MenuManagement (no ✕), Admin (no ✕), Settings (no ✕), Reports drawer (centered at md) |
| **Bottom sheet mobile / centered desktop** | `fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40` | `bg-white md:rounded-lg shadow-xl w-full md:max-w-* mx-4 p-6 rounded-t-xl md:max-h-[90vh] md:overflow-y-auto` | `md:hidden` `✕` | PaymentModal, CurrentOrders (rounded-2xl), Inventory, ItemLedger, Expenses, Reservations, NewOrder (rounded-2xl) |
| **Header bar + panel** | `flex items-end md:items-center justify-center` + sibling backdrop | `bg-white md:rounded-lg rounded-t-xl max-h-[90vh] flex flex-col` with `px-4 py-3 border-b` header | SVG 18×18 `aria-label="Close"` | Accounts `Modal`, PaymentModal header |
| **Right slide-over** | `fixed inset-0 z-50 flex justify-end` + `bg-black/20` | `w-full max-w-lg bg-white shadow-2xl` + `animation: slideIn` | `✕` | KDS DetailPanel |
| **Full-page drawer (mobile)** | `fixed inset-0 z-50 lg:hidden bg-gray-50` | full screen + `min-h-full` | `✕` | Customers detail |
| **Bottom sheet** | `fixed inset-0 z-50 lg:hidden` + `bg-black/30` | `absolute bottom-0 ... bg-white rounded-t-2xl` + `safe-bottom` | `✕` | Customers/Staff filters, Staff detail, pos-ui cart |

### 7.2 Sizing

| Modal | Width |
|---|---|
| Form (CRUD) | `max-w-md` / `max-w-lg` |
| Confirm / small | `max-w-sm` |
| Payment | `max-w-lg` |
| CreateTenant | `max-w-2xl`, `max-h-[95vh]` |
| Drawer (desktop) | `w-96` (Customers, Staff), `max-w-lg` (KDS) |

### 7.3 Dialog behavior inconsistencies

- **Overlay close:** most close on overlay click; Admin/Settings/CreateTenant require
  clicking `e.target === e.currentTarget`; **no Escape-key** handlers anywhere except
  BusinessDatePicker.
- **Close buttons:** missing entirely from MenuManagement, Admin Theme/Modules, Settings
  branch/hours modals (only Save/Cancel).
- **Focus:** `autoFocus` only in CurrentOrders/NewOrder/PaymentModal/Customers/
  MenuManagement modals; no focus traps, no `role="dialog"`, no `aria-modal` anywhere.
- **Animations:** only KDS DetailPanel (`slideIn 0.2s`) and pos-ui drawer/knob
  transitions. Everything else mounts instantly.

---

## 8. Navigation

### 8.1 Sidebar (POS)

- Desktop: `hidden md:flex flex-col bg-[#1A1A1A] text-white`, `w-56` expanded / `w-16`
  collapsed (`transition-all duration-200`). Collapse toggle (▶/◀) at top.
- Mobile: `fixed w-64` off-canvas `-translate-x-full` → `translate-x-0` with
  `bg-black/40` scrim, `duration-300`.
- Nav items: 21 views grouped under "Orders" (expanding submenu, `ordersOpen` state).
- Icons: **emoji glyphs** (`⊞ ☰ 🍽 🛍 🚚 🚗 🤝 📋 📖 📦 👥 📊 💰 🏦 👤 ⚙`) rendered at
  `text-[17px] w-6`. Collapse glyphs `◀ ▶`, chevrons `▾ ▸`, close `✕`.
- Active state: inline `backgroundColor: accentColor + '26'` (15% alpha) + text
  `accentColor`, `font-semibold`; inactive `text-[#B8B6B0] hover:bg-[#252525]
  hover:text-white`. Hardcoded `#1A1A1A`/`#252525`/`#B8B6B0` (not theme tokens).

### 8.2 Topbar (POS header)

- `px-4 py-2.5 bg-white border-b border-gray-200 flex items-center justify-between`.
- Brand name `text-lg font-bold` colored with `theme.secondaryColor`.
- Breadcrumb `pageTitle` — `/` separator + `text-sm font-medium text-gray-600 truncate`.
- Search input (disabled) `w-48 xl:w-56 ... rounded-lg bg-gray-50`, `🔍` on mobile.
- `BusinessDatePicker`, `RealtimeIndicator`, Clerk `UserButton`.
- "← All POS" link for super admin (border + text in `theme.primaryColor`).

### 8.3 Tabs (within views)

| Location | Active recipe |
|---|---|
| Reports tabs | `px-3 py-1.5 rounded-lg` + inline primary bg |
| Accounts tabs | `px-3 py-2 rounded-lg min-h-[44px]` + inline primary |
| KDS status tabs | `px-4 py-2 rounded-lg` + `bg-gray-900 text-white shadow-sm` |
| Order-type tabs (NewOrder) | `px-3 py-1.5 rounded-lg` + inline **gold** `#C9972B` |
| Order-type tabs (CurrentOrders) | `flex-1 border-b-2` + inline `borderBottomColor: primary` |
| Category tabs (NewOrder) | pills + gold |
| Mode buttons (Reservations/Reports granularity) | `px-3 py-1.5 rounded` + inline primary |

**Four different active-state mechanisms** (inline bg, gray-900, gold, bottom-border).

### 8.4 Menus / dropdowns

- Customer search dropdowns: `absolute z-10 mt-1 w-full bg-white border border-gray-200
  rounded shadow-lg max-h-40 overflow-y-auto` (CurrentOrders, DineIn, NewOrder).
- BusinessDatePicker dropdown: `w-72 bg-white rounded-xl border border-gray-200
  shadow-lg p-4` (desktop) / bottom sheet (mobile).
- **No generic `<Menu>`/`<Dropdown>` component** exists; each is bespoke.

### 8.5 Breadcrumbs

Only the POS header breadcrumb (brand / pageTitle). No breadcrumb components in admin
or elsewhere.

---

## 9. Icons

### 9.1 Library status

**No icon library is installed or used** (verified: no lucide/heroicons/react-icons/
phosphor/tabler in any package.json). Icons are one of:

1. **Emoji / Unicode glyphs** — Sidebar nav icons (`⊞ ☰ 🍽 …`), POS action icons
   (`📅 🔍 🛒 👤 📝 🏷 🎟 🍲`), status glyphs (`↻ ⌫ △ ✕ ✖ ✓ ✗ ◯ · ▾ ▸ ▲ ▼`),
   collapse arrows (`▶ ◀`).
2. **Inline SVG (Heroicons-style)** — Customers, Staff, Accounts, pos-ui search,
   PaymentModal close, landing-page logo. Convention: `fill="none" stroke="currentColor"`
   `viewBox="0 0 24 24"` `strokeWidth={2}` `strokeLinecap/Linejoin="round"`.
3. **Raster images** — `PaymentMethodLogo` (jazzcash/easypaisa/cash PNGs via plain
   `<img>`, flagged by lint as `@next/next/no-img-element`).

### 9.2 Sizes / stroke

- Icon button SVGs: `w-3.5 h-3.5`, `w-4 h-4`, `w-5 h-5` (no single standard).
- Modal close: 18×18 SVG (Accounts, PaymentModal) vs `text-xl`/`text-2xl` text glyphs.
- Chart icons/dots: CSS spans (`w-2 h-2 rounded-full`).
- Payment logos: `size` prop 14/16/20/24 via `PaymentMethodLogo`.

### 9.3 Consistency findings

- Same icon drawn differently: close `✕` vs SVG X; refresh `↻` vs "Refresh" text vs
  disabled input.
- **Alignment:** some emoji glyphs render at `text-sm`, others `text-lg`/`text-xl`/
  `text-2xl`; nav icons are `text-[17px]` with `w-6 text-center`.
- No central icon component; the same magnifier/search SVG is duplicated in Customers,
  Staff, MenuGrid, NewOrder, CurrentOrders.

---

## 10. Colors

### 10.1 Theme mechanism

- Theme delivered by `@sat-sys/ui`: `ThemeConfig { primaryColor, secondaryColor,
  logoUrl, fontFamily, accentColor?, tokens?, branding? }`, resolved to CSS variables
  by `ThemeProvider` (`:root` block) and available as `resolvedTheme`/`themeCssVars`.
- Defaults mirror the current palette: primary `#ff6600`, secondary `#1a1a1a`, sidebar
  `#1A1A1A`.
- **Consumption:** components read `theme.primaryColor`/`theme.secondaryColor` via
  inline styles. The semantic utilities (`bg-primary`, `text-primary`, `bg-card`, …)
  defined in `tailwindThemeExtend` are **not used anywhere yet**.

### 10.2 Hardcoded colors (all must move to tokens)

| Value | Where |
|---|---|
| `#C9972B` (gold) | NewOrderView (tabs, categories, all primary actions, price text, disabled `#9CA3AF`) |
| `#ff6600` | Admin theme defaults, CreateTenantModal default |
| `#1a1a1a` / `#1A1A1A` | Sidebar bg, admin secondary default |
| `#B8B6B0` / `#252525` | Sidebar text/hover |
| `#D97B3F` | Landing page buttons |
| `#F5F1EA` | Landing page background |
| `#2563eb` `#d97706` `#16a34a` `#6366f1` | KDS status action buttons |
| `#dc2626` | Customers delete confirm, various delete buttons |
| `#3b82f6` / `#9ca3af` | Reports rank circles, chart default color |
| Chart palette | `#3b82f6 #f59e0b #8b5cf6 #10b981 #ef4444` (reports-charts, also in theme defaults) |
| Account type colors | `#10b981 #3b82f6 #f59e0b #8b5cf6 #ef4444 #6b7280` (Accounts TYPE_COLORS + PaymentMethodLogo FALLBACK_COLORS — **duplicated**) |
| Third-party brands | `#D70F64 #06C167 #00CCBC #F37320` (ThirdPartyView) |
| Table tile colors | DineIn inline `#86efac #fca5a5 #fcd34d`, `rgba(34,197,94,.08/.15)` etc. |
| Heatmap scale | `#f3f4f6 #dbeafe #93c5fd #60a5fa #3b82f6` (Reports) |
| `#e5e7eb` | CurrentOrders card border inline |
| Avatar palette | `['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6']` (Customers) |
| `#1e293b` | viewport themeColor (layout) |

### 10.3 Semantic / status colors (existing convention)

Consistent convention: `bg-{color}-50 text-{color}-700` with optional
`border border-{color}-200`:
- **pending/new** blue-50/700, **in_kitchen/preparing** amber-50/700, **ready**
  green-50/700, **completed** gray-50/500-700, **cancelled** red-50/700, **paid** green.
- Order types: dine_in purple, takeaway blue, delivery orange, drive_thru teal,
  third_party indigo/gray.
- Tables/reservations: available green, occupied red, reserved amber.
- Movement: purchase green, sale blue, adjustment amber, wastage red.
- Roles (Staff): owner purple, manager blue, cashier green, chef orange, kitchen_helper
  yellow, waiter cyan, storekeeper indigo, accountant rose, cleaner gray, custom teal.

### 10.4 Palette drift

- **KDS** uses `*-100 text-*-800` (no border); **CurrentOrders/ItemLedger/Reservations/
  Admin** use `*-50 text-*-700 border`; **Staff** roles `*-100 text-*-700 border`;
  **Inventory** `*-100 text-*-700` (no border); **Customers/Accounts** `*-50 text-*-700`
  with/without border.
- **Primary blues conflict:** semantic blue (`#3b82f6`, blue-600) for actions like
  "Start Cooking"/pagination/Add Staff collides with the informational blue.
- Sidebar/dark surfaces use raw hex not tokens; landing page uses a completely
  different palette (`#F5F1EA`/`#D97B3F`).

---

## 11. Responsive Design

### 11.1 Breakpoint usage

| Breakpoint | Used for |
|---|---|
| `sm:` | Landing page hero, grid minor adjustments, segmented toggles (hidden), summary grids |
| `md:` | Primary mobile/desktop split: `hidden md:block` table vs `md:hidden` cards (Customers, Inventory, Expenses, ItemLedger, Reservations); modal bottom-sheet→centered; nav sidebar visibility; grid columns |
| `lg:` | Second split in Staff/Accounts (table vs cards, side panels), DineIn grid 5 cols |
| `xl:` | Keypad height, NewOrder grid 5 cols, cart widths, search width |

### 11.2 Layout strategies

- **Dual rendering:** every CRUD list renders desktop `<table>` + mobile `<div>` card
  list (duplicated markup per view). Breakpoint varies (`md` vs `lg`).
- **Three-column POS** (NewOrder): left cart `w-[340px] xl:w-[380px]` (hidden <md),
  center menu, right calculator `md:w-[300px] xl:w-[320px]`; mobile uses a fixed bottom
  bar `md:hidden fixed bottom-0 ... z-40` + bottom-sheet drawers.
- **Two/three-column POS** (CurrentOrders): list `md:w-72`, detail, builder
  `md:w-[480px]`; mobile shows one panel at a time via a `pc()` helper toggling
  `hidden md:flex`.
- **DineIn:** floor-plan grid `grid-cols-2 sm:3 md:4 lg:5` + right panel
  `md:w-[480px]`; mobile panel switches.
- **Accounts:** `lg:flex` two-column with arbitrary `lg:w-[73%]`/`lg:w-[27%]`; sidebar
  duplicated for mobile + desktop.
- **Settings:** `grid-cols-1 md:grid-cols-2 lg:grid-cols-[5fr_2.8fr_2.2fr]`; sticky
  mobile save bar.
- **Touch/mobile specifics:** `pb-16 md:pb-0` clearance for fixed bars (NewOrder),
  `safe-bottom`/`pb-[env(safe-area-inset-bottom)]` (pos-ui, PaymentModal, Staff),
  `min-h-[44px]+` touch targets only in POS ordering paths.

### 11.3 Foldable / landscape / portrait

- No foldable-specific handling (no `env(safe-area-*)` for left/right insets, no
  `@media (orientation: …)`).
- PWA manifest present; viewport `themeColor` set; `h-screen h-dvh` used in POSShell.
- Landscape/portrait differences are implicit (grids collapse at `md`/`lg`).

---

## 12. Loading States

### 12.1 Recipe inventory

| Type | Recipe | Where |
|---|---|---|
| **Text-only** | `text-gray-500` "Loading..." | initial auth gate (Dashboard, CurrentOrders, DineIn, Reports, Customers, Staff, Inventory, Expenses, Accounts, ItemLedger, Reservations, NewOrder) — the universal pattern |
| **Text-only (data)** | `text-gray-400 text-sm` "Loading …" | per-list loading rows |
| **Spinner** | `w-6 h-6` / `w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin` | CurrentOrders fetch, KDS grid, NewOrder POS load, PaymentModal accounts |
| **Button label swap** | `Saving… / Deleting… / Processing… / ... / Updating…` | every mutation button |
| **Pulse** | `animate-pulse` | RealtimeIndicator connecting/reconnecting dot |
| **Skeleton** | **None** | — |
| **Progress bar** | **None** (only step indicator in CreateTenant progress, and category progress bars in Dashboard/Expenses which are data visualizations) | — |

### 12.2 Findings

- No skeleton loaders anywhere; lists go straight from spinner/text to content.
- Spinner recipes consistent when present (gray-300 ring + gray-600 top), but spinner
  size differs (`w-6`, `w-8`).
- "Loading..." text color inconsistent: `text-gray-500` (page gate) vs `text-gray-400`
  (data lists).
- CreateTenantModal has the only **multi-step progress** pattern (`○ · ✓ ✗`).

---

## 13. Empty States

| State | Recipe | Copy |
|---|---|---|
| Table/list empty | `<tr><td colSpan className="p-8 text-center text-gray-400">` or centered card | "No customers found.", "No staff found.", "No inventory items yet...", "No reservations found.", "No expenses in this period." |
| Cart empty | centered emoji + `text-gray-400` | `🛒` + "Cart is empty" (+ hint) |
| No orders | `text-gray-400 text-sm text-center pt-8` | "No active orders." |
| Detail placeholder | `min-h-[200px]` center `text-gray-400 text-lg` | "Select an order from the list to view details" |
| Chart/table no data | `text-gray-400 text-sm py-12` (Reports), SVG "No data" | |
| Dashboard widgets | `text-gray-400 text-sm` | "No tables configured.", "No active orders in kitchen." |
| No permission | `text-2xl font-bold text-gray-400 mb-2` + `text-gray-300` | repeated identically in 6+ views |
| Empty container style | `bg-white rounded-xl border border-gray-200 p-8 text-center` | consistent |

**Finding:** empty-state copy/pattern is well standardized, but `text-center pt-8`
(non-card) vs `p-8 text-center` (card) vs `py-12` (Reports) padding varies.

---

## 14. Error States

| Type | Recipe | Consistency |
|---|---|---|
| **Banner** | `bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4` | ✅ highly consistent (~8 views) |
| **Banner w/ retry** | same + `ml-2 px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200` | ItemLedger, PaymentModal, CurrentOrders |
| **Field error** | input `border-red-400 bg-red-50` + `text-[11px] text-red-600 mt-1` | CurrentOrders/NewOrder/DineIn; other views `text-red-600 text-sm` |
| **Inline form error** | `text-red-600 text-sm` | Customers, Expenses, Inventory, ItemLedger, Accounts |
| **Thin banner** | `bg-red-50 border-b border-red-200 text-red-700 px-4 py-1.5 text-[11px] text-center` | Settings, NewOrder mobile |
| **Toast** | `fixed top-4 right-4 ... bg-green-600/bg-red-600 text-white rounded shadow-lg` | AdminDashboard only |
| **Not handled** | `console.error` only | MenuManagement, Reports, Dashboard |
| **Permission denied** | centered card `text-2xl font-bold text-gray-400` + `text-gray-300` | consistent |
| **Network** | RealtimeIndicator dot: green/yellow-pulse/red (Live/Connecting/Offline) | POS header |

**Findings:** no global error boundary; no toast system outside admin; retry UX only on
a few views; no offline banner (only a tiny indicator dot).

---

## 15. Accessibility

### 15.1 Contrast

- Generally OK for body text (gray-600/700 on white/gray-50). Concerns:
  - `text-gray-300` on white for placeholders/empty states and `text-[7px]/[8px]` text.
  - `text-gray-400` used for important labels in several places (below 4.5:1 on white
    for small text).
  - KDS `text-gray-500` on `bg-gray-100` badges (low contrast).
  - Landing `#D97B3F` buttons with white text (approx 2.6:1 — fails WCAG AA for
    normal text).
  - Sidebar `#B8B6B0` on `#1A1A1A` (approx 6:1 — passes AA normal text, borderline).

### 15.2 Focus

- **No `focus-visible` styling anywhere.** Native outline is preserved on most buttons
  (acceptable default) but inputs lack focus styles in ~60% of views.
- `focus:ring-2 focus:ring-blue-500` only in Staff/Settings/pos-ui search/
  CurrentOrders/NewOrder(amber).

### 15.3 Keyboard navigation

- Native buttons/links/inputs are keyboard reachable. Issues:
  - Modal overlays do not trap focus; background remains interactive.
  - **No Escape-to-close** except BusinessDatePicker.
  - Custom keypad has global `keydown` support (CurrentOrders/NewOrder) — good.
  - No `tabIndex` management on drawers/sheets.
  - Accordion (Accounts mobile account cards) not ARIA-announced.

### 15.4 ARIA

- `aria-label`: Search (CurrentOrders), Modal close (Accounts, PaymentModal).
- `aria-invalid` + `aria-describedby`: customer name/phone/address (CurrentOrders,
  NewOrder, DineIn).
- `role="img"` on empty-cart emoji (NewOrder).
- `title` attributes: KDS toolbar, pos-ui collapse/expand, PaymentMethodLogo buttons.
- **Missing everywhere:** dialog `role`/`aria-modal`, custom switch
  `role="switch"`/`aria-checked`, nav landmarks (`<nav aria-label>`), table
  `aria-sort`, loading `aria-busy`/`aria-live`, icon-only button accessible names
  (several `✕`/`−`/`+` buttons rely on text content that is empty for screen readers).

### 15.5 Touch targets

- 44px+ enforced only in PaymentModal, Accounts, POS keypad, order-type tabs
  (CurrentOrders). Most CRUD row actions are 24–30px tall. Sidebar items are
  `py-2.5` (~36px).

---

## 16. Consistency Report (every inconsistency observed)

### A. Primary color application
1. Inline `theme.primaryColor` (most views) vs `bg-blue-600` (Staff) vs gold `#C9972B`
   (NewOrder) vs blue-600 action buttons everywhere. **A tenant theme does not retheme
   the app consistently.**
2. Same logical button ("Save") differs in font-weight (`font-medium`/`font-semibold`
   /`font-bold`) and radius (`rounded`/`rounded-lg`) per view.

### B. Radius
- `rounded` (Customers buttons/inputs, Inventory, Expenses, ItemLedger, Reservations
  form inputs), `rounded-lg` (Staff, MenuManagement, Accounts, Reports, Settings),
  `rounded-xl` (cards), `rounded-2xl` (KDS tickets, CurrentOrders modals, bottom
  sheets), `rounded-full` (badges/avatars).
- **Inputs:** `rounded` vs `rounded-lg` across management views.
- **Mobile cards:** `rounded-lg` (Reservations, Accounts txn, Settings, ThirdParty) vs
  `rounded-xl` (Customers, Staff, Inventory, Expenses, ItemLedger).

### C. Shadows
- None on most cards; `shadow-sm` (Accounts, Reservations mobile, KDS), `shadow-lg`
  (dropdowns, mobile bars, hover states, Dashboard POS cards), `shadow-xl` (modals),
  `shadow-2xl` (KDS slide-over). Hover-shadow only on KDS, MenuCard, Dashboard PosCard.

### D. Buttons
- Sizes `px-2 py-1` … `px-4 py-2.5`; row action padding three variants; touch targets
  enforced only in ordering paths; disabled opacity `30/40/50`; hover variants of
  `hover:bg-red-700` inconsistently applied to solid-red buttons.

### E. Inputs
- Three input recipes (`rounded`/`rounded-lg`/POS-compact); focus styles in 4 of 12
  views; label weight (`font-medium` vs plain); label size `text-sm` vs `text-xs` vs
  `text-[11px]` (MenuManagement `text-xs`, Settings `text-[11px]`).

### F. Typography
- Modal title `text-lg font-semibold` (Inventory/ItemLedger/Expenses/Reservations/
  Accounts/Customers) vs `text-lg font-bold` (MenuManagement/KDS/Settings/Admin).
- Stat values `text-2xl font-medium` (Dashboard) vs `text-2xl font-bold` (Customers) vs
  `text-lg md:text-xl font-bold` (Accounts/Reports) vs `text-xl md:text-2xl font-bold`
  (Staff).
- Arbitrary sizes `text-[7px]…text-[17px]` sprinkled in.

### G. Spacing
- Page padding `p-4 md:p-6` vs `p-3 md:p-4` (Reports/Accounts) vs `p-6` (Inventory).
- Form stack `space-y-3` vs `space-y-4`; summary grid gap `gap-3` vs `gap-4`.

### H. Badges
- 4+ recipes (see §10.4). Shape `rounded`/`rounded-full`; size `text-[10px]`/`text-xs`;
  border on/off; `100` vs `50` background.

### I. Dialogs
- 6 different modal patterns (see §7.1); close buttons sometimes absent; header bars
  in only 2 of ~12 dialog types; Escape missing.

### J. Tables
- thead background on/off; cell density `py-1`…`py-3`; pagination style per-view;
  selected-row tint blue vs gray; breakpoint md vs lg.

### K. Icons
- Emoji vs SVG vs `<img>`; icon size `3.5/4/5`; close glyphs `✕`/`×`/SVG; no shared
  icon component.

### L. Loading/empty/error
- "Loading..." color `gray-500`/`gray-400`; empty padding variants; error handled in
  banner vs console; retry only in some views.

### M. Navigation
- Tab active state: 4 mechanisms; order-type tabs gold vs primary; KDS tabs gray-900.

### N. Animation
- Only KDS slideIn, pos-ui transitions, and hover scale on a few buttons. No standard
  motion scale. Keypad uses `active:scale-95/98`, status buttons `hover:scale-[1.02]
  active:scale-[0.98]`.

### O. Misc
- `scrollbar-hide` custom utility used broadly (hides scrollbars — hurts discoverability
  of scrollable regions).
- Currency default hardcoded `'Rs.'` in several components instead of always from
  settings/theme.
- `theme.secondaryColor + '20'` alpha trick (pos-ui borders) vs CSS variable use.

---

## 17. Recommended Enterprise Standards (target, no UI changed)

### 17.1 Spacing scale (single source of truth — already partially defined)
Adopt the CSS-variable spacing in `globals.css` and use only: `0, 1, 1.5, 2, 2.5, 3,
3.5, 4, 6, 8, 10` (rem multiples). Enforce:
- Page padding: `p-4 md:p-6` everywhere.
- Container widths: standardize on `max-w-6xl` (CRUD), `max-w-7xl` (dashboards/reports),
  `max-w-4xl` (simple lists).
- Card padding `p-4`; card list gap `space-y-3`; summary grid `gap-3`.
- Form stack `space-y-4`; table cell `px-4 py-3`.

### 17.2 Typography scale (already defined in tailwind.config)
Use only: `xs, sm, base, lg, xl, 2xl, 3xl`; **ban `text-[7..17px]` arbitrary values**.
Standardize: page title `text-2xl md:text-3xl font-bold`; card title `text-sm
font-semibold text-gray-700`; modal title `text-lg font-bold`; stat value `text-xl
md:text-2xl font-bold`; label `text-sm font-medium text-gray-600`; micro-label
`text-[10px] uppercase tracking-wider text-gray-500`.

### 17.3 Shadow scale
Use only the defined `--shadow-sm/md/lg` (and `xl` for modals): cards `shadow-none`
or `shadow-sm`; hover `shadow-md`; dropdowns `shadow-lg`; modals `shadow-xl`.
Ban ad-hoc `shadow`, `shadow-2xl`.

### 17.4 Radius scale
Use only `--radius(-sm|-md|-lg|-xl|-2xl|-full)`: inputs/buttons `rounded-lg`; cards
`rounded-xl`; sheets `rounded-t-2xl`; modals `rounded-xl`; pills `rounded-full`.

### 17.5 Component hierarchy & rules
- **One shared primitive library** in `@sat-sys/ui` (Button, Card, Input, Select,
  Modal, Badge, Table, Pagination, Avatar, Switch, Spinner, EmptyState, ErrorBanner)
  — consumed by all views; the existing `tailwindThemeExtend` + CSS variables become
  the single token source.
- Primary actions use the **theme token** (`bg-primary`/`var(--primary)`), never
  hardcoded palettes.
- Interaction rules: primary = one per screen region; destructive requires confirm;
  disabled = `opacity-50` + `cursor-not-allowed`; loading = button label swap + spinner.
- Touch targets ≥ 44px for all primary/secondary and icon controls.

### 17.6 Responsive rules
- Standard breakpoint behavior: `sm` (single-col tweaks), `md` (table↔card split),
  `lg` (side panels), `xl` (POS dense grids). Keep one dual-render breakpoint per
  page type.
- Fixed bottom action bars must reserve `pb-16` clearance; use `safe-bottom` for PWA.
- Preserve `h-screen h-dvh`; add `env(safe-area-inset-*)` for foldables.

### 17.7 Accessibility rules (WCAG 2.1 AA target)
- Contrast ≥ 4.5:1 for normal text (fix gray-300 labels, `#D97B3F` buttons, KDS
  gray-500-on-gray-100 badges).
- `focus-visible` ring on all interactive elements; focus ring in brand color.
- Modals: `role="dialog"`, `aria-modal`, focus trap, Escape-to-close, restore focus.
- Custom switches → `role="switch"` + `aria-checked`.
- Icon-only buttons → `aria-label`; search → `aria-label` + `role="search"`.
- Tables → `aria-sort` on sortable columns, `scope` on headers.
- Loading → `aria-busy`; toasts/live regions → `aria-live="polite"`.
- Keyboard: full tab order, no focus traps missing, visible focus on keypad keys.

---

## 18. Component Inventory

### 18.1 True shared components (`@sat-sys/pos-ui`)
| Component | Props | Notes |
|---|---|---|
| `MenuGrid` | menuItems, onAddToCart, theme, currencySymbol, searchQuery/onSearchChange, mostOrderedItems | Search + category sections; no tabs |
| `CartSidebar` | cartItems, onUpdateQuantity, onRemoveItem, onCheckout, disabled, theme, currencySymbol | Desktop `w-80` + mobile sheet |
| `CheckoutButton` | onCheckout, disabled, theme | Full-width, `disabled:opacity-40` |

### 18.2 De-facto shared (local, repeated per view)
| Pattern | Occurrences | Files |
|---|---|---|
| `ActionButton` (status action) | 3 | CurrentOrders, KDS, DineIn (identical impl, copy-pasted) |
| `PaginationControls` | 2 (different impl) | Customers, Staff |
| `StatusBadge`/`STATUS_*` maps | 8+ (different recipes) | CurrentOrders, KDS, Dashboard, DineIn, Customers, Staff, ItemLedger, Reservations, Admin, design-tokens |
| `Avatar` (initials circle) | 2 (different) | Customers, Staff |
| `Modal` shell | 2 (different) | Accounts (shared internally), everything else inline |
| `Card` | 1 | Settings only |
| `Grid`/`F()` field factory | 1 | Settings only |
| Spinner | 4+ | CurrentOrders, KDS, NewOrder, PaymentModal (same recipe, copy-pasted) |
| Empty-state card | 10+ (same recipe) | all CRUD views |
| Error banner | 10+ (same recipe) | all CRUD views |
| Search bar | 6 | Customers, Staff, MenuGrid, NewOrder, CurrentOrders, KDS |
| Switch (custom) | 2 | MenuManagement, Admin Modules |
| Table tile | 1 | DineIn |
| NumericKeypad | 2 (same impl) | CurrentOrders, NewOrder |

### 18.3 View-by-view component map

| View | Components used |
|---|---|
| DashboardView | metric cards, stat tiles, progress bars, status pills, table (recent) |
| CurrentOrdersView | ActionButton, NumericKeypad, order cards, item tables, cart lines, 3 modals, customer dropdown |
| NewOrderView | NumericKeypad, MenuCard, CompactMenuItem, category tabs, order-type tabs, cart, calc sidebar, 4 modals |
| KDSView | OrderCard (ticket), StatusTabs, DetailPanel, Timer, ListView, QuickAdd modal, BottomBar |
| DineInView | TableTile, ActionButton, order item table, customer dropdown, edit panel |
| CustomersView | SummaryCard/Stat, PaginationControls, avatar, search, chips, table+cards, drawers, 2 modals |
| StaffManagementView | RoleBadge/StatusBadge/AccessBadges, AccessPanel, StaffFormModal, LeaveModal, Pagination, avatar |
| InventoryView | status pills, mobile card+table, 3 modals |
| MenuManagementView | item rows (div list), custom switch, ingredients editor, 2 modals |
| ItemLedgerView | day stat tiles, movement chips, 2 tables, 1 modal |
| ExpensesView | summary cards, progress rows, category badge, mobile card+table, 2 modals |
| AccountsView | Modal (shared local), ActionButton, DonutChart, SummaryIcon, AccountIcon, balance cards, 2 tables, accordion cards, sidebar |
| ReservationsView | mode buttons, status badges, mobile card+table, 2 modals |
| ReportsView | Card helper, tabs, granularity, 6 tables, filter drawer, charts (Donut/Bar/Line/Heatmap) |
| SettingsView | Card, Grid, F(), CompactToggle, branch rows, 2 modals |
| ThirdPartyView | platform cards (data-driven) |
| AdminDashboard | tenant table+cards, Suspend/Theme/Revenue/Modules modals, toast |
| CreateTenantModal | multi-step wizard (form/progress/result) |
| Sidebar | nav items, collapse, mobile drawer |
| POSShell | header, BusinessDatePicker, RealtimeIndicator, ThemeProvider |
| Dashboard page / landing / auth / 404 | static cards, Clerk components |

### 18.4 Duplicate/overlap hotspots
1. `ActionButton` ×3 (CurrentOrders/KDS/DineIn) — identical.
2. Status/order-type badge maps ×8 — 4 recipes.
3. Modal skeleton ×~12 — 6 chrome styles.
4. Search bar ×6 — consistent, but duplicated.
5. Pagination ×2 — different styles.
6. Avatar ×2 — different styles.
7. Spinner ×4 — same recipe, duplicated.
8. Chart implementations: DonutChart duplicated in AccountsView and reports-charts.
9. `Card`/`Grid`/`F()` factories only in Settings — not promoted to shared.
10. `design-tokens.ts` exists in the POS folder defining canonical badge maps, but views
    still define their own local copies (dead/shadowed patterns).

---

## 19. Priority Matrix

### Critical (correctness / tenant-theming breaks)
| # | Finding | Impact |
|---|---|---|
| 1 | Primary color ignored in Staff, Settings, NewOrder (blue-600/gold hardcoded) — a tenant theme does not theme the whole app | Tenant brand inconsistency |
| 2 | No shared component layer → drift compounds with every new view | Maintainability |
| 3 | Duplicate badge maps with divergent recipes → status colors differ per view | Visual consistency |
| 4 | NewOrder gold `#C9972B` deviates from every other brand color | Brand consistency |
| 5 | `console.error`-only error handling in Menu/Reports/Dashboard | Silent failures |

### High (usability / accessibility)
| # | Finding |
|---|---|
| 6 | ~60% of inputs have no focus state |
| 7 | No focus traps / Escape-close / `role="dialog"` in modals |
| 8 | Icon-only buttons without accessible names (`✕`, `−`, `+`) |
| 9 | Touch targets < 44px across CRUD action buttons |
| 10 | No skeletons — blank/plain "Loading…" on every data load |
| 11 | No toast/error system outside admin; retry inconsistent |
| 12 | `scrollbar-hide` everywhere hides scroll affordance |
| 13 | Contrast fails: gray-300 labels, `#D97B3F` button, KDS low-contrast badges, `text-[7px]` |

### Medium (consistency)
| # | Finding |
|---|---|
| 14 | Radius divergence: inputs `rounded`/`rounded-lg`, cards `rounded-lg`/`rounded-xl` |
| 15 | Modal chrome: 6 patterns, missing close buttons in 3 modal types |
| 16 | Table chrome: thead bg, density, pagination, selected-row tint, md vs lg breakpoints |
| 17 | Button recipe drift: padding, weight, disabled opacity (30/40/50), hover red |
| 18 | Typography drift: modal/stat heading weights, arbitrary `text-[7..17px]` |
| 19 | Empty-state padding variants; loading text color variants |
| 20 | Icon system: emoji vs SVG vs `<img>`, inconsistent sizes |
| 21 | Page padding & max-width inconsistencies |
| 22 | `theme.secondaryColor+'20'` alpha trick vs tokens |

### Low (polish / debt)
| # | Finding |
|---|---|
| 23 | Dead code: DineIn `statusColor`/`statusDisplay` maps never rendered |
| 24 | `design-tokens.ts` shadowed by per-view copies |
| 25 | Duplicated DonutChart (Accounts vs reports-charts) |
| 26 | Hardcoded `'Rs.'` defaults vs settings-sourced currency |
| 27 | No motion/animation standard (only KDS slideIn + few hover scales) |
| 28 | No foldable/`safe-area` left-right insets; no orientation handling |
| 29 | `Active page #6366f1` vs `bg-blue-600` pagination (minor color drift) |
| 30 | Landing page palette completely outside the theme system |

---

## Appendix A — Files audited

**POS views (16):** `apps/portal/src/app/[slug]/pos/{DashboardView, CurrentOrdersView,
NewOrderView, KDSView, DineInView, CustomersView, StaffManagementView, InventoryView,
MenuManagementView, ItemLedgerView, ExpensesView, AccountsView, ReservationsView,
ReportsView, SettingsView, ThirdPartyView}.tsx`

**POS shell/context (8):** `POSShell.tsx`, `Sidebar.tsx`, `layout.tsx`,
`pos-context.tsx`, `business-date-picker.tsx`, `realtime-indicator.tsx`,
`page-guard.tsx`, `PaymentMethodLogo.tsx`, `reports-charts.tsx`, `PaymentModal.tsx`,
`ReceiptView.tsx`, `design-tokens.ts`

**Pages (6):** `app/page.tsx`, `app/layout.tsx`, `app/not-found.tsx`,
`app/dashboard/page.tsx`, `app/sign-in/…/page.tsx`, `app/sign-up/…/page.tsx`

**Admin (4):** `app/admin/{page.tsx, AdminDashboard.tsx, CreateTenantModal.tsx}`

**Shared packages:** `@sat-sys/pos-ui` (`MenuGrid.tsx`, `CartSidebar.tsx`,
`CheckoutButton.tsx`), `@sat-sys/ui` (theme engine), `globals.css`,
`tailwind.config.ts`

---

*Audit generated as analysis only — no source files were modified.*
