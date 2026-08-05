'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth, useUser, UserButton } from '@clerk/nextjs';
import Sidebar from './Sidebar';
import { POSProvider } from './pos-context';
import { EventProvider } from './event-context';
import { BusinessDateProvider } from './business-date-context';
import BusinessDatePicker from './business-date-picker';
import { RealtimeIndicator } from './realtime-indicator';
import { supa } from './supa-query';
import { Skeleton, ThemeProvider, resolveThemeConfig, themeToCssVariables } from '@sat-sys/ui';
import type { ThemeConfig } from '@sat-sys/ui';
import { hiddenViewsForModules, disabledRoutesForModules, MODULE_BY_KEY } from '@/lib/module-registry';
import type { ViewId } from './Sidebar';

interface POSShellProps {
  supabaseUrl: string;
  supabaseAnonKey: string;
  brandName: string;
  theme: ThemeConfig;
  slug: string;
  enabledModules: Record<string, boolean>;
  staffRole?: string;
  staffPermissions?: string[];
  children: React.ReactNode;
}

function computeHiddenViews(user: any, enabledModules: Record<string, boolean>, authoritativeRole?: string, authoritativePerms?: string[]): ViewId[] {
  const meta = user?.publicMetadata as Record<string, any> | undefined;
  const perms: string[] = authoritativePerms?.length ? authoritativePerms : (meta?.permissions ?? []);
  const role: string = authoritativeRole || meta?.role || '';
  const hidden: ViewId[] = hiddenViewsForModules(enabledModules);
  if (role !== 'super_admin' && role !== 'owner') {
    if (!perms.includes('staff:manage')) hidden.push('staff');
    if (!perms.includes('menu:edit')) { hidden.push('menu'); hidden.push('inventory'); hidden.push('item-ledger'); }
    if (!perms.includes('reports:view')) hidden.push('reports');
    if (!perms.includes('accounts:view')) hidden.push('accounts');
    if (!perms.includes('settings:edit')) { hidden.push('settings'); hidden.push('expenses'); }
  }
  return hidden;
}

export default function POSShell({ supabaseUrl, supabaseAnonKey, brandName, theme, slug, enabledModules, staffRole, staffPermissions, children }: POSShellProps) {
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

  const hiddenViews = user ? computeHiddenViews(user, enabledModules, staffRole, staffPermissions) : [];
  const pathname = usePathname();
  const posPath = '/' + pathname.split('/').slice(3).join('/');
  const disabledRoutes = disabledRoutesForModules(enabledModules);
  const disabledModuleKey = disabledRoutes.includes(posPath)
    ? MODULE_BY_KEY[Object.keys(MODULE_BY_KEY).find((k) => MODULE_BY_KEY[k].routes?.includes(posPath)) as string]?.label
    : undefined;
  const routeBlocked = disabledRoutes.includes(posPath);

  const { resolvedTheme, themeCssVars } = useMemo(() => {
    const resolvedTheme = resolveThemeConfig(theme);
    return { resolvedTheme, themeCssVars: themeToCssVariables(resolvedTheme) };
  }, [theme]);

  if (!isLoaded || !authReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md px-6">
          <Skeleton variant="card" rows={4} />
        </div>
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
    resolvedTheme,
    themeCssVars,
  };

  return (
    <POSProvider value={contextValue}>
      <ThemeProvider theme={theme}>
      <EventProvider slug={slug} supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey}>
      <BusinessDateProvider>
      <div className="h-screen h-dvh flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 py-2.5 bg-navbar border-b border-navbar-border flex-shrink-0">
          <div className="flex items-center gap-3 text-navbar-foreground">
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
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search menu, orders..."
              className="hidden lg:block w-48 xl:w-56 px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 placeholder-gray-400"
              disabled
            />
            <button className="lg:hidden text-gray-400 text-lg p-1">🔍</button>
            <BusinessDatePicker />
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
          {routeBlocked ? (
            <main className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="text-center p-8 bg-white rounded-2xl border border-gray-200 shadow-sm max-w-md">
                <div className="text-4xl mb-3">🔒</div>
                <h1 className="text-xl font-bold text-gray-800 mb-2">Module Disabled</h1>
                <p className="text-sm text-gray-500">
                  {disabledModuleKey ? (
                    <>The <span className="font-semibold text-gray-700">{disabledModuleKey}</span> module is currently disabled for this POS by the administrator. Contact your administrator to enable it.</>
                  ) : (
                    'This area is currently disabled for this POS. Contact your administrator to enable it.'
                  )}
                </p>
              </div>
            </main>
          ) : (
            children
          )}
        </div>
      </div>
      </BusinessDateProvider>
      </EventProvider>
      </ThemeProvider>
    </POSProvider>
  );
}
