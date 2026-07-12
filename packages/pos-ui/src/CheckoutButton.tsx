'use client';
import type { ThemeConfig } from './types';

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
      className="w-full py-3 rounded-lg font-bold text-white transition-opacity disabled:opacity-40"
      style={{ backgroundColor: theme.primaryColor }}
    >
      {disabled ? 'Cart Empty' : 'Checkout'}
    </button>
  );
}
