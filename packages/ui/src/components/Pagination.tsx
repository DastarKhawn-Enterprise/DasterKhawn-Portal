'use client';

import type { ReactNode } from 'react';

export interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  totalPages?: number;
  /** Number of page buttons to show around the current one. */
  siblings?: number;
  label?: string;
  footer?: boolean;
  className?: string;
}

/** Build a windowed page-number list (e.g. 1 … 4 5 6 … 20). */
function pageWindow(current: number, total: number, siblings = 1): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const start = Math.max(2, current - siblings);
  const end = Math.min(total - 1, current + siblings);
  const pages: (number | '…')[] = [1];
  if (start > 2) pages.push('…');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push('…');
  pages.push(total);
  return pages;
}

const PAGE_BTN =
  'min-w-[30px] h-8 px-2 flex items-center justify-center text-xs rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--input-focus)]';

export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  totalPages,
  siblings = 1,
  label,
  footer = true,
  className = '',
}: PaginationProps) {
  const total = totalPages ?? Math.max(1, Math.ceil(totalItems / pageSize));
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);
  const pages = pageWindow(page, total, siblings);

  const control = (content: ReactNode, disabled: boolean, onClick: () => void, ariaLabel: string) => (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={
        PAGE_BTN +
        ' border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed'
      }
    >
      {content}
    </button>
  );

  const bar = (
    <div className={'flex items-center justify-between gap-3 flex-wrap ' + className}>
      {label !== undefined ? (
        <span className="text-xs text-gray-500">{label}</span>
      ) : (
        <span className="text-xs text-gray-500">
          Showing {from} to {to} of {totalItems}
        </span>
      )}
      <div className="flex items-center gap-1">
        {control('‹', page <= 1, () => onPageChange(page - 1), 'Previous page')}
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={'e' + i} className="px-1 text-xs text-gray-400 select-none">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={
                PAGE_BTN +
                (p === page
                  ? ' bg-primary text-primary-foreground border-primary font-medium'
                  : ' border-gray-300 text-gray-600 hover:bg-gray-50')
              }
            >
              {p}
            </button>
          ),
        )}
        {control('›', page >= total, () => onPageChange(page + 1), 'Next page')}
      </div>
    </div>
  );

  if (!footer) return bar;
  return (
    <div className={'flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50'}>
      {bar}
    </div>
  );
}

export default Pagination;
