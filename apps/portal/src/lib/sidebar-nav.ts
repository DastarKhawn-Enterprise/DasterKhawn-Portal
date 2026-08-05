/* Single source of truth for the POS sidebar navigation.
   Every sidebar tab is derived from here. A "module" is exactly one sidebar
   tab: each NAV item with `isModule !== false` produces exactly one module
   toggle in the Admin module manager. Order types and order-status sub-tabs
   are sidebar entries but are NOT modules (isModule: false). */

export type ViewId =
  | 'dashboard'
  | 'orders'
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

export interface SidebarNavItem {
  id: ViewId;
  label: string;
  icon?: string;
  path: string;
  /** True when this tab is a module (gets a toggle). Order types and status tabs are false. */
  isModule?: boolean;
  children?: SidebarNavItem[];
}

export const SIDEBAR_NAV: SidebarNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞', path: '/dashboard' },
  {
    id: 'orders',
    label: 'Orders',
    icon: '☰',
    path: '/orders',
    isModule: true,
    children: [
      { id: 'current-orders', label: 'Current Orders', path: '/orders', isModule: false },
      { id: 'orders-new', label: 'New Order', path: '/orders/new', isModule: true },
      { id: 'orders-completed', label: 'Completed', path: '/orders/completed', isModule: false },
      { id: 'orders-cancelled', label: 'Cancelled', path: '/orders/cancelled', isModule: false },
      { id: 'orders-draft', label: 'Draft', path: '/orders/draft', isModule: false },
    ],
  },
  { id: 'dine-in', label: 'Dine In', icon: '🍽', path: '/dine-in', isModule: false },
  { id: 'take-away', label: 'Take Away', icon: '🛍', path: '/take-away', isModule: false },
  { id: 'delivery', label: 'Delivery', icon: '🚚', path: '/delivery', isModule: false },
  { id: 'drive-thru', label: 'Drive Thru', icon: '🚗', path: '/drive-thru', isModule: false },
  { id: 'third-party', label: 'Third Party', icon: '🤝', path: '/third-party', isModule: false },
  { id: 'reservations', label: 'Reservations', icon: '📋', path: '/reservations' },
  { id: 'menu', label: 'Menu', icon: '📖', path: '/menu' },
  { id: 'inventory', label: 'Inventory', icon: '📦', path: '/inventory' },
  { id: 'item-ledger', label: 'Item Ledger', icon: '📋', path: '/item-ledger' },
  { id: 'customers', label: 'Customers', icon: '👥', path: '/customers' },
  { id: 'reports', label: 'Reports', icon: '📊', path: '/reports' },
  { id: 'expenses', label: 'Expenses', icon: '💰', path: '/expenses' },
  { id: 'accounts', label: 'Accounts', icon: '🏦', path: '/accounts' },
  { id: 'staff', label: 'Staff', icon: '👤', path: '/staff' },
  { id: 'settings', label: 'Settings', icon: '⚙', path: '/settings' },
];

const PATH_TO_VIEW: Record<string, ViewId> = {};
for (const item of SIDEBAR_NAV) {
  PATH_TO_VIEW[item.path] = item.id;
  if (item.children) {
    for (const child of item.children) {
      PATH_TO_VIEW[child.path] = child.id;
    }
  }
}

export function viewIdForPath(posPath: string): ViewId {
  return PATH_TO_VIEW[posPath] || 'dashboard';
}