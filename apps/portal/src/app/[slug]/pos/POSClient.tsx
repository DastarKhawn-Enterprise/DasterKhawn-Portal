'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, useUser, UserButton } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
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
import type { ViewId as StaffViewId } from './Sidebar';

interface POSClientProps {
  supabaseUrl: string;
  supabaseAnonKey: string;
  brandName: string;
  theme: ThemeConfig;
  slug: string;
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

export default function POSClient({ supabaseUrl, supabaseAnonKey, brandName, theme, slug }: POSClientProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [authReady, setAuthReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewId>('dashboard');

  const hiddenViews = useMemo(() => {
    const meta = user?.publicMetadata as Record<string, any> | undefined;
    const perms: string[] = meta?.permissions ?? [];
    const role: string = meta?.role ?? '';
    if (role === 'super_admin') return [];
    const hidden: ViewId[] = [];
    if (!perms.includes('staff:manage')) hidden.push('staff');
    if (!perms.includes('menu:edit')) { hidden.push('menu'); hidden.push('inventory'); }
    if (!perms.includes('reports:view')) hidden.push('reports');
    if (!perms.includes('settings:edit')) hidden.push('settings');
    return hidden;
  }, [user]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setAuthReady(true);
  }, [isLoaded, isSignedIn]);

  const placeholder = (title: string) => <PlaceholderPage title={title} />;

  const renderContent = () => {
    switch (activeView) {
      case 'current-orders':
        return <CurrentOrdersView supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} theme={theme} brandName={brandName} />;
      case 'take-away':
        return <CurrentOrdersView supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} theme={theme} brandName={brandName} viewConfig={{ title: 'Take Away', orderType: 'takeaway', showCustomerFields: true }} />;
      case 'dashboard':
        return <DashboardView supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} theme={theme} />;
      case 'orders-completed':
        return placeholder('Completed Orders');
      case 'orders-cancelled':
        return placeholder('Cancelled Orders');
      case 'orders-draft':
        return placeholder('Draft Orders');
      case 'dine-in':
        return <DineInView supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} theme={theme} brandName={brandName} />;
      case 'delivery':
        return placeholder('Delivery');
      case 'drive-thru':
        return placeholder('Drive Thru');
      case 'third-party':
        return placeholder('Third Party');
      case 'reservations':
        return placeholder('Reservations');
      case 'menu':
        return <MenuManagementView supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} theme={theme} />;
      case 'inventory':
        return <InventoryView supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} theme={theme} />;
      case 'customers':
        return placeholder('Customers');
      case 'reports':
        return <ReportsView supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} theme={theme} />;
      case 'expenses':
        return placeholder('Expenses');
      case 'staff':
        return <StaffManagementView slug={slug} />;
      case 'settings':
        return <SettingsView supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} theme={theme} />;
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
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 shadow-sm">
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
            className="w-64 px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-500 placeholder-gray-400"
            disabled
          />
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
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
