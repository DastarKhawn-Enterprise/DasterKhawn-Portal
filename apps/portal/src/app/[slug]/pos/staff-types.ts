export interface StaffMeta {
  phone?: string;
  employment_status?: string;
  login_enabled?: boolean;
  leave_start?: string;
  leave_end?: string;
  leave_reason?: string;
  approved_by?: string;
  disabled_at?: string;
  disabled_by?: string;
  password_reset_at?: string;
  password_reset_by?: string;
  last_login_at?: string;
}

export interface StaffMember {
  id: string;
  clerkUserId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  permissions: string[];
  createdAt: string;
  metadata: StaffMeta;
}

export interface StaffListResult {
  currentUser: { id: string; name: string; email: string; role: string; permissions: string[] };
  staff: StaffMember[];
  total: number;
  totalActive: number;
  totalLeave: number;
  totalInactive: number;
  error?: string;
}

export const STAFF_ROLES = [
  'owner', 'manager', 'cashier', 'chef', 'kitchen_helper',
  'waiter', 'storekeeper', 'accountant', 'cleaner', 'custom',
] as const;
export type StaffRole = typeof STAFF_ROLES[number];

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner', manager: 'Manager', cashier: 'Cashier',
  chef: 'Chef', kitchen_helper: 'Kitchen Helper', waiter: 'Waiter',
  storekeeper: 'Storekeeper', accountant: 'Accountant',
  cleaner: 'Cleaner', custom: 'Custom Role',
};

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] || role;
}

const OWNER_PERMS = [
  'orders:create', 'orders:view', 'orders:update',
  'menu:view', 'menu:edit', 'reports:view',
  'staff:manage', 'settings:edit',
  'accounts:view', 'accounts:manage', 'accounts:transactions',
  'accounts:transfer', 'accounts:adjust',
  'customers:view', 'customers:create', 'customers:edit', 'customers:manage',
];

export const ROLE_DEFAULTS: Record<string, string[]> = {
  owner: [...OWNER_PERMS],
  manager: [
    'orders:create', 'orders:view', 'orders:update',
    'menu:view', 'menu:edit', 'reports:view',
    'staff:manage', 'settings:edit', 'accounts:view',
    'accounts:manage', 'accounts:transactions',
    'accounts:transfer', 'accounts:adjust',
    'customers:view', 'customers:create', 'customers:edit', 'customers:manage',
  ],
  cashier: [
    'orders:create', 'orders:view', 'orders:update',
    'menu:view', 'accounts:view',
    'customers:view', 'customers:create',
  ],
  chef: ['orders:view', 'menu:view'],
  kitchen_helper: ['orders:view'],
  waiter: [
    'orders:create', 'orders:view', 'orders:update',
    'menu:view',
    'customers:view', 'customers:create',
  ],
  storekeeper: ['menu:view', 'menu:edit', 'reports:view', 'customers:view'],
  accountant: [
    'reports:view',
    'accounts:view', 'accounts:manage', 'accounts:transactions',
    'accounts:transfer', 'accounts:adjust',
    'customers:view',
  ],
  cleaner: [],
  custom: [],
};

const ALL_PERMISSIONS = [
  { key: 'orders:create', label: 'POS - Create Orders' },
  { key: 'orders:view', label: 'Orders - View' },
  { key: 'orders:update', label: 'Orders - Update' },
  { key: 'menu:view', label: 'Menu - View' },
  { key: 'menu:edit', label: 'Menu - Edit' },
  { key: 'reports:view', label: 'Reports - View' },
  { key: 'staff:manage', label: 'Staff - Manage' },
  { key: 'settings:edit', label: 'Settings - Edit' },
  { key: 'accounts:view', label: 'Accounts - View' },
  { key: 'accounts:manage', label: 'Accounts - Manage' },
  { key: 'accounts:transactions', label: 'Accounts - Transactions' },
  { key: 'accounts:transfer', label: 'Accounts - Transfer' },
  { key: 'accounts:adjust', label: 'Accounts - Adjust' },
  { key: 'customers:view', label: 'Customers - View' },
  { key: 'customers:create', label: 'Customers - Create' },
  { key: 'customers:edit', label: 'Customers - Edit' },
  { key: 'customers:manage', label: 'Customers - Manage' },
];

export interface PermissionDef {
  key: string;
  label: string;
}

export function getAllPermissions(): PermissionDef[] {
  return ALL_PERMISSIONS;
}

export const PERMISSION_PAGES = [
  { key: 'dashboard', label: 'Dashboard', perm: null },
  { key: 'pos', label: 'POS', perm: 'orders:create' },
  { key: 'orders', label: 'Orders', perm: 'orders:view' },
  { key: 'kitchen', label: 'Kitchen Display', perm: 'orders:view' },
  { key: 'tables', label: 'Table Management', perm: 'orders:create' },
  { key: 'menu', label: 'Menu Management', perm: 'menu:view' },
  { key: 'inventory', label: 'Inventory', perm: 'menu:edit' },
  { key: 'item-ledger', label: 'Item Ledger', perm: 'menu:edit' },
  { key: 'customers', label: 'Customers', perm: 'customers:view' },
  { key: 'staff', label: 'Staff Management', perm: 'staff:manage' },
  { key: 'accounts', label: 'Accounts', perm: 'accounts:view' },
  { key: 'expenses', label: 'Expenses', perm: 'settings:edit' },
  { key: 'reports', label: 'Reports', perm: 'reports:view' },
  { key: 'settings', label: 'Settings', perm: 'settings:edit' },
  { key: 'reservations', label: 'Reservations', perm: 'orders:create' },
  { key: 'third-party', label: 'Third Party', perm: 'orders:create' },
];

export interface CreateStaffData {
  email: string;
  name: string;
  role: string;
  phone: string;
  employmentStatus: string;
  permissions: string[];
  password?: string;
}

export interface UpdateStaffData {
  name?: string;
  role?: string;
  phone?: string;
  employmentStatus?: string;
  permissions?: string[];
}
