'use client';

import { useState, useEffect } from 'react';
import { useAuth, useUser, UserButton } from '@clerk/nextjs';
import Sidebar from './Sidebar';
import { POSProvider } from './pos-context';
import { EventProvider } from './event-context';
import { RealtimeIndicator } from './realtime-indicator';
import { supa } from './supa-query';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import type { ViewId } from './Sidebar';

interface POSShellProps {
  supabaseUrl: string;
  supabaseAnonKey: string;
  brandName: string;
  theme: ThemeConfig;
  slug: string;
  enabledModules: Record<string, boolean>;
  children: React.ReactNode;
}

function computeHiddenViews(user: any, enabledModules: Record<string, boolean>): ViewId[] {
  const meta = user?.publicMetadata as Record<string, any> | undefined;
  const perms: string[] = meta?.permissions ?? [];
  const role: string = meta?.role ?? '';
  const hidden: ViewId[] = [];
  if (role !== 'super_admin') {
    if (!perms.includes('staff:manage')) hidden.push('staff');
    if (!perms.includes('menu:edit')) { hidden.push('menu'); hidden.push('inventory'); hidden.push('item-ledger'); }
    if (!perms.includes('reports:view')) hidden.push('reports');
    if (!perms.includes('accounts:view')) hidden.push('accounts');
    if (!perms.includes('settings:edit')) { hidden.push('settings'); hidden.push('expenses'); }
  }
  const moduleToViews: Record<string, ViewId[]> = {
    orders: ['current-orders', 'orders-new', 'orders-completed', 'orders-cancelled', 'orders-draft'],
    dine_in: ['dine-in'],
    take_away: ['take-away'],
    delivery: ['delivery'],
    drive_thru: ['drive-thru'],
    third_party: ['third-party'],
    reservations: ['reservations'],
    menu: ['menu'],
    inventory: ['inventory', 'item-ledger'],
    customers: ['customers'],
    reports: ['reports'],
    expenses: ['expenses'],
    staff: ['staff'],
    settings: ['settings'],
  };
  for (const [moduleKey, views] of Object.entries(moduleToViews)) {
    if (enabledModules[moduleKey] === false) {
      for (const v of views) {
        if (!hidden.includes(v)) hidden.push(v);
      }
    }
  }
  return hidden;
}

export default function POSShell({ supabaseUrl, supabaseAnonKey, brandName, theme, slug, enabledModules, children }: POSShellProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [currencySymbol, setCurrencySymbol] = useState('Rs.');
  const [pageTitle, setPageTitle] = useState('');
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setAuthReady(true);
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!authReady) return;
    supa(slug, { table: 'settings', select: 'currency_symbol', limit: 1 }).then((r) => {
      if (r.ok && r.data?.[0]?.currency_symbol) setCurrencySymbol(r.data[0].currency_symbol);
    }).catch(() => {});
  }, [authReady, slug]);

  const hiddenViews = user ? computeHiddenViews(user, enabledModules) : [];

  if (!isLoaded || !authReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  const contextValue = {
    supabaseUrl,
    supabaseAnonKey,
    brandName,
    theme,
    slug,
    enabledModules,
    currencySymbol,
    hiddenViews,
    pageTitle,
    setPageTitle,
  };

  return (
    <POSProvider value={contextValue}>
      <EventProvider slug={slug} supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey}>
      <div className="h-screen h-dvh flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3" style={{ color: theme.secondaryColor }}>
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden text-xl p-1 hover:bg-gray-100 rounded"
            >
              ☰
            </button>
            <span className="text-lg font-bold">{brandName}</span>
            {pageTitle && <><span className="text-gray-300 mx-1.5 text-sm">/</span><span className="text-sm font-medium text-gray-600 truncate max-w-[200px]">{pageTitle}</span></>}
            {(user?.publicMetadata as Record<string, any> | undefined)?.role === 'super_admin' && (
              <a
                href="/dashboard"
                className="ml-2 px-3 py-1 text-xs font-medium rounded border bg-white hover:bg-gray-50 transition-colors"
                style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}
              >
                ← All POS
              </a>
            )}
          </div>
          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="Search menu, orders..."
              className="hidden md:block w-64 px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 placeholder-gray-400"
              disabled
            />
            <button className="md:hidden text-gray-400 text-lg p-1">🔍</button>
            <RealtimeIndicator />
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden min-w-0">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
            accentColor={theme.primaryColor}
            mobileOpen={mobileSidebarOpen}
            onMobileClose={() => setMobileSidebarOpen(false)}
            hiddenViews={hiddenViews}
            slug={slug}
          />
          {children}
        </div>
      </div>
      </EventProvider>
    </POSProvider>
  );
}
