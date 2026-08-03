import type { HTMLAttributes, ReactNode } from 'react';

export interface EmptyStateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
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
  as = 'card',
  className = '',
  children,
  ...rest
}: EmptyStateProps) {
  const content = children ?? (
    <>
      {icon !== undefined && <div className="text-3xl mb-2">{icon}</div>}
      {title !== undefined && (
        <p className="text-gray-600 font-medium text-sm">{title}</p>
      )}
      {description !== undefined && (
        <p className="text-gray-400 text-sm mt-1">{description}</p>
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
