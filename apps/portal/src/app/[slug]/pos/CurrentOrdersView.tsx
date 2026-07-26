'use client';

import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { usePOS } from './pos-context';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { MenuGrid, CartSidebar } from '@sat-sys/pos-ui';
import type { MenuItem, CartItem, ThemeConfig } from '@sat-sys/pos-ui';
import ReceiptView from './ReceiptView';
import PaymentModal from './PaymentModal';
import { deductInventorySupa } from './inventory-utils';
import { updateCustomerLoyaltySupa, searchCustomersSupa } from './customer-utils';
import { supa } from './supa-query';
import useOfflineSync from '@/hooks/useOfflineSync';
import { getCachedMenuItems, getCachedSettings } from '@/lib/offline-db';
import { useEvent, usePublish } from './use-event';
import { generateInvoiceNumber } from './invoice-utils';

interface OrderItem {
  menu_item_id: string;
  quantity: number;
  price_at_order: number;
  menu_items: { name: string };
}

interface Order {
  id: string;
  order_number: number;
  status: string;
  total: number;
  tax_amount?: number;
  service_charge_amount?: number;
  discount_amount?: number;
  discount_type?: string | null;
  discount_value?: number | null;
  notes?: string | null;
  created_at: string;
  order_type?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  pickup_time?: string | null;
  customer_id?: string | null;
  payment_status?: string | null;
  amount_paid?: number;
  amount_due?: number;
  order_items: OrderItem[];
}

interface TableRecord {
  id: string;
  table_number: string;
  status: string;
}

export interface ViewConfig {
  title: string;
  orderType: string | null;
  showCustomerFields: boolean;
  statusFilter?: string | null;
  hideNewOrder?: boolean;
  newOrderMode?: boolean;
  excludeStatus?: string[];
}

interface Props {
  slug: string;
  theme: ThemeConfig;
  brandName: string;
  viewConfig?: ViewConfig;
}

type OrderTypeOption = 'dine_in' | 'takeaway' | 'delivery' | 'drive_thru';

const ORDER_TYPE_LABELS: Record<OrderTypeOption, string> = {
  dine_in: 'Dine In',
  takeaway: 'Take Away',
  delivery: 'Delivery',
  drive_thru: 'Drive Thru',
};

const statusDisplay: Record<string, string> = {
  pending: 'Pending',
  in_kitchen: 'In Kitchen',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const statusColor: Record<string, string> = {
  pending: 'bg-blue-50 text-blue-700 border border-blue-200',
  in_kitchen: 'bg-amber-50 text-amber-700 border border-amber-200',
  ready: 'bg-green-50 text-green-700 border border-green-200',
  completed: 'bg-gray-50 text-gray-700 border border-gray-200',
  cancelled: 'bg-red-50 text-red-700 border border-red-200',
};

const SELECT_ORDER_FIELDS = 'id, order_number, status, total, tax_amount, service_charge_amount, discount_amount, discount_type, discount_value, notes, created_at, order_type, customer_name, customer_phone, pickup_time, customer_id, payment_status, amount_paid, amount_due, order_items (menu_item_id, quantity, price_at_order, menu_items (name))';

const ORDER_TYPE_BADGE: Record<string, string> = {
  dine_in: 'bg-purple-50 text-purple-700 border border-purple-200',
  takeaway: 'bg-blue-50 text-blue-700 border border-blue-200',
  delivery: 'bg-orange-50 text-orange-700 border border-orange-200',
  drive_thru: 'bg-teal-50 text-teal-700 border border-teal-200',
};

const ORDER_TYPE_DISPLAY: Record<string, string> = {
  dine_in: 'Dine In',
  takeaway: 'Take Away',
  delivery: 'Delivery',
  drive_thru: 'Drive Thru',
  third_party: '3rd Party',
};

function NumericKeypadInner({ value, onChange, onClear, onOperator, calcNewNumberRef }: { value: string; onChange: (v: string) => void; onClear: () => void; onOperator?: (op: '+' | '-', currentValue: string) => void; calcNewNumberRef?: React.MutableRefObject<{ newNumber: boolean }> }) {
  const press = (k: string) => {
    if (k === 'backspace') { onChange(value.slice(0, -1)); return; }
    if (k === 'clear') { onClear(); return; }
    if (k === '.' && value.includes('.')) return;
    if (k === '.' && value === '') { onChange('0.'); return; }
    if (k === '+') { onOperator?.('+', value); return; }
    if (k === '-') { onOperator?.('-', value); return; }
    if (calcNewNumberRef?.current.newNumber) { calcNewNumberRef.current.newNumber = false; onChange(k); }
    else onChange(value + k);
  };
  return (
    <div className="grid grid-cols-4 gap-1">
      {[['7','8','9','backspace'],['4','5','6','+'],['1','2','3','-'],['0','00','.','clear']].map((row, ri) => row.map((k) => (
        <button key={ri+k} onClick={() => press(k)}
          className={'min-h-[52px] xl:min-h-[56px] rounded-xl text-sm font-bold transition-all active:scale-95 select-none ' + (
            k === 'backspace' || k === 'clear' ? 'bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-600 border border-red-200' :
            k === '+' || k === '-' ? 'bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-600 border border-blue-200' :
            'bg-gray-50 hover:bg-gray-200 active:bg-gray-300 text-gray-800 border border-gray-200'
          )}
        >{k === 'backspace' ? '⌫' : k === 'clear' ? 'C' : k === '+' ? '+' : k === '-' ? '−' : k}</button>
      )))}
    </div>
  );
}
const NumericKeypad = memo(NumericKeypadInner);

export default function CurrentOrdersView({ slug, theme, brandName, viewConfig }: Props) {
  const router = useRouter();
  const cfg = useMemo(() => ({ title: 'Active Orders', orderType: null, showCustomerFields: false, ...viewConfig }), [viewConfig]);

  const { setPageTitle } = usePOS();
  useEffect(() => { setPageTitle(cfg.title); }, [setPageTitle, cfg.title]);

  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [authReady, setAuthReady] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [fetchError, setFetchError] = useState('');
  const [fetchLoading, setFetchLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const fetchingRef = useRef(false);
  const creatingOrderRef = useRef(false);

  // Customer fields (takeaway / delivery / drive_thru)
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [pickupASAP, setPickupASAP] = useState(true);
  const [pickupScheduledTime, setPickupScheduledTime] = useState('');

  // Order type selector (all-orders view only)
  const [selectedOrderType, setSelectedOrderType] = useState<OrderTypeOption>('dine_in');
  const [orderedTables, setOrderedTables] = useState<TableRecord[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  // Mobile panel navigation
  const [mobilePanel, setMobilePanel] = useState<'list' | 'detail' | 'new-order'>('list');

  // Print bill
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  // Payment
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const paymentOrderRef = useRef<Order | null>(null);
  paymentOrderRef.current = paymentOrder;
  // Edit order
  const [editingOrder, setEditingOrder] = useState(false);
  const [editCart, setEditCart] = useState<CartItem[]>([]);

  // Discount
  const [discount, setDiscount] = useState<{ type: 'percentage' | 'fixed'; value: number } | null>(null);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('');

  // Order notes
  const [orderNotes, setOrderNotes] = useState('');
  const [showNotesModal, setShowNotesModal] = useState(false);

  // Promo code
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState('');

  // Calculator
  const [showCalculator, setShowCalculator] = useState(false);
  const [keypadValue, setKeypadValue] = useState('');
  const [keypadDisplay, setKeypadDisplay] = useState('');
  const calcRef = useRef({ buffer: 0, op: null as '+' | '-' | null, newNumber: false });

  // Settings (tax, currency, footer)
  const [settings, setSettings] = useState<{ taxEnabled: boolean; taxRate: number; currencySymbol: string; footerText: string; serviceChargeEnabled: boolean; serviceChargeRate: number; serviceChargeDineIn: boolean; serviceChargeTakeaway: boolean; serviceChargeDelivery: boolean; serviceChargeDriveThru: boolean; taxServiceCharge: boolean } | null>(null);

  // Menu search
  const [menuSearch, setMenuSearch] = useState('');
  const [mostOrderedItems, setMostOrderedItems] = useState<MenuItem[]>([]);
  const [mostOrderedLoading, setMostOrderedLoading] = useState(false);

  // Customer linking for new orders
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string; phone: string | null } | null>(null);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  // Drive Thru vehicle fields
  const [vehicleType, setVehicleType] = useState('');
  const [vehiclePlateNumber, setVehiclePlateNumber] = useState('');

  const   isScoped = cfg.orderType !== null;
  const effectiveOrderType: string = cfg.orderType || selectedOrderType;

  const selectedOrder = useMemo(() => orders.find((o) => o.id === selectedId) ?? null, [orders, selectedId]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setAuthReady(true);
  }, [isLoaded, isSignedIn]);

  // Background sync — keeps IndexedDB up to date for offline use
  useOfflineSync(slug, authReady);

  // Fetch menu (with offline fallback to IndexedDB)
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    supa(slug, { table: 'menu_items', select: 'id, name, description, price, category, available', order: 'name', limit: 500 })
      .then(async (r) => {
        if (cancelled) return;
        if (r.ok) { setMenuItems(r.data ?? []); return; }
        if (!navigator.onLine) {
          const cached = await getCachedMenuItems(slug);
          if (!cancelled && cached.length > 0) setMenuItems(cached);
        }
      })
      .catch(async () => {
        if (!cancelled && !navigator.onLine) {
          const cached = await getCachedMenuItems(slug);
          if (cached.length > 0) setMenuItems(cached);
        }
      });
    return () => { cancelled = true; };
  }, [authReady, slug]);

  // Fetch tables (for dine_in table selector)
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    supa(slug, { table: 'tables', select: 'id, table_number, status', order: 'table_number' })
      .then((r) => { if (!cancelled && r.ok) setOrderedTables(r.data ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authReady, slug]);

  // Fetch settings (with offline fallback to IndexedDB)
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    supa(slug, { table: 'settings', select: 'tax_enabled, tax_rate, currency_symbol, receipt_footer_text, enabled_modules', limit: 1 })
      .then(async (r) => {
        if (cancelled) return;
        if (r.ok && r.data?.[0]) {
          const d = r.data[0];
          const rest = d.enabled_modules?.restaurant || {};
          setSettings({ taxEnabled: d.tax_enabled, taxRate: Number(d.tax_rate), currencySymbol: d.currency_symbol, footerText: d.receipt_footer_text, serviceChargeEnabled: !!rest.service_charge_enabled, serviceChargeRate: Number(rest.service_charge_rate) || 0, serviceChargeDineIn: rest.service_charge_dine_in !== false, serviceChargeTakeaway: !!rest.service_charge_takeaway, serviceChargeDelivery: !!rest.service_charge_delivery, serviceChargeDriveThru: !!rest.service_charge_drive_thru, taxServiceCharge: !!rest.tax_service_charge });
          return;
        }
        if (!navigator.onLine) {
          const cached = await getCachedSettings(slug);
          if (!cancelled && cached) { const cr = cached.enabled_modules?.restaurant || {}; setSettings({ taxEnabled: cached.tax_enabled, taxRate: Number(cached.tax_rate), currencySymbol: cached.currency_symbol, footerText: cached.receipt_footer_text, serviceChargeEnabled: !!cr.service_charge_enabled, serviceChargeRate: Number(cr.service_charge_rate) || 0, serviceChargeDineIn: cr.service_charge_dine_in !== false, serviceChargeTakeaway: !!cr.service_charge_takeaway, serviceChargeDelivery: !!cr.service_charge_delivery, serviceChargeDriveThru: !!cr.service_charge_drive_thru, taxServiceCharge: !!cr.tax_service_charge }); }
        }
      })
      .catch(async () => {
        if (!cancelled && !navigator.onLine) {
          const cached = await getCachedSettings(slug);
          if (cached) { const cr = cached.enabled_modules?.restaurant || {}; setSettings({ taxEnabled: cached.tax_enabled, taxRate: Number(cached.tax_rate), currencySymbol: cached.currency_symbol, footerText: cached.receipt_footer_text, serviceChargeEnabled: !!cr.service_charge_enabled, serviceChargeRate: Number(cr.service_charge_rate) || 0, serviceChargeDineIn: cr.service_charge_dine_in !== false, serviceChargeTakeaway: !!cr.service_charge_takeaway, serviceChargeDelivery: !!cr.service_charge_delivery, serviceChargeDriveThru: !!cr.service_charge_drive_thru, taxServiceCharge: !!cr.tax_service_charge }); }
        }
      });
    return () => { cancelled = true; };
  }, [authReady, slug]);

  // Fetch most ordered items (top 10 by total quantity sold)
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    setMostOrderedLoading(true);
    supa(slug, { table: 'order_items', select: 'menu_item_id, quantity, menu_items!inner(id, name, description, price, category, available)', limit: 5000 })
      .then((r) => {
        if (cancelled || !r.ok || !r.data) return;
        const grouped = new Map<string, { item: MenuItem; qty: number }>();
        for (const row of r.data) {
          const mi = (row.menu_items as any);
          if (mi?.available === false) continue;
          const key = mi.id;
          const prev = grouped.get(key) || { item: mi as unknown as MenuItem, qty: 0 };
          prev.qty += row.quantity;
          grouped.set(key, prev);
        }
        setMostOrderedItems(
          Array.from(grouped.values())
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 10)
            .map((entry) => ({ id: entry.item.id, name: entry.item.name, description: entry.item.description, price: entry.item.price, category: entry.item.category, available: entry.item.available }))
        );
      })
      .catch(() => {})
      .finally(() => setMostOrderedLoading(false));
    return () => { cancelled = true; };
  }, [authReady, slug]);

  const keypadValueRef = useRef(keypadValue);
  keypadValueRef.current = keypadValue;

  // Customer search debounce
  useEffect(() => {
    if (!authReady) return;
    const timer = setTimeout(async () => {
      if (!customerSearch.trim()) { setCustomerResults([]); return; }
      setCustomerSearchLoading(true);
      try {
        const results = await searchCustomersSupa(slug, customerSearch);
        setCustomerResults(results);
      } catch (e) {}
      setCustomerSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, authReady, slug]);

  // Fetch orders (initial load via supa)
  const fetchOrdersInitial = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setFetchLoading(true);
    setFetchError('');
    const opts: any = { table: 'orders', select: SELECT_ORDER_FIELDS, order: { column: 'created_at', ascending: false }, limit: 200 };
    if (cfg.statusFilter) {
      opts.eq = ['status', cfg.statusFilter];
    } else if (cfg.excludeStatus && cfg.excludeStatus.length > 0) {
      opts.notIn = ['status', cfg.excludeStatus];
    }
    const result = await supa(slug, opts);
    if (result.ok && result.data) {
      setOrders(result.data as unknown as Order[]);
    } else if (!result.ok) {
      console.error('[Orders] fetch error:', result.error);
      setFetchError(result.error || 'Failed to load orders');
    }
    setFetchLoading(false);
    fetchingRef.current = false;
  }, [slug, cfg.statusFilter, cfg.excludeStatus]);

  // Auto-refresh when events come in
  useEvent('orders', () => { fetchOrdersInitial(); });
  const publish = usePublish();

  useEffect(() => {
    if (!authReady) return;
    fetchOrdersInitial();
  }, [authReady, fetchOrdersInitial]);

  // Cart handlers
  const handleAddToCart = useCallback((item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.id === item.id);
      if (existing) return prev.map((ci) => (ci.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci));
      return [...prev, { id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  }, []);

  const handleUpdateQuantity = useCallback((itemId: string, qty: number) => {
    if (qty <= 0) { setCart((prev) => prev.filter((ci) => ci.id !== itemId)); return; }
    setCart((prev) => prev.map((ci) => (ci.id === itemId ? { ...ci, quantity: qty } : ci)));
  }, []);

  const handleRemoveItem = useCallback((itemId: string) => {
    setCart((prev) => prev.filter((ci) => ci.id !== itemId));
  }, []);

  // Reset customer fields
  const resetCustomerFields = useCallback(() => {
    setCustomerName('');
    setCustomerPhone('');
    setPickupASAP(true);
    setPickupScheduledTime('');
    setVehicleType('');
    setVehiclePlateNumber('');
  }, []);

  const currencySymbolVal = settings?.currencySymbol || 'Rs.';
  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);
  const isDineIn = effectiveOrderType === 'dine_in';
  const isTakeaway = effectiveOrderType === 'takeaway';
  const isDelivery = effectiveOrderType === 'delivery';
  const isDriveThru = effectiveOrderType === 'drive_thru';
  const serviceChargeRate = settings?.serviceChargeRate || 0;
  const scApplicable = settings?.serviceChargeEnabled && serviceChargeRate > 0 && (
    (isDineIn && settings?.serviceChargeDineIn) ||
    (isTakeaway && settings?.serviceChargeTakeaway) ||
    (isDelivery && settings?.serviceChargeDelivery) ||
    (isDriveThru && settings?.serviceChargeDriveThru)
  );
  const serviceChargeAmt = useMemo(() => scApplicable ? subtotal * (serviceChargeRate / 100) : 0, [scApplicable, subtotal, serviceChargeRate]);
  const taxableAmount = useMemo(() => settings?.taxServiceCharge ? subtotal + serviceChargeAmt : subtotal, [settings, subtotal, serviceChargeAmt]);
  const taxAmt = useMemo(() => (settings?.taxEnabled && settings.taxRate > 0) ? taxableAmount * (settings.taxRate / 100) : 0, [settings, taxableAmount]);
  const discountAmount = useMemo(() => {
    if (!discount) return 0;
    return discount.type === 'percentage' ? (subtotal + serviceChargeAmt + taxAmt) * (discount.value / 100) : discount.value;
  }, [discount, subtotal, serviceChargeAmt, taxAmt]);
  const grandTotal = useMemo(() => Math.max(0, subtotal + serviceChargeAmt + taxAmt - discountAmount), [subtotal, serviceChargeAmt, taxAmt, discountAmount]);

  const handleOperator = useCallback((op: '+' | '-', currentValue: string) => {
    const curr = parseFloat(currentValue) || 0;
    const c = calcRef.current;
    let result = curr;
    if (c.op === '+') result = c.buffer + curr;
    else if (c.op === '-') result = c.buffer - curr;
    if (c.op !== null) { const str = String(result); setKeypadValue(str); setKeypadDisplay(str); }
    c.buffer = result;
    c.op = op;
    c.newNumber = true;
  }, []);

  // Keyboard listener for calculator keypad
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!showCalculator) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      let k: string | null = null;
      if (e.key >= '0' && e.key <= '9') k = e.key;
      else if (e.key === '00') k = '00';
      else if (e.key === '.' || (e.key === 'Decimal' && e.code === 'NumpadDecimal')) k = '.';
      else if (e.key === 'Backspace') k = 'backspace';
      else if (e.key === 'Delete' || e.key === 'Escape') k = 'clear';
      else if (e.key === '+' || e.code === 'NumpadAdd') k = '+';
      else if (e.key === '-' || e.code === 'NumpadSubtract') k = '-';
      else if (e.code === 'Numpad0') k = '0';
      else if (e.code === 'Numpad1') k = '1';
      else if (e.code === 'Numpad2') k = '2';
      else if (e.code === 'Numpad3') k = '3';
      else if (e.code === 'Numpad4') k = '4';
      else if (e.code === 'Numpad5') k = '5';
      else if (e.code === 'Numpad6') k = '6';
      else if (e.code === 'Numpad7') k = '7';
      else if (e.code === 'Numpad8') k = '8';
      else if (e.code === 'Numpad9') k = '9';
      else if (e.key === 'Enter' || e.code === 'NumpadEnter') {
        const cur = parseFloat(keypadValueRef.current) || 0;
        const cc = calcRef.current;
        if (cc.op === '+') { const r = cc.buffer + cur; const s = String(r); setKeypadValue(s); setKeypadDisplay(s); }
        else if (cc.op === '-') { const r = cc.buffer - cur; const s = String(r); setKeypadValue(s); setKeypadDisplay(s); }
        else return;
        cc.buffer = 0; cc.op = null; cc.newNumber = true;
        return;
      }
      if (k === null) return;
      e.preventDefault();
      if (k === 'clear') { calcRef.current = { buffer: 0, op: null, newNumber: false }; setKeypadValue(''); setKeypadDisplay(''); return; }
      if (k === 'backspace') { setKeypadValue((prev) => prev.slice(0, -1)); setKeypadDisplay((prev) => prev.slice(0, -1)); return; }
      if (k === '+' && keypadValueRef.current) { handleOperator('+', keypadValueRef.current); return; }
      if (k === '-' && keypadValueRef.current) { handleOperator('-', keypadValueRef.current); return; }
      if (k === '.' && keypadValueRef.current.includes('.')) return;
      if (k === '.' && keypadValueRef.current === '') { setKeypadValue('0.'); setKeypadDisplay('0.'); return; }
      const c = calcRef.current;
      if (c.newNumber) { c.newNumber = false; setKeypadValue(k); setKeypadDisplay(k); }
      else { setKeypadValue((prev) => prev + k); setKeypadDisplay((prev) => prev + k); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showCalculator, handleOperator]);

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0 || creatingOrderRef.current) return;
    creatingOrderRef.current = true;
    setCheckingOut(true);
    try {
      const total = grandTotal;

      let pickupTime: string | null = null;
      if (!pickupASAP && pickupScheduledTime && effectiveOrderType === 'takeaway') {
        const [h, m] = pickupScheduledTime.split(':').map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        pickupTime = d.toISOString();
      }

      const shouldCaptureCustomer = isScoped
        ? cfg.showCustomerFields
        : effectiveOrderType !== 'dine_in';

      const orderPayload: Record<string, any> = { status: 'pending', source: 'pos', total, tax_amount: taxAmt, order_type: effectiveOrderType, customer_id: selectedCustomer?.id || null };
      if (shouldCaptureCustomer) {
        if (customerName) orderPayload.customer_name = customerName;
        if (customerPhone) orderPayload.customer_phone = customerPhone;
        if (effectiveOrderType === 'takeaway') orderPayload.pickup_time = pickupTime;
      }
      if (effectiveOrderType === 'dine_in' && selectedTableId) {
        orderPayload.table_id = selectedTableId;
      }
      const orderResult = await supa(slug, { table: 'orders', method: 'insert', select: 'id, order_number, created_at', single: true, body: orderPayload });
      if (!orderResult.ok || !orderResult.data) { console.error('[Checkout]', orderResult.error); setCheckingOut(false); return; }
      const order = orderResult.data;
      if (discountAmount || orderNotes) {
        supa(slug, { table: 'orders', method: 'update', eq: ['id', order.id], body: { discount_amount: discountAmount, discount_type: discount?.type || null, discount_value: discount?.value || null, notes: orderNotes || null } }).catch(() => {});
      }

      const items = cart.map((item) => ({ order_id: order.id, menu_item_id: item.id, quantity: item.quantity, price_at_order: item.price }));
      const [itemsResult] = await Promise.all([
        supa(slug, { table: 'order_items', method: 'insert', body: items }),
        effectiveOrderType === 'dine_in' && selectedTableId
          ? supa(slug, { table: 'tables', method: 'update', eq: ['id', selectedTableId], body: { status: 'occupied', current_order_id: order.id } })
          : Promise.resolve({ ok: true } as const),
      ]);
      if (!itemsResult.ok) { console.error('[Checkout items]', itemsResult.error); setCheckingOut(false); return; }
      if (effectiveOrderType === 'dine_in' && selectedTableId) {
        setOrderedTables((prev) => prev.map((t) => (t.id === selectedTableId ? { ...t, status: 'occupied' } : t)));
      }

      publish('orders', 'INSERT', { id: order.id, status: 'pending', order_type: effectiveOrderType });
      if (effectiveOrderType === 'dine_in' && selectedTableId) {
        publish('tables', 'UPDATE', { id: selectedTableId, status: 'occupied' });
      }

      const newOrder: Order = {
        id: order.id,
        order_number: order.order_number,
        status: 'pending',
        total,
        tax_amount: taxAmt,
        service_charge_amount: serviceChargeAmt,
        created_at: order.created_at,
        order_type: effectiveOrderType,
        customer_id: selectedCustomer?.id || null,
        customer_name: shouldCaptureCustomer ? (customerName || null) : undefined,
        customer_phone: shouldCaptureCustomer ? (customerPhone || null) : undefined,
        pickup_time: shouldCaptureCustomer && effectiveOrderType === 'takeaway' ? pickupTime : undefined,
        order_items: cart.map((item) => ({
          menu_item_id: item.id,
          quantity: item.quantity,
          price_at_order: item.price,
          menu_items: { name: item.name },
        })),
      };
      setOrders((prev) => [newOrder, ...prev]);
      setPaymentOrder(newOrder);
    } catch (e) { console.error('[Checkout]', e); }
    setCheckingOut(false);
    creatingOrderRef.current = false;
  }, [cart, grandTotal, taxAmt, discountAmount, discount, orderNotes, effectiveOrderType, isScoped, cfg.showCustomerFields, customerName, customerPhone, pickupASAP, pickupScheduledTime, selectedTableId, selectedCustomer, settings, slug, resetCustomerFields, cfg.newOrderMode, router]);

  const handlePaymentSuccess = useCallback((_result: any) => {
    const order = paymentOrderRef.current;
    if (order) {
      const invCart = (order.order_items || []).map((oi: OrderItem) => ({ id: oi.menu_item_id, quantity: oi.quantity }));
      deductInventorySupa(slug, invCart, order.id, user?.id).catch(e => console.error('[Inventory deduct]', e));
      generateInvoiceNumber(slug).then(invNum => {
        if (invNum) {
          supa(slug, { table: 'orders', method: 'update', eq: ['id', order.id], body: { invoice_number: invNum } }).catch(e => console.error('[Invoice num]', e));
        }
      }).catch(e => console.error('[Invoice num]', e));
    }
  }, [slug, user]);

  const handleQuickAddToOrder = useCallback(async (item: MenuItem) => {
    if (!selectedOrder || !selectedId || updating) return;
    setUpdating(selectedId);
    try {
      const currentItems = selectedOrder.order_items || [];
      const existing = currentItems.find((oi) => oi.menu_item_id === item.id);
      const newItems = existing
        ? currentItems.map((oi) => (oi.menu_item_id === item.id ? { menu_item_id: oi.menu_item_id, quantity: oi.quantity + 1, price_at_order: Number(oi.price_at_order) } : { menu_item_id: oi.menu_item_id, quantity: oi.quantity, price_at_order: Number(oi.price_at_order) }))
        : [...currentItems.map((oi) => ({ menu_item_id: oi.menu_item_id, quantity: oi.quantity, price_at_order: Number(oi.price_at_order) })), { menu_item_id: item.id, quantity: 1, price_at_order: item.price }];
      await supa(slug, { table: 'order_items', method: 'delete', eq: ['order_id', selectedId] });
      if (newItems.length > 0) {
        await supa(slug, { table: 'order_items', method: 'insert', body: newItems.map((ni) => ({ ...ni, order_id: selectedId })) });
      }
      const qs = newItems.reduce((s, ni) => s + ni.price_at_order * ni.quantity, 0);
      const ot = selectedOrder.order_type || effectiveOrderType;
      const scR = settings?.serviceChargeRate || 0;
      const scEn = settings?.serviceChargeEnabled;
      const isDin = ot === 'dine_in'; const isTA = ot === 'takeaway'; const isDL = ot === 'delivery'; const isDT = ot === 'drive_thru';
      const sc = scEn && scR > 0 && ((isDin && settings?.serviceChargeDineIn) || (isTA && settings?.serviceChargeTakeaway) || (isDL && settings?.serviceChargeDelivery) || (isDT && settings?.serviceChargeDriveThru)) ? qs * (scR / 100) : 0;
      const ta = settings?.taxServiceCharge ? qs + sc : qs;
      const tx = settings?.taxEnabled && (settings?.taxRate || 0) > 0 ? ta * ((settings?.taxRate || 0) / 100) : 0;
      const total = Math.max(0, qs + sc + tx);
      await supa(slug, { table: 'orders', method: 'update', eq: ['id', selectedId], body: { total, tax_amount: tx, service_charge_amount: sc, updated_at: new Date().toISOString() } });
      deductInventorySupa(slug, [{ id: item.id, quantity: 1 }], selectedId, user?.id).catch((e) => console.error('[QuickAdd inventory]', e));
      publish('orders', 'UPDATE', { id: selectedId });
      setOrders((prev) => prev.map((o) => (o.id === selectedId ? { ...o, total, tax_amount: tx, service_charge_amount: sc, order_items: newItems.map((ni) => ({ menu_item_id: ni.menu_item_id, quantity: ni.quantity, price_at_order: ni.price_at_order, menu_items: { name: (ni.menu_item_id === item.id ? item.name : (currentItems.find((ci) => ci.menu_item_id === ni.menu_item_id)?.menu_items?.name || 'Unknown')) } })) } : o)));
    } catch (e) { console.error('[QuickAdd]', e); }
    setUpdating(null);
  }, [selectedOrder, selectedId, updating, effectiveOrderType, settings, slug, user]);

  // Status update
  const updateStatus = useCallback(async (orderId: string, newStatus: string) => {
    setUpdating(orderId);
    try {
      const updateResult = await supa(slug, { table: 'orders', method: 'update', eq: ['id', orderId], body: { status: newStatus } });
      if (!updateResult.ok) { console.error('[Status]', updateResult.error); setUpdating(null); return; }
      publish('orders', 'UPDATE', { id: orderId, status: newStatus });

      if (newStatus === 'completed') {
        const orderResult = await supa(slug, { table: 'orders', select: 'customer_id, total', eq: ['id', orderId], single: true });
        if (orderResult.ok && orderResult.data?.customer_id) {
          await updateCustomerLoyaltySupa(slug, orderResult.data.customer_id, Number(orderResult.data.total));
        }
      }

      if (newStatus === 'completed' || newStatus === 'cancelled') {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
        setSelectedId((prev) => (prev === orderId ? null : prev));
      } else {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
      }
    } catch (e) { console.error('[Status]', e); }
    setUpdating(null);
  }, [slug]);

  const handleNewOrder = useCallback(() => {
    setCart([]);
    setSelectedId(null);
    setSelectedTableId(null);
    resetCustomerFields();
    setDiscount(null);
    setOrderNotes('');
    setKeypadValue('');
    setKeypadDisplay('');
    setShowCalculator(false);
    setPromoCode('');
    setPromoError('');
    calcRef.current = { buffer: 0, op: null, newNumber: false };
  }, [resetCustomerFields]);

  const handlePrintBill = useCallback((order: Order) => {
    setReceiptOrder(order);
  }, []);

  const handleStartEdit = useCallback(() => {
    if (!selectedOrder) return;
    setEditCart(
      selectedOrder.order_items.map((oi) => ({
        id: oi.menu_item_id,
        name: oi.menu_items?.name || 'Unknown',
        price: Number(oi.price_at_order),
        quantity: oi.quantity,
      }))
    );
    if (selectedOrder.discount_type && selectedOrder.discount_value) {
      setDiscount({ type: selectedOrder.discount_type as 'percentage' | 'fixed', value: Number(selectedOrder.discount_value) });
    } else {
      setDiscount(null);
    }
    setOrderNotes(selectedOrder.notes || '');
    setEditingOrder(true);
  }, [selectedOrder]);

  const handleEditAdd = useCallback((item: MenuItem) => {
    setEditCart((prev) => {
      const existing = prev.find((ci) => ci.id === item.id);
      if (existing) return prev.map((ci) => (ci.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci));
      return [...prev, { id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  }, []);

  const handleEditUpdateQty = useCallback((itemId: string, qty: number) => {
    if (qty <= 0) { setEditCart((prev) => prev.filter((ci) => ci.id !== itemId)); return; }
    setEditCart((prev) => prev.map((ci) => (ci.id === itemId ? { ...ci, quantity: qty } : ci)));
  }, []);

  const handleEditRemove = useCallback((itemId: string) => {
    setEditCart((prev) => prev.filter((ci) => ci.id !== itemId));
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedOrder || !selectedId) return;
    setUpdating(selectedId);
    try {
      const editSubtotal = editCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const orderTypeEdit = selectedOrder?.order_type || effectiveOrderType;
      const isDinIn = orderTypeEdit === 'dine_in';
      const isTakeaway = orderTypeEdit === 'takeaway';
      const isDelivery = orderTypeEdit === 'delivery';
      const isDriveThru = orderTypeEdit === 'drive_thru';
      let serviceCharge = 0;
      if (settings?.serviceChargeEnabled && settings.serviceChargeRate > 0) {
        if ((isDinIn && settings.serviceChargeDineIn) || (isTakeaway && settings.serviceChargeTakeaway) || (isDelivery && settings.serviceChargeDelivery) || (isDriveThru && settings.serviceChargeDriveThru)) {
          serviceCharge = editSubtotal * (settings.serviceChargeRate / 100);
        }
      }
      const taxableAmount = settings?.taxServiceCharge ? editSubtotal + serviceCharge : editSubtotal;
      let taxAmount = 0;
      if (settings?.taxEnabled && settings.taxRate > 0) {
        taxAmount = taxableAmount * (settings.taxRate / 100);
      }
      const editDiscountAmount = discount ? (discount.type === 'percentage' ? (editSubtotal + serviceCharge + taxAmount) * (discount.value / 100) : discount.value) : 0;
      const total = Math.max(0, editSubtotal + serviceCharge + taxAmount - editDiscountAmount);

      // Delete old order_items and insert new ones
      await supa(slug, { table: 'order_items', method: 'delete', eq: ['order_id', selectedId] });
      if (editCart.length > 0) {
        const items = editCart.map((item) => ({
          order_id: selectedId,
          menu_item_id: item.id,
          quantity: item.quantity,
          price_at_order: item.price,
        }));
        await supa(slug, { table: 'order_items', method: 'insert', body: items });
      }
      // Update order with all recalculated fields
      await supa(slug, {
        table: 'orders', method: 'update', eq: ['id', selectedId],
        body: {
          total, tax_amount: taxAmount, service_charge_amount: serviceCharge,
          discount_amount: editDiscountAmount || null,
          discount_type: discount?.type || null, discount_value: discount?.value || null,
          notes: orderNotes || null, updated_at: new Date().toISOString(),
        },
      });
      // Re-deduct inventory for the updated items
      deductInventorySupa(slug, editCart, selectedId, user?.id).catch(e => console.error('[Edit inventory]', e));

      publish('orders', 'UPDATE', { id: selectedId });

      setOrders((prev) =>
        prev.map((o) =>
          o.id === selectedId
            ? {
                ...o, total, tax_amount: taxAmount, service_charge_amount: serviceCharge,
                discount_amount: editDiscountAmount, discount_type: discount?.type || null,
                discount_value: discount?.value || null, notes: orderNotes || null,
                order_items: editCart.map((ci) => ({ menu_item_id: ci.id, quantity: ci.quantity, price_at_order: ci.price, menu_items: { name: ci.name } })),
              }
            : o
        )
      );
      setEditingOrder(false);
    } catch (e) { console.error('[Edit Order]', e); }
    setUpdating(null);
  }, [selectedOrder, selectedId, editCart, discount, orderNotes, settings, slug, effectiveOrderType, user]);

  const handleCancelEdit = useCallback(() => {
    setEditingOrder(false);
    setEditCart([]);
  }, []);

  const availableTables = useMemo(() => orderedTables.filter((t) => t.status === 'available'), [orderedTables]);

  if (!isLoaded || !authReady) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading...</p></div>;
  }

  // Mobile panel navigation
  const pc = (panel: 'list' | 'detail' | 'new-order', base: string) =>
    `${mobilePanel === panel ? 'flex' : 'hidden md:flex'} ${base}`;

  return (
    <><div className={`flex-1 ${cfg.newOrderMode ? 'flex flex-col overflow-hidden' : 'flex overflow-hidden min-w-0'}`}>
      {!cfg.newOrderMode && (<>
      {/* ── LEFT PANEL: Order list ── */}
      <div className={`${pc('list', 'w-full md:w-72 flex-shrink-0 bg-white border-r border-gray-200 flex-col overflow-hidden')}`}>
        <div className="flex items-center justify-end gap-1 px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-1">
            <button onClick={fetchOrdersInitial} disabled={fetchingRef.current} className="text-xs px-2 py-1.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50">↻</button>
            <button
              onClick={() => { handleNewOrder(); router.push(`/${slug}/pos/orders/new`); }}
              className="text-xs px-3 py-1.5 rounded text-white font-semibold"
              style={{ backgroundColor: theme.primaryColor }}
            >
              + New Order
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-3">
          {fetchLoading && (
            <div className="flex items-center justify-center pt-12">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            </div>
          )}
          {!fetchLoading && fetchError && (
            <div className="text-center pt-8 px-4">
              <p className="text-red-500 text-sm mb-2">{fetchError}</p>
              <button onClick={fetchOrdersInitial} className="px-3 py-1.5 text-xs rounded border border-red-300 text-red-600 hover:bg-red-50">Retry</button>
            </div>
          )}
          {!fetchLoading && !fetchError && orders.length === 0 && (
            <p className="text-gray-400 text-sm text-center pt-8">{cfg.statusFilter ? `No ${cfg.title.toLowerCase()}` : 'No active orders'}</p>
          )}
          {orders.map((order) => (
            <button
              key={order.id}
              onClick={() => { setSelectedId(order.id); setMobilePanel('detail'); }}
              className={`w-full text-left p-3 rounded-xl border transition-colors ${
                selectedId === order.id ? '' : 'hover:bg-gray-50'
              }`}
              style={selectedId === order.id ? { borderColor: theme.primaryColor, boxShadow: `0 0 0 2px ${theme.primaryColor}20` } : { borderColor: '#e5e7eb' }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm">#{order.order_number}</span>
                <div className="flex items-center gap-1">
                  {order.order_type && (
<span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${ORDER_TYPE_BADGE[order.order_type] || 'bg-gray-100 text-gray-600'}`}>
                        {ORDER_TYPE_DISPLAY[order.order_type] || order.order_type}
                    </span>
                  )}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${statusColor[order.status] || ''}`}>
                    {statusDisplay[order.status] || order.status}
                  </span>
                </div>
              </div>
              {order.customer_name ? (
                <div className="text-xs text-gray-500">
                  {order.customer_name}
                  {order.customer_phone ? ` · ${order.customer_phone}` : ''}
                </div>
              ) : (
                <div className="text-xs text-gray-500">
                  {new Date(order.created_at).toLocaleTimeString()}
                </div>
              )}
              <div className="flex text-xs text-gray-400">
                {order.pickup_time
                  ? `Pickup ${new Date(order.pickup_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · `
                  : order.order_type === 'takeaway' ? 'ASAP · ' : ''}
                {order.order_items?.length || 0} item{(order.order_items?.length || 0) !== 1 ? 's' : ''}
                <span className="ml-auto font-semibold text-gray-700">{settings?.currencySymbol}{Number(order.total).toFixed(2)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── CENTER PANEL: Order detail / placeholder + cart at bottom ── */}
      <div className={`${pc('detail', 'flex-1 bg-gray-50 flex-col overflow-hidden')}`}>
        {/* Mobile back button */}
        <button
          onClick={() => setMobilePanel('list')}
          className="md:hidden flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-gray-200"
        >
          ← Orders
        </button>
        {/* Top: order detail when selected, otherwise placeholder */}
        <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0">
          {selectedOrder ? (
            <div className="p-4 md:p-6 space-y-4">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">Order #{selectedOrder.order_number}</h2>
                  <p className="text-sm text-gray-500">
                    {new Date(selectedOrder.created_at).toLocaleString()}
                    {selectedOrder.customer_name ? ` · ${selectedOrder.customer_name}` : ''}
                    {selectedOrder.customer_phone ? ` · ${selectedOrder.customer_phone}` : ''}
                    {selectedOrder.pickup_time
                      ? ` · Pickup ${new Date(selectedOrder.pickup_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : selectedOrder.order_type === 'takeaway' ? ' · ASAP' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusColor[selectedOrder.status] || ''}`}>
                    {statusDisplay[selectedOrder.status] || selectedOrder.status}
                  </span>
                  <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>
              </div>

              {editingOrder ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Editing Order #{selectedOrder.order_number}</h3>
                    <div className="flex gap-2">
                      <button onClick={handleCancelEdit} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded">Cancel</button>
                      <button onClick={handleSaveEdit} disabled={updating === selectedOrder.id} className="px-3 py-1.5 text-xs font-semibold text-white rounded disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>
                        {updating === selectedOrder.id ? '...' : 'Save'}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {editCart.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No items in order.</p>}
                    {editCart.map((ci) => (
                      <div key={ci.id} className="flex items-center gap-2 p-1.5 rounded border border-gray-200">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{ci.name}</div>
                          <div className="text-xs text-gray-400">{settings?.currencySymbol}{ci.price.toFixed(2)} each</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleEditUpdateQty(ci.id, ci.quantity - 1)} className="w-7 h-7 rounded text-sm font-bold hover:bg-gray-100 flex items-center justify-center">−</button>
                          <span className="w-6 text-center text-sm">{ci.quantity}</span>
                          <button onClick={() => handleEditUpdateQty(ci.id, ci.quantity + 1)} className="w-7 h-7 rounded text-sm font-bold hover:bg-gray-100 flex items-center justify-center">+</button>
                        </div>
                        <button onClick={() => handleEditRemove(ci.id)} className="text-gray-400 hover:text-red-500 text-sm">✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="text-right text-sm font-bold">
                    Total: {settings?.currencySymbol}{editCart.reduce((s, ci) => s + ci.price * ci.quantity, 0).toFixed(2)}
                  </div>
                  {menuItems.length > 0 ? (
                    <MenuGrid menuItems={menuItems} onAddToCart={handleEditAdd} theme={theme} />
                  ) : (
                    <div className="flex items-center justify-center py-8"><p className="text-gray-400">Loading menu...</p></div>
                  )}
                </div>
              ) : (
                <>
                  <table className="w-full text-sm mb-6">
                    <thead>
                      <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-100">
                        <th className="text-left py-2 font-medium">Item</th>
                        <th className="text-right py-2 font-medium">Qty</th>
                        <th className="text-right py-2 font-medium">Price</th>
                        <th className="text-right py-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.order_items.map((item, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2">{item.menu_items?.name || 'Unknown'}</td>
                          <td className="text-right py-2">{item.quantity}</td>
                          <td className="text-right py-2">{settings?.currencySymbol}{Number(item.price_at_order).toFixed(2)}</td>
                          <td className="text-right py-2 font-medium">{settings?.currencySymbol}{(item.quantity * Number(item.price_at_order)).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold text-base">
                        <td colSpan={3} className="text-right py-2">Total</td>
                        <td className="text-right py-2">{settings?.currencySymbol}{Number(selectedOrder.total).toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>

                  <div className="flex flex-wrap gap-3">
                    {selectedOrder.status === 'pending' && (
                      <ActionButton label="Start Cooking" color="bg-blue-600 hover:bg-blue-700" disabled={updating === selectedOrder.id} onClick={() => updateStatus(selectedOrder.id, 'in_kitchen')} updating={updating === selectedOrder.id} />
                    )}
                    {selectedOrder.status === 'in_kitchen' && (
                      <ActionButton label="Mark Ready" color="bg-amber-600 hover:bg-amber-700" disabled={updating === selectedOrder.id} onClick={() => updateStatus(selectedOrder.id, 'ready')} updating={updating === selectedOrder.id} />
                    )}
                    {selectedOrder.status === 'ready' && (
                      <ActionButton label="Complete Order" color="bg-green-600 hover:bg-green-700" disabled={updating === selectedOrder.id} onClick={() => updateStatus(selectedOrder.id, 'completed')} updating={updating === selectedOrder.id} />
                    )}
                    {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                      <ActionButton label="Edit Order" color="bg-indigo-600 hover:bg-indigo-700" disabled={false} onClick={handleStartEdit} updating={false} />
                    )}
                    {selectedOrder.payment_status !== 'paid' ? (
                      <ActionButton label="Generate Invoice" color="bg-green-600 hover:bg-green-700" disabled={updating === selectedOrder.id} onClick={() => setPaymentOrder(selectedOrder)} updating={false} />
                    ) : (
                      <ActionButton label="Print Invoice" color="bg-gray-600 hover:bg-gray-700" disabled={false} onClick={() => handlePrintBill(selectedOrder)} updating={false} />
                    )}
                    {selectedOrder.status !== 'cancelled' && (
                      <ActionButton label="Cancel Order" color="bg-red-600 hover:bg-red-700" disabled={updating === selectedOrder.id} onClick={() => updateStatus(selectedOrder.id, 'cancelled')} updating={updating === selectedOrder.id} />
                    )}
                  </div>
                  {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                    <div className="border-t border-gray-100 pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Quick Add Items</h3>
                        {updating === selectedOrder.id && <span className="text-xs text-gray-400">Updating...</span>}
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {menuItems.length > 0 ? (
                          <MenuGrid menuItems={menuItems} onAddToCart={handleQuickAddToOrder} theme={theme} currencySymbol={settings?.currencySymbol} searchQuery={menuSearch} onSearchChange={setMenuSearch} mostOrderedItems={mostOrderedItems} />
                        ) : (
                          <div className="flex items-center justify-center py-8"><p className="text-gray-400">Loading menu...</p></div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center min-h-[200px]">
              <p className="text-gray-400 text-lg">Select an order from the list to view details</p>
            </div>
          )}
        </div>
        {/* Bottom: cart (always visible at bottom when items in cart) */}
        {cart.length > 0 && (
          <div className="border-t border-gray-200 bg-white flex flex-col flex-shrink-0 max-h-[45vh]">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Cart ({cart.reduce((s, i) => s + i.quantity, 0)})
              </span>
              <span className="text-sm font-bold">{settings?.currencySymbol || 'Rs.'}{cart.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)}</span>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-2 space-y-2 min-h-0">
              {cart.map((item) => (
                <div key={item.id} className="flex items-center gap-2 p-2 rounded border border-gray-200">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.name}</div>
                    <div className="text-xs text-gray-400">{settings?.currencySymbol || 'Rs.'}{item.price.toFixed(2)} each</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)} className="w-7 h-7 rounded text-sm font-bold hover:bg-gray-100 flex items-center justify-center">−</button>
                    <span className="w-6 text-center text-sm">{item.quantity}</span>
                    <button onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)} className="w-7 h-7 rounded text-sm font-bold hover:bg-gray-100 flex items-center justify-center">+</button>
                  </div>
                  <button onClick={() => handleRemoveItem(item.id)} className="text-gray-400 hover:text-red-500 text-sm">✕</button>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100">
              <button
                onClick={handleCheckout}
                disabled={cart.length === 0 || checkingOut}
                className="w-full py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: theme.primaryColor }}
              >
                {checkingOut ? 'Processing...' : `Place Order — ${settings?.currencySymbol || 'Rs.'}${cart.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)}`}
              </button>
            </div>
          </div>
        )}
      </div>
      </>)}{/* end left+center panels */}

      {/* ── RIGHT PANEL: New order builder ── */}
      {!cfg.hideNewOrder && (
      <div className={`${cfg.newOrderMode ? 'flex-1 flex flex-col overflow-hidden' : pc('new-order', 'w-full md:w-[480px] flex-shrink-0 bg-white border-l border-gray-200 flex-col overflow-hidden')}`}>
        {/* Mobile back button */}
        <button
          onClick={() => cfg.newOrderMode ? router.push(`/${slug}/pos/orders`) : setMobilePanel('list')}
          className="md:hidden flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-gray-200"
        >
          ← Back
        </button>
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{cfg.newOrderMode ? 'New Order' : `New ${cfg.title}`}</h3>
        </div>
        {cfg.newOrderMode ? (
          <div className="flex-1 flex flex-row overflow-hidden">
            {/* ── LEFT: Menu panel ── */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              {/* Order type selector (all-orders view only) */}
              {!isScoped && (
                <div className="flex px-4 border-b border-gray-200">
                  {(Object.keys(ORDER_TYPE_LABELS) as OrderTypeOption[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => { setSelectedOrderType(type); setSelectedTableId(null); resetCustomerFields(); }}
                      className={`flex-1 min-w-0 px-1 py-2 text-xs font-semibold transition-colors border-b-2 ${
                        selectedOrderType === type ? '' : 'border-transparent text-gray-400 hover:text-gray-600'
                      }`}
                      style={selectedOrderType === type ? { borderBottomColor: theme.primaryColor, color: theme.primaryColor } : {}}
                    >
                      {ORDER_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              )}
              {/* Compact fields bar */}
              {effectiveOrderType === 'dine_in' && (
                <div className="flex items-end gap-3 px-4 py-2 border-b border-gray-200">
                  <div className="w-56">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Table</label>
                    {availableTables.length > 0 ? (
                      <select
                        value={selectedTableId || ''}
                        onChange={(e) => setSelectedTableId(e.target.value || null)}
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                      >
                        <option value="">-- Select table --</option>
                        {availableTables.map((t) => (
                          <option key={t.id} value={t.id}>Table {t.table_number}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-gray-400">No available tables</p>
                    )}
                  </div>
                </div>
              )}
              {effectiveOrderType === 'takeaway' && (
                <div className="flex items-end gap-3 px-4 py-2 border-b border-gray-200">
                  <div className="flex-1 max-w-52">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Customer Name</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Walk-in"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="flex-1 max-w-44">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Phone</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(Optional)"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="flex-shrink-0">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Pickup</label>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-sm cursor-pointer">
                        <input type="radio" name="pickup" checked={pickupASAP} onChange={() => setPickupASAP(true)} />
                        ASAP
                      </label>
                      <label className="flex items-center gap-1 text-sm cursor-pointer">
                        <input type="radio" name="pickup" checked={!pickupASAP} onChange={() => setPickupASAP(false)} />
                        Schedule
                      </label>
                      {!pickupASAP && (
                        <input
                          type="time"
                          value={pickupScheduledTime}
                          onChange={(e) => setPickupScheduledTime(e.target.value)}
                          className="px-2 py-1 text-sm border border-gray-300 rounded w-24"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
              {effectiveOrderType === 'delivery' && (
                <div className="flex items-end gap-3 px-4 py-2 border-b border-gray-200">
                  <div className="flex-1 max-w-52">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Customer Name</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Walk-in"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="flex-1 max-w-44">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Phone</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(Optional)"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              )}
              {effectiveOrderType === 'drive_thru' && (
                <div className="flex items-end gap-3 px-4 py-2 border-b border-gray-200">
                  <div className="flex-1 max-w-44">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Customer Name</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Walk-in"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="w-36">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Phone</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(Optional)"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Vehicle</label>
                    <select
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value="">-- Select --</option>
                      <option value="Car">Car</option>
                      <option value="Motorcycle">Motorcycle</option>
                      <option value="Van">Van</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="w-36">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Plate</label>
                    <input
                      type="text"
                      value={vehiclePlateNumber}
                      onChange={(e) => setVehiclePlateNumber(e.target.value)}
                      placeholder="e.g. ABC-1234"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              )}
              {/* Customer linking */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Customer</span>
                {selectedCustomer ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">{selectedCustomer.name}</span>
                    {selectedCustomer.phone && <span className="text-xs text-gray-500">{selectedCustomer.phone}</span>}
                    <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); setCustomerResults([]); }} className="text-xs text-red-500 hover:text-red-700 ml-1">Remove</button>
                  </div>
                ) : (
                  <div className="relative flex-1 max-w-xs">
                    <input
                      id="customer-search-input"
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Search by name or phone..."
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                    {customerSearchLoading && <p className="text-xs text-gray-400 mt-0.5">Searching...</p>}
                    {customerResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto">
                        {customerResults.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => { setSelectedCustomer(r); setCustomerSearch(''); setCustomerResults([]); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                          >
                            <span className="font-medium text-gray-800">{r.name}</span>
                            {r.phone && <span className="text-gray-400 ml-2">{r.phone}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {!selectedCustomer && customerName.trim() && (
                  <button
                    onClick={async () => {
                      try {
                        const result = await supa(slug, { table: 'customers', select: 'id', filter: { name: customerName }, limit: 1 });
                        let custId: string;
                        if (result.ok && result.data?.length > 0) {
                          custId = result.data[0].id;
                        } else {
                          const insertResult = await supa(slug, { table: 'customers', method: 'insert', select: 'id', single: true, body: { name: customerName, phone: customerPhone || null, status: 'active' } });
                          if (!insertResult.ok || !insertResult.data) return;
                          custId = insertResult.data.id;
                        }
                        setSelectedCustomer({ id: custId, name: customerName, phone: customerPhone || null });
                      } catch (e) { console.error('Save customer error', e); }
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                  >
                    + Save &ldquo;{customerName}&rdquo;
                  </button>
                )}
              </div>
              {/* Menu grid */}
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                {menuItems.length > 0 ? (
                  <MenuGrid menuItems={menuItems} onAddToCart={handleAddToCart} theme={theme} currencySymbol={settings?.currencySymbol} searchQuery={menuSearch} onSearchChange={setMenuSearch} mostOrderedItems={mostOrderedItems} />
                ) : (
                  <div className="flex-1 flex items-center justify-center min-h-[300px]"><p className="text-gray-400">Loading menu...</p></div>
                )}
              </div>
            </div>
            {/* ── RIGHT: Cart panel ── */}
            <div className="w-[380px] flex-shrink-0 flex flex-col border-l border-gray-200 bg-white">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <span className="text-sm font-semibold text-gray-700">Cart ({cart.reduce((s, i) => s + i.quantity, 0)})</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowCalculator(!showCalculator)} className="text-[10px] px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 font-medium">{showCalculator ? 'Hide Calc' : 'Calc'}</button>
                  <span className="text-sm font-bold">{currencySymbolVal}{subtotal.toFixed(2)}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-3 space-y-2">
                {cart.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center pt-8">Cart is empty</p>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 p-2 rounded border border-gray-200">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{item.name}</div>
                        <div className="text-xs text-gray-400">{currencySymbolVal}{item.price.toFixed(2)} each</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)} className="w-7 h-7 rounded text-sm font-bold hover:bg-gray-100 flex items-center justify-center">−</button>
                        <span className="w-6 text-center text-sm">{item.quantity}</span>
                        <button onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)} className="w-7 h-7 rounded text-sm font-bold hover:bg-gray-100 flex items-center justify-center">+</button>
                      </div>
                      <button onClick={() => handleRemoveItem(item.id)} className="text-gray-400 hover:text-red-500 text-sm">✕</button>
                    </div>
                  ))
                )}
              </div>
              {showCalculator && (
                <div className="px-4 pb-2 border-t border-gray-200 pt-2">
                  {keypadValue && <div className="text-right text-sm font-bold text-gray-800 mb-1">{currencySymbolVal}{(parseFloat(keypadValue) || 0).toFixed(2)}</div>}
                  <NumericKeypad value={keypadValue} onChange={(v) => { setKeypadValue(v); setKeypadDisplay(v); }} onClear={() => { calcRef.current = { buffer: 0, op: null, newNumber: false }; setKeypadValue(''); setKeypadDisplay(''); }} onOperator={handleOperator} calcNewNumberRef={calcRef} />
                </div>
              )}
              {cart.length > 0 && (
                <div className="px-4 pb-2 border-t border-gray-200 pt-2 space-y-1 text-xs">
                  <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{currencySymbolVal}{subtotal.toFixed(2)}</span></div>
                  {serviceChargeAmt > 0 && <div className="flex justify-between text-gray-500"><span>Service Charge ({(settings?.serviceChargeRate || 0).toFixed(0)}%)</span><span>{currencySymbolVal}{serviceChargeAmt.toFixed(2)}</span></div>}
                  {taxAmt > 0 && <div className="flex justify-between text-gray-500"><span>Tax ({(settings?.taxRate || 0).toFixed(0)}%)</span><span>{currencySymbolVal}{taxAmt.toFixed(2)}</span></div>}
                  {discount && <div className="flex justify-between text-green-600"><span>Discount ({discount.type === 'percentage' ? discount.value + '%' : currencySymbolVal + discount.value})</span><span>-{currencySymbolVal}{discountAmount.toFixed(2)}</span></div>}
                  <div className="flex justify-between font-extrabold text-gray-900 border-t border-gray-200 pt-1.5 text-sm"><span>Total</span><span>{currencySymbolVal}{grandTotal.toFixed(2)}</span></div>
                </div>
              )}
              {cart.length > 0 && (
                <div className="px-4 pb-2 flex gap-2">
                  <button onClick={() => setShowNotesModal(true)} className="flex-1 text-[10px] px-2 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium">{orderNotes ? 'Edit Note' : 'Note'}</button>
                  <button onClick={() => setShowDiscountModal(true)} className="flex-1 text-[10px] px-2 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium">{discount ? `Disc (${discount.type === 'percentage' ? discount.value + '%' : currencySymbolVal + discount.value})` : 'Discount'}</button>
                  <button onClick={() => setShowPromoModal(true)} className="flex-1 text-[10px] px-2 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium">Promo</button>
                  <button onClick={() => document.getElementById('customer-search-input')?.focus()} className="flex-1 text-[10px] px-2 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium">{selectedCustomer ? selectedCustomer.name : 'Customer'}</button>
                </div>
              )}
              <div className="px-4 py-3 border-t border-gray-200">
                <button
                  onClick={handleCheckout}
                  disabled={cart.length === 0 || checkingOut}
                  className="w-full py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  {checkingOut ? 'Processing...' : `Place Order — ${currencySymbolVal}${grandTotal.toFixed(2)}`}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Order type selector (all-orders view only) */}
            {!isScoped && (
              <div className="flex px-4 border-b border-gray-200">
                {(Object.keys(ORDER_TYPE_LABELS) as OrderTypeOption[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => { setSelectedOrderType(type); setSelectedTableId(null); resetCustomerFields(); }}
                    className={`flex-1 min-w-0 px-1 py-2 text-xs font-semibold transition-colors border-b-2 ${
                      selectedOrderType === type ? '' : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                    style={selectedOrderType === type ? { borderBottomColor: theme.primaryColor, color: theme.primaryColor } : {}}
                  >
                    {ORDER_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            )}
            {/* Dine In: table selector */}
            {effectiveOrderType === 'dine_in' && (
              <div className="px-4 py-3 border-b border-gray-200">
                <label className="block text-xs font-medium text-gray-600 mb-1">Table</label>
                {availableTables.length > 0 ? (
                  <select
                    value={selectedTableId || ''}
                    onChange={(e) => setSelectedTableId(e.target.value || null)}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                  >
                    <option value="">-- Select table --</option>
                    {availableTables.map((t) => (
                      <option key={t.id} value={t.id}>Table {t.table_number}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-gray-400">No available tables</p>
                )}
              </div>
            )}
            {/* Take Away: customer fields + pickup time */}
            {effectiveOrderType === 'takeaway' && (
              <div className="px-4 py-3 border-b border-gray-200 space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Walk-in"
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="(Optional)"
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Pickup Time</label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-sm">
                      <input type="radio" name="pickup" checked={pickupASAP} onChange={() => setPickupASAP(true)} />
                      ASAP
                    </label>
                    <label className="flex items-center gap-1.5 text-sm">
                      <input type="radio" name="pickup" checked={!pickupASAP} onChange={() => setPickupASAP(false)} />
                      Schedule
                    </label>
                    {!pickupASAP && (
                      <input
                        type="time"
                        value={pickupScheduledTime}
                        onChange={(e) => setPickupScheduledTime(e.target.value)}
                        className="px-2 py-1 text-sm border border-gray-300 rounded w-28"
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
            {/* Delivery: customer name + phone only */}
            {effectiveOrderType === 'delivery' && (
              <div className="px-4 py-3 border-b border-gray-200 space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Walk-in"
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="(Optional)"
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            )}
            {/* Drive Thru: customer name + phone + vehicle details */}
            {effectiveOrderType === 'drive_thru' && (
              <div className="px-4 py-3 border-b border-gray-200 space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Walk-in"
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="(Optional)"
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Vehicle Type</label>
                  <select
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                  >
                    <option value="">-- Select --</option>
                    <option value="Car">Car</option>
                    <option value="Motorcycle">Motorcycle</option>
                    <option value="Van">Van</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Plate Number</label>
                  <input
                    type="text"
                    value={vehiclePlateNumber}
                    onChange={(e) => setVehiclePlateNumber(e.target.value)}
                    placeholder="e.g. ABC-1234"
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            )}
            {/* Customer linking */}
            <div className="px-4 py-3 border-b border-gray-200">
              {selectedCustomer ? (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-gray-400">Customer</span>
                    <p className="text-sm font-medium text-gray-800">{selectedCustomer.name}</p>
                    {selectedCustomer.phone && <p className="text-xs text-gray-500">{selectedCustomer.phone}</p>}
                  </div>
                  <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); setCustomerResults([]); }} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                </div>
              ) : (
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Link Customer (optional)</label>
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search by name or phone..."
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                  {customerSearchLoading && <p className="text-xs text-gray-400 mt-1">Searching...</p>}
                  {customerResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto">
                      {customerResults.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => { setSelectedCustomer(r); setCustomerSearch(''); setCustomerResults([]); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                        >
                          <span className="font-medium text-gray-800">{r.name}</span>
                          {r.phone && <span className="text-gray-400 ml-2">{r.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* Save as customer suggestion for walk-in name/phone */}
              {!selectedCustomer && customerName.trim() && (
                <button
                  onClick={async () => {
                    try {
                      const result = await supa(slug, { table: 'customers', select: 'id', filter: { name: customerName }, limit: 1 });
                      let custId: string;
                      if (result.ok && result.data?.length > 0) {
                        custId = result.data[0].id;
                      } else {
                        const insertResult = await supa(slug, { table: 'customers', method: 'insert', select: 'id', single: true, body: { name: customerName, phone: customerPhone || null, status: 'active' } });
                        if (!insertResult.ok || !insertResult.data) return;
                        custId = insertResult.data.id;
                      }
                      setSelectedCustomer({ id: custId, name: customerName, phone: customerPhone || null });
                    } catch (e) { console.error('Save customer error', e); }
                  }}
                  className="w-full mt-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium text-left"
                >
                  + Save &ldquo;{customerName}&rdquo; as customer
                </button>
              )}
            </div>
            {menuItems.length > 0 ? (
              <MenuGrid menuItems={menuItems} onAddToCart={handleAddToCart} theme={theme} currencySymbol={settings?.currencySymbol} searchQuery={menuSearch} onSearchChange={setMenuSearch} mostOrderedItems={mostOrderedItems} />
            ) : (
              <div className="flex-1 flex items-center justify-center"><p className="text-gray-400">Loading menu...</p></div>
            )}
          </div>
        )}
      </div>
      )}
    </div>
    {/* Notes Modal */}
    {showNotesModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNotesModal(false)}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">Order Notes</h2>
            <button onClick={() => setShowNotesModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
          <textarea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder="Kitchen instructions, special requests..." className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg resize-none h-28" autoFocus />
          <button onClick={() => setShowNotesModal(false)} className="w-full mt-3 py-2.5 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: theme.primaryColor }}>Save</button>
        </div>
      </div>
    )}

    {/* Discount Modal */}
    {showDiscountModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDiscountModal(false)}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-gray-800">Add Discount</h2><button onClick={() => setShowDiscountModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button></div>
          <div className="space-y-4">
            <div className="flex gap-2">
              <button onClick={() => setDiscountType('percentage')} className={'flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ' + (discountType === 'percentage' ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>%</button>
              <button onClick={() => setDiscountType('fixed')} className={'flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ' + (discountType === 'fixed' ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>Fixed</button>
            </div>
            <input type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder={discountType === 'percentage' ? 'Enter percentage...' : 'Enter amount...'} className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg" min="0" step="0.01" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => setShowDiscountModal(false)} className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
              {discount && <button onClick={() => { setDiscount(null); setShowDiscountModal(false); }} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50">Remove</button>}
              <button onClick={() => { const v = parseFloat(discountValue); if (v > 0) { setDiscount({ type: discountType, value: v }); } else { setDiscount(null); } setShowDiscountModal(false); }} className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: theme.primaryColor }}>{discount ? 'Update' : 'Apply'}</button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Promo Code Modal */}
    {showPromoModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowPromoModal(false)}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">Promo Code</h2>
            <button onClick={() => setShowPromoModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
          <div className="space-y-3">
            <input type="text" value={promoCode} onChange={(e) => { setPromoCode(e.target.value); setPromoError(''); }} placeholder="Enter promo code..." className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg uppercase" autoFocus />
            {promoError && <p className="text-xs text-red-600">{promoError}</p>}
            <button onClick={async () => {
              if (!promoCode.trim()) { setPromoError('Enter a promo code'); return; }
              const r = await supa(slug, { table: 'settings', select: 'promo_codes', limit: 1 }).catch(() => null);
              const codes = r?.ok && r.data?.[0]?.promo_codes ? r.data[0].promo_codes : null;
              if (codes?.[promoCode.trim().toUpperCase()]) {
                const p = codes[promoCode.trim().toUpperCase()];
                setDiscount({ type: p.type || 'percentage', value: p.value });
                setShowPromoModal(false); setPromoCode(''); setPromoError('');
              } else {
                setPromoError('Invalid or expired promo code');
              }
            }} className="w-full py-2.5 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: theme.primaryColor }}>Apply</button>
          </div>
        </div>
      </div>
    )}

    {paymentOrder && !receiptOrder && (
      <PaymentModal
        slug={slug}
        theme={theme}
        currencySymbol={settings?.currencySymbol || 'Rs.'}
        orderId={paymentOrder.id}
        orderNumber={paymentOrder.order_number}
        orderTotal={Number(paymentOrder.total)}
        amountPaid={0}
        amountDue={Number(paymentOrder.total)}
        customerId={paymentOrder.customer_id}
        customerName={paymentOrder.customer_name}
        customerPhone={paymentOrder.customer_phone}
        orderType={paymentOrder.order_type}
        items={(paymentOrder.order_items || []).map((oi) => ({
          name: oi.menu_items?.name || 'Unknown',
          quantity: oi.quantity,
          price: Number(oi.price_at_order),
        }))}
        taxAmount={Number(paymentOrder.tax_amount ?? 0)}
        serviceChargeAmount={Number(paymentOrder.service_charge_amount ?? 0)}
        brandName={brandName}
        onClose={() => {
          setPaymentOrder(null);
          setCart([]);
          setSelectedTableId(null);
          setSelectedCustomer(null);
          setCustomerSearch('');
          setCustomerResults([]);
          resetCustomerFields();
          setDiscount(null);
          setOrderNotes('');
          setKeypadValue('');
          setKeypadDisplay('');
          setShowCalculator(false);
          setPromoCode('');
          setPromoError('');
          calcRef.current = { buffer: 0, op: null, newNumber: false };
          if (cfg.newOrderMode) router.push(`/${slug}/pos/orders`);
          fetchOrdersInitial();
        }}
        onSuccess={handlePaymentSuccess}
      />
    )}
    {receiptOrder && (
      <ReceiptView
        data={{
          orderNumber: receiptOrder.order_number,
          status: receiptOrder.status,
          total: Number(receiptOrder.total),
          taxAmount: Number(receiptOrder.tax_amount ?? 0),
          serviceChargeAmount: Number(receiptOrder.service_charge_amount ?? 0),
          createdAt: receiptOrder.created_at,
          orderType: receiptOrder.order_type,
          customerName: receiptOrder.customer_name,
          customerPhone: receiptOrder.customer_phone,
          pickupTime: receiptOrder.pickup_time,
          tableNumber: null,
          items: receiptOrder.order_items.map((oi) => ({
            name: oi.menu_items?.name || 'Unknown',
            quantity: oi.quantity,
            price: Number(oi.price_at_order),
          })),
        }}
        brandName={brandName}
        theme={theme}
        footerText={settings?.footerText}
        currencySymbol={settings?.currencySymbol}
        onClose={() => setReceiptOrder(null)}
      />
    )}
    </>
  );
}

const ActionButton = memo(function ActionButton({ label, color, disabled, onClick, updating }: { label: string; color: string; disabled: boolean; onClick: () => void; updating: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-lg text-white text-sm font-semibold ${color} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {updating ? '...' : label}
    </button>
  );
});
