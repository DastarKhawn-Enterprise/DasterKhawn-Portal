'use client';
import type { ThemeConfig } from './theme';

interface CheckoutButtonProps {
  onCheckout: () => void;
  disabled: boolean;
  theme: ThemeConfig;
}

export default function CheckoutButton({ onCheckout, disabled, theme }: CheckoutButtonProps) {
  return (
    <button
      onClick={onCheckout}
      disabled={disabled}
      className="btn btn-lg w-full !rounded-[var(--radius-btn)]"
      style={{ backgroundColor: theme.primaryColor, color: 'var(--primary-contrast)' }}
    >
      {disabled ? 'Cart Empty' : 'Checkout'}
    </button>
  );
}
