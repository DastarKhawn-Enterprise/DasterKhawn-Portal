'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { hasPermission } from './permissions';
import { supa } from './supa-query';

interface Props {
  slug: string;
  theme: ThemeConfig;
}

interface Settings {
  id: string;
  tax_enabled: boolean;
  tax_rate: number;
  currency_symbol: string;
  receipt_footer_text: string;
}

export default function SettingsView({ slug, theme }: Props) {
  const { user, isLoaded } = useUser();
  const meta = user?.publicMetadata as Record<string, any> | undefined;
  const perms = (meta?.permissions ?? []) as string[];
  const role = (meta?.role ?? '') as string;
  const canEdit = hasPermission(perms, role, 'settings:edit');

  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('');
  const [receiptFooterText, setReceiptFooterText] = useState('');

  useEffect(() => {
    if (!isLoaded) return;
    (async () => {
      try {
        const result = await supa(slug, { table: 'settings', select: '*', limit: 1, single: true });
        if (result.ok && result.data) {
          const s = result.data as unknown as Settings;
          setSettings(s);
          setTaxEnabled(s.tax_enabled);
          setTaxRate(String(s.tax_rate));
          setCurrencySymbol(s.currency_symbol);
          setReceiptFooterText(s.receipt_footer_text);
        }
      } catch (e) { console.error('[Settings]', e); }
    })();
  }, [isLoaded, slug]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const result = await supa(slug, {
        table: 'settings',
        method: 'update',
        eq: ['id', settings.id],
        body: {
          tax_enabled: taxEnabled,
          tax_rate: parseFloat(taxRate) || 0,
          currency_symbol: currencySymbol || '$',
          receipt_footer_text: receiptFooterText || 'Thank you for your order!',
          updated_at: new Date().toISOString(),
        },
      });
      if (!result.ok) { setError(result.error); } else { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    } catch (e: any) { setError(e.message || 'Save failed'); }
    setSaving(false);
  };

  if (!isLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Settings</h1>

        {!canEdit && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded text-sm mb-6">
            You do not have permission to edit settings.
          </div>
        )}

        {settings ? (
          <div className="space-y-6">
            <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Tax</h2>
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm text-gray-600">Enable Tax</label>
                <input
                  type="checkbox"
                  checked={taxEnabled}
                  onChange={(e) => setTaxEnabled(e.target.checked)}
                  disabled={!canEdit}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </div>
              {taxEnabled && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    disabled={!canEdit}
                    className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
              )}
            </section>

            <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Currency</h2>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Currency Symbol</label>
                <input
                  type="text"
                  maxLength={5}
                  value={currencySymbol}
                  onChange={(e) => setCurrencySymbol(e.target.value)}
                  disabled={!canEdit}
                  className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
            </section>

            <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Receipt Footer</h2>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Footer Text</label>
                <input
                  type="text"
                  value={receiptFooterText}
                  onChange={(e) => setReceiptFooterText(e.target.value)}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
            </section>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                {error}
              </div>
            )}

            {canEdit && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: theme.primaryColor }}
              >
                {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
              </button>
            )}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">Loading settings...</p>
        )}
      </div>
    </div>
  );
}
