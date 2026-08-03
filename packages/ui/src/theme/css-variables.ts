import type { ResolvedTheme } from './types';

export type CssVars = Record<string, string>;

/** Build the CSS custom-property map for a resolved theme. */
export function themeToCssVariables(theme: ResolvedTheme): CssVars {
  return {
    '--background': theme.background,
    '--background-secondary': theme.backgroundSecondary,
    '--surface': theme.surface,
    '--surface-secondary': theme.surfaceSecondary,
    '--surface-hover': theme.surfaceHover,
    '--text-primary': theme.textPrimary,
    '--text-secondary': theme.textSecondary,
    '--text-muted': theme.textMuted,
    '--text-inverse': theme.textInverse,
    '--primary': theme.primary,
    '--primary-hover': theme.primaryHover,
    '--primary-active': theme.primaryActive,
    '--primary-foreground': theme.primaryForeground,
    '--secondary': theme.secondary,
    '--secondary-hover': theme.secondaryHover,
    '--secondary-foreground': theme.secondaryForeground,
    '--accent': theme.accent,
    '--success': theme.success,
    '--warning': theme.warning,
    '--danger': theme.danger,
    '--info': theme.info,
    '--border': theme.border,
    '--border-light': theme.borderLight,
    '--divider': theme.divider,
    '--card-background': theme.cardBackground,
    '--card-border': theme.cardBorder,
    '--card-header': theme.cardHeader,
    '--sidebar-background': theme.sidebarBackground,
    '--sidebar-foreground': theme.sidebarForeground,
    '--sidebar-hover': theme.sidebarHover,
    '--sidebar-active': theme.sidebarActive,
    '--sidebar-border': theme.sidebarBorder,
    '--navbar-background': theme.navbarBackground,
    '--navbar-foreground': theme.navbarForeground,
    '--navbar-border': theme.navbarBorder,
    '--button-primary': theme.buttonPrimary,
    '--button-secondary': theme.buttonSecondary,
    '--button-danger': theme.buttonDanger,
    '--button-outline': theme.buttonOutline,
    '--button-ghost': theme.buttonGhost,
    '--input-background': theme.inputBackground,
    '--input-border': theme.inputBorder,
    '--input-text': theme.inputText,
    '--input-placeholder': theme.inputPlaceholder,
    '--input-focus': theme.inputFocus,
    '--table-header': theme.tableHeader,
    '--table-header-text': theme.tableHeaderText,
    '--table-row': theme.tableRow,
    '--table-hover': theme.tableHover,
    '--table-selected': theme.tableSelected,
    '--table-border': theme.tableBorder,
    '--badge-success': theme.badgeSuccess,
    '--badge-warning': theme.badgeWarning,
    '--badge-danger': theme.badgeDanger,
    '--badge-info': theme.badgeInfo,
    '--badge-default': theme.badgeDefault,
    '--chart-1': theme.chart1,
    '--chart-2': theme.chart2,
    '--chart-3': theme.chart3,
    '--chart-4': theme.chart4,
    '--chart-5': theme.chart5,
    '--chart-grid': theme.chartGrid,
    '--receipt-background': theme.receiptBackground,
    '--receipt-border': theme.receiptBorder,
    '--receipt-text': theme.receiptText,
    '--order-status-draft': theme.orderStatus.draft,
    '--order-status-pending': theme.orderStatus.pending,
    '--order-status-preparing': theme.orderStatus.preparing,
    '--order-status-ready': theme.orderStatus.ready,
    '--order-status-completed': theme.orderStatus.completed,
    '--order-status-cancelled': theme.orderStatus.cancelled,
    '--order-status-paid': theme.orderStatus.paid,
    '--order-status-refunded': theme.orderStatus.refunded,
    '--inventory-healthy': theme.inventoryStatus.healthy,
    '--inventory-low-stock': theme.inventoryStatus.lowStock,
    '--inventory-critical': theme.inventoryStatus.critical,
  };
}

/** Serialize the resolved theme into a `:root { ... }` CSS block. */
export function themeToCssString(theme: ResolvedTheme): string {
  const vars = themeToCssVariables(theme);
  const body = Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  return `:root {\n${body}\n}`;
}
