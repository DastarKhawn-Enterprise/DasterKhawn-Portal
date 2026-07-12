'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, UserButton } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import Sidebar, { type ViewId } from './Sidebar';
import CurrentOrdersView from './CurrentOrdersView';
import DineInView from './DineInView';

interface POSClientProps {
  supabaseUrl: string;
  supabaseAnonKey: string;
  brandName: string;
  theme: ThemeConfig;
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

export default function POSClient({ supabaseUrl, supabaseAnonKey, brandName, theme }: POSClientProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const [authReady, setAuthReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<ViewId>('current-orders');

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setAuthReady(true);
  }, [isLoaded, isSignedIn]);

  const placeholder = (title: string) => <PlaceholderPage title={title} />;

  const renderContent = () => {
    switch (activeView) {
      case 'current-orders':
        return <CurrentOrdersView supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} theme={theme} />;
      case 'dashboard':
        return placeholder('Dashboard');
      case 'orders-completed':
        return placeholder('Completed Orders');
      case 'orders-cancelled':
        return placeholder('Cancelled Orders');
      case 'orders-draft':
        return placeholder('Draft Orders');
      case 'dine-in':
        return <DineInView supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} theme={theme} />;
      case 'take-away':
        return placeholder('Take Away');
      case 'delivery':
        return placeholder('Delivery');
      case 'drive-thru':
        return placeholder('Drive Thru');
      case 'third-party':
        return placeholder('Third Party');
      case 'reservations':
        return placeholder('Reservations');
      case 'menu':
        return placeholder('Menu Management');
      case 'inventory':
        return placeholder('Inventory');
      case 'customers':
        return placeholder('Customers');
      case 'reports':
        return placeholder('Reports');
      case 'expenses':
        return placeholder('Expenses');
      case 'staff':
        return placeholder('Staff Management');
      case 'settings':
        return placeholder('Settings');
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
          <span className="text-lg font-bold">{brandName}</span>
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
        />
        {renderContent()}
      </div>
    </div>
  );
}
