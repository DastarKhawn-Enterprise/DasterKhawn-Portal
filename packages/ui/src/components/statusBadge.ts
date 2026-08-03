import Badge from './Badge';
import type { BadgeVariant } from './Badge';

/**
 * Semantic status → BadgeVariant maps.
 *
 * Centralizes the status/order-type/reservation badge recipes previously
 * duplicated as string maps in every view (design-tokens.ts, CurrentOrders,
 * KDS, DineIn, Reservations, etc.). All follow the same `soft` pill recipe:
 * `bg-*-50 text-*-700 border border-*-200`.
 */
export const ORDER_STATUS_VARIANT: Record<string, BadgeVariant> = {
  new: 'info',
  pending: 'info',
  in_kitchen: 'warning',
  preparing: 'warning',
  ready: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  draft: 'neutral',
  paid: 'success',
  refunded: 'danger',
};

export const ORDER_TYPE_VARIANT: Record<string, BadgeVariant> = {
  dine_in: 'purple',
  takeaway: 'info',
  delivery: 'orange',
  drive_thru: 'teal',
  third_party: 'indigo',
};

export const TABLE_STATUS_VARIANT: Record<string, BadgeVariant> = {
  available: 'success',
  occupied: 'danger',
  reserved: 'warning',
};

export const RESERVATION_STATUS_VARIANT: Record<string, BadgeVariant> = {
  confirmed: 'info',
  seated: 'success',
  cancelled: 'danger',
  no_show: 'neutral',
};

export function orderStatusVariant(status: string): BadgeVariant {
  return ORDER_STATUS_VARIANT[status] ?? 'neutral';
}

export function orderTypeVariant(type: string): BadgeVariant {
  return ORDER_TYPE_VARIANT[type] ?? 'neutral';
}

export function tableStatusVariant(status: string): BadgeVariant {
  return TABLE_STATUS_VARIANT[status] ?? 'neutral';
}

export function reservationStatusVariant(status: string): BadgeVariant {
  return RESERVATION_STATUS_VARIANT[status] ?? 'neutral';
}

export { Badge };
export default Badge;
