import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  requiredMark?: boolean;
  error?: ReactNode;
  hint?: ReactNode;
  /** Compact POS-style field (smaller padding). */
  compact?: boolean;
  /** Overrides focus ring color with the theme's input-focus token. */
  themed?: boolean;
}

const BASE =
  'w-full border border-input-border bg-input rounded-lg text-sm text-input-text placeholder:text-input-placeholder transition-colors focus:outline-none focus:ring-2 focus:ring-input-focus focus:border-input-focus disabled:opacity-50 disabled:cursor-not-allowed';

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    requiredMark = false,
    error,
    hint,
    compact = false,
    themed = true,
    className = '',
    id,
    'aria-invalid': ariaInvalid,
    'aria-describedby': ariaDescribedBy,
    ...rest
  },
  ref,
) {
  const inputId = id;
  const describedBy = [
    ariaDescribedBy,
    error ? inputId + '-error' : undefined,
    hint ? inputId + '-hint' : undefined,
  ]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div>
      {label !== undefined && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {label}
          {requiredMark && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={
          BASE +
          (compact ? ' px-2.5 py-1.5 ' : ' px-3 py-2 ') +
          (error
            ? ' border-red-400 bg-red-50 '
            : ' focus:ring-2 ' + (themed ? ' ring-input-focus ' : '')) +
          className
        }
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={describedBy}
        {...rest}
      />
      {error !== undefined && error !== null && error !== false && (
        <p id={inputId + '-error'} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
      {hint !== undefined && !error && (
        <p id={inputId + '-hint'} className="mt-1 text-xs text-gray-400">
          {hint}
        </p>
      )}
    </div>
  );
});

export default Input;
