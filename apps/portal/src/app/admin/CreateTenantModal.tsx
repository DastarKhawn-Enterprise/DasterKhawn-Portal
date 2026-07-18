'use client';

import { useState, useCallback, type FormEvent } from 'react';
import { createTenant, type CreateTenantResult } from './actions';
import type { ThemeConfig } from '@sat-sys/gateway-sdk';

interface TenantBasic {
  id: string;
  slug: string;
  brand_name: string;
  theme_config: ThemeConfig;
}

interface CreateTenantModalProps {
  tenants: TenantBasic[];
  onClose: () => void;
  onCreated: () => void;
}

function generatePassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let result = '';
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type PageState = 'form' | 'progress' | 'result';

const STEPS = [
  'Validating Supabase credentials...',
  'Running database migrations...',
  'Copying template menu...',
  'Creating tenant record...',
  'Setting up owner account...',
  'Finalizing tenant configuration...',
];

export default function CreateTenantModal({ tenants, onClose, onCreated }: CreateTenantModalProps) {
  const [page, setPage] = useState<PageState>('form');
  const [stepIndex, setStepIndex] = useState(0);
  const [result, setResult] = useState<CreateTenantResult | null>(null);

  const [brandName, setBrandName] = useState('');
  const [slug, setSlug] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#ff6600');
  const [secondaryColor, setSecondaryColor] = useState('#1a1a1a');
  const [menuTemplateSlug, setMenuTemplateSlug] = useState('');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [supabaseServiceKey, setSupabaseServiceKey] = useState('');
  const [dbPassword, setDbPassword] = useState('');

  const handleBrandNameChange = useCallback((val: string) => {
    setBrandName(val);
    setSlug(slugify(val));
  }, []);

  const handleGeneratePassword = useCallback(() => {
    setOwnerPassword(generatePassword());
  }, []);

  const handleCopyTheme = useCallback((tenantSlug: string) => {
    const t = tenants.find((x) => x.slug === tenantSlug);
    if (t && t.theme_config) {
      setPrimaryColor(t.theme_config.primaryColor || '#ff6600');
      setSecondaryColor(t.theme_config.secondaryColor || '#1a1a1a');
    }
  }, [tenants]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!brandName || !slug || !ownerEmail || !supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !dbPassword) {
      return;
    }

    setPage('progress');
    setStepIndex(0);

    const stepTimer = setInterval(() => {
      setStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
    }, 2000);

    try {
      const res = await createTenant({
        supabaseUrl,
        supabaseAnonKey,
        supabaseServiceKey,
        dbPassword,
        brandName,
        slug,
        primaryColor,
        secondaryColor,
        templateTenantSlug: menuTemplateSlug || undefined,
        ownerEmail,
        ownerPassword: ownerPassword || generatePassword(),
      });
      setResult(res);
      if (res.success) {
        setStepIndex(STEPS.length);
        onCreated();
      } else {
        const failedIdx = STEPS.findIndex((s) => s.includes(res.step || ''));
        setStepIndex(failedIdx >= 0 ? failedIdx : stepIndex);
      }
    } catch {
      setResult({ success: false, error: 'Unexpected error submitting form' });
    } finally {
      clearInterval(stepTimer);
    }
  };

  const handleClose = () => {
    onClose();
  };

  const retryFromFailed = () => {
    setPage('form');
    setResult(null);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[95vh] overflow-y-auto mx-4">
        {page === 'form' && (
          <FormView
            brandName={brandName}
            onBrandNameChange={handleBrandNameChange}
            slug={slug}
            onSlugChange={setSlug}
            ownerEmail={ownerEmail}
            onOwnerEmailChange={setOwnerEmail}
            ownerPassword={ownerPassword}
            onOwnerPasswordChange={setOwnerPassword}
            onGeneratePassword={handleGeneratePassword}
            primaryColor={primaryColor}
            onPrimaryColorChange={setPrimaryColor}
            secondaryColor={secondaryColor}
            onSecondaryColorChange={setSecondaryColor}
            onCopyTheme={handleCopyTheme}
            menuTemplateSlug={menuTemplateSlug}
            onMenuTemplateSlugChange={setMenuTemplateSlug}
            tenants={tenants}
            supabaseUrl={supabaseUrl}
            onSupabaseUrlChange={setSupabaseUrl}
            supabaseAnonKey={supabaseAnonKey}
            onSupabaseAnonKeyChange={setSupabaseAnonKey}
            supabaseServiceKey={supabaseServiceKey}
            onSupabaseServiceKeyChange={setSupabaseServiceKey}
            dbPassword={dbPassword}
            onDbPasswordChange={setDbPassword}
            onSubmit={handleSubmit}
            onClose={handleClose}
          />
        )}

        {page === 'progress' && (
          <ProgressView
            steps={STEPS}
            currentStep={stepIndex}
            result={result}
            onRetry={retryFromFailed}
            onClose={handleClose}
          />
        )}

        {page === 'result' && result && (
          <ResultView result={result} onClose={handleClose} onRetry={retryFromFailed} />
        )}
      </div>
    </div>
  );
}

/* ─── Form View ─── */

function FormView({
  brandName, onBrandNameChange,
  slug, onSlugChange,
  ownerEmail, onOwnerEmailChange,
  ownerPassword, onOwnerPasswordChange, onGeneratePassword,
  primaryColor, onPrimaryColorChange,
  secondaryColor, onSecondaryColorChange,
  onCopyTheme,
  menuTemplateSlug, onMenuTemplateSlugChange,
  tenants,
  supabaseUrl, onSupabaseUrlChange,
  supabaseAnonKey, onSupabaseAnonKeyChange,
  supabaseServiceKey, onSupabaseServiceKeyChange,
  dbPassword, onDbPasswordChange,
  onSubmit, onClose,
}: {
  brandName: string; onBrandNameChange: (v: string) => void;
  slug: string; onSlugChange: (v: string) => void;
  ownerEmail: string; onOwnerEmailChange: (v: string) => void;
  ownerPassword: string; onOwnerPasswordChange: (v: string) => void;
  onGeneratePassword: () => void;
  primaryColor: string; onPrimaryColorChange: (v: string) => void;
  secondaryColor: string; onSecondaryColorChange: (v: string) => void;
  onCopyTheme: (tenantSlug: string) => void;
  menuTemplateSlug: string; onMenuTemplateSlugChange: (v: string) => void;
  tenants: TenantBasic[];
  supabaseUrl: string; onSupabaseUrlChange: (v: string) => void;
  supabaseAnonKey: string; onSupabaseAnonKeyChange: (v: string) => void;
  supabaseServiceKey: string; onSupabaseServiceKeyChange: (v: string) => void;
  dbPassword: string; onDbPasswordChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void; onClose: () => void;
}) {
  const isValid = brandName && slug && ownerEmail && supabaseUrl && supabaseAnonKey && supabaseServiceKey && dbPassword;

  return (
    <form onSubmit={onSubmit} className="p-6">
      <h2 className="text-xl font-bold mb-1">Create New Tenant</h2>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-sm text-amber-800">
        <strong>Before you begin:</strong> First, create a new Supabase project
        manually at <strong>supabase.com</strong> (use any account with available
        free-tier slots), then paste its credentials below. You will need the
        project URL, anon key, service role key, and the database password set
        during project creation — the database password is required to run
        schema migrations automatically.
      </div>

      <div className="space-y-5">
        {/* Brand & Slug */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name *</label>
            <input type="text" value={brandName} onChange={(e) => onBrandNameChange(e.target.value)}
              className="w-full border rounded px-3 py-1.5 text-sm" placeholder="My Restaurant" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
            <input type="text" value={slug} onChange={(e) => onSlugChange(e.target.value)}
              className="w-full border rounded px-3 py-1.5 text-sm font-mono" placeholder="my-restaurant" required />
          </div>
        </div>

        {/* Owner Account */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Owner Email *</label>
          <input type="email" value={ownerEmail} onChange={(e) => onOwnerEmailChange(e.target.value)}
            className="w-full border rounded px-3 py-1.5 text-sm" placeholder="owner@example.com" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Owner Password *</label>
          <div className="flex gap-2">
            <input type="text" value={ownerPassword} onChange={(e) => onOwnerPasswordChange(e.target.value)}
              className="flex-1 border rounded px-3 py-1.5 text-sm font-mono" placeholder="Leave blank to auto-generate" />
            <button type="button" onClick={onGeneratePassword}
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 border whitespace-nowrap">
              Generate
            </button>
          </div>
        </div>

        {/* Theme */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Theme</label>
          <div className="flex gap-4">
            <div>
              <label className="text-xs text-gray-500">Primary</label>
              <div className="flex gap-1 items-center">
                <input type="color" value={primaryColor} onChange={(e) => onPrimaryColorChange(e.target.value)}
                  className="w-8 h-8 rounded border cursor-pointer" />
                <input type="text" value={primaryColor} onChange={(e) => onPrimaryColorChange(e.target.value)}
                  className="w-24 border rounded px-2 py-1 text-xs font-mono" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">Secondary</label>
              <div className="flex gap-1 items-center">
                <input type="color" value={secondaryColor} onChange={(e) => onSecondaryColorChange(e.target.value)}
                  className="w-8 h-8 rounded border cursor-pointer" />
                <input type="text" value={secondaryColor} onChange={(e) => onSecondaryColorChange(e.target.value)}
                  className="w-24 border rounded px-2 py-1 text-xs font-mono" />
              </div>
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">Copy from tenant</label>
              <select onChange={(e) => { if (e.target.value) onCopyTheme(e.target.value); }}
                className="w-full border rounded px-2 py-1 text-xs" defaultValue="">
                <option value="">— select —</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.slug}>{t.brand_name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Menu Template */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Menu Template
            <span className="text-xs text-gray-400 ml-1">(copies names &amp; categories, not prices)</span>
          </label>
          <select value={menuTemplateSlug} onChange={(e) => onMenuTemplateSlugChange(e.target.value)}
            className="w-full border rounded px-3 py-1.5 text-sm">
            <option value="">Blank — start with an empty menu</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.slug}>{t.brand_name}</option>
            ))}
          </select>
        </div>

        {/* Supabase Credentials */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Supabase Project Credentials</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project URL *</label>
              <input type="url" value={supabaseUrl} onChange={(e) => onSupabaseUrlChange(e.target.value)}
                className="w-full border rounded px-3 py-1.5 text-sm font-mono" placeholder="https://abcdefghijklm.supabase.co" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Anon Key *</label>
              <input type="text" value={supabaseAnonKey} onChange={(e) => onSupabaseAnonKeyChange(e.target.value)}
                className="w-full border rounded px-3 py-1.5 text-sm font-mono" placeholder="eyJhbGciOiJIUzI1NiIs..." required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Service Role Key *</label>
              <input type="password" value={supabaseServiceKey} onChange={(e) => onSupabaseServiceKeyChange(e.target.value)}
                className="w-full border rounded px-3 py-1.5 text-sm font-mono" placeholder="eyJhbGciOiJIUzI1NiIs..." required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Database Password *
                <span className="text-xs text-gray-400 ml-1">(set when creating the Supabase project — needed for automated schema setup)</span>
              </label>
              <input type="password" value={dbPassword} onChange={(e) => onDbPasswordChange(e.target.value)}
                className="w-full border rounded px-3 py-1.5 text-sm" placeholder="Password from project creation" required />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 justify-end mt-6 pt-4 border-t">
        <button type="button" onClick={onClose}
          className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" disabled={!isValid}
          className="px-4 py-2 rounded text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
          Create Tenant
        </button>
      </div>
    </form>
  );
}

/* ─── Progress View ─── */

function ProgressView({
  steps, currentStep, result, onRetry, onClose,
}: {
  steps: string[]; currentStep: number; result: CreateTenantResult | null;
  onRetry: () => void; onClose: () => void;
}) {
  const failed = result && !result.success;
  const done = result?.success;

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">
        {done ? 'Tenant Created Successfully' : failed ? 'Creation Failed' : 'Creating Tenant...'}
      </h2>

      <div className="space-y-3">
        {steps.map((step, i) => {
          let status: 'waiting' | 'current' | 'done' | 'failed' = 'waiting';
          if (done) {
            status = 'done';
          } else if (failed && i === currentStep) {
            status = 'failed';
          } else if (failed && i < currentStep) {
            status = 'done';
          } else if (i < currentStep) {
            status = 'done';
          } else if (i === currentStep) {
            status = 'current';
          }

          return (
            <div key={i} className={`flex items-center gap-3 text-sm ${
              status === 'done' ? 'text-green-700' :
              status === 'failed' ? 'text-red-700' :
              status === 'current' ? 'text-blue-700' : 'text-gray-400'
            }`}>
              <span className="w-5 text-center">
                {status === 'done' ? '✓' : status === 'failed' ? '✗' : status === 'current' ? '○' : '·'}
              </span>
              <span className={status === 'current' ? 'font-medium' : ''}>{step}</span>
            </div>
          );
        })}
      </div>

      {failed && result?.error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <strong>Error at step &ldquo;{result.step || 'Unknown'}&rdquo;:</strong> {result.error}
        </div>
      )}

      <div className="flex gap-3 justify-end mt-6">
        {failed ? (
          <>
            <button onClick={onRetry}
              className="px-4 py-2 rounded text-white bg-blue-600 hover:bg-blue-700">
              Retry from Beginning
            </button>
            <button onClick={onClose}
              className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">
              Close
            </button>
          </>
        ) : done ? (
          <button onClick={onClose}
            className="px-4 py-2 rounded text-white bg-green-600 hover:bg-green-700">
            Continue
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Result View ─── */

function ResultView({
  result, onClose, onRetry,
}: {
  result: CreateTenantResult; onClose: () => void; onRetry: () => void;
}) {
  if (!result.success) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold mb-2 text-red-700">Creation Failed</h2>
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 mb-4">
          <strong>Step &ldquo;{result.step || 'Unknown'}&rdquo;:</strong> {result.error}
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onRetry}
            className="px-4 py-2 rounded text-white bg-blue-600 hover:bg-blue-700">
            Retry from Beginning
          </button>
          <button onClick={onClose}
            className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-2 text-green-700">Tenant Created Successfully</h2>

      <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2 text-sm mb-4">
        <div className="flex justify-between">
          <span className="text-gray-600">Tenant Slug</span>
          <span className="font-mono font-medium">{result.tenantSlug}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Owner Email</span>
          <span className="font-medium">{result.ownerEmail}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Owner Password</span>
          <span className="font-mono font-medium">{result.password}</span>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        Share these credentials with the business owner. The new tenant will
        appear in the admin dashboard&apos;s tenant list immediately.
      </p>

      <div className="flex gap-3 justify-end">
        <button onClick={onClose}
          className="px-4 py-2 rounded text-white bg-green-600 hover:bg-green-700">
          Done
        </button>
      </div>
    </div>
  );
}
