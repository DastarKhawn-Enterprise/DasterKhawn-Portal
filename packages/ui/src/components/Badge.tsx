import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'purple'
  | 'orange'
  | 'teal'
  | 'indigo'
  | 'outline'
  | 'disabled';

export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  tone?: 'soft' | 'solid';
  size?: BadgeSize;
  pill?: boolean;
  dot?: boolean;
  children?: ReactNode;
}

/**
 * Standardized status/type pill. Defaults to the enterprise `soft` tone
 * (`bg-*-50 text-*-700 border border-*-200`) used across CRUD views.
 * `solid` renders `bg-*-600 text-white` for high-emphasis counters.
 */
const SOFT_CLASSES: Record<BadgeVariant, string> = {
  primary: 'bg-primary/10 text-primary border border-primary/30',
  secondary: 'bg-gray-100 text-gray-700 border border-gray-200',
  success: 'bg-green-50 text-green-700 border border-green-200',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200',
  danger: 'bg-red-50 text-red-700 border border-red-200',
  info: 'bg-blue-50 text-blue-700 border border-blue-200',
  neutral: 'bg-gray-50 text-gray-500 border border-gray-200',
  purple: 'bg-purple-50 text-purple-700 border border-purple-200',
  orange: 'bg-orange-50 text-orange-700 border border-orange-200',
  teal: 'bg-teal-50 text-teal-700 border border-teal-200',
  indigo: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  outline: 'bg-transparent text-gray-600 border border-gray-300',
  disabled: 'bg-gray-100 text-gray-400 border border-gray-200',
};

const SOLID_CLASSES: Record<BadgeVariant, string> = {
  primary: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  danger: 'bg-danger text-white',
  info: 'bg-info text-white',
  neutral: 'bg-gray-600 text-white',
  purple: 'bg-purple-600 text-white',
  orange: 'bg-orange-600 text-white',
  teal: 'bg-teal-600 text-white',
  indigo: 'bg-indigo-600 text-white',
  outline: 'bg-white text-gray-700 border border-gray-300',
  disabled: 'bg-gray-200 text-gray-400',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
};

export function Badge({
  variant = 'neutral',
  tone = 'soft',
  size = 'md',
  pill = false,
  dot = false,
  className = '',
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={
        'inline-flex items-center gap-1 font-medium ' +
        SIZE_CLASSES[size] +
        ' ' +
        (pill ? 'rounded-full ' : 'rounded ') +
        (tone === 'solid' ? SOLID_CLASSES[variant] : SOFT_CLASSES[variant]) +
        (className ? ' ' + className : '')
      }
      {...rest}
    >
      {dot && (
        <span
          aria-hidden
          className={
            'w-1.5 h-1.5 rounded-full ' +
            (tone === 'solid' ? 'bg-white/80' : 'bg-current')
          }
        />
      )}
      {children}
    </span>
  );
}

export default Badge;
