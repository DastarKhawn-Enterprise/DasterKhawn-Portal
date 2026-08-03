import Badge from './Badge';
import type { BadgeProps, BadgeVariant, BadgeSize } from './Badge';

/**
 * Generic business-status → BadgeVariant map.
 *
 * Covers the cross-module status vocabulary (Payment, Inventory, Customer,
 * Table, Order) so every module renders the same status identically:
 *
 * Pending / Preparing / Ready / Completed / Paid / Unpaid / Cancelled /
 * Refunded / Out Of Stock / Low Stock / Active / Inactive / Open / Closed.
 */
export const STATUS_VARIANT: Record<string, BadgeVariant> = {
  // Order / payment
  pending: 'info',
  preparing: 'warning',
  in_kitchen: 'warning',
  ready: 'success',
  completed: 'neutral',
  paid: 'success',
  unpaid: 'warning',
  cancelled: 'danger',
  refunded: 'danger',
  new: 'info',
  draft: 'neutral',

  // Inventory
  out_of_stock: 'danger',
  low_stock: 'warning',
  in_stock: 'success',
  healthy: 'success',

  // Entity status
  active: 'success',
  inactive: 'neutral',
  disabled: 'disabled',
  open: 'success',
  closed: 'neutral',
  available: 'success',
  occupied: 'danger',
  reserved: 'warning',
  confirmed: 'info',
  seated: 'success',
  no_show: 'neutral',

  // Generic account / ledger
  credit: 'danger',
  debit: 'success',
  purchase: 'success',
  sale: 'info',
  adjustment: 'warning',
  wastage: 'danger',
};

export interface StatusPillProps
  extends Omit<BadgeProps, 'variant' | 'size'> {
  status: string;
  /** Optional label override (defaults to a title-cased status). */
  label?: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
}

function titleCase(status: string): string {
  return status
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Standardized status pill. Pass any status key and it renders the matching
 * shared Badge with the canonical `soft` pill recipe. Pass an explicit
 * `variant` to override the inferred one.
 */
export function StatusPill({
  status,
  label,
  variant,
  size = 'md',
  pill = true,
  dot = false,
  ...rest
}: StatusPillProps) {
  return (
    <Badge
      variant={variant ?? STATUS_VARIANT[status] ?? 'neutral'}
      size={size}
      pill={pill}
      dot={dot}
      {...rest}
    >
      {label ?? titleCase(status)}
    </Badge>
  );
}

export default StatusPill;