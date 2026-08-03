'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { ReactNode, RefObject } from 'react';

export type ModalPlacement = 'centered' | 'bottom-sheet';
export type ModalSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  placement?: ModalPlacement;
  /** Render a header close button. Defaults to true. */
  showClose?: boolean;
  /** Additional classes for the panel. */
  panelClassName?: string;
  /** Close on overlay click. Defaults to true. */
  closeOnOverlay?: boolean;
  /** Initial focused element ref. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  labelledBy?: string;
  /** Bottom-sheet safe-area padding for PWA. */
  safeBottom?: boolean;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  xs: 'md:max-w-sm',
  sm: 'md:max-w-sm',
  md: 'md:max-w-md',
  lg: 'md:max-w-lg',
};

const CloseIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/**
 * Enterprise modal shell: bottom-sheet on mobile, centered card on md+.
 *
 * Handles Escape-to-close, overlay-click close, `role="dialog"` + `aria-modal`,
 * focus management (trap + restore) and a consistent header close button.
 * Layout matches the existing modal chrome so adopting it is visually neutral.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  placement = 'bottom-sheet',
  showClose = true,
  panelClassName = '',
  closeOnOverlay = true,
  initialFocusRef,
  labelledBy,
  safeBottom = false,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = labelledBy;

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    },
    [open],
  );

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', handleKeyDown, true);
    const target =
      initialFocusRef?.current ?? panelRef.current?.querySelector<HTMLElement>('input, button, [tabindex]:not([tabindex="-1"])');
    target?.focus();
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className={
        'fixed inset-0 z-50 flex ' +
        (placement === 'bottom-sheet'
          ? 'items-end md:items-center justify-center bg-black/40'
          : 'items-center justify-center bg-black/40')
      }
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={
          'relative w-full mx-0 md:mx-4 bg-white shadow-xl flex flex-col overflow-hidden ' +
          (placement === 'bottom-sheet'
            ? 'rounded-t-2xl md:rounded-lg max-h-[90vh] '
            : 'rounded-xl max-h-[90vh] ') +
          SIZE_CLASSES[size] +
          (safeBottom ? ' pb-[env(safe-area-inset-bottom,0px)]' : '') +
          (panelClassName ? ' ' + panelClassName : '')
        }
      >
        {(title !== undefined || showClose) && (
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 shrink-0">
            <div className="min-w-0">
              {title !== undefined && (
                <h2 id={titleId} className="text-lg font-bold text-gray-800 truncate">
                  {title}
                </h2>
              )}
              {description !== undefined && (
                <p className="mt-0.5 text-xs text-gray-500">{description}</p>
              )}
            </div>
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="p-1.5 -mr-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--input-focus)]"
              >
                <CloseIcon />
              </button>
            )}
          </div>
        )}
        <div className="overflow-y-auto flex-1 px-5 py-4 text-sm text-gray-700">
          {children}
        </div>
        {footer !== undefined && (
          <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default Modal;
