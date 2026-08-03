import { DEFAULT_BRANDING, DEFAULT_TOKENS } from './defaults';
import type { ResolvedTheme, ThemeConfig, ThemeTokens } from './types';

/** Clamp a channel into the 0-255 range. */
function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Convert any supported CSS color string into an RGB triple; null when unparseable. */
export function toRgb(color: string): [number, number, number] | null {
  const hex = color.trim();
  if (hex.startsWith('#')) {
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const match = hex.match(/^rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (match) return [clamp(Number(match[1])), clamp(Number(match[2])), clamp(Number(match[3]))];
  return null;
}

function toHex(r: number, g: number, b: number): string {
  const to = (n: number) => clamp(n).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Lighten (positive amount) or darken (negative amount) a hex/rgb color by a 0-100 percentage. */
export function shade(color: string, amount: number): string {
  const rgb = toRgb(color);
  if (!rgb) return color;
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount) / 100;
  return toHex(rgb[0] + (t - rgb[0]) * p, rgb[1] + (t - rgb[1]) * p, rgb[2] + (t - rgb[2]) * p);
}

/** Convert a hex color into a Tailwind-friendly `rgb(r g b / <alpha-value>)` reference. */
export function toRgbTemplate(color: string): string {
  const rgb = toRgb(color);
  if (!rgb) return color;
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / <alpha-value>)`;
}

function resolveOrderStatus(
  override: Partial<ThemeTokens['orderStatus']> | undefined,
): ThemeTokens['orderStatus'] {
  return { ...DEFAULT_TOKENS.orderStatus, ...(override ?? {}) };
}

function resolveInventoryStatus(
  override: Partial<ThemeTokens['inventoryStatus']> | undefined,
): ThemeTokens['inventoryStatus'] {
  return { ...DEFAULT_TOKENS.inventoryStatus, ...(override ?? {}) };
}

/**
 * Merge a stored tenant theme config with the baseline defaults.
 *
 * Backwards compatible: tenants that only persisted `primaryColor`,
 * `secondaryColor`, `logoUrl` and `fontFamily` (the legacy shape) resolve
 * against defaults, deriving hover/active states from the provided colors.
 * Missing/new values always fall back to the baseline so nothing breaks.
 */
export function resolveThemeConfig(config?: Partial<ThemeConfig> | null): ResolvedTheme {
  const t = config?.tokens ?? {};

  const primary = t.primary ?? config?.primaryColor ?? DEFAULT_TOKENS.primary;
  const secondary = t.secondary ?? config?.secondaryColor ?? DEFAULT_TOKENS.secondary;
  const accent = t.accent ?? config?.accentColor ?? DEFAULT_TOKENS.accent;

  const branding = {
    restaurantName: config?.branding?.restaurantName ?? DEFAULT_BRANDING.restaurantName,
    restaurantLogo: config?.branding?.restaurantLogo ?? config?.logoUrl ?? DEFAULT_BRANDING.restaurantLogo,
    dashboardLogo: config?.branding?.dashboardLogo ?? config?.logoUrl ?? DEFAULT_BRANDING.dashboardLogo,
    receiptLogo: config?.branding?.receiptLogo ?? config?.logoUrl ?? DEFAULT_BRANDING.receiptLogo,
    loginLogo: config?.branding?.loginLogo ?? config?.logoUrl ?? DEFAULT_BRANDING.loginLogo,
    brandFont: config?.branding?.brandFont ?? config?.fontFamily ?? DEFAULT_BRANDING.brandFont,
    accentColor: config?.branding?.accentColor ?? config?.accentColor ?? DEFAULT_BRANDING.accentColor,
  };

  return {
    background: t.background ?? DEFAULT_TOKENS.background,
    backgroundSecondary: t.backgroundSecondary ?? DEFAULT_TOKENS.backgroundSecondary,
    surface: t.surface ?? DEFAULT_TOKENS.surface,
    surfaceSecondary: t.surfaceSecondary ?? DEFAULT_TOKENS.surfaceSecondary,
    surfaceHover: t.surfaceHover ?? DEFAULT_TOKENS.surfaceHover,
    textPrimary: t.textPrimary ?? DEFAULT_TOKENS.textPrimary,
    textSecondary: t.textSecondary ?? DEFAULT_TOKENS.textSecondary,
    textMuted: t.textMuted ?? DEFAULT_TOKENS.textMuted,
    textInverse: t.textInverse ?? DEFAULT_TOKENS.textInverse,
    primary,
    primaryHover: t.primaryHover ?? shade(primary, -8),
    primaryActive: t.primaryActive ?? shade(primary, -16),
    primaryForeground: t.primaryForeground ?? DEFAULT_TOKENS.primaryForeground,
    secondary,
    secondaryHover: t.secondaryHover ?? shade(secondary, 12),
    secondaryForeground: t.secondaryForeground ?? DEFAULT_TOKENS.secondaryForeground,
    accent,
    success: t.success ?? DEFAULT_TOKENS.success,
    warning: t.warning ?? DEFAULT_TOKENS.warning,
    danger: t.danger ?? DEFAULT_TOKENS.danger,
    info: t.info ?? DEFAULT_TOKENS.info,
    border: t.border ?? DEFAULT_TOKENS.border,
    borderLight: t.borderLight ?? DEFAULT_TOKENS.borderLight,
    divider: t.divider ?? DEFAULT_TOKENS.divider,
    cardBackground: t.cardBackground ?? DEFAULT_TOKENS.cardBackground,
    cardBorder: t.cardBorder ?? DEFAULT_TOKENS.cardBorder,
    cardHeader: t.cardHeader ?? DEFAULT_TOKENS.cardHeader,
    sidebarBackground: t.sidebarBackground ?? DEFAULT_TOKENS.sidebarBackground,
    sidebarForeground: t.sidebarForeground ?? DEFAULT_TOKENS.sidebarForeground,
    sidebarHover: t.sidebarHover ?? DEFAULT_TOKENS.sidebarHover,
    sidebarActive: t.sidebarActive ?? accent,
    sidebarBorder: t.sidebarBorder ?? DEFAULT_TOKENS.sidebarBorder,
    navbarBackground: t.navbarBackground ?? DEFAULT_TOKENS.navbarBackground,
    navbarForeground: t.navbarForeground ?? secondary,
    navbarBorder: t.navbarBorder ?? DEFAULT_TOKENS.navbarBorder,
    buttonPrimary: t.buttonPrimary ?? primary,
    buttonSecondary: t.buttonSecondary ?? DEFAULT_TOKENS.buttonSecondary,
    buttonDanger: t.buttonDanger ?? DEFAULT_TOKENS.buttonDanger,
    buttonOutline: t.buttonOutline ?? DEFAULT_TOKENS.buttonOutline,
    buttonGhost: t.buttonGhost ?? DEFAULT_TOKENS.buttonGhost,
    inputBackground: t.inputBackground ?? DEFAULT_TOKENS.inputBackground,
    inputBorder: t.inputBorder ?? DEFAULT_TOKENS.inputBorder,
    inputText: t.inputText ?? DEFAULT_TOKENS.inputText,
    inputPlaceholder: t.inputPlaceholder ?? DEFAULT_TOKENS.inputPlaceholder,
    inputFocus: t.inputFocus ?? accent,
    tableHeader: t.tableHeader ?? DEFAULT_TOKENS.tableHeader,
    tableHeaderText: t.tableHeaderText ?? DEFAULT_TOKENS.tableHeaderText,
    tableRow: t.tableRow ?? DEFAULT_TOKENS.tableRow,
    tableHover: t.tableHover ?? DEFAULT_TOKENS.tableHover,
    tableSelected: t.tableSelected ?? DEFAULT_TOKENS.tableSelected,
    tableBorder: t.tableBorder ?? DEFAULT_TOKENS.tableBorder,
    badgeSuccess: t.badgeSuccess ?? DEFAULT_TOKENS.badgeSuccess,
    badgeWarning: t.badgeWarning ?? DEFAULT_TOKENS.badgeWarning,
    badgeDanger: t.badgeDanger ?? DEFAULT_TOKENS.badgeDanger,
    badgeInfo: t.badgeInfo ?? DEFAULT_TOKENS.badgeInfo,
    badgeDefault: t.badgeDefault ?? DEFAULT_TOKENS.badgeDefault,
    chart1: t.chart1 ?? DEFAULT_TOKENS.chart1,
    chart2: t.chart2 ?? DEFAULT_TOKENS.chart2,
    chart3: t.chart3 ?? DEFAULT_TOKENS.chart3,
    chart4: t.chart4 ?? DEFAULT_TOKENS.chart4,
    chart5: t.chart5 ?? DEFAULT_TOKENS.chart5,
    chartGrid: t.chartGrid ?? DEFAULT_TOKENS.chartGrid,
    receiptBackground: t.receiptBackground ?? DEFAULT_TOKENS.receiptBackground,
    receiptBorder: t.receiptBorder ?? DEFAULT_TOKENS.receiptBorder,
    receiptText: t.receiptText ?? DEFAULT_TOKENS.receiptText,
    orderStatus: resolveOrderStatus(t.orderStatus),
    inventoryStatus: resolveInventoryStatus(t.inventoryStatus),
    ...branding,
  };
}
