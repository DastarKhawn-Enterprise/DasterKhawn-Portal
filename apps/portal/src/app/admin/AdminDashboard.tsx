'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toggleTenantStatus, saveTenantTheme, getRevenueStats } from './actions';
import type { ThemeConfig } from '@sat-sys/gateway-sdk';

interface TenantRow {
  id: string;
  slug: string;
  brand_name: string;
  status: 'active' | 'suspended';
  theme_config: ThemeConfig;
  created_at: string;
  billing: {
    payment_status: string;
    last_paid_at: string | null;
    due_date: string | null;
    amount_due: number | null;
  } | null;
}

interface AdminDashboardProps {
  tenants: TenantRow[];
}

export default function AdminDashboard({ tenants }: AdminDashboardProps) {
  const [localTenants, setLocalTenants] = useState(tenants);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals
  const [suspendTarget, setSuspendTarget] = useState<TenantRow | null>(null);
  const [themeTarget, setThemeTarget] = useState<TenantRow | null>(null);
  const [revenueTarget, setRevenueTarget] = useState<TenantRow | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleToggleStatus = async (t: TenantRow) => {
    setBusy(t.id);
    const result = await toggleTenantStatus(t.id, t.status);
    if (result.success) {
      const newStatus = t.status === 'active' ? 'suspended' : 'active';
      setLocalTenants((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: newStatus } : x)));
      showMsg('success', `${t.brand_name} ${newStatus === 'active' ? 'activated' : 'suspended'}`);
    } else {
      showMsg('error', result.error ?? 'Failed');
    }
    setBusy(null);
    setSuspendTarget(null);
  };

  return (
    <>
      {message && (
        <div
          className={`fixed top-4 right-4 px-4 py-2 rounded shadow-lg text-white z-50 ${
            message.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {message.text}
        </div>
      )}

      <main className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Super Admin Dashboard</h1>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-100 text-gray-600 text-sm uppercase">
                <tr>
                  <th className="px-4 py-3">Brand</th>
                  <th className="px-4 py-3">Slug</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {localTenants.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{t.brand_name}</td>
                    <td className="px-4 py-3 text-gray-500">{t.slug}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                          t.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {t.billing ? (
                        <span
                          className={
                            t.billing.payment_status === 'paid'
                              ? 'text-green-600'
                              : 'text-yellow-600'
                          }
                        >
                          {t.billing.payment_status}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/${t.slug}/pos`}
                          className="text-sm px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        >
                          Open POS
                        </Link>
                        <button
                          onClick={() => setThemeTarget(t)}
                          className="text-sm px-3 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                        >
                          Edit Theme
                        </button>
                        <button
                          onClick={() => setSuspendTarget(t)}
                          disabled={busy === t.id}
                          className={`text-sm px-3 py-1 rounded ${
                            t.status === 'active'
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          } disabled:opacity-50`}
                        >
                          {busy === t.id ? '...' : t.status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                        <button
                          onClick={() => setRevenueTarget(t)}
                          className="text-sm px-3 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                        >
                          Revenue
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {suspendTarget && (
        <SuspendModal
          tenant={suspendTarget}
          onConfirm={() => handleToggleStatus(suspendTarget)}
          onClose={() => setSuspendTarget(null)}
        />
      )}

      {themeTarget && (
        <ThemeModal
          tenant={themeTarget}
          onSave={async (theme) => {
            const r = await saveTenantTheme(themeTarget.id, theme);
            if (r.success) {
              setLocalTenants((prev) =>
                prev.map((x) => (x.id === themeTarget.id ? { ...x, theme_config: theme } : x)),
              );
              showMsg('success', `${themeTarget.brand_name} theme updated`);
              setThemeTarget(null);
            } else {
              showMsg('error', r.error ?? 'Failed');
            }
          }}
          onClose={() => setThemeTarget(null)}
        />
      )}

      {revenueTarget && (
        <RevenueModal tenant={revenueTarget} onClose={() => setRevenueTarget(null)} />
      )}
    </>
  );
}

/* ─── Suspend Confirm Modal ─── */

function SuspendModal({
  tenant,
  onConfirm,
  onClose,
}: {
  tenant: TenantRow;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const isActive = tenant.status === 'active';
  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-sm mx-auto shadow-xl">
        <h2 className="text-xl font-bold mb-3">
          {isActive ? 'Suspend' : 'Activate'} {tenant.brand_name}?
        </h2>
        {isActive ? (
          <p className="text-gray-600 mb-4">
            Suspending will prevent all users from accessing this POS until it is reactivated.
          </p>
        ) : (
          <p className="text-gray-600 mb-4">Reactivate this POS to restore access for all assigned users.</p>
        )}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded text-white ${isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
          >
            Confirm {isActive ? 'Suspend' : 'Activate'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ─── Theme Editor Modal ─── */

function ThemeModal({
  tenant,
  onSave,
  onClose,
}: {
  tenant: TenantRow;
  onSave: (theme: ThemeConfig) => Promise<void>;
  onClose: () => void;
}) {
  const [theme, setTheme] = useState<ThemeConfig>({
    primaryColor: tenant.theme_config?.primaryColor || '#ff6600',
    secondaryColor: tenant.theme_config?.secondaryColor || '#1a1a1a',
    logoUrl: tenant.theme_config?.logoUrl || '',
    fontFamily: tenant.theme_config?.fontFamily || 'Inter',
  });
  const [saving, setSaving] = useState(false);

  const update = (field: keyof ThemeConfig, value: string) => {
    setTheme((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(theme);
    setSaving(false);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-lg mx-auto shadow-xl w-full">
        <h2 className="text-xl font-bold mb-4">Theme — {tenant.brand_name}</h2>

        <div className="space-y-4">
          <ColorField label="Primary Color" value={theme.primaryColor} onChange={(v) => update('primaryColor', v)} />
          <ColorField label="Secondary Color" value={theme.secondaryColor} onChange={(v) => update('secondaryColor', v)} />
          <TextField label="Logo URL" value={theme.logoUrl} onChange={(v) => update('logoUrl', v)} placeholder="https://..." />
          <TextField label="Font Family" value={theme.fontFamily} onChange={(v) => update('fontFamily', v)} placeholder="Inter" />
        </div>

        {/* Live preview */}
        <div className="mt-6 border rounded-lg overflow-hidden">
          <div className="px-4 py-2 text-white text-sm font-bold" style={{ backgroundColor: theme.primaryColor }}>
            Preview Header
          </div>
          <div className="px-4 py-3 text-white text-sm" style={{ backgroundColor: theme.secondaryColor }}>
            Preview Footer
          </div>
          <p className="px-4 py-2 text-sm" style={{ fontFamily: theme.fontFamily }}>
            Sample text in {theme.fontFamily || 'system font'}
          </p>
        </div>

        <div className="flex gap-3 justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Theme'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function ColorField({
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
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded border cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 border rounded px-3 py-1.5 text-sm font-mono"
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
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border rounded px-3 py-1.5 text-sm"
      />
    </div>
  );
}

/* ─── Revenue Modal ─── */

function RevenueModal({
  tenant,
  onClose,
}: {
  tenant: TenantRow;
  onClose: () => void;
}) {
  const [range, setRange] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [stats, setStats] = useState<{
    totalOrders: number;
    totalRevenue: number;
    avgOrderValue: number;
    error?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = async (r: typeof range) => {
    setLoading(true);
    setRange(r);
    const result = await getRevenueStats(tenant.slug, r);
    setStats(result);
    setLoading(false);
  };

  // Fetch on first open
  const [fetched, setFetched] = useState(false);
  if (!fetched) {
    setFetched(true);
    fetchStats('all');
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-md mx-auto shadow-xl w-full">
        <h2 className="text-xl font-bold mb-2">Revenue — {tenant.brand_name}</h2>

        <div className="flex gap-2 mb-4">
          {(['today', 'week', 'month', 'all'] as const).map((r) => (
            <button
              key={r}
              onClick={() => fetchStats(r)}
              className={`px-3 py-1 rounded text-sm ${
                range === r ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {r === 'all' ? 'All Time' : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : stats?.error ? (
          <p className="text-red-600">{stats.error}</p>
        ) : stats ? (
          <div className="space-y-3">
            <div className="flex justify-between border-b pb-2">
              <span className="text-gray-600">Total Orders</span>
              <span className="font-bold text-lg">{stats.totalOrders}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-gray-600">Total Revenue</span>
              <span className="font-bold text-lg">${stats.totalRevenue.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Avg Order Value</span>
              <span className="font-bold text-lg">${stats.avgOrderValue.toFixed(2)}</span>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ─── Modal Overlay ─── */

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {children}
    </div>
  );
}
