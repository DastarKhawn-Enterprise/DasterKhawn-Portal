import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumb?: ReactNode;
  /** Right-aligned action area (buttons, exports, etc.). */
  actions?: ReactNode;
  /** Optional toolbar row below the header (filters, search, date picker). */
  toolbar?: ReactNode;
  className?: string;
}

/**
 * Unified page header. Renders the canonical `flex flex-col sm:flex-row
 * sm:items-center justify-between gap-3 mb-5` block used across POS views:
 * title + optional subtitle/breadcrumb on the left, actions on the right, and
 * an optional toolbar strip underneath.
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
  toolbar,
  className = '',
}: PageHeaderProps) {
  return (
    <div className={className || 'mb-5'}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          {breadcrumb !== undefined && <div className="mb-0.5">{breadcrumb}</div>}
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 truncate">
            {title}
          </h1>
          {subtitle !== undefined && (
            <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
        {actions !== undefined && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>
        )}
      </div>
      {toolbar !== undefined && <div className="mt-4">{toolbar}</div>}
    </div>
  );
}

export default PageHeader;