'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth, useUser, UserButton } from '@clerk/nextjs';
import Sidebar from './Sidebar';
import { POSProvider } from './pos-context';
import { EventProvider } from './event-context';
import NotificationSoundProvider from './NotificationSoundProvider';
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
  children: React.ReactNode;
}

function computeHiddenViews(enabledModules: Record<string, boolean>): ViewId[] {
  // Only module gating drives navigation visibility. No feature-level
  // permissions exist: when a module is enabled the user has full access.
  return hiddenViewsForModules(enabledModules);
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

  const hiddenViews = computeHiddenViews(enabledModules);
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
      <main className="min-h-screen flex items-center justify-center bg-background">
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
      <NotificationSoundProvider slug={slug} />
      <BusinessDateProvider>
      <div className="h-screen h-dvh flex flex-col overflow-hidden">
<header className="flex items-center justify-between px-4 py-2.5 bg-navbar border-b border-navbar-border flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 text-navbar-foreground">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden text-xl p-1 rounded hover:bg-surface-hover flex-shrink-0"
            >
              ☰
            </button>
            <span className="text-lg font-bold truncate whitespace-nowrap">{brandName}</span>
            {(user?.publicMetadata as Record<string, any> | undefined)?.role === 'super_admin' && (
              <a
                href="/dashboard"
                className="ml-2 px-3 py-1 text-xs font-medium rounded border bg-surface hover:bg-surface-secondary transition-colors whitespace-nowrap flex-shrink-0"
                style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}
              >
                ← All POS
              </a>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <input
              type="text"
              placeholder="Search menu, orders..."
              className="hidden lg:block w-48 xl:w-56 px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-muted placeholder-input-placeholder"
              disabled
            />
            <button className="lg:hidden text-input-placeholder text-lg p-1">🔍</button>
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
            <main className="flex-1 flex items-center justify-center bg-background">
              <div className="text-center p-8 bg-surface rounded-2xl border border-card-border shadow-sm max-w-md">
                <div className="text-4xl mb-3">🔒</div>
                <h1 className="text-xl font-bold text-foreground mb-2">Module Disabled</h1>
                <p className="text-sm text-muted">
                  {disabledModuleKey ? (
                    <>The <span className="font-semibold text-text-secondary">{disabledModuleKey}</span> module is currently disabled for this POS by the administrator. Contact your administrator to enable it.</>
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
