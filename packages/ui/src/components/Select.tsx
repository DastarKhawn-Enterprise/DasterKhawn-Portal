import { forwardRef } from 'react';
import type { SelectHTMLAttributes, ReactNode } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  requiredMark?: boolean;
  error?: ReactNode;
  hint?: ReactNode;
  /** Overrides focus ring color with the theme's input-focus token. */
  themed?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    requiredMark = false,
    error,
    hint,
    themed = true,
    className = '',
    id,
    children,
    'aria-invalid': ariaInvalid,
    'aria-describedby': ariaDescribedBy,
    ...rest
  },
  ref,
) {
  const describedBy =
    [ariaDescribedBy, error ? id + '-error' : undefined, hint ? id + '-hint' : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div>
      {label !== undefined && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {requiredMark && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <select
        ref={ref}
        id={id}
        className={
          'w-full px-3 py-2 border border-input-border bg-input rounded-lg text-sm text-input-text transition-colors focus:outline-none focus:ring-2 focus:ring-input-focus focus:border-input-focus disabled:opacity-50 disabled:cursor-not-allowed ' +
          (error ? ' border-red-400 bg-red-50 ' : '') +
          (themed ? '' : '') +
          className
        }
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={describedBy}
        {...rest}
      >
        {children}
      </select>
      {error !== undefined && error !== null && error !== false && (
        <p id={id + '-error'} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
      {hint !== undefined && !error && (
        <p id={id + '-hint'} className="mt-1 text-xs text-gray-400">
          {hint}
        </p>
      )}
    </div>
  );
});

export default Select;
