'use client';

import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { supa } from './supa-query';
import { usePOS } from './pos-context';
import { deductInventorySupa } from './inventory-utils';
import { searchCustomersSupa } from './customer-utils';
import { processPayments, type PaymentInput } from './payment-actions';
import ReceiptView from './ReceiptView';
import PaymentMethodLogo from './PaymentMethodLogo';
import { usePublish } from './use-event';

interface MenuItem { id: string; name: string; description?: string; price: number; category?: string; available?: boolean; }
interface CartItem { id: string; name: string; price: number; quantity: number; uid: string; image?: string; notes?: string; }
interface TableRecord { id: string; table_number: string; status: string; }
interface Customer { id: string; name: string; phone: string | null; total_orders?: number; total_spent?: number; loyalty_points?: number; credit_balance?: number; }
interface Account { id: string; name: string; account_type: string; payment_method: string; current_balance: number; }
type OrderTypeOption = 'dine_in' | 'takeaway' | 'delivery' | 'drive_thru' | 'third_party';
type PaymentViewType = 'selection' | 'input';

interface Props { slug: string; theme: ThemeConfig; brandName: string; }

const ORDER_TYPE_LABELS: Record<OrderTypeOption, string> = { dine_in: 'Dine In', takeaway: 'Take Away', delivery: 'Delivery', drive_thru: 'Drive Thru', third_party: '3rd Party' };
const METHOD_LABELS: Record<string, string> = { cash: 'Cash', jazzcash: 'JazzCash', easypaisa: 'Easypaisa', bank_transfer: 'Bank Transfer', card: 'Card', credit: 'Credit' };

function genId() { return Math.random().toString(36).slice(2, 9); }

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

function MenuCard({ item, onAdd, isPopular }: { item: MenuItem; onAdd: (item: MenuItem) => void; isPopular?: boolean }) {
  const isAvailable = item.available !== false;
  return (
    <button onClick={() => isAvailable && onAdd(item)} disabled={!isAvailable}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-amber-300 transition-all text-left w-full disabled:opacity-50 disabled:cursor-not-allowed flex flex-col group"
    >
      <div className="aspect-[4/3] bg-gray-100 relative overflow-hidden">
        <div className="w-full h-full flex items-center justify-center text-gray-300 text-3xl">&#x1F372;</div>
        {!isAvailable && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><span className="bg-white text-gray-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase">Out of Stock</span></div>}
        {isPopular && <div className="absolute top-1.5 left-1.5 bg-amber-500 text-white text-[8px] px-1.5 py-0.5 rounded font-bold uppercase shadow">Popular</div>}
      </div>
      <div className="p-2.5 flex-1 flex flex-col justify-between gap-1">
        <div className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">{item.name}</div>
        <div className="flex items-center justify-between mt-auto"><span className="text-sm font-bold" style={{ color: '#C9972B' }}>Rs. {Number(item.price).toFixed(0)}</span></div>
      </div>
    </button>
  );
}

function CompactMenuItem({ item, onAdd }: { item: MenuItem; onAdd: (item: MenuItem) => void }) {
  const isAvailable = item.available !== false;
  return (
    <button onClick={() => isAvailable && onAdd(item)} disabled={!isAvailable}
      className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 flex items-center gap-3 disabled:opacity-40 transition-colors"
    >
      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{item.name}</span>
      <span className="text-xs text-gray-400">{item.category}</span>
      <span className="text-sm font-bold shrink-0" style={{ color: '#C9972B' }}>Rs. {Number(item.price).toFixed(0)}</span>
    </button>
  );
}

export default function NewOrderView({ slug, theme, brandName }: Props) {
  const publish = usePublish();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [authReady, setAuthReady] = useState(false);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [settings, setSettings] = useState<{ taxEnabled: boolean; taxRate: number; currencySymbol: string; footerText: string; serviceChargeEnabled: boolean; serviceChargeRate: number; serviceChargeDineIn: boolean; serviceChargeTakeaway: boolean; serviceChargeDelivery: boolean; serviceChargeDriveThru: boolean; taxServiceCharge: boolean } | null>(null);
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<OrderTypeOption>('dine_in');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  const [menuSearch, setMenuSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('grid');
  const [mostOrderedItems, setMostOrderedItems] = useState<MenuItem[]>([]);
  const [mostOrderedLoading, setMostOrderedLoading] = useState(false);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  const [discount, setDiscount] = useState<{ type: 'percentage' | 'fixed'; value: number } | null>(null);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('');

  const [checkingOut, setCheckingOut] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [currentOrderNumber, setCurrentOrderNumber] = useState<number>(0);

  const [paymentView, setPaymentView] = useState<PaymentViewType>('selection');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [keypadValue, setKeypadValue] = useState('');
  const [keypadDisplay, setKeypadDisplay] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState('');
  const [showCalculator, setShowCalculator] = useState(false);
  const [orderError, setOrderError] = useState('');

  const searchRef = useRef<HTMLInputElement>(null);
  const creatingOrderRef = useRef(false);
  const currencySymbol = settings?.currencySymbol || 'Rs.';
  const calcRef = useRef({ buffer: 0, op: null as '+' | '-' | null, newNumber: false });
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

  const { setPageTitle } = usePOS();
  useEffect(() => { setPageTitle('New Order'); }, [setPageTitle]);

  useEffect(() => { if (isLoaded && isSignedIn) setAuthReady(true); }, [isLoaded, isSignedIn]);
  useEffect(() => { if (!authReady) return; let c = false; supa(slug, { table: 'menu_items', select: 'id, name, description, price, category, available', order: 'name', limit: 500 }).then((r) => { if (!c && r.ok) { setMenuItems(r.data ?? []); } else if (!c && !r.ok) { console.error('[NewOrder] menu fetch error:', r.error); } }).catch((e) => { console.error('[NewOrder] menu fetch exception:', e); }); return () => { c = true; }; }, [authReady, slug]);
  useEffect(() => { if (!authReady) return; let c = false; supa(slug, { table: 'tables', select: 'id, table_number, status', order: 'table_number' }).then((r) => { if (!c && r.ok) setTables(r.data ?? []); }).catch(() => {}); return () => { c = true; }; }, [authReady, slug]);
  useEffect(() => { if (!authReady) return; let c = false; supa(slug, { table: 'settings', select: 'tax_enabled, tax_rate, currency_symbol, receipt_footer_text, enabled_modules', limit: 1 }).then((r) => { if (!c && r.ok && r.data?.[0]) { const d = r.data[0]; const rest = d.enabled_modules?.restaurant || {}; setSettings({ taxEnabled: d.tax_enabled, taxRate: Number(d.tax_rate), currencySymbol: d.currency_symbol, footerText: d.receipt_footer_text, serviceChargeEnabled: !!rest.service_charge_enabled, serviceChargeRate: Number(rest.service_charge_rate) || 0, serviceChargeDineIn: rest.service_charge_dine_in !== false, serviceChargeTakeaway: !!rest.service_charge_takeaway, serviceChargeDelivery: !!rest.service_charge_delivery, serviceChargeDriveThru: !!rest.service_charge_drive_thru, taxServiceCharge: !!rest.tax_service_charge }); } }).catch(() => {}); return () => { c = true; }; }, [authReady, slug]);

  useEffect(() => { if (!authReady) return; let c = false; setMostOrderedLoading(true); supa(slug, { table: 'order_items', select: 'menu_item_id, quantity, menu_items!inner(id, name, description, price, category, available)', limit: 5000 }).then((r) => { if (c || !r.ok || !r.data) return; const grouped = new Map<string, { item: MenuItem; qty: number }>(); for (const row of r.data) { const mi = (row.menu_items as any); if (mi?.available === false) continue; const key = mi.id; const prev = grouped.get(key) || { item: mi as unknown as MenuItem, qty: 0 }; prev.qty += row.quantity; grouped.set(key, prev); } setMostOrderedItems(Array.from(grouped.values()).sort((a, b) => b.qty - a.qty).slice(0, 10).map((e) => e.item)); }).catch(() => {}).finally(() => setMostOrderedLoading(false)); return () => { c = true; }; }, [authReady, slug]);

  useEffect(() => { if (!authReady || !showCustomerModal) return; const t = setTimeout(async () => { if (!customerSearch.trim()) { setCustomerResults([]); return; } setCustomerSearchLoading(true); try { const results = await searchCustomersSupa(slug, customerSearch); setCustomerResults(results); } catch {} setCustomerSearchLoading(false); }, 300); return () => clearTimeout(t); }, [customerSearch, authReady, slug, showCustomerModal]);

  // Load accounts on mount (needed for payment)
  useEffect(() => { if (!authReady) return; const load = async () => { setLoadingAccounts(true); const r = await supa(slug, { table: 'accounts', select: 'id,name,account_type,payment_method,current_balance', eq: ['is_active', true], order: 'name' }); if (r.ok && r.data) setAccounts(r.data as Account[]); setLoadingAccounts(false); }; load(); }, [authReady, slug]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
        const cur = parseFloat(keypadValue) || 0;
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
      if (k === '+' && keypadValue) { handleOperator('+', keypadValue); return; }
      if (k === '-' && keypadValue) { handleOperator('-', keypadValue); return; }
      if (k === '.' && keypadValue.includes('.')) return;
      if (k === '.' && keypadValue === '') { setKeypadValue('0.'); setKeypadDisplay('0.'); return; }
      const c = calcRef.current;
      if (c.newNumber) { c.newNumber = false; setKeypadValue(k); setKeypadDisplay(k); }
      else { setKeypadValue((prev) => prev + k); setKeypadDisplay((prev) => prev + k); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [keypadValue]);

  const handleAddToCart = useCallback((item: MenuItem) => { setCart((prev) => { const existing = prev.find((ci) => ci.id === item.id); if (existing) return prev.map((ci) => (ci.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci)); return [...prev, { id: item.id, name: item.name, price: item.price, quantity: 1, uid: genId() }]; }); }, []);
  const handleUpdateQuantity = useCallback((itemId: string, qty: number) => { if (qty <= 0) { setCart((prev) => prev.filter((ci) => ci.id !== itemId)); return; } setCart((prev) => prev.map((ci) => (ci.id === itemId ? { ...ci, quantity: qty } : ci))); }, []);
  const handleRemoveItem = useCallback((uid: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setCart((prev) => {
      const byUid = prev.filter((ci) => ci.uid !== uid);
      if (byUid.length < prev.length) return byUid;
      return prev.filter((ci) => ci.id !== uid);
    });
  }, []);

  const handleClearCart = useCallback(() => {
    setCart([]); setSpecialInstructions(''); setOrderNotes(''); setDiscount(null); setSelectedCustomer(null);
    setSelectedTableId(null); setCurrentOrderId(null); setCurrentOrderNumber(0); setPaymentView('selection');
    setPaymentMethod(''); setKeypadValue(''); setKeypadDisplay(''); setPaymentError(''); setAccounts([]); setOrderError('');
    calcRef.current = { buffer: 0, op: null, newNumber: false };
  }, []);

  const handleNewOrder = useCallback(() => { handleClearCart(); }, [handleClearCart]);

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);
  const serviceCharge = useMemo(() => {
    if (!settings?.serviceChargeEnabled || !settings.serviceChargeRate) return 0;
    const f = (orderType === 'dine_in' && settings.serviceChargeDineIn) || (orderType === 'takeaway' && settings.serviceChargeTakeaway) || (orderType === 'delivery' && settings.serviceChargeDelivery) || (orderType === 'drive_thru' && settings.serviceChargeDriveThru);
    return f ? subtotal * (settings.serviceChargeRate / 100) : 0;
  }, [settings, orderType, subtotal]);
  const taxableAmount = useMemo(() => settings?.taxServiceCharge ? subtotal + serviceCharge : subtotal, [settings, subtotal, serviceCharge]);
  const taxAmount = useMemo(() => { if (!settings?.taxEnabled || !settings.taxRate) return 0; return taxableAmount * (settings.taxRate / 100); }, [settings, taxableAmount]);
  const discountAmount = useMemo(() => { if (!discount) return 0; return discount.type === 'percentage' ? (subtotal + serviceCharge + taxAmount) * (discount.value / 100) : discount.value; }, [discount, subtotal, serviceCharge, taxAmount]);
  const grandTotal = useMemo(() => Math.max(0, subtotal + serviceCharge + taxAmount - discountAmount), [subtotal, serviceCharge, taxAmount, discountAmount]);

  const handlePlaceOrder = useCallback(async () => {
    if (cart.length === 0 || creatingOrderRef.current) return;
    creatingOrderRef.current = true; setCheckingOut(true); setOrderError('');
    try {
      let pickupTime: string | null = null;
      if (orderType === 'takeaway' || orderType === 'delivery') { const d = new Date(); d.setMinutes(d.getMinutes() + 20); pickupTime = d.toISOString(); }
      const orderPayload: Record<string, any> = { status: 'pending', source: 'pos', total: grandTotal, tax_amount: taxAmount, order_type: orderType, customer_id: selectedCustomer?.id || null, customer_name: selectedCustomer?.name || null, customer_phone: selectedCustomer?.phone || null, pickup_time: pickupTime };
      if (orderType === 'dine_in' && selectedTableId) orderPayload.table_id = selectedTableId;
      const orderResult = await supa(slug, { table: 'orders', method: 'insert', select: 'id, order_number, created_at', single: true, body: orderPayload });
      if (!orderResult.ok || !orderResult.data) { setOrderError(orderResult.error || 'Failed to create order'); setCheckingOut(false); creatingOrderRef.current = false; return; }
      publish('orders', 'INSERT', { id: orderResult.data?.id });
      const newOrder: any = orderResult.data;
      const items = cart.map((item) => ({ order_id: newOrder.id, menu_item_id: item.id, quantity: item.quantity, price_at_order: item.price }));
      const itemsResult = await supa(slug, { table: 'order_items', method: 'insert', body: items });
      if (!itemsResult.ok) { setOrderError(itemsResult.error || 'Failed to save order items'); setCheckingOut(false); creatingOrderRef.current = false; return; }
      await deductInventorySupa(slug, cart, newOrder.id, user?.id).catch((e) => console.error('[Inventory]', e));
      if (orderType === 'dine_in' && selectedTableId) { await supa(slug, { table: 'tables', method: 'update', eq: ['id', selectedTableId], body: { status: 'occupied', current_order_id: newOrder.id } }); setTables((prev) => prev.map((t) => (t.id === selectedTableId ? { ...t, status: 'occupied' } : t))); }
      setCurrentOrderId(newOrder.id); setCurrentOrderNumber(newOrder.order_number); setPaymentView('selection'); setPaymentMethod(''); setKeypadValue(''); setKeypadDisplay(''); setPaymentError(''); calcRef.current = { buffer: 0, op: null, newNumber: false };
    } catch (e: any) { console.error('[PlaceOrder]', e); setOrderError(e.message || 'Order failed'); }
    setCheckingOut(false); creatingOrderRef.current = false;
  }, [cart, orderType, grandTotal, taxAmount, serviceCharge, selectedCustomer, selectedTableId, slug, user]);

  const handleProcessPayment = useCallback(async () => {
    if (!currentOrderId || !paymentMethod) return;
    if (paymentMethod === 'cash' && !keypadValue) { setPaymentError('Enter amount received'); return; }
    setSavingPayment(true); setPaymentError('');
    try {
      const acc = accounts.find((a) => a.payment_method === paymentMethod);
      if (!acc) { setPaymentError('Account not found for ' + paymentMethod); setSavingPayment(false); return; }
      const received = paymentMethod === 'cash' ? parseFloat(keypadValue) : grandTotal;
      const changeDue = paymentMethod === 'cash' ? Math.max(0, received - grandTotal) : 0;
      const payments: PaymentInput[] = [{ account_id: acc.id, payment_method: paymentMethod, amount: grandTotal, cash_received: paymentMethod === 'cash' ? received : null, change_due: paymentMethod === 'cash' ? changeDue : null, reference_number: (paymentMethod !== 'cash' ? keypadValue : null) || null, notes: null, customer_id: selectedCustomer?.id || null, idempotency_key: currentOrderId + '_' + Date.now() + '_' + genId() }];
      const r = await processPayments(slug, currentOrderId, payments);
      if (!r.success) { setPaymentError(r.error || 'Payment failed'); setSavingPayment(false); return; }
      publish('payments', 'INSERT', { id: r.data?.id });
      setSuccessData(r); setShowReceipt(true);
    } catch (e: any) { setPaymentError(e.message || 'Payment failed'); }
    setSavingPayment(false);
  }, [currentOrderId, paymentMethod, keypadValue, grandTotal, accounts, selectedCustomer, slug]);

  const handlePayClick = useCallback(() => {
    if (!currentOrderId || cart.length === 0) return;
    setOrderError('');
    const pm = paymentMethod || 'cash';
    const kv = pm === 'cash' ? (keypadValue || String(Math.ceil(grandTotal))) : '';
    if (!paymentMethod) { setPaymentMethod(pm); if (pm === 'cash') { setKeypadValue(kv); setKeypadDisplay(kv); } }
    if (pm === 'cash' && !kv) { setPaymentError('Enter amount received'); return; }
    const acc = accounts.find((a) => a.payment_method === pm);
    if (!acc) { setPaymentError('Account not found for ' + pm); return; }
    const received = pm === 'cash' ? parseFloat(kv) : grandTotal;
    const changeDue = pm === 'cash' ? Math.max(0, received - grandTotal) : 0;
    setSavingPayment(true);
    processPayments(slug, currentOrderId, [{ account_id: acc.id, payment_method: pm, amount: grandTotal, cash_received: pm === 'cash' ? received : null, change_due: pm === 'cash' ? changeDue : null, reference_number: (pm !== 'cash' ? kv : null) || null, notes: null, customer_id: selectedCustomer?.id || null, idempotency_key: currentOrderId + '_' + Date.now() + '_' + genId() }]).then((r) => {
      if (!r.success) { setPaymentError(r.error || 'Payment failed'); setSavingPayment(false); return; }
      publish('payments', 'INSERT', { id: r.data?.id });
      setSuccessData(r); setShowReceipt(true); setSavingPayment(false);
    }).catch((e: any) => { setPaymentError(e.message || 'Payment failed'); setSavingPayment(false); });
  }, [currentOrderId, cart, paymentMethod, keypadValue, grandTotal, accounts, selectedCustomer, slug]);

  const filteredItems = useMemo(() => {
    let items = menuItems;
    if (selectedCategory !== 'all') items = items.filter((i) => (i.category ?? 'Uncategorized') === selectedCategory);
    if (menuSearch) { const q = menuSearch.toLowerCase(); items = items.filter((i) => i.name.toLowerCase().includes(q) || (i.category ?? '').toLowerCase().includes(q)); }
    return items;
  }, [menuItems, selectedCategory, menuSearch]);
  const allCategories = useMemo(() => [...new Set(menuItems.map((i) => i.category ?? 'Uncategorized'))].sort(), [menuItems]);
  const groupedByCategory = useMemo(() => { const m = new Map<string, MenuItem[]>(); for (const item of filteredItems) { const c = item.category ?? 'Uncategorized'; if (!m.has(c)) m.set(c, []); m.get(c)!.push(item); } return m; }, [filteredItems]);
  const availableTables = tables.filter((t) => t.status === 'available');
  const orderCount = cart.reduce((s, i) => s + i.quantity, 0);

  const receiptData = useMemo(() => {
    if (!showReceipt) return null;
    return { orderNumber: currentOrderNumber, status: 'paid', total: grandTotal, createdAt: new Date().toISOString(), orderType, customerName: selectedCustomer?.name || null, customerPhone: selectedCustomer?.phone || null, items: cart.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })), taxAmount, serviceChargeAmount: serviceCharge, tableNumber: selectedTableId ? tables.find((t) => t.id === selectedTableId)?.table_number || null : null };
  }, [showReceipt, currentOrderNumber, grandTotal, orderType, selectedCustomer, cart, taxAmount, serviceCharge, selectedTableId, tables]);

  if (!isLoaded || !authReady) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50"><div className="text-center"><div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-2" /><p className="text-gray-500 text-sm">Loading POS...</p></div></div>;
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 min-w-0 overflow-hidden" style={{ fontFamily: 'inherit' }}>
      {showReceipt && receiptData && (
        <ReceiptView data={receiptData} brandName={brandName} theme={theme} onClose={() => { setShowReceipt(false); setSuccessData(null); handleNewOrder(); }} currencySymbol={currencySymbol} />
      )}

      {showCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCustomerModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">Select Customer</h2>
              <button onClick={() => setShowCustomerModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {selectedCustomer && (
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                  <div className="flex items-center justify-between mb-2">
                    <div><p className="font-semibold text-gray-800">{selectedCustomer.name}</p>{selectedCustomer.phone && <p className="text-sm text-gray-500">{selectedCustomer.phone}</p>}</div>
                    <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); setCustomerResults([]); }} className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-white rounded-lg p-2"><span className="text-gray-400 block">Orders</span><span className="font-bold text-gray-800">{selectedCustomer.total_orders || 0}</span></div>
                    <div className="bg-white rounded-lg p-2"><span className="text-gray-400 block">Points</span><span className="font-bold text-gray-800">{selectedCustomer.loyalty_points || 0}</span></div>
                    <div className="bg-white rounded-lg p-2"><span className="text-gray-400 block">Credit</span><span className="font-bold text-gray-800">{currencySymbol}{(selectedCustomer as any).credit_balance || 0}</span></div>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Search Customer</label>
                <input type="text" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Name or phone..." className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" autoFocus />
              </div>
              {customerSearchLoading && <p className="text-xs text-gray-400">Searching...</p>}
              {customerResults.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {customerResults.map((r) => (
                    <button key={r.id} onClick={async () => { const detail = await supa(slug, { table: 'customers', select: 'id, name, phone, total_orders, total_spent, loyalty_points, credit_balance', eq: ['id', r.id], single: true }); if (detail.ok && detail.data) setSelectedCustomer(detail.data as Customer); else setSelectedCustomer({ id: r.id, name: r.name, phone: r.phone }); setShowCustomerModal(false); }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 text-sm"
                    ><span className="font-medium text-gray-800">{r.name}</span>{r.phone && <span className="text-gray-400 ml-2">{r.phone}</span>}</button>
                  ))}
                </div>
              )}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick Add Customer</h3>
                <div className="space-y-2">
                  <input type="text" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} placeholder="Full Name" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
                  <input type="tel" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} placeholder="Phone (optional)" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
                  <button onClick={async () => { if (!newCustomerName.trim()) return; const result = await supa(slug, { table: 'customers', method: 'insert', select: 'id, name, phone', single: true, body: { name: newCustomerName.trim(), phone: newCustomerPhone.trim() || null, status: 'active' } }); if (result.ok && result.data) { setSelectedCustomer(result.data as Customer); setShowCustomerModal(false); setNewCustomerName(''); setNewCustomerPhone(''); publish('customers', 'INSERT', { id: result.data?.id }); } }}
                    className="w-full py-2 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: '#C9972B' }}>Add Customer</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                <button onClick={() => { const v = parseFloat(discountValue); if (v > 0) { setDiscount({ type: discountType, value: v }); } else { setDiscount(null); } setShowDiscountModal(false); }} className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: '#C9972B' }}>{discount ? 'Update' : 'Apply'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {showNotesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNotesModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Order Notes</h2>
              <button onClick={() => setShowNotesModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <textarea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder="Kitchen instructions, special requests..." className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg resize-none h-28" autoFocus />
            <button onClick={() => setShowNotesModal(false)} className="w-full mt-3 py-2.5 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: '#C9972B' }}>Save</button>
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
              }} className="w-full py-2.5 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: '#C9972B' }}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Main 3-Column Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

        {/* LEFT: Order Cart */}
        <div className="w-[340px] xl:w-[380px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden hidden md:flex">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
            <div>
              <h2 className="font-bold text-gray-800" style={{ fontSize: '15px' }}>{currentOrderId ? '#ORD-' + String(currentOrderNumber).padStart(5, '0') : 'New Order'}</h2>
              <p className="text-xs text-gray-400">{orderCount} item{orderCount !== 1 ? 's' : ''}{currentOrderId ? ' - Awaiting Payment' : ''}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setShowCustomerModal(true)} className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">{selectedCustomer ? selectedCustomer.name : 'Customer'}</button>
              <button onClick={handleClearCart} className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">New</button>
            </div>
          </div>

          <div className="px-3 py-2 border-b border-gray-100 flex gap-1 overflow-x-auto scrollbar-hide shrink-0">
            {(Object.keys(ORDER_TYPE_LABELS) as OrderTypeOption[]).map((type) => (
              <button key={type} onClick={() => { setOrderType(type); setSelectedTableId(null); }}
                className={'px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ' + (orderType === type ? 'text-white' : 'text-gray-500 hover:bg-gray-100')}
                style={orderType === type ? { backgroundColor: '#C9972B' } : {}}
              >{ORDER_TYPE_LABELS[type]}</button>
            ))}
          </div>

          {orderType === 'dine_in' && (
            <div className="px-4 py-2 border-b border-gray-100 shrink-0">
              <select value={selectedTableId || ''} onChange={(e) => setSelectedTableId(e.target.value || null)} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg bg-white">
                <option value="">-- Select Table --</option>
                {availableTables.map((t) => (<option key={t.id} value={t.id}>Table {t.table_number}</option>))}
                {tables.filter((t) => t.status === 'occupied').map((t) => (<option key={t.id} value={t.id} className="text-amber-600">Table {t.table_number} (occupied)</option>))}
              </select>
            </div>
          )}

          <div className="flex-1 overflow-y-auto scrollbar-hide px-3 py-3 space-y-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
                <span className="text-5xl mb-4" role="img">&#x1F6D2;</span>
                <p className="text-gray-400 font-medium">Cart is empty</p>
                <p className="text-gray-300 text-xs mt-1">Click menu items to add them here</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.uid} className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p><p className="text-xs text-gray-400">{currencySymbol}{item.price.toFixed(2)} each</p></div>
                    <button onClick={(e) => handleRemoveItem(item.uid || item.id, e)} className="text-red-400 hover:text-red-600 text-lg font-bold px-1.5 py-0.5 border border-red-200 rounded-md hover:border-red-400 transition-colors" title="Remove item">&#x2716; <span className="text-[10px] font-medium">Remove</span></button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                      <button onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center text-sm font-bold text-gray-600 hover:bg-gray-100">&#8722;</button>
                      <span className="w-8 text-center text-sm font-semibold text-gray-800">{item.quantity}</span>
                      <button onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center text-sm font-bold text-gray-600 hover:bg-gray-100">+</button>
                    </div>
                    <span className="text-sm font-bold text-gray-800">{currencySymbol}{(item.quantity * item.price).toFixed(2)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {cart.length > 0 && (
            <div className="border-t border-gray-200 px-4 pt-2 pb-1 space-y-1.5 shrink-0">
              <textarea value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} placeholder="Special instructions..." className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg resize-none h-12" />
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{currencySymbol}{subtotal.toFixed(2)}</span></div>
                {serviceCharge > 0 && <div className="flex justify-between text-gray-500"><span>Service Charge ({(settings?.serviceChargeRate || 0).toFixed(0)}%)</span><span>{currencySymbol}{serviceCharge.toFixed(2)}</span></div>}
                {taxAmount > 0 && <div className="flex justify-between text-gray-500"><span>Tax ({(settings?.taxRate || 0).toFixed(0)}%)</span><span>{currencySymbol}{taxAmount.toFixed(2)}</span></div>}
                {discount && <div className="flex justify-between text-green-600"><span>Discount ({discount.type === 'percentage' ? discount.value + '%' : currencySymbol + discount.value})</span><span>-{currencySymbol}{discountAmount.toFixed(2)}</span></div>}
                <div className="flex justify-between font-extrabold text-gray-900 border-t border-gray-200 pt-1.5" style={{ fontSize: '16px' }}><span>Total</span><span>{currencySymbol}{grandTotal.toFixed(2)}</span></div>
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 px-4 py-3 flex gap-2 shrink-0">
            {currentOrderId ? (
              <>
                <button onClick={() => { setCurrentOrderId(null); setCurrentOrderNumber(0); setPaymentView('selection'); setPaymentMethod(''); setKeypadValue(''); setKeypadDisplay(''); }} className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50">Back</button>
                <button onClick={() => setPaymentView('selection')} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:shadow-lg" style={{ backgroundColor: '#C9972B' }}>Pay Now</button>
              </>
            ) : (
              <>
                <button onClick={handleClearCart} className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50">Hold</button>
                <button onClick={handlePlaceOrder} disabled={cart.length === 0 || checkingOut} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg" style={{ backgroundColor: cart.length > 0 ? '#C9972B' : '#9CA3AF' }}>{checkingOut ? 'Placing...' : 'Place Order'}</button>
              </>
            )}
          </div>
        </div>

        {/* Mobile Cart Bar (shown on small screens) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg">
          {orderError && <div className="px-4 py-1.5 bg-red-50 border-b border-red-100 text-[10px] text-red-600 text-center font-medium">{orderError}</div>}
          {paymentError && <div className="px-4 py-1.5 bg-red-50 border-b border-red-100 text-[10px] text-red-600 text-center font-medium">{paymentError}</div>}
          {cart.length > 0 && (
            <div className="flex gap-1 px-3 py-1.5 border-b border-gray-100 overflow-x-auto">
              {(Object.keys(ORDER_TYPE_LABELS) as OrderTypeOption[]).map((type) => (
                <button key={type} onClick={() => setOrderType(type)}
                  className={'px-2 py-1 text-[10px] font-semibold rounded-md whitespace-nowrap ' + (orderType === type ? 'text-white' : 'text-gray-500 border border-gray-200')}
                  style={orderType === type ? { backgroundColor: '#C9972B' } : {}}
                >{ORDER_TYPE_LABELS[type]}</button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 px-4 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800">{currencySymbol}{grandTotal.toFixed(2)}</p>
              <p className="text-xs text-gray-400">{orderCount} item{orderCount !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={() => setShowCalculator(!showCalculator)} className={'px-2 py-1.5 text-[10px] font-semibold rounded-md border transition-colors ' + (showCalculator ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500')}>{showCalculator ? 'Hide Calc' : 'Calc'}</button>
            <button onClick={() => setShowCustomerModal(true)} className="px-2.5 py-1.5 text-[10px] font-semibold border border-gray-200 rounded-md text-gray-600">Customer</button>
            <button onClick={currentOrderId ? handlePayClick : handlePlaceOrder} disabled={cart.length === 0 || checkingOut || savingPayment} className="px-5 py-1.5 rounded-md text-xs font-bold text-white disabled:opacity-50" style={{ backgroundColor: cart.length > 0 ? '#C9972B' : '#9CA3AF' }}>{savingPayment ? '...' : checkingOut ? '...' : currentOrderId ? 'Pay' : 'Order'}</button>
          </div>
        </div>

        {/* CENTER: Menu */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 pb-16 md:pb-0">
          <div className="bg-white border-b border-gray-200 shrink-0">
            <div className="flex items-center gap-2 px-4 py-2">
              <div className="flex-1 relative">
                <input ref={searchRef} type="text" value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} placeholder="Search menu..." className="w-full h-9 pl-8 pr-3 text-sm border border-gray-300 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none transition-all" />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">&#x1F50D;</span>
              </div>
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden hidden sm:flex">
                <button onClick={() => setViewMode('grid')} className={'px-3 py-1.5 text-xs font-medium transition-colors ' + (viewMode === 'grid' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-100')}>Grid</button>
                <button onClick={() => setViewMode('compact')} className={'px-3 py-1.5 text-xs font-medium transition-colors ' + (viewMode === 'compact' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-100')}>List</button>
              </div>
            </div>
            <div className="flex gap-0.5 px-3 pb-2 overflow-x-auto scrollbar-hide">
              <button key="all" onClick={() => setSelectedCategory('all')}
                className={'px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ' + (selectedCategory === 'all' ? 'text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700')}
                style={selectedCategory === 'all' ? { backgroundColor: '#C9972B' } : {}}
              >All</button>
              {allCategories.map((cat) => (
                <button key={cat} onClick={() => setSelectedCategory(cat)}
                  className={'px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ' + (selectedCategory === cat ? 'text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700')}
                  style={selectedCategory === cat ? { backgroundColor: '#C9972B' } : {}}
                >{cat}</button>
              ))}
            </div>
          </div>

          {/* Menu Grid */}
          <div className="flex-1 overflow-y-auto scrollbar-hide p-4">
            {menuSearch && mostOrderedItems.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Most Ordered</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {mostOrderedItems.filter((i) => i.name.toLowerCase().includes(menuSearch.toLowerCase())).slice(0, 5).map((item) => (
                    <MenuCard key={item.id} item={item} onAdd={handleAddToCart} isPopular />
                  ))}
                </div>
              </div>
            )}
            {viewMode === 'grid' ? (
              filteredItems.length === 0 ? (
                <div className="flex items-center justify-center h-48"><p className="text-gray-400 text-sm">No items found</p></div>
              ) : (
                Array.from(groupedByCategory.entries()).map(([cat, items]) => (
                  <div key={cat} className="mb-6">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{cat}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                      {items.map((item) => (
                        <MenuCard key={item.id} item={item} onAdd={handleAddToCart} isPopular={mostOrderedItems.some((m) => m.id === item.id)} />
                      ))}
                    </div>
                  </div>
                ))
              )
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {filteredItems.length === 0 ? (
                  <div className="flex items-center justify-center h-32"><p className="text-gray-400 text-sm">No items found</p></div>
                ) : (
                  Array.from(groupedByCategory.entries()).map(([cat, items]) => (
                    <div key={cat}>
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{cat}</h4>
                      </div>
                      {items.map((item) => (<CompactMenuItem key={item.id} item={item} onAdd={handleAddToCart} />))}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Calculator-Style POS Sidebar */}
        <div className={'w-full md:w-[300px] xl:w-[320px] flex-shrink-0 bg-white md:border-l border-t md:border-t-0 border-gray-200 flex flex-col ' + (showCalculator ? 'flex' : 'hidden md:flex')}>

          {/* Action Buttons - 2x2 Grid */}
          <div className="grid grid-cols-2 gap-1 p-2 border-b border-gray-200 shrink-0">
            <button onClick={() => setShowCustomerModal(true)}
              className="flex flex-col items-center justify-center py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all text-gray-700 active:scale-95 gap-0.5"
            >
              <span className="text-sm leading-none">&#x1F464;</span>
              <span className="text-[9px] font-semibold">Customer</span>
              {selectedCustomer && <span className="text-[7px] text-green-600 font-bold truncate max-w-full px-0.5 leading-tight">{selectedCustomer.name}</span>}
            </button>
            <button onClick={() => setShowNotesModal(true)}
              className="flex flex-col items-center justify-center py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all text-gray-700 active:scale-95 gap-0.5"
            >
              <span className="text-sm leading-none">&#x1F4DD;</span>
              <span className="text-[9px] font-semibold">Notes</span>
              {orderNotes && <span className="text-[7px] text-blue-600 font-bold">Added</span>}
            </button>
            <button onClick={() => {
              if (keypadValue && !isNaN(parseFloat(keypadValue))) {
                const v = parseFloat(keypadValue);
                if (v > 0) { setDiscount({ type: 'fixed', value: v }); setKeypadValue(''); setKeypadDisplay(''); return; }
              }
              setShowDiscountModal(true); setDiscountValue(discount ? String(discount.value) : '');
            }}
              className="flex flex-col items-center justify-center py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all text-gray-700 active:scale-95 gap-0.5"
            >
              <span className="text-sm leading-none">&#x1F3F7;&#xFE0F;</span>
              <span className="text-[9px] font-semibold">Discount</span>
              {discount && <span className="text-[7px] text-green-600 font-bold truncate max-w-full px-0.5 leading-tight">{discount.type === 'percentage' ? discount.value + '%' : currencySymbol + discount.value}</span>}
            </button>
            <button onClick={() => { setShowPromoModal(true); setPromoCode(''); setPromoError(''); }}
              className="flex flex-col items-center justify-center py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all text-gray-700 active:scale-95 gap-0.5"
            >
              <span className="text-sm leading-none">&#x1F39F;&#xFE0F;</span>
              <span className="text-[9px] font-semibold">Promo</span>
            </button>
          </div>

          {/* Payment Method Row (visible only after order placed) */}
          {currentOrderId && (
            <div className="px-2 py-1.5 border-b border-gray-200 flex gap-1 overflow-x-auto shrink-0">
              {['cash', 'card', 'jazzcash', 'easypaisa', 'bank_transfer'].map((pm) => (
                <button key={pm} onClick={() => {
                  if (paymentMethod === pm) { setPaymentMethod(''); return; }
                  setPaymentMethod(pm); setPaymentView('input');
                  if (pm === 'cash') { setKeypadValue(String(Math.ceil(grandTotal))); setKeypadDisplay(String(Math.ceil(grandTotal))); }
                  else { setKeypadValue(''); setKeypadDisplay(''); }
                }}
                  className={'flex-1 py-1.5 rounded-lg text-[9px] font-semibold transition-all border ' + (paymentMethod === pm ? 'text-white border-transparent shadow-sm' : 'text-gray-500 border-gray-200 hover:bg-gray-50')}
                  style={paymentMethod === pm ? { backgroundColor: '#C9972B' } : {}}
                >{pm === 'cash' ? '\u{1F4B5}' : pm === 'card' ? '\u{1F4B3}' : pm === 'jazzcash' ? '\u{1F4F1}' : pm === 'easypaisa' ? '\u{1F4F1}' : '\u{1F3E6}'}</button>
              ))}
            </div>
          )}

          {/* Keypad - always functional */}
          <div className="p-2 border-b border-gray-200 shrink-0">
            {keypadValue && (
              <div className="mb-1.5 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200 text-center">
                <span className="text-[10px] text-gray-400">{currentOrderId && paymentMethod ? (paymentMethod === 'cash' ? 'Cash Received' : 'Reference / Amount') : 'Calculator'}</span>
                <p className="text-base font-extrabold text-gray-900">{currencySymbol}{(parseFloat(keypadValue) || 0).toFixed(2)}</p>
              </div>
            )}
            <NumericKeypad value={keypadValue} onChange={(v) => { setKeypadValue(v); setKeypadDisplay(v); }} onClear={() => { calcRef.current = { buffer: 0, op: null, newNumber: false }; setKeypadValue(''); setKeypadDisplay(''); }} onOperator={handleOperator} calcNewNumberRef={calcRef} />
            {paymentError && <p className="text-[10px] text-red-600 text-center mt-1">{paymentError}</p>}
          </div>

          {/* Payment Summary - flex-1 fills remaining space, scrolls only if needed */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 text-[11px]">
            <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{currencySymbol}{subtotal.toFixed(2)}</span></div>
            {discount && <div className="flex justify-between text-green-600"><span>Discount{discount.type === 'percentage' ? ` (${discount.value}%)` : ''}</span><span>-{currencySymbol}{discountAmount.toFixed(2)}</span></div>}
            {serviceCharge > 0 && <div className="flex justify-between text-gray-500"><span>Service Charge ({(settings?.serviceChargeRate || 0).toFixed(0)}%)</span><span>{currencySymbol}{serviceCharge.toFixed(2)}</span></div>}
            {taxAmount > 0 && <div className="flex justify-between text-gray-500"><span>Tax ({(settings?.taxRate || 0).toFixed(0)}%)</span><span>{currencySymbol}{taxAmount.toFixed(2)}</span></div>}
            <div className="border-t border-gray-200 pt-1" />
            <div className="flex justify-between font-bold text-gray-900 text-sm"><span>Grand Total</span><span>{currencySymbol}{grandTotal.toFixed(2)}</span></div>
            {currentOrderId && paymentMethod && (
              <>
                <div className="border-t border-gray-200 pt-1 border-dashed" />
                <div className="flex justify-between text-blue-600 font-medium"><span>Paid</span><span>{currencySymbol}{(parseFloat(keypadValue) || 0).toFixed(2)}</span></div>
                {(parseFloat(keypadValue) || 0) > 0 && (parseFloat(keypadValue) || 0) < grandTotal && (
                  <div className="flex justify-between text-amber-600 font-medium"><span>Remaining</span><span>{currencySymbol}{(grandTotal - (parseFloat(keypadValue) || 0)).toFixed(2)}</span></div>
                )}
                {(parseFloat(keypadValue) || 0) >= grandTotal && (
                  <div className="flex justify-between text-green-600 font-medium"><span>Change</span><span>{currencySymbol}{((parseFloat(keypadValue) || 0) - grandTotal).toFixed(2)}</span></div>
                )}
              </>
            )}
          </div>

          {/* Pay Button - shrink-0 sticks to bottom */}
          <div className="border-t border-gray-200 px-3 py-2 shrink-0">
            <button onClick={handlePayClick}
              disabled={!currentOrderId || cart.length === 0 || savingPayment}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg active:scale-[0.98]"
              style={{ backgroundColor: cart.length > 0 ? '#C9972B' : '#9CA3AF' }}
            >{savingPayment ? 'Processing...' : 'Pay ' + currencySymbol + grandTotal.toFixed(2)}</button>
          </div>
        </div>
      </div>
    </div>
  );
}