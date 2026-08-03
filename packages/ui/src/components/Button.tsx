'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'danger-outline'
  | 'success'
  | 'warning'
  | 'info';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  fullWidth?: boolean;
  children?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active',
  secondary:
    'bg-secondary text-secondary-foreground hover:bg-secondary-hover',
  outline:
    'bg-transparent border border-border text-text-secondary hover:bg-surface-hover',
  ghost: 'bg-transparent text-text-secondary hover:bg-surface-hover',
  danger: 'bg-danger text-white hover:opacity-90 active:opacity-80',
  'danger-outline':
    'bg-transparent border border-danger/30 text-danger hover:bg-danger/10',
  success: 'bg-success text-white hover:opacity-90 active:opacity-80',
  warning: 'bg-warning text-white hover:opacity-90 active:opacity-80',
  info: 'bg-info text-white hover:opacity-90 active:opacity-80',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-4 py-2.5 text-sm',
  icon: 'w-10 h-10 text-sm',
  'icon-sm': 'w-8 h-8 text-sm',
};

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--input-focus)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap select-none';

const Spinner = ({ className }: { className?: string }) => (
  <span
    aria-hidden
    className={
      'inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin ' +
      (className ?? '')
    }
  />
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      loadingLabel,
      fullWidth = false,
      className = '',
      disabled,
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={
          BASE_CLASSES +
          ' ' +
          VARIANT_CLASSES[variant] +
          ' ' +
          SIZE_CLASSES[size] +
          (fullWidth ? ' w-full' : '') +
          (className ? ' ' + className : '')
        }
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading && <Spinner />}
        {loading && loadingLabel ? loadingLabel : children}
      </button>
    );
  },
);

export default Button;
