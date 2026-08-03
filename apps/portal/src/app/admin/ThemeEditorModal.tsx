'use client';

import { useMemo, useState } from 'react';
import {
  DEFAULT_TOKENS,
  resolveThemeConfig,
  type ResolvedTheme,
  type ThemeConfig,
  type ThemeTokens,
} from '@sat-sys/ui';
import { THEME_PRESETS } from './theme-presets';

interface ThemeEditorModalProps {
  brandName: string;
  initialTheme: ThemeConfig | null;
  onSave: (theme: ThemeConfig) => Promise<void>;
  onClose: () => void;
}

const DEFAULT_HEX = /^#[0-9a-fA-F]{6}$/;
const SHORT_HEX = /^#[0-9a-fA-F]{3}$/;

function toHexForInput(value: string): string {
  if (DEFAULT_HEX.test(value)) return value;
  if (SHORT_HEX.test(value)) {
    return `#${value
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`;
  }
  return '#ffffff';
}

export default function ThemeEditorModal({
  brandName,
  initialTheme,
  onSave,
  onClose,
}: ThemeEditorModalProps) {
  const [tokens, setTokens] = useState<Partial<ThemeTokens>>(initialTheme?.tokens ?? {});
  const [primaryColor, setPrimaryColor] = useState(initialTheme?.primaryColor ?? DEFAULT_TOKENS.primary);
  const [secondaryColor, setSecondaryColor] = useState(initialTheme?.secondaryColor ?? DEFAULT_TOKENS.secondary);
  const [accentColor, setAccentColor] = useState(initialTheme?.accentColor ?? DEFAULT_TOKENS.accent);
  const [logoUrl, setLogoUrl] = useState(initialTheme?.logoUrl ?? '');
  const [fontFamily, setFontFamily] = useState(initialTheme?.fontFamily ?? 'Inter');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const setToken = (key: keyof ThemeTokens, value: string) => {
    setTokens((prev) => ({ ...prev, [key]: value }));
    if (key === 'primary') setPrimaryColor(value);
    if (key === 'secondary') setSecondaryColor(value);
    if (key === 'accent') setAccentColor(value);
  };

  const setOrderStatus = (key: keyof ThemeTokens['orderStatus'], value: string) => {
    setTokens((prev) => {
      const orderStatus: ThemeTokens['orderStatus'] = {
        ...DEFAULT_TOKENS.orderStatus,
        ...(prev.orderStatus ?? {}),
      };
      orderStatus[key] = value;
      return { ...prev, orderStatus };
    });
  };

  const setInventoryStatus = (key: keyof ThemeTokens['inventoryStatus'], value: string) => {
    setTokens((prev) => {
      const inventoryStatus: ThemeTokens['inventoryStatus'] = {
        ...DEFAULT_TOKENS.inventoryStatus,
        ...(prev.inventoryStatus ?? {}),
      };
      inventoryStatus[key] = value;
      return { ...prev, inventoryStatus };
    });
  };

  const resolved: ResolvedTheme = useMemo(
    () =>
      resolveThemeConfig({
        primaryColor,
        secondaryColor,
        accentColor,
        tokens,
      }),
    [primaryColor, secondaryColor, accentColor, tokens],
  );

  const applyPreset = (name: string) => {
    const preset = THEME_PRESETS.find((p) => p.name === name);
    if (!preset) return;
    setTokens(preset.tokens);
    if (preset.tokens.primary) setPrimaryColor(preset.tokens.primary);
    if (preset.tokens.secondary) setSecondaryColor(preset.tokens.secondary);
    if (preset.tokens.accent) setAccentColor(preset.tokens.accent);
  };

  const resetToDefault = () => {
    setTokens({});
    setPrimaryColor(DEFAULT_TOKENS.primary);
    setSecondaryColor(DEFAULT_TOKENS.secondary);
    setAccentColor(DEFAULT_TOKENS.accent);
  };

  const hasCustomization = Object.keys(tokens).length > 0;

  const handleSave = async () => {
    setSaving(true);
    const theme: ThemeConfig = {
      primaryColor,
      secondaryColor,
      logoUrl,
      fontFamily,
      accentColor,
      tokens,
      branding: initialTheme?.branding,
    };
    await onSave(theme);
    setSaving(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const isPresetActive = (name: string) =>
    name === 'Brand Orange' ? !hasCustomization : THEME_PRESETS.find((p) => p.name === name)?.tokens === tokens;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Theme Manager — {brandName}</h2>
            <p className="text-sm text-gray-500">Per-tenant theme tokens. Changes apply instantly on next load.</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="px-6 py-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">Presets</span>
            <div className="flex gap-2">
              <button
                onClick={resetToDefault}
                disabled={!hasCustomization}
                className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                Reset to Default
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {THEME_PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => applyPreset(p.name)}
                title={p.description}
                className={`px-3 py-1.5 rounded border text-sm ${
                  isPresetActive(p.name)
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-3">
          <Section title="Live Preview" defaultOpen>
            <div className="sm:col-span-2">
              <ThemePreview resolved={resolved} />
            </div>
          </Section>

          <Section title="1. Brand Colors">
            <TokenField label="Brand Primary" value={resolved.primary} onChange={(v) => setToken('primary', v)} />
            <TokenField label="Brand Secondary" value={resolved.secondary} onChange={(v) => setToken('secondary', v)} />
            <TokenField label="Accent" value={resolved.accent} onChange={(v) => setToken('accent', v)} />
            <TokenField label="Primary Hover" value={resolved.primaryHover} onChange={(v) => setToken('primaryHover', v)} />
            <TokenField label="Primary Active" value={resolved.primaryActive} onChange={(v) => setToken('primaryActive', v)} />
            <TokenField label="Primary Foreground" value={resolved.primaryForeground} onChange={(v) => setToken('primaryForeground', v)} />
            <TokenField label="Secondary Hover" value={resolved.secondaryHover} onChange={(v) => setToken('secondaryHover', v)} />
            <TokenField label="Secondary Foreground" value={resolved.secondaryForeground} onChange={(v) => setToken('secondaryForeground', v)} />
            <TextField label="Logo URL" value={logoUrl} onChange={setLogoUrl} placeholder="https://..." />
            <TextField label="Font Family" value={fontFamily} onChange={setFontFamily} placeholder="Inter" />
          </Section>

          <Section title="2. Interface Colors">
            <TokenField label="App Background" value={resolved.background} onChange={(v) => setToken('background', v)} />
            <TokenField label="Secondary Background" value={resolved.backgroundSecondary} onChange={(v) => setToken('backgroundSecondary', v)} />
            <TokenField label="Surface" value={resolved.surface} onChange={(v) => setToken('surface', v)} />
            <TokenField label="Surface Secondary" value={resolved.surfaceSecondary} onChange={(v) => setToken('surfaceSecondary', v)} />
            <TokenField label="Surface Hover" value={resolved.surfaceHover} onChange={(v) => setToken('surfaceHover', v)} />
            <TokenField label="Card Background" value={resolved.cardBackground} onChange={(v) => setToken('cardBackground', v)} />
            <TokenField label="Card Border" value={resolved.cardBorder} onChange={(v) => setToken('cardBorder', v)} />
            <TokenField label="Card Header" value={resolved.cardHeader} onChange={(v) => setToken('cardHeader', v)} />
            <TokenField label="Border" value={resolved.border} onChange={(v) => setToken('border', v)} />
            <TokenField label="Border Light" value={resolved.borderLight} onChange={(v) => setToken('borderLight', v)} />
            <TokenField label="Divider" value={resolved.divider} onChange={(v) => setToken('divider', v)} />
          </Section>

          <Section title="3. Text">
            <TokenField label="Text Primary" value={resolved.textPrimary} onChange={(v) => setToken('textPrimary', v)} />
            <TokenField label="Text Secondary" value={resolved.textSecondary} onChange={(v) => setToken('textSecondary', v)} />
            <TokenField label="Text Muted" value={resolved.textMuted} onChange={(v) => setToken('textMuted', v)} />
            <TokenField label="Text Inverse" value={resolved.textInverse} onChange={(v) => setToken('textInverse', v)} />
          </Section>

          <Section title="4. Semantic Colors">
            <TokenField label="Success" value={resolved.success} onChange={(v) => setToken('success', v)} />
            <TokenField label="Warning" value={resolved.warning} onChange={(v) => setToken('warning', v)} />
            <TokenField label="Danger" value={resolved.danger} onChange={(v) => setToken('danger', v)} />
            <TokenField label="Info" value={resolved.info} onChange={(v) => setToken('info', v)} />
          </Section>

          <Section title="5. Navigation">
            <TokenField label="Sidebar Background" value={resolved.sidebarBackground} onChange={(v) => setToken('sidebarBackground', v)} />
            <TokenField label="Sidebar Foreground" value={resolved.sidebarForeground} onChange={(v) => setToken('sidebarForeground', v)} />
            <TokenField label="Sidebar Hover" value={resolved.sidebarHover} onChange={(v) => setToken('sidebarHover', v)} />
            <TokenField label="Sidebar Active" value={resolved.sidebarActive} onChange={(v) => setToken('sidebarActive', v)} />
            <TokenField label="Sidebar Border" value={resolved.sidebarBorder} onChange={(v) => setToken('sidebarBorder', v)} />
            <TokenField label="Navbar Background" value={resolved.navbarBackground} onChange={(v) => setToken('navbarBackground', v)} />
            <TokenField label="Navbar Foreground" value={resolved.navbarForeground} onChange={(v) => setToken('navbarForeground', v)} />
            <TokenField label="Navbar Border" value={resolved.navbarBorder} onChange={(v) => setToken('navbarBorder', v)} />
          </Section>

          <Section title="6. Buttons">
            <TokenField label="Primary Button" value={resolved.buttonPrimary} onChange={(v) => setToken('buttonPrimary', v)} />
            <TokenField label="Secondary Button" value={resolved.buttonSecondary} onChange={(v) => setToken('buttonSecondary', v)} />
            <TokenField label="Danger Button" value={resolved.buttonDanger} onChange={(v) => setToken('buttonDanger', v)} />
            <TokenField label="Outline Button" value={resolved.buttonOutline} onChange={(v) => setToken('buttonOutline', v)} />
            <TokenField label="Ghost Button" value={resolved.buttonGhost} onChange={(v) => setToken('buttonGhost', v)} />
          </Section>

          <Section title="7. Tables">
            <TokenField label="Table Header" value={resolved.tableHeader} onChange={(v) => setToken('tableHeader', v)} />
            <TokenField label="Table Header Text" value={resolved.tableHeaderText} onChange={(v) => setToken('tableHeaderText', v)} />
            <TokenField label="Table Row" value={resolved.tableRow} onChange={(v) => setToken('tableRow', v)} />
            <TokenField label="Table Hover" value={resolved.tableHover} onChange={(v) => setToken('tableHover', v)} />
            <TokenField label="Table Selected" value={resolved.tableSelected} onChange={(v) => setToken('tableSelected', v)} />
            <TokenField label="Table Border" value={resolved.tableBorder} onChange={(v) => setToken('tableBorder', v)} />
          </Section>

          <Section title="8. Status & Badges">
            <TokenField label="Badge Success" value={resolved.badgeSuccess} onChange={(v) => setToken('badgeSuccess', v)} />
            <TokenField label="Badge Warning" value={resolved.badgeWarning} onChange={(v) => setToken('badgeWarning', v)} />
            <TokenField label="Badge Danger" value={resolved.badgeDanger} onChange={(v) => setToken('badgeDanger', v)} />
            <TokenField label="Badge Info" value={resolved.badgeInfo} onChange={(v) => setToken('badgeInfo', v)} />
            <TokenField label="Badge Default" value={resolved.badgeDefault} onChange={(v) => setToken('badgeDefault', v)} />
            <div className="sm:col-span-2 border-t pt-3">
              <div className="text-xs font-semibold text-gray-500 mb-2">Order Status</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.keys(DEFAULT_TOKENS.orderStatus) as Array<keyof ThemeTokens['orderStatus']>).map((k) => (
                  <TokenField
                    key={k}
                    label={k}
                    value={resolved.orderStatus[k]}
                    onChange={(v) => setOrderStatus(k, v)}
                  />
                ))}
              </div>
            </div>
            <div className="sm:col-span-2 border-t pt-3">
              <div className="text-xs font-semibold text-gray-500 mb-2">Inventory Status</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.keys(DEFAULT_TOKENS.inventoryStatus) as Array<keyof ThemeTokens['inventoryStatus']>).map((k) => (
                  <TokenField
                    key={k}
                    label={k}
                    value={resolved.inventoryStatus[k]}
                    onChange={(v) => setInventoryStatus(k, v)}
                  />
                ))}
              </div>
            </div>
          </Section>

          <Section title="9. Charts">
            <TokenField label="Chart 1" value={resolved.chart1} onChange={(v) => setToken('chart1', v)} />
            <TokenField label="Chart 2" value={resolved.chart2} onChange={(v) => setToken('chart2', v)} />
            <TokenField label="Chart 3" value={resolved.chart3} onChange={(v) => setToken('chart3', v)} />
            <TokenField label="Chart 4" value={resolved.chart4} onChange={(v) => setToken('chart4', v)} />
            <TokenField label="Chart 5" value={resolved.chart5} onChange={(v) => setToken('chart5', v)} />
            <TokenField label="Chart Grid" value={resolved.chartGrid} onChange={(v) => setToken('chartGrid', v)} />
          </Section>

          <Section title="10. Receipts">
            <TokenField label="Receipt Background" value={resolved.receiptBackground} onChange={(v) => setToken('receiptBackground', v)} />
            <TokenField label="Receipt Border" value={resolved.receiptBorder} onChange={(v) => setToken('receiptBorder', v)} />
            <TokenField label="Receipt Text" value={resolved.receiptText} onChange={(v) => setToken('receiptText', v)} />
          </Section>
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {hasCustomization ? 'Custom theme active for this tenant' : 'Using default theme'}
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : savedFlash ? 'Saved ✓' : 'Save Theme'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-left"
      >
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        <span className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>&#9662;</span>
      </button>
      {isOpen && <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>}
    </div>
  );
}

function TokenField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={toHexForInput(value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded border cursor-pointer shrink-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 border rounded px-2 py-1.5 text-xs font-mono"
        />
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border rounded px-2 py-1.5 text-sm"
      />
    </div>
  );
}

function ThemePreview({ resolved: t }: { resolved: ResolvedTheme }) {
  return (
    <div className="border rounded-lg overflow-hidden text-sm">
      <div className="flex min-h-[280px]">
        <div className="w-36 shrink-0 p-3 space-y-1" style={{ backgroundColor: t.sidebarBackground, color: t.sidebarForeground }}>
          <div className="font-bold mb-3" style={{ color: t.sidebarForeground }}>
            Brand
          </div>
          <div className="px-2 py-1 rounded text-xs" style={{ backgroundColor: t.sidebarActive, color: t.primaryForeground }}>
            Dashboard
          </div>
          <div className="px-2 py-1 rounded text-xs" style={{ backgroundColor: t.sidebarHover, color: t.sidebarForeground }}>
            Orders
          </div>
          <div className="px-2 py-1 text-xs" style={{ color: t.sidebarForeground }}>
            Menu
          </div>
          <div className="px-2 py-1 text-xs" style={{ color: t.sidebarForeground }}>
            Settings
          </div>
        </div>
        <div className="flex-1 flex flex-col" style={{ backgroundColor: t.background }}>
          <div className="px-4 py-2 flex items-center justify-between" style={{ backgroundColor: t.navbarBackground, color: t.navbarForeground, borderBottom: `1px solid ${t.navbarBorder}` }}>
            <span className="font-semibold">Page Title</span>
            <span className="text-xs" style={{ color: t.textMuted }}>
              User
            </span>
          </div>
          <div className="flex-1 p-4 space-y-3" style={{ color: t.textPrimary }}>
            <div className="rounded-lg p-4" style={{ backgroundColor: t.cardBackground, border: `1px solid ${t.cardBorder}` }}>
              <div className="flex gap-2 flex-wrap mb-3">
                <span className="px-3 py-1 rounded text-xs" style={{ backgroundColor: t.buttonPrimary, color: t.primaryForeground }}>
                  Primary
                </span>
                <span className="px-3 py-1 rounded text-xs border" style={{ backgroundColor: t.buttonSecondary, color: t.textPrimary, borderColor: t.border }}>
                  Secondary
                </span>
                <span className="px-3 py-1 rounded text-xs" style={{ backgroundColor: t.buttonDanger, color: t.primaryForeground }}>
                  Danger
                </span>
              </div>
              <div className="flex gap-1.5 mb-3 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: t.success, color: t.primaryForeground }}>
                  Paid
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: t.warning, color: t.primaryForeground }}>
                  Preparing
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: t.danger, color: t.primaryForeground }}>
                  Cancelled
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: t.info, color: t.primaryForeground }}>
                  Info
                </span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    {['Item', 'Price', 'Status'].map((h) => (
                      <th
                        key={h}
                        className="px-2 py-1.5 text-left font-medium"
                        style={{ backgroundColor: t.tableHeader, color: t.tableHeaderText }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-2 py-1.5 border-b" style={{ backgroundColor: t.tableRow, borderColor: t.tableBorder }}>
                      Item A
                    </td>
                    <td className="px-2 py-1.5 border-b" style={{ backgroundColor: t.tableRow, borderColor: t.tableBorder }}>
                      $10.00
                    </td>
                    <td className="px-2 py-1.5 border-b" style={{ backgroundColor: t.tableRow, color: t.success, borderColor: t.tableBorder }}>
                      Completed
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="rounded-lg p-4" style={{ backgroundColor: t.receiptBackground, border: `1px solid ${t.receiptBorder}`, color: t.receiptText }}>
              <div className="text-center text-xs font-bold mb-1">Receipt Preview</div>
              <div className="flex justify-between text-xs">
                <span>Nasi Lemak</span>
                <span>$4.50</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: t.textMuted }}>Subtotal</span>
                <span>$4.50</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}