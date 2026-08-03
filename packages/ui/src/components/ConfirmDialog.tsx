'use client';

import type { ReactNode, RefObject } from 'react';
import Modal from './Modal';
import Button from './Button';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Confirm button tone. Defaults to `danger` for destructive actions. */
  tone?: 'danger' | 'primary' | 'info' | 'warning' | 'neutral';
  loading?: boolean;
  loadingLabel?: string;
  showCancel?: boolean;
  size?: 'sm' | 'md';
  /** Bottom-sheet on mobile / centered on md+ (default) vs always centered. */
  placement?: 'bottom-sheet' | 'centered';
  initialFocusRef?: RefObject<HTMLElement | null>;
  labelledBy?: string;
}

const BUTTON_VARIANT: Record<NonNullable<ConfirmDialogProps['tone']>, 'danger' | 'primary' | 'info' | 'warning' | 'outline'> = {
  danger: 'danger',
  primary: 'primary',
  info: 'info',
  warning: 'warning',
  neutral: 'outline',
};

/**
 * Standardized confirmation dialog built on the shared Modal.
 *
 * Renders a centered dialog with a message, a cancel button (outline) and a
 * confirm button whose tone defaults to `danger` (delete / cancel / refund /
 * archive / logout). Handles Escape, focus trap, backdrop click and loading.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  showCancel = true,
  size = 'sm',
  placement = 'bottom-sheet',
  initialFocusRef,
  labelledBy,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size={size}
      placement={placement}
      showClose={false}
      title={title}
      labelledBy={labelledBy}
      initialFocusRef={initialFocusRef}
      footer={
        <div className="flex items-center justify-end gap-2">
          {showCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              {cancelLabel}
            </Button>
          )}
          <Button
            type="button"
            variant={BUTTON_VARIANT[tone]}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {message && <p className="text-sm text-gray-600">{message}</p>}
    </Modal>
  );
}

export default ConfirmDialog;