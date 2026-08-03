import type { HTMLAttributes, ReactNode } from 'react';

export interface ErrorBannerProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  retry?: () => void;
  retryLabel?: string;
  tone?: 'error' | 'warning' | 'success' | 'info';
}

const TONE_CLASSES: Record<NonNullable<ErrorBannerProps['tone']>, string> = {
  error: 'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  success: 'bg-green-50 border-green-200 text-green-700',
  info: 'bg-blue-50 border-blue-200 text-blue-700',
};

const RETRY_TONE: Record<NonNullable<ErrorBannerProps['tone']>, string> = {
  error: 'bg-red-100 text-red-700 hover:bg-red-200',
  warning: 'bg-amber-100 text-amber-700 hover:bg-amber-200',
  success: 'bg-green-100 text-green-700 hover:bg-green-200',
  info: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
};

/**
 * Standardized status banner. Matches the canonical recipe
 * `bg-*-50 border border-*-200 text-*-700 px-4 py-3 rounded text-sm`.
 */
export function ErrorBanner({
  children,
  retry,
  retryLabel = 'Retry',
  tone = 'error',
  className = '',
  ...rest
}: ErrorBannerProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        'border px-4 py-3 rounded text-sm mb-4 flex items-center justify-between gap-2 ' +
        TONE_CLASSES[tone] +
        (className ? ' ' + className : '')
      }
      {...rest}
    >
      <span className="min-w-0">{children}</span>
      {retry !== undefined && (
        <button
          type="button"
          onClick={retry}
          className={
            'ml-2 px-2 py-1 text-xs rounded font-medium shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--input-focus)] ' +
            RETRY_TONE[tone]
          }
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export default ErrorBanner;
