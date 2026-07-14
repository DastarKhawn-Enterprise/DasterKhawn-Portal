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
      <div className="p-4 font-bold text-lg border-b flex items-center justify-between" style={{ borderColor: theme.secondaryColor + '20' }}>
        <span>Cart {itemCount > 0 && `(${itemCount})`}</span>
        {/* Desktop collapse toggle */}
        <button
          onClick={() => setDesktopOpen(false)}
          className="hidden md:block text-gray-400 hover:text-gray-600 text-xs px-1"
          title="Collapse cart"
        >
          ▸
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cartItems.length === 0 && (
          <p className="text-gray-400 text-sm text-center mt-8">Cart is empty</p>
        )}
        {cartItems.map((item) => (
          <div key={item.id} className="flex items-center gap-2 p-2 rounded border">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{item.name}</div>
              <div className="text-xs" style={{ color: theme.primaryColor }}>
                {currencySymbol || '$'}{(item.price * item.quantity).toFixed(2)}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                className="w-7 h-7 md:w-6 md:h-6 rounded text-sm font-bold hover:bg-gray-100 flex items-center justify-center"
              >
                −
              </button>
              <span className="w-6 text-center text-sm">{item.quantity}</span>
              <button
                onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                className="w-7 h-7 md:w-6 md:h-6 rounded text-sm font-bold hover:bg-gray-100 flex items-center justify-center"
              >
                +
              </button>
            </div>
            <button
              onClick={() => onRemoveItem(item.id)}
              className="text-gray-400 hover:text-red-500 text-sm"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="p-4 border-t" style={{ borderColor: theme.secondaryColor + '20' }}>
        <div className="flex justify-between font-bold mb-3">
          <span>Total</span>
          <span>{currencySymbol || '$'}{total.toFixed(2)}</span>
        </div>
        <CheckoutButton onCheckout={onCheckout} disabled={disabled} theme={theme} />
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar — expanded */}
      {desktopOpen && (
        <div className="hidden md:flex w-80 flex-col border-l bg-white" style={{ borderColor: theme.secondaryColor + '20' }}>
          {cartContent}
        </div>
      )}

      {/* Desktop collapsed tab — shown when sidebar is hidden */}
      {!desktopOpen && (
        <button
          onClick={() => setDesktopOpen(true)}
          className="hidden md:flex flex-col items-center justify-center w-10 border-l bg-white hover:bg-gray-50 cursor-pointer"
          style={{ borderColor: theme.secondaryColor + '20' }}
          title="Expand cart"
        >
          <span className="text-gray-400 text-xs rotate-90 whitespace-nowrap select-none">
            Cart {itemCount > 0 && `(${itemCount})`}
          </span>
          <span className="text-gray-400 text-xs mt-2">◂</span>
        </button>
      )}

      {/* Mobile cart summary bar */}
      {itemCount > 0 && (
        <button
          onClick={() => setMobileOpen(true)}
          className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 text-white text-sm font-bold shadow-lg"
          style={{ backgroundColor: theme.primaryColor }}
        >
          <span>View Cart ({itemCount} item{itemCount !== 1 ? 's' : ''})</span>
          <span>{currencySymbol || '$'}{total.toFixed(2)}</span>
        </button>
      )}

      {/* Mobile cart drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative mt-auto bg-white rounded-t-2xl shadow-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-center pt-2 pb-1">
              <div className="w-8 h-1 rounded-full bg-gray-300" />
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
