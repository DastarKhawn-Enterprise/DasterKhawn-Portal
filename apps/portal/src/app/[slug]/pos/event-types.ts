export type EventCategory = 'orders' | 'kitchen' | 'inventory' | 'customers' | 'staff' | 'menu' | 'tables' | 'payments' | 'reports' | 'settings';

export interface EventDefinition<Payload = unknown> {
  category: EventCategory;
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  label: string;
}

export interface EventPayload {
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
  timestamp: number;
  slug: string;
}

export type EventCallback = (payload: EventPayload) => void;
export type UnsubscribeFn = () => void;
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export const SUPPORTED_TABLES = [
  'orders', 'order_items', 'payments',
  'menu_items', 'categories',
  'inventory_transactions', 'inventory_items',
  'customers', 'customer_loyalty',
  'staff', 'staff_roles',
  'tables', 'reservations',
  'sales_summary', 'expenses',
  'settings', 'business_settings',
  'kitchen_tickets', 'kitchen_items',
] as const;

export type SupportedTable = (typeof SUPPORTED_TABLES)[number];

export function getTableCategory(table: SupportedTable): EventCategory {
  if (table === 'orders' || table === 'order_items') return 'orders';
  if (table === 'kitchen_tickets' || table === 'kitchen_items') return 'kitchen';
  if (table === 'inventory_transactions' || table === 'inventory_items') return 'inventory';
  if (table === 'customers' || table === 'customer_loyalty') return 'customers';
  if (table === 'staff' || table === 'staff_roles') return 'staff';
  if (table === 'menu_items' || table === 'categories') return 'menu';
  if (table === 'tables' || table === 'reservations') return 'tables';
  if (table === 'payments') return 'payments';
  if (table === 'sales_summary' || table === 'expenses') return 'reports';
  if (table === 'settings' || table === 'business_settings') return 'settings';
  return 'settings';
}

export function supportsRealtime(table: string): table is SupportedTable {
  return (SUPPORTED_TABLES as readonly string[]).includes(table);
}
