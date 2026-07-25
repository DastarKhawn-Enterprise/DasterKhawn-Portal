'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { usePOS } from './pos-context';
import { useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { hasPermission } from './permissions';
import { supa } from './supa-query';

interface Props {
  slug: string;
  theme: ThemeConfig;
}

interface SettingsRow {
  id: string;
  tax_enabled: boolean;
  tax_rate: number;
  currency_symbol: string;
  receipt_footer_text: string;
  enabled_modules: Record<string, any>;
  updated_at?: string;
  updated_by?: string;
}

interface BranchRow {
  id: string;
  name: string;
  address?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  phone?: string;
  email?: string;
  is_default: boolean;
  is_active: boolean;
}

interface BusinessHoursRow {
  id?: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const CURRENCIES = [
  { value: 'Rs.', label: 'PKR (Rs.)' },
  { value: '$', label: 'USD ($)' },
  { value: '€', label: 'EUR (€)' },
  { value: '£', label: 'GBP (£)' },
  { value: 'SAR', label: 'SAR' },
  { value: 'AED', label: 'AED' },
  { value: 'QAR', label: 'QAR' },
  { value: 'OMR', label: 'OMR' },
];

const RESTAURANT_TYPES = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'fast_food', label: 'Fast Food' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'cloud_kitchen', label: 'Cloud Kitchen' },
  { value: 'other', label: 'Other' },
];

const BUSINESS_TYPES = [
  { value: 'sole_proprietorship', label: 'Sole Proprietorship' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'private_limited', label: 'Private Limited' },
  { value: 'public_limited', label: 'Public Limited' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ur', label: 'Urdu' },
  { value: 'ar', label: 'Arabic' },
];

const TIMEZONES = [
  { value: 'Asia/Karachi', label: 'Asia/Karachi (PKT)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh (AST)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
  { value: 'UTC', label: 'UTC' },
];

const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY' },
];

const TIME_FORMATS = [
  { value: '12h', label: '12-hour (AM/PM)' },
  { value: '24h', label: '24-hour' },
];

const LANDING_PAGES = [
  { value: 'pos', label: 'POS' },
  { value: 'orders', label: 'Orders' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'menu', label: 'Menu' },
];

const ORDER_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'preparing', label: 'Preparing' },
];

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'jazzcash', label: 'JazzCash' },
  { value: 'easypaisa', label: 'EasyPaisa' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'debit_card', label: 'Debit Card' },
];

const SYSTEM_MODULES = [
  { key: 'kitchen_display', label: 'Kitchen Display' },
  { key: 'table_management', label: 'Table Management' },
  { key: 'reservations', label: 'Reservations' },
  { key: 'inventory_alerts', label: 'Inventory Alerts' },
  { key: 'negative_stock', label: 'Negative Stock' },
  { key: 'customer_loyalty', label: 'Customer Loyalty' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'online_ordering', label: 'Online Ordering' },
];

function formatTime24(val: string | null | undefined): string {
  if (!val) return '';
  const parts = val.split(':');
  if (parts.length >= 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  return val;
}

function fmtTime(val: string | null | undefined): string {
  if (!val) return '--:--';
  const p = val.split(':');
  let h = parseInt(p[0], 10);
  const m = p[1] || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

function summarizeHours(hours: BusinessHoursRow[]): { label: string; text: string }[] {
  if (!hours.length) return [{ label: 'Not set', text: 'No hours configured' }];
  const sorted = [...hours].sort((a, b) => a.day_of_week - b.day_of_week);
  const result: { label: string; text: string }[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (
      j + 1 < sorted.length &&
      sorted[j + 1].day_of_week === sorted[j].day_of_week + 1 &&
      sorted[j + 1].is_closed === sorted[i].is_closed &&
      sorted[j + 1].open_time === sorted[i].open_time &&
      sorted[j + 1].close_time === sorted[i].close_time
    ) {
      j++;
    }
    const s = sorted[i], e = sorted[j];
    const label = s.day_of_week === e.day_of_week ? DAYS[s.day_of_week] : `${DAYS[s.day_of_week].slice(0, 3)}–${DAYS[e.day_of_week].slice(0, 3)}`;
    result.push({ label, text: s.is_closed ? 'Closed' : `${fmtTime(s.open_time)} – ${fmtTime(s.close_time)}` });
    i = j + 1;
  }
  return result;
}

function F(label: string, value: any, onChange: (v: any) => void, opts?: { type?: string; disabled?: boolean; help?: string; placeholder?: string; min?: number; max?: number; step?: string; options?: { value: string; label: string }[] }) {
  const base = 'w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400';
  return (
    <div className="mb-2">
      <label className="block text-[11px] font-medium text-gray-500 mb-0.5">{label}</label>
      {opts?.options ? (
        <select value={String(value)} onChange={(e) => onChange(e.target.value)} disabled={opts?.disabled || false} className={`${base} bg-white`}>
          {opts.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : opts?.type === 'checkbox' ? (
        <label className="flex items-center gap-2 cursor-pointer mt-0.5">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} disabled={opts?.disabled || false} className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50" />
        </label>
      ) : opts?.type === 'textarea' ? (
        <textarea value={String(value)} onChange={(e) => onChange(e.target.value)} disabled={opts?.disabled || false} placeholder={opts?.placeholder} rows={2} className={`${base}`} />
      ) : (
        <input type={opts?.type || 'text'} value={String(value)} onChange={(e) => onChange(e.target.value)} disabled={opts?.disabled || false} placeholder={opts?.placeholder} min={opts?.min} max={opts?.max} step={opts?.step} className={`${base}`} />
      )}
      {opts?.help && <p className="text-[10px] text-gray-400 mt-0.5">{opts.help}</p>}
    </div>
  );
}

function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-3 ${className || ''}`}>
      {title && <h3 className="text-xs font-semibold text-gray-800 mb-2 pb-1.5 border-b border-gray-100">{title}</h3>}
      {children}
    </div>
  );
}

function Grid({ cols = 2, children }: { cols?: 1 | 2 | 3 | 4; children: React.ReactNode }) {
  const cls = cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-1 md:grid-cols-2' : cols === 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-4';
  return <div className={`grid ${cls} gap-x-3 gap-y-0`}>{children}</div>;
}

function CompactToggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center justify-between py-1 cursor-pointer">
      <span className="text-xs text-gray-700">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50" />
    </label>
  );
}

export default function SettingsView({ slug, theme }: Props) {
  const { user, isLoaded } = useUser();
  const meta = user?.publicMetadata as Record<string, any> | undefined;
  const perms = (meta?.permissions ?? []) as string[];
  const role = (meta?.role ?? '') as string;
  const canEdit = hasPermission(perms, role, 'settings:edit');

  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [businessHours, setBusinessHours] = useState<BusinessHoursRow[]>([]);
  const [localHours, setLocalHours] = useState<BusinessHoursRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [initBranch, setInitBranch] = useState(false);

  // Branch modal
  const [branchModal, setBranchModal] = useState<{ open: boolean; editing?: BranchRow; data: Partial<BranchRow> }>({ open: false, data: {} });

  // Hours modal
  const [hoursModal, setHoursModal] = useState(false);
  const [editHours, setEditHours] = useState<BusinessHoursRow[]>([]);

  const r = useMemo(() => (settings?.enabled_modules?.restaurant || {}) as Record<string, any>, [settings]);

  const [form, setForm] = useState({
    taxEnabled: false, taxRate: '0', currencySymbol: 'Rs.', receiptFooterText: 'Thank you for your order!',
    restaurantName: '', restaurantType: 'restaurant', defaultLanguage: 'en', timezone: 'Asia/Karachi',
    dateFormat: 'DD/MM/YYYY', timeFormat: '12h', darkMode: false, defaultLandingPage: 'pos',
    email: '', phone: '', secondaryPhone: '', additionalEmails: '', website: '',
    businessName: '', businessType: 'sole_proprietorship', ntn: '', strn: '', fbrStatus: 'unregistered',
    fbrRegDate: '', fbrPosId: '', fbrInvoicePrefix: '', showNtnReceipt: true, ntnAllBranches: true,
    tagline: '', description: '',
    taxName: 'GST', taxInclusive: false,
    serviceChargeEnabled: false, serviceChargeName: 'Service Charge', serviceChargeRate: '10',
    serviceChargeDineIn: true, serviceChargeTakeaway: false, serviceChargeDelivery: false,
    serviceChargeDriveThru: false, taxServiceCharge: false,
    receiptHeader: '', showLogo: true, showBranchAddress: true, showPhone: true, showNtn: true,
    showCashierName: true, showPaymentMethod: true, showTaxBreakdown: true, showServiceCharge: true,
    thankYouMessage: '',
    defaultOrderStatus: 'pending', autoSendToKitchen: true, requireCustomerDelivery: false,
    requireCustomerCredit: false, allowEditBeforePayment: true, allowEditAfterPayment: false,
    autoPrintReceipt: false, defaultPaymentMethod: 'cash',
    lowStockAlerts: true, defaultLowStockThreshold: '10', allowNegativeStock: false,
    autoDeductIngredients: true, writeItemLedger: false,
  });

  const initialFormRef = useRef<string>('');

  const formJson = useMemo(() => JSON.stringify(form), [form]);
  const dirty = formJson !== initialFormRef.current && initialFormRef.current !== '';
  const hoursChanged = useMemo(() => JSON.stringify(localHours) !== JSON.stringify(businessHours.map((h) => ({ day_of_week: h.day_of_week, open_time: h.open_time, close_time: h.close_time, is_closed: h.is_closed }))), [localHours, businessHours]);

  const defaultBranch = useMemo(() => branches.find((b) => b.is_default) || branches[0], [branches]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, bRes, hRes] = await Promise.all([
        supa(slug, { table: 'settings', select: '*', limit: 1, single: true }),
        supa(slug, { table: 'branches', select: '*', order: 'name.asc' }),
        supa(slug, { table: 'business_hours', select: '*', order: 'day_of_week.asc' }),
      ]);

      if (sRes.ok && sRes.data) setSettings(sRes.data as unknown as SettingsRow);
      if (bRes.ok && bRes.data) setBranches(bRes.data as unknown as BranchRow[]);
      if (hRes.ok && hRes.data) {
        const hrs = hRes.data as unknown as BusinessHoursRow[];
        setBusinessHours(hrs);
        setLocalHours(hrs.map((h) => ({ ...h })));
      }

      const countKeys = ['branches', 'tables', 'staff', 'menu_items'] as const;
      const countResults = await Promise.all(countKeys.map((t) => supa(slug, { table: t, select: 'id', head: true })));
      const countMap: Record<string, number> = {};
      countKeys.forEach((t, i) => { if (countResults[i].ok) countMap[t] = Number(countResults[i].count || 0); });
      setCounts(countMap);

      if (bRes.ok && bRes.data && bRes.data.length === 0 && !initBranch) {
        const hasActivity = countMap['menu_items'] > 0 || countMap['tables'] > 0;
        if (hasActivity) {
          setInitBranch(true);
          const insRes = await supa(slug, {
            table: 'branches', method: 'insert', body: { name: 'Main Branch', country: 'Pakistan', is_default: true, is_active: true }, select: '*',
          });
          if (insRes.ok && insRes.data) setBranches(insRes.data as unknown as BranchRow[]);
        }
      }
    } catch (e: any) {
      console.error('[Settings] load error:', e);
      setError(e.message || 'Failed to load settings');
    }
    setLoading(false);
  }, [slug, initBranch]);

  const { setPageTitle } = usePOS();
  useEffect(() => { setPageTitle('Settings'); }, [setPageTitle]);
  useEffect(() => { if (isLoaded) load(); }, [isLoaded, load]);

  useEffect(() => {
    if (!settings) return;
    const rest = settings.enabled_modules?.restaurant || {};
    const g = (key: string, fallback: any = '') => rest[key] ?? fallback;
    const f = {
      taxEnabled: settings.tax_enabled,
      taxRate: String(settings.tax_rate),
      currencySymbol: settings.currency_symbol || 'Rs.',
      receiptFooterText: settings.receipt_footer_text || 'Thank you for your order!',
      restaurantName: g('restaurant_name', ''),
      restaurantType: g('restaurant_type', 'restaurant'),
      defaultLanguage: g('default_language', 'en'),
      timezone: g('timezone', 'Asia/Karachi'),
      dateFormat: g('date_format', 'DD/MM/YYYY'),
      timeFormat: g('time_format', '12h'),
      darkMode: !!g('dark_mode', false),
      defaultLandingPage: g('default_landing_page', 'pos'),
      email: g('email', ''),
      phone: g('phone', ''),
      secondaryPhone: g('secondary_phone', ''),
      additionalEmails: g('additional_emails', ''),
      website: g('website', ''),
      businessName: g('business_name', ''),
      businessType: g('business_type', 'sole_proprietorship'),
      ntn: g('ntn', ''),
      strn: g('strn', ''),
      fbrStatus: g('fbr_status', 'unregistered'),
      fbrRegDate: g('fbr_reg_date', ''),
      fbrPosId: g('fbr_pos_id', ''),
      fbrInvoicePrefix: g('fbr_invoice_prefix', ''),
      showNtnReceipt: g('show_ntn_receipt', true),
      ntnAllBranches: g('ntn_all_branches', true),
      tagline: g('tagline', ''),
      description: g('description', ''),
      taxName: g('tax_name', 'GST'),
      taxInclusive: !!g('tax_inclusive', false),
      serviceChargeEnabled: !!g('service_charge_enabled', false),
      serviceChargeName: g('service_charge_name', 'Service Charge'),
      serviceChargeRate: String(g('service_charge_rate', 10)),
      serviceChargeDineIn: g('service_charge_dine_in', true) !== false,
      serviceChargeTakeaway: !!g('service_charge_takeaway', false),
      serviceChargeDelivery: !!g('service_charge_delivery', false),
      serviceChargeDriveThru: !!g('service_charge_drive_thru', false),
      taxServiceCharge: !!g('tax_service_charge', false),
      receiptHeader: g('receipt_header', ''),
      showLogo: g('show_logo', true) !== false,
      showBranchAddress: g('show_branch_address', true) !== false,
      showPhone: g('show_phone', true) !== false,
      showNtn: g('show_ntn', true) !== false,
      showCashierName: g('show_cashier_name', true) !== false,
      showPaymentMethod: g('show_payment_method', true) !== false,
      showTaxBreakdown: g('show_tax_breakdown', true) !== false,
      showServiceCharge: g('show_service_charge', true) !== false,
      thankYouMessage: g('thank_you_message', ''),
      defaultOrderStatus: g('default_order_status', 'pending'),
      autoSendToKitchen: g('auto_send_to_kitchen', true) !== false,
      requireCustomerDelivery: !!g('require_customer_delivery', false),
      requireCustomerCredit: !!g('require_customer_credit', false),
      allowEditBeforePayment: g('allow_edit_before_payment', true) !== false,
      allowEditAfterPayment: !!g('allow_edit_after_payment', false),
      autoPrintReceipt: !!g('auto_print_receipt', false),
      defaultPaymentMethod: g('default_payment_method', 'cash'),
      lowStockAlerts: g('low_stock_alerts', true) !== false,
      defaultLowStockThreshold: String(g('default_low_stock_threshold', 10)),
      allowNegativeStock: !!g('allow_negative_stock', false),
      autoDeductIngredients: g('auto_deduct_ingredients', true) !== false,
      writeItemLedger: !!g('write_item_ledger', false),
    };
    setForm(f);
    initialFormRef.current = JSON.stringify(f);
  }, [settings]);

  const update = useCallback((key: keyof typeof form, value: any) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const save = useCallback(async () => {
    if (!settings || !canEdit) return;
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const body: Record<string, any> = {
        tax_enabled: !!form.taxEnabled,
        tax_rate: Number(form.taxRate) || 0,
        currency_symbol: form.currencySymbol || 'Rs.',
        receipt_footer_text: form.receiptFooterText || 'Thank you for your order!',
        updated_at: new Date().toISOString(),
      };

      const restaurant: Record<string, any> = {
        restaurant_name: form.restaurantName,
        restaurant_type: form.restaurantType,
        currency: form.currencySymbol,
        default_language: form.defaultLanguage,
        timezone: form.timezone,
        date_format: form.dateFormat,
        time_format: form.timeFormat,
        dark_mode: form.darkMode,
        default_landing_page: form.defaultLandingPage,
        email: form.email, phone: form.phone, secondary_phone: form.secondaryPhone,
        additional_emails: form.additionalEmails, website: form.website,
        business_name: form.businessName, business_type: form.businessType,
        ntn: form.ntn, strn: form.strn, fbr_status: form.fbrStatus,
        fbr_reg_date: form.fbrRegDate, fbr_pos_id: form.fbrPosId,
        fbr_invoice_prefix: form.fbrInvoicePrefix,
        show_ntn_receipt: form.showNtnReceipt, ntn_all_branches: form.ntnAllBranches,
        tagline: form.tagline, description: form.description,
        tax_name: form.taxName, tax_inclusive: form.taxInclusive,
        service_charge_enabled: form.serviceChargeEnabled,
        service_charge_name: form.serviceChargeName,
        service_charge_rate: form.serviceChargeRate,
        service_charge_dine_in: form.serviceChargeDineIn,
        service_charge_takeaway: form.serviceChargeTakeaway,
        service_charge_delivery: form.serviceChargeDelivery,
        service_charge_drive_thru: form.serviceChargeDriveThru,
        tax_service_charge: form.taxServiceCharge,
        receipt_header: form.receiptHeader,
        show_logo: form.showLogo, show_branch_address: form.showBranchAddress,
        show_phone: form.showPhone, show_ntn: form.showNtn,
        show_cashier_name: form.showCashierName, show_payment_method: form.showPaymentMethod,
        show_tax_breakdown: form.showTaxBreakdown, show_service_charge: form.showServiceCharge,
        thank_you_message: form.thankYouMessage,
        default_order_status: form.defaultOrderStatus,
        auto_send_to_kitchen: form.autoSendToKitchen,
        require_customer_delivery: form.requireCustomerDelivery,
        require_customer_credit: form.requireCustomerCredit,
        allow_edit_before_payment: form.allowEditBeforePayment,
        allow_edit_after_payment: form.allowEditAfterPayment,
        auto_print_receipt: form.autoPrintReceipt,
        default_payment_method: form.defaultPaymentMethod,
        low_stock_alerts: form.lowStockAlerts,
        default_low_stock_threshold: form.defaultLowStockThreshold,
        allow_negative_stock: form.allowNegativeStock,
        auto_deduct_ingredients: form.autoDeductIngredients,
        write_item_ledger: form.writeItemLedger,
      };

      body.enabled_modules = {
        ...(settings.enabled_modules || {}),
        modules: settings.enabled_modules?.modules || {},
        restaurant,
      };

      const result = await supa(slug, { table: 'settings', method: 'update', eq: ['id', settings.id], body });

      if (!result.ok) {
        setError(result.error || 'Save failed');
      } else {
        if (hoursChanged) {
          for (const h of localHours) {
            const hBody = { day_of_week: h.day_of_week, open_time: h.open_time, close_time: h.close_time, is_closed: h.is_closed };
            const existing = businessHours.find((bh) => bh.day_of_week === h.day_of_week);
            if (existing?.id) {
              await supa(slug, { table: 'business_hours', method: 'update', eq: ['id', existing.id], body: hBody });
            } else {
              await supa(slug, { table: 'business_hours', method: 'insert', body: hBody });
            }
          }
        }
        setSaved(true);
        initialFormRef.current = JSON.stringify(form);
        setTimeout(() => setSaved(false), 2000);
        load();
      }
    } catch (e: any) {
      setError(e.message || 'Save failed');
    }
    setSaving(false);
  }, [settings, canEdit, form, slug, load, hoursChanged, localHours, businessHours]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // --- Branch modal handlers ---
  const openBranchModal = (br?: BranchRow) => {
    setBranchModal({
      open: true,
      editing: br,
      data: br ? { ...br } : { name: '', address: '', city: '', province: '', postal_code: '', country: 'Pakistan', phone: '', email: '', is_default: false, is_active: true },
    });
  };

  const saveBranchModal = async () => {
    const d = branchModal.data;
    if (!d.name) return;
    setSaving(true);
    setError('');
    try {
      const body: Record<string, any> = { name: d.name, address: d.address, city: d.city, province: d.province, postal_code: d.postal_code, country: d.country || 'Pakistan', phone: d.phone, email: d.email, is_default: !!d.is_default, is_active: true };
      if (branchModal.editing?.id) {
        await supa(slug, { table: 'branches', method: 'update', eq: ['id', branchModal.editing.id], body });
      } else {
        await supa(slug, { table: 'branches', method: 'insert', body, select: '*' });
      }
      setBranchModal({ open: false, data: {} });
      load();
    } catch (e: any) { setError(e.message || 'Branch save failed'); }
    setSaving(false);
  };

  const deleteBranch = async (id: string) => {
    setError('');
    const r = await supa(slug, { table: 'branches', method: 'delete', eq: ['id', id] });
    if (!r.ok) { setError(r.error || 'Delete failed'); return; }
    load();
  };

  // --- Hours modal handlers ---
  const openHoursModal = () => {
    setEditHours(localHours.map((h) => ({ ...h })));
    setHoursModal(true);
  };

  const updateEditHour = (idx: number, field: keyof BusinessHoursRow, val: any) => {
    setEditHours((prev) => { const copy = [...prev]; copy[idx] = { ...copy[idx], [field]: val }; return copy; });
  };

  const copyHoursToWeekdays = () => {
    const mon = editHours.find((h) => h.day_of_week === 0);
    if (!mon) return;
    setEditHours((prev) => prev.map((h) => (h.day_of_week >= 0 && h.day_of_week <= 4 ? { ...mon, day_of_week: h.day_of_week, id: h.id } : h)));
  };

  const copyHoursToAllDays = () => {
    const mon = editHours.find((h) => h.day_of_week === 0);
    if (!mon) return;
    setEditHours((prev) => prev.map((h) => ({ ...mon, day_of_week: h.day_of_week, id: h.id })));
  };

  const saveHoursModal = () => {
    setLocalHours(editHours.map((h) => ({ ...h })));
    setHoursModal(false);
  };

  // --- Modules ---
  const modules = settings?.enabled_modules?.modules || {};
  const toggleModule = (key: string, val: boolean) => {
    if (!settings) return;
    const newModules = { ...modules, [key]: val };
    const newSettings = { ...settings, enabled_modules: { ...(settings.enabled_modules || {}), modules: newModules } };
    setSettings(newSettings);
  };

  // --- Preview data ---
  const previewData = useMemo(() => {
    const scRate = form.serviceChargeEnabled ? Number(form.serviceChargeRate) || 0 : 0;
    const scAmt = scRate > 0 ? 1000 * (scRate / 100) : 0;
    const taxRt = form.taxEnabled ? Number(form.taxRate) || 0 : 0;
    const taxable = form.taxServiceCharge ? 1000 + scAmt : 1000;
    const taxAmt = taxable * (taxRt / 100);
    const total = 1000 + scAmt + taxAmt;
    return { scRate, scAmt, taxRt, taxAmt, total, scName: form.serviceChargeName, taxName: form.taxName };
  }, [form]);

  // --- Summary ---
  const hoursSummary = useMemo(() => summarizeHours(localHours), [localHours]);

  // Ensure localHours always has 7 entries
  useEffect(() => {
    if (businessHours.length > 0 && localHours.length === 0) {
      setLocalHours(businessHours.map((h) => ({ ...h })));
    } else if (businessHours.length === 0 && localHours.length === 0) {
      setLocalHours(DAYS.map((_, i) => ({ day_of_week: i, open_time: i < 5 ? '09:00' : '10:00', close_time: i < 5 ? '22:00' : '23:00', is_closed: i === 6 })));
    }
  }, [businessHours, localHours.length]);

  if (!isLoaded || loading) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50 min-h-screen"><p className="text-gray-400 text-sm">Loading settings...</p></div>;
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 min-h-dvh min-h-screen">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-3 lg:px-4 py-2 flex items-center justify-end shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <select
            value={defaultBranch?.id || ''}
            onChange={(e) => {
              const br = branches.find((b) => b.id === e.target.value);
              if (br && canEdit) {
                branches.forEach((b) => supa(slug, { table: 'branches', method: 'update', eq: ['id', b.id], body: { is_default: b.id === br.id } }));
                load();
              }
            }}
            disabled={!canEdit || branches.length <= 1}
            className="text-xs px-2 py-1 border border-gray-200 rounded bg-white text-gray-700 max-w-[160px] truncate"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}{b.is_default ? ' (Default)' : ''}</option>
            ))}
          </select>
          {canEdit && (
            <button onClick={() => openBranchModal()} className="text-[11px] text-blue-600 hover:underline shrink-0">+ Add</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(dirty || hoursChanged) && <span className="text-[11px] text-amber-600 font-medium hidden sm:inline">Unsaved changes</span>}
          {saved && <span className="text-[11px] text-green-600 font-medium">Saved!</span>}
          {canEdit && (
            <button onClick={save} disabled={saving || (!dirty && !hoursChanged)}
              className="px-3.5 py-1.5 text-xs text-white rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: theme.primaryColor }}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {!canEdit && (
        <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-800 px-4 py-1.5 text-[11px] text-center">View-only mode. Contact an admin for edit access.</div>
      )}
      {error && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 px-4 py-1.5 text-[11px] text-center">{error}</div>
      )}

      {/* ── Main three-column grid ── */}
      <div className="flex-1 overflow-y-auto p-3 lg:p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[5fr_2.8fr_2.2fr] gap-3 max-w-[1600px] mx-auto">
          {/* ═══════════ LEFT COLUMN (50%) ═══════════ */}
          <div className="space-y-3">

            {/* 1. General Information */}
            <Card title="General Information">
              <Grid cols={3}>
                <div>{F('Restaurant Name', form.restaurantName, (v) => update('restaurantName', v), { placeholder: 'My Restaurant', disabled: !canEdit })}</div>
                <div>{F('Restaurant Type', form.restaurantType, (v) => update('restaurantType', v), { options: RESTAURANT_TYPES, disabled: !canEdit })}</div>
                <div>{F('Currency', form.currencySymbol, (v) => update('currencySymbol', v), { options: CURRENCIES, disabled: !canEdit })}</div>
                <div>{F('Default Language', form.defaultLanguage, (v) => update('defaultLanguage', v), { options: LANGUAGES, disabled: !canEdit })}</div>
                <div>{F('Timezone', form.timezone, (v) => update('timezone', v), { options: TIMEZONES, disabled: !canEdit })}</div>
                <div>{F('Date Format', form.dateFormat, (v) => update('dateFormat', v), { options: DATE_FORMATS, disabled: !canEdit })}</div>
                <div>{F('Time Format', form.timeFormat, (v) => update('timeFormat', v), { options: TIME_FORMATS, disabled: !canEdit })}</div>
                <div>{F('Default Landing Page', form.defaultLandingPage, (v) => update('defaultLandingPage', v), { options: LANDING_PAGES, disabled: !canEdit })}</div>
                <div>{F('Dark Mode', form.darkMode, (v) => update('darkMode', v), { type: 'checkbox', disabled: !canEdit, help: 'Dark theme for POS' })}</div>
              </Grid>
            </Card>

            {/* 2. Contact Information */}
            <Card title="Contact Information">
              <Grid cols={2}>
                <div>{F('Restaurant Email', form.email, (v) => update('email', v), { placeholder: 'info@restaurant.com', type: 'email', disabled: !canEdit })}</div>
                <div>{F('Primary Phone', form.phone, (v) => update('phone', v), { placeholder: '+92 300 1234567', type: 'tel', disabled: !canEdit })}</div>
                <div>{F('Secondary Phone', form.secondaryPhone, (v) => update('secondaryPhone', v), { placeholder: '+92 300 1234567', type: 'tel', disabled: !canEdit })}</div>
                <div>{F('Additional Emails', form.additionalEmails, (v) => update('additionalEmails', v), { placeholder: 'Comma separated', type: 'email', disabled: !canEdit })}</div>
                <div className="md:col-span-2">{F('Website', form.website, (v) => update('website', v), { placeholder: 'https://restaurant.com', type: 'url', disabled: !canEdit })}</div>
              </Grid>
            </Card>

            {/* 3. Business Details */}
            <Card title="Business Details">
              <Grid cols={2}>
                <div>{F('Legal Business Name', form.businessName, (v) => update('businessName', v), { placeholder: 'Legal entity name', disabled: !canEdit })}</div>
                <div>{F('Business Type', form.businessType, (v) => update('businessType', v), { options: BUSINESS_TYPES, disabled: !canEdit })}</div>
                <div>{F('NTN', form.ntn, (v) => update('ntn', v), { placeholder: 'National Tax Number', disabled: !canEdit })}</div>
                <div>{F('Tagline', form.tagline, (v) => update('tagline', v), { placeholder: 'Short business tagline', disabled: !canEdit })}</div>
                <div className="md:col-span-2">{F('Description', form.description, (v) => update('description', v), { type: 'textarea', placeholder: 'Business description', disabled: !canEdit })}</div>
              </Grid>
              <div className="grid grid-cols-4 gap-2 mt-2 pt-2 border-t border-gray-100">
                <div className="bg-gray-50 rounded p-1.5 text-center"><p className="text-sm font-bold text-gray-700">{counts['branches'] || 0}</p><p className="text-[10px] text-gray-500">Branches</p></div>
                <div className="bg-gray-50 rounded p-1.5 text-center"><p className="text-sm font-bold text-gray-700">{counts['tables'] || 0}</p><p className="text-[10px] text-gray-500">Tables</p></div>
                <div className="bg-gray-50 rounded p-1.5 text-center"><p className="text-sm font-bold text-gray-700">{counts['staff'] || 0}</p><p className="text-[10px] text-gray-500">Staff</p></div>
                <div className="bg-gray-50 rounded p-1.5 text-center"><p className="text-sm font-bold text-gray-700">{counts['menu_items'] || 0}</p><p className="text-[10px] text-gray-500">Menu Items</p></div>
              </div>
            </Card>

            {/* 4. Legal & FBR Information */}
            <Card title="Legal & FBR Information">
              <Grid cols={2}>
                <div>{F('NTN Number', form.ntn, (v) => update('ntn', v), { placeholder: 'National Tax Number', disabled: !canEdit })}</div>
                <div>{F('STRN Number', form.strn, (v) => update('strn', v), { placeholder: 'Sales Tax Registration Number', disabled: !canEdit })}</div>
                <div>{F('Registration Type', form.businessType, (v) => update('businessType', v), { options: BUSINESS_TYPES, disabled: !canEdit })}</div>
                <div>{F('FBR Registration Status', form.fbrStatus, (v) => update('fbrStatus', v), { options: [
                  { value: 'unregistered', label: 'Unregistered' },
                  { value: 'registered', label: 'Registered' },
                  { value: 'pending', label: 'Pending' },
                ], disabled: !canEdit })}</div>
                {form.fbrStatus === 'registered' && (
                  <>
                    <div>{F('Registration Date', form.fbrRegDate, (v) => update('fbrRegDate', v), { type: 'date', disabled: !canEdit, help: 'Cannot be in the future' })}</div>
                    <div>{F('POS Integration ID', form.fbrPosId, (v) => update('fbrPosId', v), { placeholder: 'FBR POS ID', disabled: !canEdit })}</div>
                    <div>{F('Fiscal Invoice Prefix', form.fbrInvoicePrefix, (v) => update('fbrInvoicePrefix', v), { placeholder: 'INV-', disabled: !canEdit })}</div>
                    <div>{F('Show NTN on Receipt', form.showNtnReceipt, (v) => update('showNtnReceipt', v), { type: 'checkbox', disabled: !canEdit })}</div>
                    <div>{F('Use Tenant NTN for All Branches', form.ntnAllBranches, (v) => update('ntnAllBranches', v), { type: 'checkbox', disabled: !canEdit })}</div>
                  </>
                )}
              </Grid>
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800 leading-tight">
                FBR details are stored for receipts and business records. Automatic fiscal submission is not connected.
              </div>
            </Card>

            {/* 5. Logo and Branding */}
            <Card title="Logo and Branding">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-gray-100 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-[10px] shrink-0">Logo</div>
                <div className="flex gap-1.5">
                  <button disabled className="px-2.5 py-1 text-[11px] text-gray-500 bg-gray-100 border border-gray-200 rounded cursor-not-allowed">Change Logo</button>
                  <button disabled className="px-2.5 py-1 text-[11px] text-gray-500 bg-gray-100 border border-gray-200 rounded cursor-not-allowed">Remove Logo</button>
                  <span className="text-[10px] text-gray-400 self-center">Coming Soon</span>
                </div>
              </div>
              <Grid cols={2}>
                <div>{F('Tagline', form.tagline, (v) => update('tagline', v), { placeholder: 'Short tagline', disabled: !canEdit })}</div>
                <div>{F('Description', form.description, (v) => update('description', v), { placeholder: 'Brief description', disabled: !canEdit })}</div>
              </Grid>
            </Card>

          </div>

          {/* ═══════════ MIDDLE COLUMN (28%) ═══════════ */}
          <div className="space-y-3">

            {/* 6. Branch Addresses */}
            <Card title="Branch Addresses">
              {branches.length === 0 ? (
                <p className="text-xs text-gray-400">No branches configured.</p>
              ) : (
                <div className="space-y-2">
                  {branches.map((b) => (
                    <div key={b.id} className="flex items-start justify-between p-2 bg-gray-50 border border-gray-100 rounded">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-gray-700">{b.name}</span>
                          {b.is_default && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Default</span>}
                        </div>
                        <p className="text-[11px] text-gray-500 truncate mt-0.5">{b.address || b.city || 'No address'}{b.phone ? ` | ${b.phone}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {canEdit && (
                          <>
                            <button onClick={() => openBranchModal(b)} className="text-[11px] text-blue-600 hover:underline">Edit</button>
                            {!b.is_default && (
                              <button onClick={() => deleteBranch(b.id)} className="text-[11px] text-red-500 hover:underline">Del</button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {canEdit && (
                <button onClick={() => openBranchModal()} className="mt-2 text-xs text-blue-600 hover:underline">+ Add Branch</button>
              )}
            </Card>

            {/* 7. Business Hours */}
            <Card title="Business Hours">
              <div className="space-y-1 text-[11px]">
                {hoursSummary.map((s, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-gray-600 font-medium">{s.label}</span>
                    <span className={s.text === 'Closed' ? 'text-red-500' : 'text-gray-700'}>{s.text}</span>
                  </div>
                ))}
              </div>
              {canEdit && (
                <button onClick={openHoursModal} className="mt-2 text-xs text-blue-600 hover:underline">Edit Hours</button>
              )}
            </Card>

            {/* 8. Tax & Service Charge */}
            <Card title="Tax & Service Charge">
              <p className="text-[11px] font-medium text-gray-600 mb-1">Tax</p>
              <Grid cols={2}>
                <div>{F('Enable Tax', form.taxEnabled, (v) => update('taxEnabled', v), { type: 'checkbox', disabled: !canEdit })}</div>
                {form.taxEnabled && (
                  <>
                    <div>{F('Name', form.taxName, (v) => update('taxName', v), { placeholder: 'GST', disabled: !canEdit })}</div>
                    <div>{F('Rate (%)', form.taxRate, (v) => update('taxRate', v), { type: 'number', min: 0, max: 100, step: '0.01', disabled: !canEdit })}</div>
                    <div>{F('Inclusive', form.taxInclusive, (v) => update('taxInclusive', v), { type: 'checkbox', disabled: !canEdit })}</div>
                  </>
                )}
              </Grid>
              <p className="text-[11px] font-medium text-gray-600 mt-2 mb-1">Service Charge</p>
              <Grid cols={2}>
                <div>{F('Enable SC', form.serviceChargeEnabled, (v) => update('serviceChargeEnabled', v), { type: 'checkbox', disabled: !canEdit })}</div>
                {form.serviceChargeEnabled && (
                  <>
                    <div>{F('Name', form.serviceChargeName, (v) => update('serviceChargeName', v), { placeholder: 'Service Charge', disabled: !canEdit })}</div>
                    <div>{F('Rate (%)', form.serviceChargeRate, (v) => update('serviceChargeRate', v), { type: 'number', min: 0, max: 100, step: '0.1', disabled: !canEdit })}</div>
                    <div>{F('Dine In', form.serviceChargeDineIn, (v) => update('serviceChargeDineIn', v), { type: 'checkbox', disabled: !canEdit })}</div>
                    <div>{F('Take Away', form.serviceChargeTakeaway, (v) => update('serviceChargeTakeaway', v), { type: 'checkbox', disabled: !canEdit })}</div>
                    <div>{F('Delivery', form.serviceChargeDelivery, (v) => update('serviceChargeDelivery', v), { type: 'checkbox', disabled: !canEdit })}</div>
                    <div>{F('Drive Thru', form.serviceChargeDriveThru, (v) => update('serviceChargeDriveThru', v), { type: 'checkbox', disabled: !canEdit })}</div>
                    <div>{F('Tax SC', form.taxServiceCharge, (v) => update('taxServiceCharge', v), { type: 'checkbox', disabled: !canEdit, help: 'Tax on service charge' })}</div>
                  </>
                )}
              </Grid>
            </Card>

            {/* 9. Receipt Settings */}
            <Card title="Receipt Settings">
              <Grid cols={2}>
                <div>{F('Header', form.receiptHeader, (v) => update('receiptHeader', v), { placeholder: 'Header text', disabled: !canEdit })}</div>
                <div>{F('Footer', form.receiptFooterText, (v) => update('receiptFooterText', v), { placeholder: 'Thank you!', disabled: !canEdit })}</div>
                <div className="md:col-span-2">{F('Thank You Message', form.thankYouMessage, (v) => update('thankYouMessage', v), { placeholder: 'Visit again!', disabled: !canEdit })}</div>
              </Grid>
              <div className="grid grid-cols-2 gap-x-2 mt-1">
                <CompactToggle label="Show Logo" checked={form.showLogo} onChange={(v) => update('showLogo', v)} disabled={!canEdit} />
                <CompactToggle label="Show Address" checked={form.showBranchAddress} onChange={(v) => update('showBranchAddress', v)} disabled={!canEdit} />
                <CompactToggle label="Show Phone" checked={form.showPhone} onChange={(v) => update('showPhone', v)} disabled={!canEdit} />
                <CompactToggle label="Show NTN" checked={form.showNtn} onChange={(v) => update('showNtn', v)} disabled={!canEdit} />
                <CompactToggle label="Show Cashier" checked={form.showCashierName} onChange={(v) => update('showCashierName', v)} disabled={!canEdit} />
                <CompactToggle label="Show Payment Method" checked={form.showPaymentMethod} onChange={(v) => update('showPaymentMethod', v)} disabled={!canEdit} />
                <CompactToggle label="Show Tax Breakdown" checked={form.showTaxBreakdown} onChange={(v) => update('showTaxBreakdown', v)} disabled={!canEdit} />
                <CompactToggle label="Show Service Charge" checked={form.showServiceCharge} onChange={(v) => update('showServiceCharge', v)} disabled={!canEdit} />
              </div>
            </Card>

          </div>

          {/* ═══════════ RIGHT SIDEBAR (22%) ═══════════ */}
          <div className="space-y-3">

            {/* 10. Restaurant Preview */}
            <Card title="Restaurant Preview">
              <div className="text-center">
                <div className="w-12 h-12 bg-gray-100 rounded-full mx-auto mb-1.5 flex items-center justify-center text-gray-400 text-[10px]">Logo</div>
                <p className="font-bold text-gray-800 text-xs">{form.businessName || form.restaurantName || (defaultBranch?.name || 'Restaurant')}</p>
                {form.tagline && <p className="text-[10px] text-gray-500 mt-0.5">{form.tagline}</p>}
                <div className="text-[10px] text-gray-400 mt-1.5 space-y-0.5">
                  {form.restaurantType && <p>{RESTAURANT_TYPES.find((t) => t.value === form.restaurantType)?.label || form.restaurantType}</p>}
                  {form.phone && <p>{form.phone}</p>}
                  {form.email && <p className="truncate">{form.email}</p>}
                  {defaultBranch?.city && <p>{defaultBranch.city}{defaultBranch.country ? `, ${defaultBranch.country}` : ''}</p>}
                </div>
              </div>
              <hr className="my-2 border-gray-200" />
              <p className="text-[10px] font-semibold text-gray-600 mb-1.5 text-center">Receipt Preview</p>
              <div className="bg-gray-50 rounded p-2 border border-dashed border-gray-200 text-[10px]">
                <div className="text-center">
                  <p className="font-bold text-gray-800">{form.businessName || form.restaurantName || 'Restaurant'}</p>
                  {form.receiptHeader && <p className="text-gray-500">{form.receiptHeader}</p>}
                </div>
                <hr className="my-1 border-dashed border-gray-300" />
                <div className="space-y-0.5 text-gray-600">
                  <div className="flex justify-between"><span>Item x 2</span><span>1,000</span></div>
                  <div className="flex justify-between"><span>Item x 1</span><span>500</span></div>
                  {form.serviceChargeEnabled && previewData.scRate > 0 && (
                    <div className="flex justify-between text-gray-400"><span>{previewData.scName} ({previewData.scRate}%)</span><span>{previewData.scAmt.toFixed(0)}</span></div>
                  )}
                  {form.taxEnabled && previewData.taxRt > 0 && (
                    <div className="flex justify-between text-gray-400"><span>{previewData.taxName} ({previewData.taxRt}%)</span><span>{previewData.taxAmt.toFixed(0)}</span></div>
                  )}
                  <hr className="border-gray-200" />
                  <div className="flex justify-between font-bold text-gray-800"><span>Total</span><span>{previewData.total.toFixed(0)}</span></div>
                </div>
                <hr className="my-1 border-dashed border-gray-300" />
                <p className="text-center text-gray-400">{form.receiptFooterText}</p>
                {form.thankYouMessage && <p className="text-center text-gray-400 mt-0.5">{form.thankYouMessage}</p>}
              </div>
            </Card>

            {/* 11. Business Summary */}
            <Card title="Business Summary">
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><span className="text-gray-500">Branches</span><span className="font-semibold text-gray-800">{counts['branches'] || 0}</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-500">Tables</span><span className="font-semibold text-gray-800">{counts['tables'] || 0}</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-500">Staff</span><span className="font-semibold text-gray-800">{counts['staff'] || 0}</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-500">Menu Items</span><span className="font-semibold text-gray-800">{counts['menu_items'] || 0}</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-500">Default Currency</span><span className="font-semibold text-gray-800">{form.currencySymbol || 'Rs.'}</span></div>
              </div>
            </Card>

            {/* 12. System Settings */}
            <Card title="System Settings">
              <p className="text-[10px] text-gray-400 mb-1.5">Toggle available modules</p>
              <div className="space-y-0.5">
                {SYSTEM_MODULES.map((m) => (
                  <CompactToggle key={m.key} label={m.label} checked={modules[m.key] !== false} onChange={(v) => toggleModule(m.key, v)} disabled={!canEdit} />
                ))}
              </div>
            </Card>

            {/* 13. Order Controls */}
            <Card title="Order Controls">
              <div className="mb-1.5">
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Default Order Status</label>
                <select value={form.defaultOrderStatus} onChange={(e) => update('defaultOrderStatus', e.target.value)} disabled={!canEdit}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400">
                  {ORDER_STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <CompactToggle label="Auto-send to Kitchen" checked={form.autoSendToKitchen} onChange={(v) => update('autoSendToKitchen', v)} disabled={!canEdit} />
              <CompactToggle label="Require Customer for Delivery" checked={form.requireCustomerDelivery} onChange={(v) => update('requireCustomerDelivery', v)} disabled={!canEdit} />
              <CompactToggle label="Require Customer for Credit" checked={form.requireCustomerCredit} onChange={(v) => update('requireCustomerCredit', v)} disabled={!canEdit} />
              <CompactToggle label="Allow Edit Before Payment" checked={form.allowEditBeforePayment} onChange={(v) => update('allowEditBeforePayment', v)} disabled={!canEdit} />
              <CompactToggle label="Allow Edit After Payment" checked={form.allowEditAfterPayment} onChange={(v) => update('allowEditAfterPayment', v)} disabled={!canEdit} />
              <CompactToggle label="Auto-print Receipt" checked={form.autoPrintReceipt} onChange={(v) => update('autoPrintReceipt', v)} disabled={!canEdit} />
              <div className="mt-1.5">
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Default Payment Method</label>
                <select value={form.defaultPaymentMethod} onChange={(e) => update('defaultPaymentMethod', e.target.value)} disabled={!canEdit}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400">
                  {PAYMENT_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </Card>

            {/* 14. Inventory Controls */}
            <Card title="Inventory Controls">
              <CompactToggle label="Low Stock Alerts" checked={form.lowStockAlerts} onChange={(v) => update('lowStockAlerts', v)} disabled={!canEdit} />
              {form.lowStockAlerts && (
                <div className="mb-1.5">
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Default Threshold</label>
                  <input type="number" value={form.defaultLowStockThreshold} onChange={(e) => update('defaultLowStockThreshold', e.target.value)} disabled={!canEdit}
                    min={0} step="1" className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400" />
                </div>
              )}
              <CompactToggle label="Allow Negative Stock" checked={form.allowNegativeStock} onChange={(v) => update('allowNegativeStock', v)} disabled={!canEdit} />
              <CompactToggle label="Auto-deduct Ingredients" checked={form.autoDeductIngredients} onChange={(v) => update('autoDeductIngredients', v)} disabled={!canEdit} />
              <CompactToggle label="Write Item Ledger" checked={form.writeItemLedger} onChange={(v) => update('writeItemLedger', v)} disabled={!canEdit} />
            </Card>

            {/* 15. Data Management */}
            <Card title="Data Management">
              <p className="text-[10px] text-gray-400 mb-1.5">Export, backup, and restore operations.</p>
              <div className="flex flex-col gap-1.5">
                <button disabled className="w-full px-3 py-1.5 text-[11px] text-gray-500 bg-gray-100 border border-gray-200 rounded cursor-not-allowed">Export Settings</button>
                <button disabled className="w-full px-3 py-1.5 text-[11px] text-gray-500 bg-gray-100 border border-gray-200 rounded cursor-not-allowed">Export Menu / Data</button>
                <button disabled className="w-full px-3 py-1.5 text-[11px] text-gray-500 bg-gray-100 border border-gray-200 rounded cursor-not-allowed">Backup Now</button>
                <button disabled className="w-full px-3 py-1.5 text-[11px] text-gray-500 bg-gray-100 border border-gray-200 rounded cursor-not-allowed">Restore</button>
                <p className="text-[10px] text-gray-400 text-center">Coming Soon</p>
              </div>
            </Card>

          </div>
        </div>

        {/* ── Mobile sticky save bar ── */}
        {canEdit && (dirty || hoursChanged) && (
          <div className="sticky bottom-0 z-20 lg:hidden bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between mt-3">
            <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
            <button onClick={save} disabled={saving} className="px-5 py-2 text-sm text-white rounded font-medium disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {/* ── Branch Modal ── */}
      {branchModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-xl shadow-lg p-5 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-800 mb-4">{branchModal.editing ? 'Edit Branch' : 'Add Branch'}</h3>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Branch Name *</label>
                <input type="text" value={branchModal.data.name || ''} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, name: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                <input type="text" value={branchModal.data.address || ''} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, address: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                  <input type="text" value={branchModal.data.city || ''} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, city: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Province</label>
                  <input type="text" value={branchModal.data.province || ''} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, province: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Postal Code</label>
                  <input type="text" value={branchModal.data.postal_code || ''} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, postal_code: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
                  <input type="text" value={branchModal.data.country || 'Pakistan'} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, country: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                <input type="tel" value={branchModal.data.phone || ''} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, phone: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input type="email" value={branchModal.data.email || ''} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, email: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveBranchModal} disabled={saving || !branchModal.data.name} className="px-4 py-2 text-sm text-white rounded disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>{saving ? 'Saving...' : 'Save'}</button>
              <button onClick={() => setBranchModal({ open: false, data: {} })} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hours Editing Modal ── */}
      {hoursModal && editHours.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-xl shadow-lg p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-800 mb-4">Edit Business Hours</h3>
            <div className="space-y-2 mb-4">
              {editHours.sort((a, b) => a.day_of_week - b.day_of_week).map((h, idx) => {
                const realIdx = editHours.findIndex((eh) => eh.day_of_week === h.day_of_week);
                return (
                  <div key={h.day_of_week} className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0 flex-wrap">
                    <span className="w-20 text-sm font-medium text-gray-700 shrink-0">{DAYS[h.day_of_week]}</span>
                    <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                      <input type="checkbox" checked={h.is_closed} onChange={(e) => updateEditHour(realIdx, 'is_closed', e.target.checked)} className="w-3.5 h-3.5" />
                      Closed
                    </label>
                    {!h.is_closed && (
                      <>
                        <input type="time" value={formatTime24(h.open_time)} onChange={(e) => updateEditHour(realIdx, 'open_time', e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs w-28" />
                        <span className="text-xs text-gray-400">to</span>
                        <input type="time" value={formatTime24(h.close_time)} onChange={(e) => updateEditHour(realIdx, 'close_time', e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs w-28" />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mb-4 flex-wrap">
              <button onClick={copyHoursToWeekdays} className="px-3 py-1 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50">Copy Mon to Weekdays</button>
              <button onClick={copyHoursToAllDays} className="px-3 py-1 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50">Copy to All Days</button>
            </div>
            <div className="flex gap-2">
              <button onClick={saveHoursModal} className="px-4 py-2 text-sm text-white rounded" style={{ backgroundColor: theme.primaryColor }}>Done</button>
              <button onClick={() => setHoursModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
