import type { ReactNode } from 'react';

export interface ToolbarProps {
  /** Left slot: search input, date pickers, dropdowns. */
  children?: ReactNode;
  /** Right slot: primary actions (Export, Refresh, Add…). */
  actions?: ReactNode;
  className?: string;
}

/**
 * Unified filter/toolbar strip. Renders the canonical
 * `flex flex-col md:flex-row md:items-center justify-between gap-3` row used
 * across CRUD views, with a standard vertical rhythm (`mb-4`).
 */
export function Toolbar({ children, actions, className = '' }: ToolbarProps) {
  return (
    <div
      className={
        'flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 ' +
        (className ? ' ' + className : '')
      }
    >
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
      {actions !== undefined && (
        <div className="flex items-center gap-2 flex-wrap">{actions}</div>
      )}
    </div>
  );
}

export default Toolbar;