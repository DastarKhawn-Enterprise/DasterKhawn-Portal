'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, useUser, UserButton } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import Sidebar, { type ViewId } from './Sidebar';
import DashboardView from './DashboardView';
import CurrentOrdersView from './CurrentOrdersView';
import DineInView from './DineInView';
import MenuManagementView from './MenuManagementView';
import ReportsView from './ReportsView';
import StaffManagementView from './StaffManagementView';
import SettingsView from './SettingsView';
import InventoryView from './InventoryView';
import CustomersView from './CustomersView';
import ExpensesView from './ExpensesView';
import ReservationsView from './ReservationsView';
import ThirdPartyView from './ThirdPartyView';
import { supa } from './supa-query';

interface POSClientProps {
  supabaseUrl: string;
  supabaseAnonKey: string;
  brandName: string;
  theme: ThemeConfig;
  slug: string;
  enabledModules: Record<string, boolean>;
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-400 mb-2">{title}</h2>
        <p className="text-gray-300">Coming Soon</p>
      </div>
    </div>
  );
}

export default function POSClient({ supabaseUrl, supabaseAnonKey, brandName, theme, slug, enabledModules }: POSClientProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [authReady, setAuthReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewId>('dashboard');
  const [currencySymbol, setCurrencySymbol] = useState('Rs.');

  useEffect(() => {
    if (!authReady) return;
    supa(slug, { table: 'settings', select: 'currency_symbol', limit: 1 }).then((r) => {
      if (r.ok && r.data?.[0]?.currency_symbol) setCurrencySymbol(r.data[0].currency_symbol);
    }).catch(() => {});
  }, [authReady, slug]);

  const hiddenViews = useMemo(() => {
    const meta = user?.publicMetadata as Record<string, any> | undefined;
    const perms: string[] = meta?.permissions ?? [];
    const role: string = meta?.role ?? '';
    if (role === 'super_admin') return [];
    const hidden: ViewId[] = [];

    // Permission-based hiding
    if (!perms.includes('staff:manage')) hidden.push('staff');
    if (!perms.includes('menu:edit')) { hidden.push('menu'); hidden.push('inventory'); }
    if (!perms.includes('reports:view')) hidden.push('reports');
    if (!perms.includes('settings:edit')) { hidden.push('settings'); hidden.push('expenses'); }

    // Per-tenant module toggle hiding (applies to ALL users regardless of permissions)
    const moduleToViews: Record<string, ViewId[]> = {
      orders: ['current-orders', 'orders-completed', 'orders-cancelled', 'orders-draft'],
      dine_in: ['dine-in'],
      take_away: ['take-away'],
      delivery: ['delivery'],
      drive_thru: ['drive-thru'],
      third_party: ['third-party'],
      reservations: ['reservations'],
      menu: ['menu'],
      inventory: ['inventory'],
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
  }, [user, enabledModules]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setAuthReady(true);
  }, [isLoaded, isSignedIn]);

  const placeholder = (title: string) => <PlaceholderPage title={title} />;

  const renderContent = () => {
    switch (activeView) {
      case 'current-orders':
        return <CurrentOrdersView slug={slug} supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} theme={theme} brandName={brandName} />;
      case 'take-away':
        return <CurrentOrdersView slug={slug} supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} theme={theme} brandName={brandName} viewConfig={{ title: 'Take Away', orderType: 'takeaway', showCustomerFields: true }} />;
      case 'dashboard':
        return <DashboardView supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} theme={theme} slug={slug} currencySymbol={currencySymbol} />;
      case 'orders-completed':
        return placeholder('Completed Orders');
      case 'orders-cancelled':
        return placeholder('Cancelled Orders');
      case 'orders-draft':
        return placeholder('Draft Orders');
      case 'dine-in':
        return <DineInView slug={slug} supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} theme={theme} brandName={brandName} />;
      case 'delivery':
        return placeholder('Delivery');
      case 'drive-thru':
        return placeholder('Drive Thru');
      case 'third-party':
        return <ThirdPartyView />;
      case 'reservations':
        return <ReservationsView slug={slug} theme={theme} />;
      case 'menu':
        return <MenuManagementView slug={slug} theme={theme} />;
      case 'inventory':
        return <InventoryView slug={slug} theme={theme} />;
      case 'customers':
        return <CustomersView slug={slug} theme={theme} loyaltyPointsEnabled={enabledModules.loyalty_points !== false} currencySymbol={currencySymbol} />;
      case 'reports':
        return <ReportsView slug={slug} theme={theme} currencySymbol={currencySymbol} />;
      case 'expenses':
        return <ExpensesView slug={slug} theme={theme} currencySymbol={currencySymbol} />;
      case 'staff':
        return <StaffManagementView slug={slug} />;
      case 'settings':
        return <SettingsView slug={slug} theme={theme} />;
      default:
        return placeholder('Unknown');
    }
  };

  if (!isLoaded || !authReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  return (
    <div className="h-screen h-dvh flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3" style={{ color: theme.secondaryColor }}>
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden text-xl p-1 hover:bg-gray-100 rounded"
          >
            ☰
          </button>
          <span className="text-lg font-bold">{brandName}</span>
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
            className="hidden md:block w-64 px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-500 placeholder-gray-400"
            disabled
          />
          <button className="md:hidden text-gray-400 text-lg p-1">🔍</button>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden min-w-0">
        <Sidebar
          activeView={activeView}
          onNavigate={setActiveView}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
          accentColor={theme.primaryColor}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
          hiddenViews={hiddenViews}
        />
        {renderContent()}
      </div>
    </div>
  );
}
