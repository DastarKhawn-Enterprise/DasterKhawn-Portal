import type { ReactNode } from 'react';

/**
 * Primitive shimmer block. Renders a rounded gray bar that pulses.
 */
export function SkeletonBlock({
  className = '',
  width,
  height,
}: {
  className?: string;
  width?: string | number;
  height?: string | number;
}) {
  return (
    <div
      role="status"
      aria-hidden
      className={
        'animate-pulse bg-gray-200 rounded ' +
        (className ? ' ' + className : '')
      }
      style={{ width, height }}
    />
  );
}

const Row = ({ cols }: { cols: number }) => (
  <div className="px-4 py-3 flex items-center gap-4">
    {Array.from({ length: cols }).map((_, i) => (
      <SkeletonBlock key={i} className="h-3" width={i === 0 ? '40%' : '100%'} />
    ))}
  </div>
);

/** Table skeleton: a header row + N body rows inside a card shell. */
export function SkeletonTable({
  rows = 5,
  cols = 5,
  className = '',
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div
      className={
        'bg-white rounded-xl border border-gray-200 overflow-hidden ' +
        (className ? ' ' + className : '')
      }
    >
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex gap-2">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBlock key={i} className="h-4" width={i === 0 ? '40%' : '100%'} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Row key={i} cols={cols} />
      ))}
    </div>
  );
}

export interface SkeletonProps {
  variant?: 'card' | 'table' | 'list' | 'form' | 'lines';
  className?: string;
  rows?: number;
  cols?: number;
  title?: ReactNode;
}

/**
 * Unified loading skeleton. Pick a preset variant:
 *  - `table` / `card` / `list` / `form` / `lines`
 * Defaults to a card shell with `lines` rows.
 */
export function Skeleton({
  variant = 'lines',
  className = '',
  rows = 4,
  cols = 5,
  title,
}: SkeletonProps) {
  const shell = (inner: ReactNode) => (
    <div
      className={
        'bg-white rounded-xl border border-gray-200 overflow-hidden ' +
        (className ? ' ' + className : '')
      }
    >
      {inner}
    </div>
  );

  switch (variant) {
    case 'table':
      return shell(<SkeletonTable rows={rows} cols={cols} className="border-0 rounded-none" />);
    case 'form':
      return shell(
        <div className="p-5 space-y-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="h-9 w-full" />
            </div>
          ))}
        </div>,
      );
    case 'card':
      return shell(
        <div className="p-5 space-y-3">
          {title && <SkeletonBlock className="h-4 w-1/3" />}
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonBlock key={i} height={i === 0 ? 96 : 14} className="w-full" />
          ))}
        </div>,
      );
    case 'list':
      return shell(
        <div className="divide-y divide-gray-100">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-3">
              <SkeletonBlock className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <SkeletonBlock className="h-3 w-1/2" />
                <SkeletonBlock className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>,
      );
    case 'lines':
    default:
      return (
        <div className={'space-y-2 ' + className}>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonBlock key={i} className="h-3.5 w-full" width={i % 2 ? '70%' : '100%'} />
          ))}
        </div>
      );
  }
}

export default Skeleton;