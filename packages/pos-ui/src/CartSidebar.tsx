'use client';
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
  const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <div className="w-80 flex flex-col border-l bg-white" style={{ borderColor: theme.secondaryColor + '20' }}>
      <div className="p-4 font-bold text-lg border-b" style={{ borderColor: theme.secondaryColor + '20' }}>
        Cart
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
                className="w-6 h-6 rounded text-sm font-bold hover:bg-gray-100"
              >
                −
              </button>
              <span className="w-6 text-center text-sm">{item.quantity}</span>
              <button
                onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                className="w-6 h-6 rounded text-sm font-bold hover:bg-gray-100"
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
    </div>
  );
}
