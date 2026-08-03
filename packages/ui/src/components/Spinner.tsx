import type { HTMLAttributes } from 'react';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<NonNullable<SpinnerProps['size']>, string> = {
  xs: 'w-4 h-4 border-2',
  sm: 'w-5 h-5 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-2',
};

/** Standardized spinner: gray ring + darker top segment. */
export function Spinner({ size = 'md', className = '', ...rest }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={
        'inline-block rounded-full border-gray-300 border-t-gray-600 animate-spin ' +
        SIZE_CLASSES[size] +
        (className ? ' ' + className : '')
      }
      {...rest}
    />
  );
}

export default Spinner;
