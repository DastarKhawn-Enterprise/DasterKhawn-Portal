/* ============================================================================
   SINGLE SOURCE OF TRUTH for the POS sidebar navigation AND the Module system.

   Every visible sidebar tab IS a module. There is exactly ONE module registry —
   this file — and everything else (module toggles, permissions, route guards,
   dashboard shortcuts, search, quick actions) reads from it via
   lib/module-registry.ts.

   Rules:
   - A GROUP (Orders / Inventory) is a NAMESPACE, not a module. Each of its
     children is an independent module and can be toggled on/off individually.
   - Order types (Dine In / Take Away / Delivery / Drive Thru / Third Party)
     are independent modules too — disabling one hides only that workflow.
   - Group order-summary tabs are SELECTED per child; "New Order" is its own.
   - Adding ANY new sidebar tab automatically surfaces it in Module Management,
     permissions, guest route protection, and the admin dashboard — no extra
     coding required elsewhere.
   ========================================================================== */

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
  | 'wastage-management'
  | 'customers'
  | 'reports'
  | 'expenses'
  | 'accounts'
  | 'staff'
  | 'settings';

export interface SidebarNavItem {
  /** Unique module ID. Every sidebar/item has exactly one. */
  id: ViewId;
  /** Display name shown in the sidebar & module management. */
  label: string;
  icon?: string;
  /** POS-relative route (used for navigation AND route guarding). */
  path: string;
  /** True = a real module (gets a toggle + permission). False = namespace only. */
  isModule?: boolean;
  /** Feature-level permission key that gates this module (undefined = no perm). */
  permission?: string | null;
  /** Ordering within the same parent group. */
  sort?: number;
  /** Feature flag name (future-proofing; ignored today). */
  feature?: string;
  /** Sidebar namespace/parent id ('' for root items). */
  parent?: ViewId | '';
  /** Short description shown in Module Management. */
  description?: string;
  children?: SidebarNavItem[];
}

export const SIDEBAR_NAV: SidebarNavItem[] = [
  {
    id: 'dashboard', label: 'Dashboard', icon: '⊞', path: '/dashboard',
    permission: null, sort: 1,
    description: 'Overview of today … sales, orders, tables, kitchen.',
  },
  {
    id: 'orders', label: 'Orders', icon: '☰', path: '/orders',
    isModule: false, parent: '', sort: 2,
    description: 'Orders namespace (each sub-page is a module).',
    children: [
      { id: 'current-orders', label: 'Current Orders', path: '/orders', isModule: true, permission: 'orders:view', parent: 'orders', sort: 10, description: 'Live order board.' },
      { id: 'orders-new', label: 'New Order', path: '/orders/new', isModule: true, permission: 'orders:create', parent: 'orders', sort: 20, description: 'Create a new order.' },
      { id: 'orders-completed', label: 'Completed', path: '/orders/completed', isModule: true, permission: 'orders:view', parent: 'orders', sort: 30, description: 'Completed orders archive.' },
      { id: 'orders-cancelled', label: 'Cancelled', path: '/orders/cancelled', isModule: true, permission: 'orders:view', parent: 'orders', sort: 40, description: 'Cancelled orders archive.' },
      { id: 'orders-draft', label: 'Draft', path: '/orders/draft', isModule: true, permission: 'orders:view', parent: 'orders', sort: 50, description: 'Saved draft orders.' },
    ],
  },
  { id: 'dine-in', label: 'Dine In', icon: '🍽', path: '/dine-in', isModule: true, permission: 'orders:create', sort: 200, description: 'Dine-in ordering workflow.' },
  { id: 'take-away', label: 'Take Away', icon: '🛍', path: '/take-away', isModule: true, permission: 'orders:create', sort: 210, description: 'Take-away ordering workflow.' },
  { id: 'delivery', label: 'Delivery', icon: '🚚', path: '/delivery', isModule: true, permission: 'orders:create', sort: 220, description: 'Delivery ordering workflow.' },
  { id: 'drive-thru', label: 'Drive Thru', icon: '🚗', path: '/drive-thru', isModule: true, permission: 'orders:create', sort: 230, description: 'Drive-thru ordering workflow.' },
  { id: 'third-party', label: 'Third Party', icon: '🤝', path: '/third-party', isModule: true, permission: 'orders:create', sort: 240, description: 'Third-party ordering workflow.' },
  { id: 'reservations', label: 'Reservations', icon: '📋', path: '/reservations', isModule: true, permission: 'orders:create', sort: 300, description: 'Table reservations.' },
  { id: 'menu', label: 'Menu', icon: '📖', path: '/menu', isModule: true, permission: 'menu:view', sort: 400, description: 'Menu item management.' },
  {
    id: 'inventory', label: 'Inventory', icon: '📦', path: '/inventory',
    isModule: false, parent: '', sort: 500, description: 'Inventory namespace.',
    children: [
      { id: 'inventory', label: 'Inventory', path: '/inventory', isModule: true, permission: 'menu:edit', parent: 'inventory', sort: 10, description: 'Stock levels and items.' },
      { id: 'item-ledger', label: 'Item Ledger', path: '/item-ledger', isModule: true, permission: 'menu:edit', parent: 'inventory', sort: 20, description: 'Per-item inventory ledger.' },
      { id: 'wastage-management', label: 'Wastage Management', path: '/wastage-management', isModule: true, permission: 'menu:edit', parent: 'inventory', sort: 30, description: 'Record and analyse wastage.' },
    ],
  },
  { id: 'customers', label: 'Customers', icon: '👥', path: '/customers', isModule: true, permission: 'customers:view', sort: 600, description: 'Customer directory.' },
  { id: 'reports', label: 'Reports', icon: '📊', path: '/reports', isModule: true, permission: 'reports:view', sort: 700, description: 'Analytics and reports.' },
  { id: 'expenses', label: 'Expenses', icon: '💰', path: '/expenses', isModule: true, permission: 'settings:edit', sort: 800, description: 'Expense tracking.' },
  { id: 'accounts', label: 'Accounts', icon: '🏦', path: '/accounts', isModule: true, permission: 'accounts:view', sort: 900, description: 'Accounts and payments.' },
  { id: 'staff', label: 'Staff', icon: '👤', path: '/staff', isModule: true, permission: 'staff:manage', sort: 1000, description: 'Staff & permissions.' },
  { id: 'settings', label: 'Settings', icon: '⚙', path: '/settings', isModule: true, permission: 'settings:edit', sort: 1100, description: 'System settings.' },
];

/** Fast lookup: POS-relative path -> view id. Children override parents on ties. */
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