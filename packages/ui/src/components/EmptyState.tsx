import type { HTMLAttributes, ReactNode } from 'react';

export type EmptyStateVariant =
  | 'no-data'
  | 'no-orders'
  | 'no-customers'
  | 'no-inventory'
  | 'no-reports'
  | 'no-staff'
  | 'no-tables'
  | 'no-reservations'
  | 'no-search-results'
  | 'permission-denied'
  | 'offline';

const VARIANT_DEFAULTS: Record<EmptyStateVariant, { icon: string; title: string; description: string }> = {
  'no-data': { icon: '📄', title: 'No data yet', description: 'Nothing to show right now.' },
  'no-orders': { icon: '🧾', title: 'No orders yet', description: 'Orders placed in this view will appear here.' },
  'no-customers': { icon: '👥', title: 'No customers yet', description: 'Customers you add will appear here.' },
  'no-inventory': { icon: '📦', title: 'No inventory items', description: 'Add inventory items to get started.' },
  'no-reports': { icon: '📊', title: 'No reports to display', description: 'Try a different date range or filter.' },
  'no-staff': { icon: '👤', title: 'No staff members', description: 'Invite staff members to get started.' },
  'no-tables': { icon: '🍽', title: 'No tables available', description: 'Tables you add will appear here.' },
  'no-reservations': { icon: '📋', title: 'No reservations', description: 'Reservations you create will appear here.' },
  'no-search-results': { icon: '🔍', title: 'No results found', description: 'Try a different search term or filter.' },
  'permission-denied': { icon: '🔒', title: 'Permission required', description: 'You do not have permission to view this.' },
  offline: { icon: '📡', title: 'You are offline', description: 'Reconnect to continue using this feature.' },
};

export interface EmptyStateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Preset icon/title/description; individual props override it. */
  variant?: EmptyStateVariant;
  /** Card wrapper (default) vs bare centered text. */
  as?: 'card' | 'bare';
  className?: string;
}

/**
 * Standardized empty state. `as="card"` renders the canonical
 * `bg-white rounded-xl border border-gray-200 p-8 text-center` used across
 * all CRUD views; `as="bare"` renders a compact centered text block.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  variant,
  as = 'card',
  className = '',
  children,
  ...rest
}: EmptyStateProps) {
  const preset = variant ? VARIANT_DEFAULTS[variant] : undefined;
  const content = children ?? (
    <>
      {(icon ?? preset?.icon) !== undefined && (
        <div className="text-3xl mb-2">{icon ?? preset?.icon}</div>
      )}
      {(title ?? preset?.title) !== undefined && (
        <p className="text-gray-600 font-medium text-sm">{title ?? preset?.title}</p>
      )}
      {(description ?? preset?.description) !== undefined && (
        <p className="text-gray-400 text-sm mt-1">{description ?? preset?.description}</p>
      )}
      {action !== undefined && <div className="mt-4">{action}</div>}
    </>
  );

  if (as === 'bare') {
    return (
      <div className={'text-center text-gray-400 text-sm py-8 ' + className} {...rest}>
        {content}
      </div>
    );
  }

  return (
    <div
      className={
        'bg-white rounded-xl border border-gray-200 p-8 text-center ' + className
      }
      {...rest}
    >
      {content}
    </div>
  );
}

export default EmptyState;
