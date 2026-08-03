interface TailwindThemeExtend {
  colors?: Record<string, unknown>;
  fontFamily?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Tailwind theme extension that binds semantic utilities to the CSS
 * variables emitted by the theme engine.
 *
 * Usage in `tailwind.config.ts`:
 *
 * ```ts
 * import { tailwindThemeExtend } from '@sat-sys/ui';
 * const config: Config = {
 *   theme: { extend: tailwindThemeExtend },
 * };
 * ```
 *
 * Every value references a `var(--…)` emitted by `themeToCssVariables`, so a
 * tenant theme flows straight into Tailwind utilities (e.g. `bg-background`,
 * `text-primary`, `border-border`, `bg-card`) with no component changes.
 */
export const tailwindThemeExtend: TailwindThemeExtend = {
  colors: {
    background: 'var(--background)',
    'background-secondary': 'var(--background-secondary)',
    surface: 'var(--surface)',
    'surface-secondary': 'var(--surface-secondary)',
    'surface-hover': 'var(--surface-hover)',
    foreground: 'var(--text-primary)',
    muted: 'var(--text-muted)',
    'text-secondary': 'var(--text-secondary)',
    'text-inverse': 'var(--text-inverse)',
    primary: {
      DEFAULT: 'var(--primary)',
      hover: 'var(--primary-hover)',
      active: 'var(--primary-active)',
      foreground: 'var(--primary-foreground)',
    },
    secondary: {
      DEFAULT: 'var(--secondary)',
      hover: 'var(--secondary-hover)',
      foreground: 'var(--secondary-foreground)',
    },
    accent: 'var(--accent)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
    info: 'var(--info)',
    border: 'var(--border)',
    'border-light': 'var(--border-light)',
    divider: 'var(--divider)',
    card: {
      DEFAULT: 'var(--card-background)',
      border: 'var(--card-border)',
      header: 'var(--card-header)',
    },
    sidebar: {
      DEFAULT: 'var(--sidebar-background)',
      foreground: 'var(--sidebar-foreground)',
      hover: 'var(--sidebar-hover)',
      active: 'var(--sidebar-active)',
      border: 'var(--sidebar-border)',
    },
    navbar: {
      DEFAULT: 'var(--navbar-background)',
      foreground: 'var(--navbar-foreground)',
      border: 'var(--navbar-border)',
    },
    input: {
      DEFAULT: 'var(--input-background)',
      border: 'var(--input-border)',
      text: 'var(--input-text)',
      placeholder: 'var(--input-placeholder)',
      focus: 'var(--input-focus)',
    },
    table: {
      header: 'var(--table-header)',
      'header-text': 'var(--table-header-text)',
      row: 'var(--table-row)',
      hover: 'var(--table-hover)',
      selected: 'var(--table-selected)',
      border: 'var(--table-border)',
    },
    badge: {
      success: 'var(--badge-success)',
      warning: 'var(--badge-warning)',
      danger: 'var(--badge-danger)',
      info: 'var(--badge-info)',
      default: 'var(--badge-default)',
    },
    chart: {
      1: 'var(--chart-1)',
      2: 'var(--chart-2)',
      3: 'var(--chart-3)',
      4: 'var(--chart-4)',
      5: 'var(--chart-5)',
      grid: 'var(--chart-grid)',
    },
    receipt: {
      background: 'var(--receipt-background)',
      border: 'var(--receipt-border)',
      text: 'var(--receipt-text)',
    },
    'order-status': {
      draft: 'var(--order-status-draft)',
      pending: 'var(--order-status-pending)',
      preparing: 'var(--order-status-preparing)',
      ready: 'var(--order-status-ready)',
      completed: 'var(--order-status-completed)',
      cancelled: 'var(--order-status-cancelled)',
      paid: 'var(--order-status-paid)',
      refunded: 'var(--order-status-refunded)',
    },
    'inventory-status': {
      healthy: 'var(--inventory-healthy)',
      'low-stock': 'var(--inventory-low-stock)',
      critical: 'var(--inventory-critical)',
    },
  },
  fontFamily: {
    heading: 'var(--font-heading)',
    body: 'var(--font-body)',
    mono: 'var(--font-mono)',
  },
};
