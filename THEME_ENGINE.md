# SAT SYS — Semantic Theme Engine

Tenant-aware semantic design tokens for `@sat-sys/ui`, delivered as CSS custom
properties and consumed through Tailwind utilities. Designed for full backward
compatibility: no page migration, no UI redesign, pixel-identical default
appearance.

---

## 1. Architecture

```
┌───────────────────────────── @sat-sys/ui ─────────────────────────────┐
│  src/theme/                                                           │
│   types.ts         ThemeConfig / ThemeTokens / ThemeBranding /        │
│                    ResolvedTheme (canonical, source of truth)         │
│   defaults.ts      DEFAULT_TOKENS / DEFAULT_BRANDING / DEFAULT_THEME  │
│   resolve.ts       resolveThemeConfig() merges stored config over     │
│                    defaults; derives hover/active shades             │
│   css-variables.ts themeToCssVariables() → CSS custom-property map;   │
│                    themeToCssString() → ":root { … }" block           │
│   tailwind.ts      tailwindThemeExtend → semantic utility map         │
│   ThemeProvider.tsx <ThemeProvider> injects <style> on :root          │
└───────────────────────────────────────────────────────────────────────┘

                ┌──────────────────────┬──────────────────────┐
                ▼                      ▼                      ▼
        apps/portal            @sat-sys/pos-ui         @sat-sys/gateway-sdk
   globals.css :root    re-exports ThemeConfig    re-exports ThemeConfig
   (baseline defaults)  (zero code change)        (zero code change)
   tailwind.config.ts
   POSShell.tsx (ThemeProvider)
```

The canonical `ThemeConfig` type lives in `@sat-sys/ui`. `@sat-sys/pos-ui` and
`@sat-sys/gateway-sdk` re-export it (`export type { ThemeConfig } from
'@sat-sys/ui'`), so existing `import type { ThemeConfig } from '@sat-sys/pos-ui'`
/ `'@sat-sys/gateway-sdk'` call sites keep compiling unchanged.

## 2. Configuration shape

`ThemeConfig` (packages/ui/src/theme/types.ts):

| Field          | Required | Purpose                                            |
| -------------- | -------- | -------------------------------------------------- |
| `primaryColor` | yes*     | Legacy brand color (persisted today)               |
| `secondaryColor`| yes*    | Legacy secondary color (persisted today)           |
| `logoUrl`      | yes*     | Legacy logo URL (persisted today)                  |
| `fontFamily`   | yes*     | Legacy font family (persisted today)               |
| `accentColor`  | optional | Accent color (new)                                 |
| `tokens`       | optional | Partial<ThemeTokens> — fine-grained semantic tokens |
| `branding`     | optional | Restaurant / logo / font overrides                 |

\* Legacy fields are required by the type but **optional in storage**: tenants
that only persisted a subset resolve against defaults with zero migration.
All new fields are optional and fall back to defaults.

The four legacy fields match the shape already persisted in `tenants.theme_config`,
so existing rows remain valid as-is.

## 3. Token → CSS variable map

`themeToCssVariables(resolvedTheme)` emits every token as a `--` custom property
on `:root`. The full map (packages/ui/src/theme/css-variables.ts):

```
Colors:
  --background --background-secondary --surface --surface-secondary --surface-hover
  --text-primary --text-secondary --text-muted --text-inverse
  --primary --primary-hover --primary-active --primary-foreground
  --secondary --secondary-hover --secondary-foreground
  --accent --success --warning --danger --info
  --border --border-light --divider

Surfaces:
  --card-background --card-border --card-header
  --sidebar-background --sidebar-foreground --sidebar-hover --sidebar-active --sidebar-border
  --navbar-background --navbar-foreground --navbar-border

Controls:
  --button-primary --button-secondary --button-danger --button-outline --button-ghost
  --input-background --input-border --input-text --input-placeholder --input-focus

Data:
  --table-header --table-header-text --table-row --table-hover --table-selected --table-border
  --badge-success --badge-warning --badge-danger --badge-info --badge-default
  --chart-1..5 --chart-grid
  --receipt-background --receipt-border --receipt-text

Status:
  --order-status-draft|pending|preparing|ready|completed|cancelled|paid|refunded
  --inventory-healthy --inventory-low-stock --inventory-critical
```

## 4. Tailwind utility map

`tailwindThemeExtend` (packages/ui/src/theme/tailwind.ts) binds semantic
utilities to those variables:

```
bg-background  bg-surface  bg-card  bg-sidebar  bg-navbar  bg-table-header
text-primary   text-foreground (--text-primary)  text-muted  text-secondary
border-border  border-card(border)
primary:   bg-primary text-primary-foreground bg-primary-hover bg-primary-active
sidebar:   bg-sidebar text-sidebar-foreground bg-sidebar-hover bg-sidebar-active border-sidebar-border
status:    bg-order-status-pending … bg-inventory-status-critical
fonts:     font-heading font-body font-mono
```

Defaults already mirror the current hard-coded design language (gray palette,
`#ff6600` brand orange, `#1A1A1A` sidebar, `#B8B6B0` sidebar text, …) so the
baseline appearance is pixel-identical to today. Existing utilities
(`bg-gray-*`, `bg-white`, `border-gray-*`, …) are untouched.

## 5. Resolver & fallback behavior

`resolveThemeConfig(config)` (packages/ui/src/theme/resolve.ts):

- Every missing token falls back to `DEFAULT_TOKENS`.
- Legacy colors are honored: `tokens.primary` → `config.primaryColor` →
  default. Same for `secondary` and `accent`.
- Derived states are auto-computed when not provided:
  - `primaryHover` = `shade(primary, -8)`, `primaryActive` = `shade(primary, -16)`
  - `secondaryHover` = `shade(secondary, 12)`
  - `sidebarActive` and `inputFocus` fall back to `accent`
  - `navbarForeground` falls back to `secondary`
  - `buttonPrimary` falls back to `primary`
- Branding: each `branding.*` field falls back to the legacy field, then to
  `DEFAULT_BRANDING` (e.g. `dashboardLogo` → `logoUrl` → undefined).

Helpers exported for tooling: `toRgb(color)`, `shade(color, amount)`,
`toRgbTemplate(color)`.

## 6. Runtime delivery

`apps/portal` wires the engine in three places:

1. **`globals.css`** — static `:root` block with every baseline token, so the
   first paint and any server-rendered CSS match the current UI before JS loads.
2. **`tailwind.config.ts`** — `theme: { extend: tailwindThemeExtend }` plus
   centralized radius / shadow / fontSize variables (values equal Tailwind
   defaults, so nothing visually changes).
3. **`POSShell.tsx`** — `<ThemeProvider theme={resolvedTenantTheme}>` wraps the
   POS tree; the provider hydrates a `<style data-sat-sys-theme>` element with
   the resolved `:root { … }` variables, overriding the static baseline for that
   tenant. `resolvedTheme` and `themeCssVars` are also exposed through
   `POSContext` for imperative/JS use.

No page uses the semantic utilities yet — that is the (future, intentional)
migration step. Existing markup is unaffected because the defaults equal the
old hard-coded values.

## 7. Extending a tenant theme

1. **Schema** — `tenants.theme_config` already accepts the full `ThemeConfig`
   object, so `tokens` / `branding` / `accentColor` properties are persisted
   automatically by `updateTenantTheme(tenantId, theme)`. **No schema change and
   no new DB table are required.**
   > The `theme_config` jsonb column stores nested groups (e.g.
   > `tokens.orderStatus`) as a single jsonb value and round-trips intact; there
   > is no column-per-token. Existing tenants already persisted only the four
   > legacy fields, and they resolve against defaults with zero migration.
2. **Admin UI — Enterprise Theme Manager** (implemented). In
   `apps/portal/src/app/admin`, the **Edit Theme** button on any tenant opens
   `ThemeEditorModal.tsx`, a per-tenant theme manager:
   - **10 editable sections**: 1) Brand Colors, 2) Interface Colors,
     3) Text, 4) Semantic Colors, 5) Navigation, 6) Buttons, 7) Tables,
     8) Status & Badges (incl. per-status order + inventory), 9) Charts,
     10) Receipts. Every field is a color swatch + hex text input backed by the
     corresponding `ThemeTokens` key.
   - **Live preview** — the editor derives `resolved = resolveThemeConfig({…})`
     as you type and renders a mini sidebar/navbar/cards/buttons/badges/table/
     receipt mock using those resolved values, so changes are visible before
     saving.
   - **6 presets** — `theme-presets.ts` exports `THEME_PRESETS`
     (Brand Orange / Midnight Blue / Emerald / Royal Purple / Rose / Slate).
     Applying a preset writes a coherent `Partial<ThemeTokens>` override.
   - **Reset to Default** — clears `tokens` (reverts to canonical baseline).
   - **Save** — builds a `ThemeConfig` (`primaryColor`, `secondaryColor`,
     `logoUrl`, `fontFamily`, `accentColor`, `tokens`, preserved `branding`)
     and persists it via `saveTenantTheme` → `updateTenantTheme`.
3. **Consumption** — `POSShell` reads the tenant's `theme_config`, passes it to
   `<ThemeProvider>`, and everything downstream re-themes via CSS variables with
   no component changes. Saving in the admin applies on the tenant's next load.
4. **Utilities** — components may still migrate to semantic utilities
   (`bg-background`, `text-primary`, `bg-sidebar`, …) for tenant-aware styling.

## 8. Verification

- `pnpm --filter @sat-sys/ui lint` / `pos-ui` / `gateway-sdk` — pass.
- `npx tsc --noEmit` in `apps/portal` — passes.
- `npx next build` in `apps/portal` — succeeds; emitted CSS contains the full
  `:root` variable block and semantic utilities map to `var(--…)`.
- Existing palette utilities (`bg-gray-50`, `text-gray-900`, `border-gray-200`,
  …) still emit literal RGB values — untouched.
