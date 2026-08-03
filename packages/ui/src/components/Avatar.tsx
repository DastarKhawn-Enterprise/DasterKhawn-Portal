import type { HTMLAttributes } from 'react';

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  name: string;
  /** Explicit background color (hex). When omitted uses the palette by name hash. */
  backgroundColor?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  textColor?: string;
}

const DEFAULT_PALETTE = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
];

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-10 h-10 text-sm',
  xl: 'w-12 h-12 text-base',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return DEFAULT_PALETTE[Math.abs(h) % DEFAULT_PALETTE.length];
}

export function Avatar({
  name,
  backgroundColor,
  size = 'sm',
  textColor = '#ffffff',
  className = '',
  style,
  ...rest
}: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      className={
        'inline-flex items-center justify-center rounded-full font-semibold flex-shrink-0 select-none ' +
        SIZE_CLASSES[size] +
        (className ? ' ' + className : '')
      }
      style={{
        backgroundColor: backgroundColor ?? hashColor(name),
        color: textColor,
        ...style,
      }}
      {...rest}
    >
      {initials(name)}
    </span>
  );
}

export default Avatar;
