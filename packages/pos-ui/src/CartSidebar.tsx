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
}

export default function CartSidebar({
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
  disabled,
  theme,
}: CartSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const cartContent = (
    <>
      <div className="p-4 font-bold text-lg border-b" style={{ borderColor: theme.secondaryColor + '20' }}>
        Cart {itemCount > 0 && `(${itemCount})`}
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
                ${(item.price * item.quantity).toFixed(2)}
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
          <span>${total.toFixed(2)}</span>
        </div>
        <CheckoutButton onCheckout={onCheckout} disabled={disabled} theme={theme} />
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-80 flex-col border-l bg-white" style={{ borderColor: theme.secondaryColor + '20' }}>
        {cartContent}
      </div>

      {/* Mobile floating cart button */}
      {itemCount > 0 && (
        <button
          onClick={() => setMobileOpen(true)}
          className="md:hidden fixed bottom-4 right-4 z-30 flex items-center gap-2 px-4 py-3 rounded-full text-white text-sm font-bold shadow-lg"
          style={{ backgroundColor: theme.primaryColor }}
        >
          🛒 {itemCount} item{itemCount !== 1 ? 's' : ''} · ${total.toFixed(2)}
        </button>
      )}

      {/* Mobile cart drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          {/* Drawer */}
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
