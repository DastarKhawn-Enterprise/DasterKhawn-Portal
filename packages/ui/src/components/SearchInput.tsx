'use client';

import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
  /** Accessible name for icon-only / search contexts. */
  searchLabel?: string;
  onClear?: () => void;
  clearLabel?: string;
  /** Compact variant used in POS ordering paths. */
  compact?: boolean;
}

const MagnifierIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput(
    {
      label,
      searchLabel,
      onClear,
      clearLabel = 'Clear search',
      compact = false,
      className = '',
      id,
      'aria-label': ariaLabel,
      ...rest
    },
    ref,
  ) {
    const inputId = id;
    return (
      <div>
        {label !== undefined && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        <div className="relative">
          <MagnifierIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            ref={ref}
            id={inputId}
            type="text"
            role="searchbox"
            aria-label={ariaLabel ?? searchLabel}
            className={
              'w-full border border-input-border bg-input rounded-lg text-sm text-input-text placeholder:text-input-placeholder transition-colors focus:outline-none focus:ring-2 focus:ring-input-focus focus:border-input-focus disabled:opacity-50 disabled:cursor-not-allowed ' +
              (compact ? ' pl-9 pr-8 py-1.5 ' : ' pl-9 pr-8 py-2 ') +
              className
            }
            {...rest}
          />
          {rest.value !== undefined && String(rest.value).length > 0 && onClear && (
            <button
              type="button"
              onClick={onClear}
              aria-label={clearLabel}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <svg
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  },
);

export default SearchInput;
