import type { ViewId } from '@/app/[slug]/pos/Sidebar';

export type ModuleCategory =
  | 'Core'
  | 'Order Types'
  | 'Kitchen & Dining'
  | 'Catalog & Inventory'
  | 'Customers & Loyalty'
  | 'Staff & People'
  | 'Finance & Accounting'
  | 'Reports & Analytics'
  | 'Configuration & Integrations'
  | 'Commerce & Promotions'
  | 'AI & Intelligence';

export type ReportTabId = 'overview' | 'sales' | 'orders' | 'items' | 'inventory' | 'staff' | 'customers' | 'pnl';

export type WidgetId = 'open-tables' | 'kitchen-status';

export interface ModuleDef {
  key: string;
  label: string;
  description: string;
  category: ModuleCategory;
  /** Effective default when the tenant record has no stored value for this key. */
  defaultEnabled: boolean;
  /** Core modules that can never be disabled. */
  locked?: boolean;
  /** Other module keys that must be enabled for this one to function. */
  dependencies?: string[];
  /** Sidebar/dashboard views hidden when this module is disabled. */
  views?: ViewId[];
  /** POS-relative routes blocked when this module is disabled. */
  routes?: string[];
  /** Dashboard widget ids gated by this module. */
  widgets?: WidgetId[];
  /** Reports tabs gated by this module. */
  reportTabs?: ReportTabId[];
}

/* ── Single source of truth for every module across the platform ──
   The admin dashboard Module editor, the POS sidebar/nav gating, route
   guarding, dashboard widgets, report tabs, and dependency enforcement all
   derive from this registry. Add a new module here and the rest of the
   system learns about it automatically. */
export const MODULES: ModuleDef[] = [
  // ── Core (locked) ──
  { key: 'dashboard', label: 'Dashboard', description: 'Home dashboard and overview widgets.', category: 'Core', defaultEnabled: true, locked: true, views: ['dashboard'] },
  { key: 'orders', label: 'Orders', description: 'Order lifecycle — current, new, completed, cancelled, draft.', category: 'Core', defaultEnabled: true, locked: true, views: ['current-orders', 'orders-new', 'orders-completed', 'orders-cancelled', 'orders-draft'], routes: ['/orders', '/orders/new', '/orders/completed', '/orders/cancelled', '/orders/draft'] },

  // ── Order Types ──
  { key: 'dine_in', label: 'Dine In', description: 'In-restaurant dine-in ordering.', category: 'Order Types', defaultEnabled: true, views: ['dine-in'], routes: ['/dine-in'] },
  { key: 'take_away', label: 'Take Away', description: 'Take-away / pick-up orders.', category: 'Order Types', defaultEnabled: true, views: ['take-away'], routes: ['/take-away'] },
  { key: 'delivery', label: 'Delivery', description: 'Scheduled delivery orders.', category: 'Order Types', defaultEnabled: true, views: ['delivery'], routes: ['/delivery'] },
  { key: 'drive_thru', label: 'Drive Thru', description: 'Drive-thru lane ordering.', category: 'Order Types', defaultEnabled: true, views: ['drive-thru'], routes: ['/drive-thru'] },
  { key: 'third_party', label: 'Third Party', description: 'Orders placed through third-party aggregators.', category: 'Order Types', defaultEnabled: true, views: ['third-party'], routes: ['/third-party'] },

  // ── Kitchen & Dining ──
  { key: 'reservations', label: 'Reservations', description: 'Table reservations and table management.', category: 'Kitchen & Dining', defaultEnabled: true, views: ['reservations'], routes: ['/reservations'], widgets: ['open-tables'] },
  { key: 'kitchen_display', label: 'Kitchen Display', description: 'Live kitchen status widget on the dashboard.', category: 'Kitchen & Dining', defaultEnabled: true, widgets: ['kitchen-status'] },
  { key: 'delivery_drivers', label: 'Delivery Drivers', description: 'Track and manage delivery drivers.', category: 'Kitchen & Dining', defaultEnabled: false, dependencies: ['delivery'] },
  { key: 'online_orders', label: 'Online Orders', description: 'Customer-facing online ordering storefront.', category: 'Kitchen & Dining', defaultEnabled: false, dependencies: ['orders'] },
  { key: 'qr_ordering', label: 'QR Ordering', description: 'Scan-to-order QR menus for tables.', category: 'Kitchen & Dining', defaultEnabled: false, dependencies: ['menu', 'orders'] },

  // ── Catalog & Inventory ──
  { key: 'menu', label: 'Menu', description: 'Menu items, categories, and pricing.', category: 'Catalog & Inventory', defaultEnabled: true, views: ['menu'], routes: ['/menu'] },
  { key: 'inventory', label: 'Inventory', description: 'Stock levels and inventory adjustments.', category: 'Catalog & Inventory', defaultEnabled: true, views: ['inventory'], routes: ['/inventory'] },
  { key: 'item_ledger', label: 'Item Ledger', description: 'Full transaction history for every inventory item.', category: 'Catalog & Inventory', defaultEnabled: true, views: ['item-ledger'], routes: ['/item-ledger'], dependencies: ['inventory'] },
  { key: 'inventory_adjustments', label: 'Inventory Adjustments', description: 'Detailed stock adjustment logging.', category: 'Catalog & Inventory', defaultEnabled: false, dependencies: ['inventory'] },
  { key: 'suppliers', label: 'Suppliers', description: 'Supplier and purchase management.', category: 'Catalog & Inventory', defaultEnabled: false, dependencies: ['inventory'] },
  { key: 'forecasting', label: 'Forecasting', description: 'Demand forecasting from orders and stock usage.', category: 'Catalog & Inventory', defaultEnabled: false, dependencies: ['inventory', 'orders'] },

  // ── Customers & Loyalty ──
  { key: 'customers', label: 'Customers', description: 'Customer directory, history, and insights.', category: 'Customers & Loyalty', defaultEnabled: true, views: ['customers'], routes: ['/customers'], reportTabs: ['customers'] },
  { key: 'loyalty_points', label: 'Loyalty Points', description: 'Loyalty points and rewards program.', category: 'Customers & Loyalty', defaultEnabled: true, dependencies: ['customers'] },

  // ── Staff & People ──
  { key: 'staff', label: 'Staff', description: 'Staff accounts, roles, and permissions.', category: 'Staff & People', defaultEnabled: true, views: ['staff'], routes: ['/staff'], reportTabs: ['staff'] },
  { key: 'roles', label: 'Roles', description: 'Custom role and permission management.', category: 'Staff & People', defaultEnabled: false, dependencies: ['staff'] },
  { key: 'attendance', label: 'Attendance', description: 'Staff clock-in / clock-out tracking.', category: 'Staff & People', defaultEnabled: false, dependencies: ['staff'] },
  { key: 'payroll', label: 'Payroll', description: 'Payroll calculation and pay runs.', category: 'Staff & People', defaultEnabled: false, dependencies: ['staff', 'expenses'] },
  { key: 'branches', label: 'Branches', description: 'Multi-branch / multi-location management.', category: 'Staff & People', defaultEnabled: false, dependencies: ['settings'] },

  // ── Finance & Accounting ──
  { key: 'expenses', label: 'Expenses', description: 'Operating expense tracking.', category: 'Finance & Accounting', defaultEnabled: true, views: ['expenses'], routes: ['/expenses'] },
  { key: 'accounts', label: 'Accounts', description: 'Ledger, transactions, and cash handling.', category: 'Finance & Accounting', defaultEnabled: true, views: ['accounts'], routes: ['/accounts'] },
  { key: 'taxes', label: 'Taxes', description: 'Tax configuration and collection settings.', category: 'Finance & Accounting', defaultEnabled: false, dependencies: ['settings'] },

  // ── Reports & Analytics ──
  { key: 'reports', label: 'Reports', description: 'Sales, orders, items, and profit reports.', category: 'Reports & Analytics', defaultEnabled: true, views: ['reports'], routes: ['/reports'], reportTabs: ['overview', 'sales', 'orders', 'items', 'pnl'] },
  { key: 'analytics', label: 'Analytics', description: 'Advanced analytics dashboards.', category: 'Reports & Analytics', defaultEnabled: false, dependencies: ['reports'] },

  // ── Configuration & Integrations ──
  { key: 'settings', label: 'Settings', description: 'Business profile, currency, and POS preferences.', category: 'Configuration & Integrations', defaultEnabled: true, views: ['settings'], routes: ['/settings'] },
  { key: 'printers', label: 'Printers', description: 'Receipt printer configuration.', category: 'Configuration & Integrations', defaultEnabled: false, dependencies: ['settings'] },
  { key: 'receipts', label: 'Receipts', description: 'Receipt templates and branding.', category: 'Configuration & Integrations', defaultEnabled: false, dependencies: ['settings'] },
  { key: 'theme_manager', label: 'Theme Manager', description: 'Custom POS theming and colors.', category: 'Configuration & Integrations', defaultEnabled: false, dependencies: ['settings'] },
  { key: 'notification_center', label: 'Notification Center', description: 'In-app and push notifications.', category: 'Configuration & Integrations', defaultEnabled: false, dependencies: ['settings'] },
  { key: 'integrations', label: 'Integrations', description: 'Third-party service connections.', category: 'Configuration & Integrations', defaultEnabled: false, dependencies: ['settings'] },
  { key: 'api_access', label: 'API Access', description: 'Developer API keys and webhooks.', category: 'Configuration & Integrations', defaultEnabled: false, dependencies: ['settings'] },

  // ── Commerce & Promotions ──
  { key: 'promotions', label: 'Promotions', description: 'Campaigns and promotional pricing.', category: 'Commerce & Promotions', defaultEnabled: false, dependencies: ['menu'] },
  { key: 'discounts', label: 'Discounts', description: 'Automatic and manual discounts.', category: 'Commerce & Promotions', defaultEnabled: false, dependencies: ['menu'] },
  { key: 'gift_cards', label: 'Gift Cards', description: 'Gift card issuance and redemption.', category: 'Commerce & Promotions', defaultEnabled: false, dependencies: ['customers'] },

  // ── AI & Intelligence ──
  { key: 'ai_features', label: 'AI Features', description: 'AI-assisted insights and automations.', category: 'AI & Intelligence', defaultEnabled: false, dependencies: ['reports'] },
];

export const MODULE_BY_KEY: Record<string, ModuleDef> = Object.fromEntries(MODULES.map((m) => [m.key, m]));

export const MODULE_GROUPS: { label: ModuleCategory; keys: string[] }[] = (() => {
  const order: ModuleCategory[] = [
    'Core',
    'Order Types',
    'Kitchen & Dining',
    'Catalog & Inventory',
    'Customers & Loyalty',
    'Staff & People',
    'Finance & Accounting',
    'Reports & Analytics',
    'Configuration & Integrations',
    'Commerce & Promotions',
    'AI & Intelligence',
  ];
  const groups = new Map<ModuleCategory, string[]>();
  for (const m of MODULES) {
    if (!groups.has(m.category)) groups.set(m.category, []);
    groups.get(m.category)!.push(m.key);
  }
  return order.filter((c) => groups.has(c)).map((c) => ({ label: c, keys: groups.get(c)! }));
})();

export const MODULE_LABELS: Record<string, string> = Object.fromEntries(MODULES.map((m) => [m.key, m.label]));

/** Default state for every known module key presented to the admin editor. */
export function defaultModules(): Record<string, boolean> {
  return Object.fromEntries(MODULES.map((m) => [m.key, m.defaultEnabled]));
}

/**
 * Produces the EFFECTIVE enabled map for a tenant.
 *  - Missing keys fall back to their registry default (fixes the "deleted
 *    key silently re-enables" problem by always expressing a full set).
 *  - Locked modules are always enabled.
 *  - A module is effectively disabled if any of its dependencies are
 *    effectively disabled, regardless of its own toggle.
 */
export function resolveEnabledModules(raw: Record<string, boolean> | undefined): Record<string, boolean> {
  const base = { ...defaultModules(), ...(raw || {}) };
  for (const m of MODULES) if (m.locked) base[m.key] = true;

  const effective: Record<string, boolean> = { ...base };
  let changed = true;
  let guard = 0;
  while (changed && guard < MODULES.length + 1) {
    changed = false;
    guard += 1;
    for (const m of MODULES) {
      if (m.locked) continue;
      const depsOk = (m.dependencies || []).every((d) => {
        const depDef = MODULE_BY_KEY[d];
        return depDef === undefined ? base[d] !== false : (effective[d] !== false);
      });
      const value = base[m.key] !== false && depsOk;
      if (effective[m.key] !== value) {
        effective[m.key] = value;
        changed = true;
      }
    }
  }
  return effective;
}

/** ViewIds to hide in the sidebar when a module is disabled. */
export function hiddenViewsForModules(raw: Record<string, boolean> | undefined): ViewId[] {
  const effective = resolveEnabledModules(raw);
  const hidden: ViewId[] = [];
  for (const m of MODULES) {
    if (effective[m.key] === false && m.views) {
      for (const v of m.views) if (!hidden.includes(v)) hidden.push(v);
    }
  }
  return hidden;
}

/** POS-relative routes that must be blocked when a module is disabled. */
export function disabledRoutesForModules(raw: Record<string, boolean> | undefined): string[] {
  const effective = resolveEnabledModules(raw);
  const routes: string[] = [];
  for (const m of MODULES) {
    if (effective[m.key] === false && m.routes) {
      for (const r of m.routes) if (!routes.includes(r)) routes.push(r);
    }
  }
  return routes;
}

export function effectiveDetailed(raw: Record<string, boolean> | undefined): Record<string, { enabled: boolean; dependencyBlocked: boolean; label: string; description: string; category: ModuleCategory; locked: boolean; dependencies: string[] }> {
  const base = { ...defaultModules(), ...(raw || {}) };
  for (const m of MODULES) if (m.locked) base[m.key] = true;
  const effective = resolveEnabledModules(raw);
  const out: Record<string, any> = {};
  for (const m of MODULES) {
    let dependencyBlocked = false;
    for (const d of m.dependencies || []) if (effective[d] === false) dependencyBlocked = true;
    out[m.key] = {
      enabled: effective[m.key],
      dependencyBlocked,
      label: m.label,
      description: m.description,
      category: m.category,
      locked: !!m.locked,
      dependencies: m.dependencies || [],
    };
  }
  return out;
}