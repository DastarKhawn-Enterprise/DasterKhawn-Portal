'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import { useRouter, usePathname } from 'next/navigation';
import { MenuGrid, CartSidebar } from '@sat-sys/pos-ui';
import type { MenuItem, CartItem, ThemeConfig } from '@sat-sys/pos-ui';
import KitchenView from './KitchenView';

interface POSClientProps {
  supabaseUrl: string;
  supabaseAnonKey: string;
  brandName: string;
  theme: ThemeConfig;
  initialTab: string;
}

export default function POSClient({ supabaseUrl, supabaseAnonKey, brandName, theme, initialTab }: POSClientProps) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTabState] = useState<'order' | 'kitchen'>(initialTab === 'kitchen' ? 'kitchen' : 'order');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [confirmation, setConfirmation] = useState<{ orderNumber: number } | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const switchTab = useCallback(
    (t: 'order' | 'kitchen') => {
      setTabState(t);
      router.replace(`${pathname}?tab=${t}`, { scroll: false });
    },
    [router, pathname],
  );

  const getSupabaseClient = useCallback(async () => {
    const token = await getToken({ template: 'supabase' });
    if (!token) throw new Error('No auth token');
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
  }, [getToken, supabaseUrl, supabaseAnonKey]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setAuthReady(true);
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;

    getSupabaseClient()
      .then((client) => {
        if (cancelled) return null;
        return client.from('menu_items')
          .select('id, name, description, price, category, available')
          .order('name');
      })
      .then((result: any) => {
        if (cancelled || !result || result.error) return;
        setMenuItems(result.data ?? []);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [authReady, getSupabaseClient]);

  const handleAddToCart = useCallback((item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.id === item.id);
      if (existing) {
        return prev.map((ci) =>
          ci.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci,
        );
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  }, []);

  const handleUpdateQuantity = useCallback((itemId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((ci) => ci.id !== itemId));
      return;
    }
    setCart((prev) => prev.map((ci) => (ci.id === itemId ? { ...ci, quantity: qty } : ci)));
  }, []);

  const handleRemoveItem = useCallback((itemId: string) => {
    setCart((prev) => prev.filter((ci) => ci.id !== itemId));
  }, []);

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0) return;
    setCheckingOut(true);

    try {
      const client = await getSupabaseClient();
      const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

      const { data: order, error: orderError } = await client
        .from('orders')
        .insert({ status: 'pending', source: 'pos', total })
        .select('id, order_number')
        .single();

      if (orderError || !order) {
        console.error('[POSClient] Order insert failed:', orderError);
        setCheckingOut(false);
        return;
      }

      const orderItems = cart.map((item) => ({
        order_id: order.id,
        menu_item_id: item.id,
        quantity: item.quantity,
        price_at_order: item.price,
      }));

      const { error: itemsError } = await client.from('order_items').insert(orderItems);

      if (itemsError) {
        console.error('[POSClient] Order items insert failed:', itemsError);
        setCheckingOut(false);
        return;
      }

      setCart([]);
      setConfirmation({ orderNumber: order.order_number });
    } catch (e) {
      console.error('[POSClient] Checkout failed:', e);
    }

    setCheckingOut(false);
  }, [cart, getSupabaseClient]);

  if (!isLoaded || !authReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  if (confirmation && tab === 'order') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <div className="text-4xl mb-4" style={{ color: theme.primaryColor }}>✓</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Order Placed!</h1>
          <p className="text-gray-600">
            Order <span className="font-bold" style={{ color: theme.primaryColor }}>#{confirmation.orderNumber}</span> has been sent to the kitchen.
          </p>
          <button
            onClick={() => setConfirmation(null)}
            className="mt-6 px-6 py-2 rounded-lg text-white font-medium"
            style={{ backgroundColor: theme.primaryColor }}
          >
            New Order
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <header
        className="flex items-center justify-between px-4 py-3 text-white shadow-sm"
        style={{ backgroundColor: theme.secondaryColor }}
      >
        <h1 className="text-xl font-bold">{brandName} — POS</h1>
        {tab === 'order' && (
          <span className="text-sm opacity-80">{cart.length} item{cart.length !== 1 ? 's' : ''} in cart</span>
        )}
      </header>

      <div className="flex border-b border-gray-200 bg-white px-6">
        <button
          onClick={() => switchTab('order')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'order'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Order
        </button>
        <button
          onClick={() => switchTab('kitchen')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'kitchen'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Kitchen
        </button>
      </div>

      {tab === 'order' ? (
        <div className="flex flex-1 overflow-hidden">
          <MenuGrid menuItems={menuItems} onAddToCart={handleAddToCart} theme={theme} />
          <CartSidebar
            cartItems={cart}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onCheckout={handleCheckout}
            disabled={cart.length === 0 || checkingOut}
            theme={theme}
          />
        </div>
      ) : (
        <KitchenView supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} brandName={brandName} />
      )}
    </div>
  );
}
