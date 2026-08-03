'use client';

import type { InputHTMLAttributes } from 'react';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  size?: 'sm' | 'md';
}

const SIZE_TRACK: Record<NonNullable<SwitchProps['size']>, string> = {
  sm: 'w-9 h-5',
  md: 'w-10 h-5',
};

const SIZE_KNOB: Record<NonNullable<SwitchProps['size']>, string> = {
  sm: 'w-4 h-4',
  md: 'w-4 h-4',
};

const SIZE_TRANSLATE: Record<NonNullable<SwitchProps['size']>, string> = {
  sm: 'translate-x-4',
  md: 'translate-x-5',
};

/**
 * Accessible switch built on a checkbox input. Uses the theme primary color
 * for the checked state and announces state via `aria-checked`.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  size = 'md',
  disabled,
  className = '',
  id,
  onChange,
  ...rest
}: SwitchProps) {
  return (
    <label
      className={
        'inline-flex items-center gap-2 cursor-pointer ' +
        (disabled ? ' opacity-50 cursor-not-allowed' : '') +
        (className ? ' ' + className : '')
      }
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-checked={checked ?? false}
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          onChange?.(e);
          onCheckedChange?.(e.target.checked);
        }}
        className="peer sr-only"
        {...rest}
      />
      <span
        aria-hidden
        className={
          'relative inline-flex items-center rounded-full transition-colors ' +
          SIZE_TRACK[size] +
          ' ' +
          (checked ? 'bg-primary' : 'bg-gray-300 peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--input-focus)] peer-focus-visible:ring-offset-2')
        }
      >
        <span
          className={
            'inline-block transform rounded-full bg-white shadow transition-transform ' +
            SIZE_KNOB[size] +
            ' ' +
            (checked ? SIZE_TRANSLATE[size] : 'translate-x-0.5')
          }
        />
      </span>
      {label !== undefined && <span className="text-sm text-gray-700">{label}</span>}
    </label>
  );
}

export default Switch;
