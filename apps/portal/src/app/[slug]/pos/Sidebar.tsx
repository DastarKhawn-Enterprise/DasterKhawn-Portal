'use client';

import { useState } from 'react';

export type ViewId =
  | 'dashboard'
  | 'current-orders'
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
  | 'customers'
  | 'reports'
  | 'expenses'
  | 'staff'
  | 'settings';

interface NavItem {
  id: ViewId;
  label: string;
  icon: string;
  children?: { id: ViewId; label: string }[];
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
  {
    id: 'current-orders',
    label: 'Orders',
    icon: '☰',
    children: [
      { id: 'current-orders', label: 'Current Orders' },
      { id: 'orders-completed', label: 'Completed' },
      { id: 'orders-cancelled', label: 'Cancelled' },
      { id: 'orders-draft', label: 'Draft' },
    ],
  },
  { id: 'dine-in', label: 'Dine In', icon: '🍽' },
  { id: 'take-away', label: 'Take Away', icon: '🛍' },
  { id: 'delivery', label: 'Delivery', icon: '🚚' },
  { id: 'drive-thru', label: 'Drive Thru', icon: '🚗' },
  { id: 'third-party', label: 'Third Party', icon: '🤝' },
  { id: 'reservations', label: 'Reservations', icon: '📋' },
  { id: 'menu', label: 'Menu', icon: '📖' },
  { id: 'inventory', label: 'Inventory', icon: '📦' },
  { id: 'customers', label: 'Customers', icon: '👥' },
  { id: 'reports', label: 'Reports', icon: '📊' },
  { id: 'expenses', label: 'Expenses', icon: '💰' },
  { id: 'staff', label: 'Staff', icon: '👤' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

interface SidebarProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  accentColor: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  hiddenViews?: ViewId[];
}

export default function Sidebar({ activeView, onNavigate, collapsed, onToggleCollapse, accentColor, mobileOpen, onMobileClose, hiddenViews }: SidebarProps) {
  const [ordersOpen, setOrdersOpen] = useState(true);

  const isActive = (id: ViewId) => activeView === id;

  const handleNavigate = (id: ViewId) => {
    onNavigate(id);
    onMobileClose?.();
  };

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!hiddenViews || hiddenViews.length === 0) return true;
    if (item.children) {
      const filteredChildren = item.children.filter((c) => !hiddenViews.includes(c.id));
      return filteredChildren.length > 0 || !hiddenViews.includes(item.id);
    }
    return !hiddenViews.includes(item.id);
  });

  const content = (
    <>
      {/* Collapse toggle — hidden on mobile */}
      <button
        onClick={onToggleCollapse}
        className="hidden md:flex items-center justify-center h-12 text-gray-400 hover:text-white hover:bg-slate-800"
      >
        <span className="text-lg">{collapsed ? '▶' : '◀'}</span>
      </button>

      {/* Nav items */}
      <div className="flex-1 overflow-y-auto">
        {visibleItems.map((item) => {
          if (item.children) {
            return (
              <div key={item.id}>
                <button
                  onClick={() => setOrdersOpen(!ordersOpen)}
                  className={`flex items-center w-full px-4 py-2.5 text-sm transition-colors ${
                    isActive(item.id)
                      ? 'font-semibold'
                      : 'text-gray-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  style={isActive(item.id) ? { backgroundColor: accentColor + '33', color: accentColor } : {}}
                >
                  <span className="text-base w-6 text-center flex-shrink-0">{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span className="ml-3 flex-1 text-left">{item.label}</span>
                      <span className="text-xs text-gray-500">{ordersOpen ? '▾' : '▸'}</span>
                    </>
                  )}
                </button>
                {ordersOpen && !collapsed && item.children.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => handleNavigate(child.id)}
                    className={`flex items-center w-full pl-12 pr-4 py-2 text-sm transition-colors ${
                      isActive(child.id)
                        ? 'font-semibold'
                        : 'text-gray-400 hover:bg-slate-800 hover:text-white'
                    }`}
                    style={isActive(child.id) ? { backgroundColor: accentColor + '33', color: accentColor } : {}}
                  >
                    {child.label}
                  </button>
                ))}
              </div>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className={`flex items-center w-full px-4 py-2.5 text-sm transition-colors ${
                isActive(item.id)
                  ? 'font-semibold'
                  : 'text-gray-300 hover:bg-slate-800 hover:text-white'
              }`}
              style={isActive(item.id) ? { backgroundColor: accentColor + '33', color: accentColor } : {}}
            >
              <span className="text-base w-6 text-center flex-shrink-0">{item.icon}</span>
              {!collapsed && <span className="ml-3">{item.label}</span>}
            </button>
          );
        })}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={onMobileClose} />
      )}

      {/* Desktop sidebar */}
      <nav
        className={`hidden md:flex flex-col bg-slate-900 text-white transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        {content}
      </nav>

      {/* Mobile drawer */}
      <nav
        className={`md:hidden fixed top-0 left-0 z-50 h-full bg-slate-900 text-white transition-all duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } w-64`}
      >
        {/* Close button */}
        <button
          onClick={onMobileClose}
          className="flex items-center justify-center h-12 w-full text-gray-400 hover:text-white hover:bg-slate-800"
        >
          <span className="text-lg">✕</span>
        </button>
        {content}
      </nav>
    </>
  );
}
