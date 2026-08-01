'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser, UserButton } from '@clerk/nextjs';
import Sidebar from './Sidebar';
import { POSProvider } from './pos-context';
import { EventProvider } from './event-context';
import { RealtimeIndicator } from './realtime-indicator';
import { supa } from './supa-query';
import { buildThemeVars } from '@sat-sys/pos-ui';
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
  const [darkMode, setDarkMode] = useState(false);
  const [clock, setClock] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

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

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
    };
    updateClock();
    const interval = setInterval(updateClock, 30000);
    return () => clearInterval(interval);
  }, []);

  const hiddenViews = user ? computeHiddenViews(user, enabledModules) : [];

  const themeVars = buildThemeVars(theme);

  const meta = (user?.publicMetadata ?? {}) as { role?: string };
  const isAdmin = meta.role === 'super_admin';
  const displayName = user?.firstName || user?.username || 'User';
  const initials = (user?.firstName?.[0] || '') + (user?.lastName?.[0] || '') || displayName[0] || 'U';

  if (!isLoaded || !authReady) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading...</p>
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
  };

  return (
    <POSProvider value={contextValue}>
      <EventProvider slug={slug} supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey}>
      <div
        className="h-screen h-dvh flex flex-col overflow-hidden"
        style={{ ...themeVars, fontFamily: `${theme.fontFamily || 'Inter'}, system-ui, -apple-system, sans-serif` }}
        data-theme={darkMode ? 'dark' : 'light'}
      >
        {/* ── Header ── */}
        <header className="flex items-center justify-between h-[60px] px-4 md:px-6 bg-[var(--header)] border-b flex-shrink-0 z-30" style={{ borderColor: 'var(--border)' }}>
          {/* Left: Brand + Nav */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-[var(--radius-btn)] hover:bg-[var(--surface-3)] text-[var(--text-soft)] transition-colors"
              aria-label="Open menu"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Logo / Initials */}
            {theme.logoUrl ? (
              <img src={theme.logoUrl} alt={brandName} className="w-8 h-8 rounded-[10px] object-contain hidden sm:block" />
            ) : (
              <div className="hidden sm:flex w-8 h-8 rounded-[10px] items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: theme.primaryColor }}>
                {brandName.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-[15px] font-semibold text-[var(--text)] truncate hidden sm:block">{brandName}</span>
              {pageTitle && (
                <>
                  <span className="text-[var(--text-faint)] text-sm hidden md:inline">/</span>
                  <span className="text-sm font-medium text-[var(--text-muted)] truncate max-w-[180px] hidden md:block">{pageTitle}</span>
                </>
              )}
            </div>

            {isAdmin && (
              <a
                href="/dashboard"
                className="hidden lg:inline-flex btn btn-outline btn-sm text-xs"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                All POS
              </a>
            )}
          </div>

          {/* Right: Search, Clock, Realtime, User */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Search */}
            <div className={`relative transition-all duration-200 ${showSearch ? 'w-64' : 'w-auto'}`}>
              {showSearch && (
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <svg className="w-4 h-4 text-[var(--text-faint)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              )}
              <input
                type="text"
                placeholder="Search menu, orders..."
                className={`${showSearch ? 'input pl-10 pr-3 w-full' : 'hidden md:block'}`}
                style={showSearch ? {} : {}}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />
            </div>

            <button
              onClick={() => setShowSearch(!showSearch)}
              className="flex items-center justify-center w-9 h-9 rounded-[var(--radius-btn)] hover:bg-[var(--surface-3)] text-[var(--text-muted)] transition-colors"
              aria-label="Search"
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            {/* Clock */}
            <span className="hidden md:block text-xs font-medium tabular-nums text-[var(--text-muted)] px-2 py-1 rounded-[8px] bg-[var(--surface-3)]">
              {clock}
            </span>

            {/* Dark mode toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="flex items-center justify-center w-9 h-9 rounded-[var(--radius-btn)] hover:bg-[var(--surface-3)] text-[var(--text-muted)] transition-colors"
              aria-label="Toggle dark mode"
            >
              {darkMode ? (
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* Realtime */}
            <RealtimeIndicator />

            {/* User / Cashier */}
            <div className="flex items-center gap-2 pl-2 ml-1 border-l" style={{ borderColor: 'var(--border)' }}>
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-medium text-[var(--text)] leading-tight">{displayName}</span>
                <span className="text-[10px] text-[var(--text-muted)] leading-tight capitalize">{meta.role || 'staff'}</span>
              </div>
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: 'w-8 h-8',
                  },
                }}
              />
            </div>
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
          <main className="flex-1 overflow-hidden min-w-0" style={{ backgroundColor: 'var(--background)' }}>
            {children}
          </main>
        </div>
      </div>
      </EventProvider>
    </POSProvider>
  );
}
