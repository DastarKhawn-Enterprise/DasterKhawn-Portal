'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { ReactNode, RefObject } from 'react';

export type DrawerPosition = 'left' | 'right';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  position?: DrawerPosition;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Panel width (Tailwind width utility). */
  widthClassName?: string;
  showClose?: boolean;
  closeOnOverlay?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  labelledBy?: string;
  /** Prevent body scroll when open. Defaults to true. */
  lockBodyScroll?: boolean;
}

/**
 * Standardized side panel (drawer) with Escape, focus trap + restore,
 * backdrop click close and body scroll lock. Slides in from `left`/`right`.
 */
export function Drawer({
  open,
  onClose,
  position = 'right',
  title,
  description,
  children,
  footer,
  widthClassName = 'w-full max-w-md',
  showClose = true,
  closeOnOverlay = true,
  initialFocusRef,
  labelledBy,
  lockBodyScroll = true,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

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
    if (lockBodyScroll) document.body.style.overflow = 'hidden';
    const target =
      initialFocusRef?.current ??
      panelRef.current?.querySelector<HTMLElement>(
        'input, button, [tabindex]:not([tabindex="-1"])',
      );
    target?.focus();
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (lockBodyScroll) document.body.style.overflow = '';
      previouslyFocused.current?.focus?.();
    };
  }, [open, handleKeyDown, lockBodyScroll]);

  if (!open) return null;

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className={
        'relative h-full flex flex-col bg-white shadow-xl overflow-hidden ' +
        (position === 'right' ? 'ml-auto' : 'mr-auto') +
        ' ' +
        widthClassName
      }
    >
      {(title !== undefined || showClose) && (
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="min-w-0">
            {title !== undefined && (
              <h2 id={labelledBy} className="text-lg font-bold text-gray-800 truncate">
                {title}
              </h2>
            )}
            {description !== undefined && (
              <p className="mt-0.5 text-xs text-gray-500">{description}</p>
            )}
          </div>
          {showClose !== false && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 -mr-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--input-focus)]"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="w-5 h-5"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
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
  );

  if (position === 'right') {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div
          className="absolute inset-0 bg-black/30"
          onMouseDown={(e) => {
            if (closeOnOverlay && e.target === e.currentTarget) onClose();
          }}
        />
        {panel}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/30"
        onMouseDown={(e) => {
          if (closeOnOverlay && e.target === e.currentTarget) onClose();
        }}
      />
      {panel}
    </div>
  );
}

export default Drawer;