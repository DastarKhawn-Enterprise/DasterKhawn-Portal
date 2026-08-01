'use client';
import { useState } from 'react';
import type { CartItem, ThemeConfig } from './types';
import CheckoutButton from './CheckoutButton';

interface CartSidebarProps {
  cartItems: CartItem[];
  onUpdateQuantity: (itemId: string, qty: number) => void;
  onRemoveItem: (itemId: string) => void;
  onCheckout: () => void;
  disabled: boolean;
  theme: ThemeConfig;
  currencySymbol?: string;
}

export default function CartSidebar({
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
  disabled,
  theme,
  currencySymbol,
}: CartSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const cartContent = (
    <>
      <div className="px-4 py-3 font-semibold text-[15px] border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <span className="text-[var(--text)]">Cart {itemCount > 0 && `(${itemCount})`}</span>
        <button
          onClick={() => setDesktopOpen(false)}
          className="hidden md:block text-[var(--text-muted)] hover:text-[var(--text)] text-xs px-1"
          title="Collapse cart"
          aria-label="Collapse cart"
        >
          ▸
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {cartItems.length === 0 && (
          <p className="text-[var(--text-muted)] text-sm text-center mt-8">Cart is empty</p>
        )}
        {cartItems.map((item) => (
          <div key={item.id} className="flex items-center gap-2 p-2.5 rounded-[var(--radius-btn)] border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[var(--text)] truncate">{item.name}</div>
              <div className="text-xs font-medium" style={{ color: theme.primaryColor }}>
                {currencySymbol || 'Rs.'}{(item.price * item.quantity).toFixed(2)}
              </div>
            </div>
            <div className="flex items-center gap-0.5 bg-[var(--surface-3)] rounded-[10px] p-0.5">
              <button
                onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                aria-label={`Decrease ${item.name}`}
                className="w-7 h-7 md:w-6 md:h-6 rounded-lg text-sm font-bold hover:bg-[var(--surface-2)] text-[var(--text-soft)] flex items-center justify-center transition-colors"
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-semibold text-[var(--text)] tabular-nums">{item.quantity}</span>
              <button
                onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                aria-label={`Increase ${item.name}`}
                className="w-7 h-7 md:w-6 md:h-6 rounded-lg text-sm font-bold hover:bg-[var(--surface-2)] text-[var(--text-soft)] flex items-center justify-center transition-colors"
              >
                +
              </button>
            </div>
            <button
              onClick={() => onRemoveItem(item.id)}
              aria-label={`Remove ${item.name}`}
              className="text-[var(--text-muted)] hover:text-[var(--danger)] text-sm w-6 h-6 flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex justify-between font-bold mb-3 text-[var(--text)]">
          <span>Total</span>
          <span className="tabular-nums">{currencySymbol || 'Rs.'}{total.toFixed(2)}</span>
        </div>
        <CheckoutButton onCheckout={onCheckout} disabled={disabled} theme={theme} />
      </div>
    </>
  );

  return (
    <>
      {desktopOpen && (
        <div className="hidden md:flex w-80 flex-col border-l bg-[var(--surface)]" style={{ borderColor: 'var(--border)' }}>
          {cartContent}
        </div>
      )}

      {!desktopOpen && (
        <button
          onClick={() => setDesktopOpen(true)}
          className="hidden md:flex flex-col items-center justify-center w-10 border-l bg-[var(--surface)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
          style={{ borderColor: 'var(--border)' }}
          title="Expand cart"
        >
          <span className="text-[var(--text-muted)] text-xs rotate-90 whitespace-nowrap select-none">
            Cart {itemCount > 0 && `(${itemCount})`}
          </span>
          <span className="text-[var(--text-muted)] text-xs mt-2">◂</span>
        </button>
      )}

      {itemCount > 0 && (
        <button
          onClick={() => setMobileOpen(true)}
          className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between px-5 py-4 text-white text-sm font-bold shadow-[var(--shadow-card-hover)]"
          style={{ backgroundColor: theme.primaryColor }}
        >
          <span>View Cart ({itemCount} item{itemCount !== 1 ? 's' : ''})</span>
          <span className="tabular-nums">{currencySymbol || 'Rs.'}{total.toFixed(2)}</span>
        </button>
      )}

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col">
          <div className="absolute inset-0 bg-black/40 anim-fade" onClick={() => setMobileOpen(false)} />
          <div className="relative mt-auto bg-[var(--surface)] rounded-t-[var(--radius-card)] shadow-[var(--shadow-dialog)] max-h-[80vh] flex flex-col anim-slide-bottom">
            <div className="flex items-center justify-center pt-2.5 pb-1">
              <div className="w-10 h-1 rounded-full bg-[var(--border-strong)]" />
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              {cartContent}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
