export interface ThemeOrderStatus {
  draft: string;
  pending: string;
  preparing: string;
  ready: string;
  completed: string;
  cancelled: string;
  paid: string;
  refunded: string;
}

export interface ThemeInventoryStatus {
  healthy: string;
  lowStock: string;
  critical: string;
}

export interface ThemeTokens {
  background: string;
  backgroundSecondary: string;
  surface: string;
  surfaceSecondary: string;
  surfaceHover: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  primary: string;
  primaryHover: string;
  primaryActive: string;
  primaryForeground: string;
  secondary: string;
  secondaryHover: string;
  secondaryForeground: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  border: string;
  borderLight: string;
  divider: string;
  cardBackground: string;
  cardBorder: string;
  cardHeader: string;
  sidebarBackground: string;
  sidebarForeground: string;
  sidebarHover: string;
  sidebarActive: string;
  sidebarBorder: string;
  navbarBackground: string;
  navbarForeground: string;
  navbarBorder: string;
  buttonPrimary: string;
  buttonSecondary: string;
  buttonDanger: string;
  buttonOutline: string;
  buttonGhost: string;
  inputBackground: string;
  inputBorder: string;
  inputText: string;
  inputPlaceholder: string;
  inputFocus: string;
  tableHeader: string;
  tableHeaderText: string;
  tableRow: string;
  tableHover: string;
  tableSelected: string;
  tableBorder: string;
  badgeSuccess: string;
  badgeWarning: string;
  badgeDanger: string;
  badgeInfo: string;
  badgeDefault: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  chartGrid: string;
  receiptBackground: string;
  receiptBorder: string;
  receiptText: string;
  orderStatus: ThemeOrderStatus;
  inventoryStatus: ThemeInventoryStatus;
}

export interface ThemeBranding {
  restaurantName?: string;
  restaurantLogo?: string;
  dashboardLogo?: string;
  receiptLogo?: string;
  loginLogo?: string;
  brandFont?: string;
  accentColor?: string;
}

/**
 * Canonical tenant theme config.
 *
 * The four legacy fields (`primaryColor`, `secondaryColor`, `logoUrl`,
 * `fontFamily`) are the same shape persisted in `tenants.theme_config` today,
 * so every existing tenant remains valid with zero migration. All new fields
 * are optional and fall back to defaults when absent.
 */
export interface ThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  fontFamily: string;
  accentColor?: string;
  tokens?: Partial<ThemeTokens>;
  branding?: ThemeBranding;
}

export type ResolvedTheme = ThemeTokens & ThemeBranding;
