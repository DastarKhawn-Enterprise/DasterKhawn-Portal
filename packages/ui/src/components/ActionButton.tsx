'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ActionTone =
  | 'primary'
  | 'blue'
  | 'amber'
  | 'green'
  | 'indigo'
  | 'gray'
  | 'red';

export interface ActionButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ActionTone;
  /** Use the theme primary color (overrides tone for brand actions). */
  themePrimary?: boolean;
  size?: 'md' | 'sm';
  loading?: boolean;
  /** Render raw Tailwind color classes verbatim (legacy drop-in API). */
  color?: string;
  /** Backfill for the legacy `{ label, updating }` call sites. */
  label?: string;
  updating?: boolean;
  children?: ReactNode;
}

const TONE_CLASSES: Record<ActionTone, string> = {
  primary: 'bg-primary hover:bg-primary-hover',
  blue: 'bg-blue-600 hover:bg-blue-700',
  amber: 'bg-amber-600 hover:bg-amber-700',
  green: 'bg-green-600 hover:bg-green-700',
  indigo: 'bg-indigo-600 hover:bg-indigo-700',
  gray: 'bg-gray-600 hover:bg-gray-700',
  red: 'bg-danger hover:opacity-90',
};

const SIZE_CLASSES = {
  md: 'px-4 py-2 rounded-lg text-sm font-semibold',
  sm: 'px-3 py-1.5 rounded-lg text-xs font-semibold',
};

/**
 * Shared status-action button. Replaces the identical copy-pasted
 * `ActionButton` previously duplicated in CurrentOrdersView and DineInView.
 * Theme-driven actions use `themePrimary` / `tone="primary"`.
 */
export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  function ActionButton(
    {
      tone = 'primary',
      themePrimary = false,
      size = 'md',
      loading = false,
      color,
      label,
      updating = false,
      disabled,
      className = '',
      children,
      ...rest
    },
    ref,
  ) {
    const isBusy = loading || updating;
    const content = children ?? (isBusy ? '...' : (label as ReactNode));
    const effectiveColor =
      color ?? (themePrimary
        ? 'bg-primary hover:bg-primary-hover'
        : TONE_CLASSES[tone]);

    return (
      <button
        ref={ref}
        className={
          'inline-flex items-center justify-center gap-1.5 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--input-focus)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ' +
          SIZE_CLASSES[size] +
          ' ' +
          effectiveColor +
          (className ? ' ' + className : '')
        }
        disabled={disabled || isBusy}
        aria-busy={isBusy || undefined}
        {...rest}
      >
        {content}
      </button>
    );
  },
);

export default ActionButton;