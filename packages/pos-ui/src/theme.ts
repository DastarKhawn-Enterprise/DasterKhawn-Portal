export interface ThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  fontFamily: string;
  accentColor?: string;
  backgroundColor?: string;
  sidebarColor?: string;
  surfaceColor?: string;
  headerColor?: string;
  cardColor?: string;
  borderColor?: string;
  textColor?: string;
  mutedTextColor?: string;
  radius?: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = (hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbTriplet(hex: string): string {
  const c = hexToRgb(hex);
  return c ? `${c.r} ${c.g} ${c.b}` : '255 255 255';
}

export function contrastColor(hex: string): string {
  const c = hexToRgb(hex);
  if (!c) return '#ffffff';
  const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return lum > 0.55 ? '#111827' : '#ffffff';
}

export const DEFAULT_THEME: ThemeConfig = {
  primaryColor: '#ff6600',
  secondaryColor: '#1f2430',
  logoUrl: '',
  fontFamily: 'Inter',
};

/**
 * Converts a ThemeConfig into leaf CSS custom-property values that are applied
 * on the POS shell wrapper. Derived tokens (hover/soft shades, shadows, radius)
 * are computed automatically in CSS from these leaves, so the whole app follows
 * the theme with zero manual edits.
 */
export function buildThemeVars(theme: ThemeConfig): Record<string, string> {
  const primary = theme.primaryColor || DEFAULT_THEME.primaryColor;
  const secondary = theme.secondaryColor || DEFAULT_THEME.secondaryColor;
  const accent = theme.accentColor || primary;
  const radius = theme.radius || 18;

  return {
    '--primary': primary,
    '--primary-rgb': rgbTriplet(primary),
    '--primary-contrast': contrastColor(primary),
    '--secondary': secondary,
    '--secondary-rgb': rgbTriplet(secondary),
    '--secondary-contrast': contrastColor(secondary),
    '--accent': accent,
    '--accent-rgb': rgbTriplet(accent),
    '--accent-contrast': contrastColor(accent),
    '--background': theme.backgroundColor || '#f6f7f9',
    '--surface': theme.surfaceColor || '#ffffff',
    '--card': theme.cardColor || '#ffffff',
    '--header': theme.headerColor || '#ffffff',
    '--sidebar': theme.sidebarColor || secondary,
    '--sidebar-text': contrastColor(theme.sidebarColor || secondary),
    '--border': theme.borderColor || '#e6e8ec',
    '--text': theme.textColor || '#111827',
    '--text-muted': theme.mutedTextColor || '#6b7280',
    '--radius': String(radius),
    '--radius-card': String(radius),
    '--radius-btn': String(Math.max(radius - 6, 8)),
    '--radius-input': String(Math.max(radius - 6, 8)),
    '--radius-dialog': String(radius),
    '--radius-sidebar': String(Math.max(radius + 2, 20)),
    '--font': theme.fontFamily || DEFAULT_THEME.fontFamily,
  };
}
