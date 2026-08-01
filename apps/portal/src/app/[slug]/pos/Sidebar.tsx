'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type ViewId =
  | 'dashboard'
  | 'current-orders'
  | 'orders-new'
  | 'orders-completed'
  | 'orders-cancelled'
  | 'orders-draft'
  | 'dine-in'
  | 'take-away'
  | 'delivery'
  | 'drive-thru'
  | 'third-party'
  | 'reservations'
  | 'menu'
  | 'inventory'
  | 'item-ledger'
  | 'customers'
  | 'reports'
  | 'expenses'
  | 'accounts'
  | 'staff'
  | 'settings';

interface NavItem {
  id: ViewId;
  label: string;
  icon: string;
  path: string;
  color?: string;
  children?: { id: ViewId; label: string; path: string }[];
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞', path: '/dashboard', color: '#8b5cf6' },
  {
    id: 'current-orders',
    label: 'Orders',
    icon: '☰',
    path: '/orders',
    color: '#3b82f6',
    children: [
      { id: 'current-orders', label: 'Current Orders', path: '/orders' },
      { id: 'orders-new', label: 'New Order', path: '/orders/new' },
      { id: 'orders-completed', label: 'Completed', path: '/orders/completed' },
      { id: 'orders-cancelled', label: 'Cancelled', path: '/orders/cancelled' },
      { id: 'orders-draft', label: 'Draft', path: '/orders/draft' },
    ],
  },
  { id: 'dine-in', label: 'Dine In', icon: '🍽', path: '/dine-in', color: '#10b981' },
  { id: 'take-away', label: 'Take Away', icon: '🛍', path: '/take-away', color: '#f59e0b' },
  { id: 'delivery', label: 'Delivery', icon: '🚚', path: '/delivery', color: '#ef4444' },
  { id: 'drive-thru', label: 'Drive Thru', icon: '🚗', path: '/drive-thru', color: '#06b6d4' },
  { id: 'third-party', label: 'Third Party', icon: '🤝', path: '/third-party', color: '#8b5cf6' },
  { id: 'reservations', label: 'Reservations', icon: '📋', path: '/reservations', color: '#ec4899' },
  { id: 'menu', label: 'Menu', icon: '📖', path: '/menu', color: '#f97316' },
  { id: 'inventory', label: 'Inventory', icon: '📦', path: '/inventory', color: '#6366f1' },
  { id: 'item-ledger', label: 'Item Ledger', icon: '📋', path: '/item-ledger', color: '#14b8a6' },
  { id: 'customers', label: 'Customers', icon: '👥', path: '/customers', color: '#8b5cf6' },
  { id: 'reports', label: 'Reports', icon: '📊', path: '/reports', color: '#22c55e' },
  { id: 'expenses', label: 'Expenses', icon: '💰', path: '/expenses', color: '#ef4444' },
  { id: 'accounts', label: 'Accounts', icon: '🏦', path: '/accounts', color: '#3b82f6' },
  { id: 'staff', label: 'Staff', icon: '👤', path: '/staff', color: '#6366f1' },
  { id: 'settings', label: 'Settings', icon: '⚙', path: '/settings', color: '#6b7280' },
];

const PATH_TO_VIEW: Record<string, ViewId> = {};
for (const item of NAV_ITEMS) {
  PATH_TO_VIEW[item.path] = item.id;
  if (item.children) {
    for (const child of item.children) {
      PATH_TO_VIEW[child.path] = child.id;
    }
  }
}

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  accentColor: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  hiddenViews?: ViewId[];
  slug: string;
}

function navLink(path: string, slug: string) {
  return `/${slug}/pos${path}`;
}

export default function Sidebar({ collapsed, onToggleCollapse, accentColor, mobileOpen, onMobileClose, hiddenViews, slug }: SidebarProps) {
  const pathname = usePathname();
  const posPath = '/' + pathname.split('/').slice(3).join('/');
  const activeView = PATH_TO_VIEW[posPath] || 'dashboard';

  const [ordersOpen, setOrdersOpen] = useState(true);

  const isActive = (id: ViewId) => activeView === id;

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!hiddenViews || hiddenViews.length === 0) return true;
    if (item.children) {
      const filteredChildren = item.children.filter((c) => !hiddenViews.includes(c.id));
      return filteredChildren.length > 0 || !hiddenViews.includes(item.id);
    }
    return !hiddenViews.includes(item.id);
  });

  const handleMobileClose = () => onMobileClose?.();

  const content = (
    <>
      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="hidden md:flex items-center justify-center h-12 text-[var(--sidebar-muted)] hover:text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] transition-colors"
      >
        <svg className={`w-4 h-4 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-2 py-2 space-y-0.5">
        {visibleItems.map((item) => {
          if (item.children) {
            const active = isActive(item.id);
            const anyChildActive = item.children.some((c) => isActive(c.id));
            return (
              <div key={item.id}>
                <button
                  onClick={() => setOrdersOpen(!ordersOpen)}
                  className={`flex items-center w-full px-3 py-2.5 rounded-[var(--radius-btn)] text-sm transition-all duration-150 group ${
                    active || anyChildActive
                      ? 'font-semibold'
                      : 'text-[var(--sidebar-muted)] hover:text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)]'
                  }`}
                  style={
                    active || anyChildActive
                      ? { backgroundColor: 'var(--sidebar-active-soft)', color: accentColor }
                      : {}
                  }
                >
                  <span
                    className={`w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-colors flex-shrink-0 ${
                      active || anyChildActive
                        ? ''
                        : 'bg-[var(--sidebar-hover)] group-hover:bg-[var(--sidebar-text)]/10'
                    }`}
                    style={
                      active || anyChildActive
                        ? { backgroundColor: `${accentColor}18`, color: accentColor }
                        : {}
                    }
                  >
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="ml-3 flex-1 text-left">{item.label}</span>
                      <svg className={`w-3.5 h-3.5 transition-transform duration-200 text-[var(--sidebar-muted)] ${ordersOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </>
                  )}
                </button>
                {ordersOpen && !collapsed && (
                  <div className="ml-5 pl-4 border-l border-[var(--sidebar-hover)] mt-0.5 space-y-0.5">
                    {item.children.map((child) => {
                      const childActive = isActive(child.id);
                      return (
                        <Link
                          key={child.id}
                          href={navLink(child.path, slug)}
                          onClick={handleMobileClose}
                          className={`flex items-center w-full px-3 py-2 text-sm rounded-[8px] transition-all duration-150 ${
                            childActive
                              ? 'font-semibold bg-[var(--sidebar-active-soft)]'
                              : 'text-[var(--sidebar-muted)] hover:text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)]'
                          }`}
                          style={childActive ? { color: accentColor } : {}}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const active = isActive(item.id);
          return (
            <Link
              key={item.id}
              href={navLink(item.path, slug)}
              onClick={handleMobileClose}
              className={`flex items-center w-full px-3 py-2.5 rounded-[var(--radius-btn)] text-sm transition-all duration-150 group ${
                active
                  ? 'font-semibold'
                  : 'text-[var(--sidebar-muted)] hover:text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)]'
              }`}
              style={active ? { backgroundColor: 'var(--sidebar-active-soft)', color: accentColor } : {}}
            >
              <span
                className={`w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-colors flex-shrink-0 ${
                  active ? '' : 'bg-[var(--sidebar-hover)] group-hover:bg-[var(--sidebar-text)]/10'
                }`}
                style={active ? { backgroundColor: `${accentColor}18`, color: accentColor } : {}}
              >
                {item.icon}
              </span>
              {!collapsed && <span className="ml-3">{item.label}</span>}
            </Link>
          );
        })}
      </div>
    </>
  );

  return (
    <>
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] anim-fade" onClick={onMobileClose} />
      )}

      <nav
        className={`hidden md:flex flex-col transition-all duration-200 flex-shrink-0 ${
          collapsed ? 'w-[68px]' : 'w-60'
        }`}
        style={{ backgroundColor: 'var(--sidebar)', color: 'var(--sidebar-text)' }}
      >
        {content}
      </nav>

      <nav
        className={`md:hidden fixed top-0 left-0 z-50 h-full transition-all duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } w-[280px] flex flex-col`}
        style={{ backgroundColor: 'var(--sidebar)', color: 'var(--sidebar-text)' }}
      >
        <button
          onClick={onMobileClose}
          className="flex items-center justify-center h-12 w-full text-[var(--sidebar-muted)] hover:text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {content}
      </nav>
    </>
  );
}
