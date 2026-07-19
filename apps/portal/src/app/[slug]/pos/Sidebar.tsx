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
  | 'staff'
  | 'settings';

interface NavItem {
  id: ViewId;
  label: string;
  icon: string;
  path: string;
  children?: { id: ViewId; label: string; path: string }[];
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞', path: '/dashboard' },
  {
    id: 'current-orders',
    label: 'Orders',
    icon: '☰',
    path: '/orders',
    children: [
      { id: 'current-orders', label: 'Current Orders', path: '/orders' },
      { id: 'orders-new', label: 'New Order', path: '/orders/new' },
      { id: 'orders-completed', label: 'Completed', path: '/orders/completed' },
      { id: 'orders-cancelled', label: 'Cancelled', path: '/orders/cancelled' },
      { id: 'orders-draft', label: 'Draft', path: '/orders/draft' },
    ],
  },
  { id: 'dine-in', label: 'Dine In', icon: '🍽', path: '/dine-in' },
  { id: 'take-away', label: 'Take Away', icon: '🛍', path: '/take-away' },
  { id: 'delivery', label: 'Delivery', icon: '🚚', path: '/delivery' },
  { id: 'drive-thru', label: 'Drive Thru', icon: '🚗', path: '/drive-thru' },
  { id: 'third-party', label: 'Third Party', icon: '🤝', path: '/third-party' },
  { id: 'reservations', label: 'Reservations', icon: '📋', path: '/reservations' },
  { id: 'menu', label: 'Menu', icon: '📖', path: '/menu' },
  { id: 'inventory', label: 'Inventory', icon: '📦', path: '/inventory' },
  { id: 'item-ledger', label: 'Item Ledger', icon: '📋', path: '/item-ledger' },
  { id: 'customers', label: 'Customers', icon: '👥', path: '/customers' },
  { id: 'reports', label: 'Reports', icon: '📊', path: '/reports' },
  { id: 'expenses', label: 'Expenses', icon: '💰', path: '/expenses' },
  { id: 'staff', label: 'Staff', icon: '👤', path: '/staff' },
  { id: 'settings', label: 'Settings', icon: '⚙', path: '/settings' },
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
      <button
        onClick={onToggleCollapse}
        className="hidden md:flex items-center justify-center h-12 text-[#B8B6B0] hover:text-white hover:bg-[#252525]"
      >
        <span className="text-lg">{collapsed ? '▶' : '◀'}</span>
      </button>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {visibleItems.map((item) => {
          if (item.children) {
            return (
              <div key={item.id}>
                <button
                  onClick={() => setOrdersOpen(!ordersOpen)}
                  className={`flex items-center w-full px-4 py-2.5 text-sm transition-colors ${
                    isActive(item.id)
                      ? 'font-semibold'
                      : 'text-[#B8B6B0] hover:bg-[#252525] hover:text-white'
                  }`}
                  style={isActive(item.id) ? { backgroundColor: accentColor + '26', color: accentColor } : {}}
                >
                  <span className="text-[17px] w-6 text-center flex-shrink-0">{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span className="ml-3 flex-1 text-left">{item.label}</span>
                      <span className="text-xs text-gray-500">{ordersOpen ? '▾' : '▸'}</span>
                    </>
                  )}
                </button>
                {ordersOpen && !collapsed && item.children.map((child) => (
                  <Link
                    key={child.id}
                    href={navLink(child.path, slug)}
                    onClick={handleMobileClose}
                    className={`flex items-center w-full pl-12 pr-4 py-2 text-sm transition-colors ${
                      isActive(child.id)
                        ? 'font-semibold'
                        : 'text-[#B8B6B0] hover:bg-[#252525] hover:text-white'
                    }`}
                    style={isActive(child.id) ? { backgroundColor: accentColor + '26', color: accentColor } : {}}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            );
          }

          return (
            <Link
              key={item.id}
              href={navLink(item.path, slug)}
              onClick={handleMobileClose}
              className={`flex items-center w-full px-4 py-2.5 text-sm transition-colors ${
                isActive(item.id)
                  ? 'font-semibold'
                  : 'text-[#B8B6B0] hover:bg-[#252525] hover:text-white'
              }`}
              style={isActive(item.id) ? { backgroundColor: accentColor + '26', color: accentColor } : {}}
            >
              <span className="text-[17px] w-6 text-center flex-shrink-0">{item.icon}</span>
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
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={onMobileClose} />
      )}

      <nav
        className={`hidden md:flex flex-col bg-[#1A1A1A] text-white transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        {content}
      </nav>

      <nav
        className={`md:hidden fixed top-0 left-0 z-50 h-full bg-[#1A1A1A] text-white transition-all duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } w-64`}
      >
        <button
          onClick={onMobileClose}
          className="flex items-center justify-center h-12 w-full text-[#B8B6B0] hover:text-white hover:bg-[#252525]"
        >
          <span className="text-lg">✕</span>
        </button>
        {content}
      </nav>
    </>
  );
}
