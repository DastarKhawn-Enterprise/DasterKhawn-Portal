'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

const LANDING_PAGES = [
  { value: 'pos', label: 'POS' },
  { value: 'orders', label: 'Orders' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'menu', label: 'Menu' },
];

const SECTION_LABELS: Record<string, string> = {
  branches: 'Branch Selector',
  general: 'General Information',
  contact: 'Contact Information',
  business: 'Business Details',
  branch_addr: 'Branch Addresses',
  hours: 'Business Hours',
  legal: 'Legal & FBR Information',
  taxes: 'Tax & Service Charge',
  receipt: 'Receipt Settings',
  orders: 'Order Settings',
  inventory: 'Inventory Settings',
  logo: 'Logo and Branding',
};

const SECTION_IDS = Object.keys(SECTION_LABELS);

function F(label: string, value: any, onChange: (v: any) => void, opts?: { type?: string; disabled?: boolean; help?: string; placeholder?: string; min?: number; max?: number; step?: string; options?: { value: string; label: string }[]; rows?: number; wide?: boolean }) {
  const baseCls = 'w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400';
  const wideCls = opts?.wide ? '' : 'md:max-w-xs';
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {opts?.options ? (
        <select value={String(value)} onChange={(e) => onChange(e.target.value)} disabled={opts?.disabled || false} className={`${baseCls} ${wideCls} bg-white`}>
          {opts.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : opts?.type === 'checkbox' ? (
        <label className="flex items-center gap-2 cursor-pointer mt-1">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} disabled={opts?.disabled || false} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50" />
        </label>
      ) : opts?.type === 'textarea' ? (
        <textarea value={String(value)} onChange={(e) => onChange(e.target.value)} disabled={opts?.disabled || false} placeholder={opts?.placeholder} rows={opts?.rows || 3} className={`${baseCls} ${wideCls}`} />
      ) : (
        <input type={opts?.type || 'text'} value={String(value)} onChange={(e) => onChange(opts?.type === 'number' ? e.target.value : e.target.value)} disabled={opts?.disabled || false} placeholder={opts?.placeholder} min={opts?.min} max={opts?.max} step={opts?.step} className={`${baseCls} ${wideCls}`} />
      )}
      {opts?.help && <p className="text-xs text-gray-400 mt-0.5">{opts.help}</p>}
    </div>
  );
}

function Card({ id, title, children, className }: { id?: string; title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div id={id} className={`bg-white rounded-xl border border-gray-200 p-5 mb-4 ${className || ''}`}>
      {title && <h2 className="text-base font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">{title}</h2>}
      {children}
    </div>
  );
}

function Grid({ cols = 2, children }: { cols?: 1 | 2 | 3; children: React.ReactNode }) {
  return <div className={`grid grid-cols-1 md:grid-cols-${cols} gap-x-6 gap-y-1`}>{children}</div>;
}

function formatTime24(val: string | null | undefined): string {
  if (!val) return '';
  const parts = val.split(':');
  if (parts.length >= 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  return val;
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
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [initBranch, setInitBranch] = useState(false);

  // Branch modal state
  const [branchModal, setBranchModal] = useState<{ open: boolean; editing?: BranchRow; data: Partial<BranchRow> }>({ open: false, data: {} });

  // Hours editing (in-place, not modal)
  const [hoursDirty, setHoursDirty] = useState(false);
  const [localHours, setLocalHours] = useState<BusinessHoursRow[]>([]);

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

  // Compute dirty state
  const formJson = useMemo(() => JSON.stringify(form), [form]);
  const dirty = formJson !== initialFormRef.current && initialFormRef.current !== '';
  const hoursChanged = useMemo(() => JSON.stringify(localHours) !== JSON.stringify(businessHours.map((h) => ({ day_of_week: h.day_of_week, open_time: h.open_time, close_time: h.close_time, is_closed: h.is_closed }))), [localHours, businessHours]);

  // Track dirty for hours
  const [hoursSaved, setHoursSaved] = useState(false);

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
      const countResults = await Promise.all(
        countKeys.map((t) => supa(slug, { table: t, select: 'id', head: true })),
      );
      const countMap: Record<string, number> = {};
      countKeys.forEach((t, i) => {
        if (countResults[i].ok) countMap[t] = Number(countResults[i].count || 0);
      });
      setCounts(countMap);

      // Branch initialization: if no branches exist and tenant is operating, create Main Branch
      if (bRes.ok && bRes.data && bRes.data.length === 0 && !initBranch) {
        const hasOrders = countMap['menu_items'] > 0 || countMap['tables'] > 0;
        if (hasOrders) {
          setInitBranch(true);
          const insRes = await supa(slug, {
            table: 'branches', method: 'insert', body: { name: 'Main Branch', country: 'Pakistan', is_default: true, is_active: true }, select: '*',
          });
          if (insRes.ok && insRes.data) {
            setBranches(insRes.data as unknown as BranchRow[]);
          }
        }
      }
    } catch (e: any) {
      console.error('[Settings] load error:', e);
      setError(e.message || 'Failed to load settings');
    }
    setLoading(false);
  }, [slug, initBranch]);

  useEffect(() => {
    if (isLoaded) load();
  }, [isLoaded, load]);

  // Sync form when settings loaded
  useEffect(() => {
    if (!settings) return;
    const rest = settings.enabled_modules?.restaurant || {};
    const g = (key: string, fallback: any = '') => rest[key] ?? fallback;
    const newForm = {
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
    setForm(newForm);
    initialFormRef.current = JSON.stringify(newForm);
  }, [settings]);

  const update = useCallback((key: keyof typeof form, value: any) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const g = useCallback((key: keyof typeof form) => form[key], [form]);

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

      const result = await supa(slug, {
        table: 'settings', method: 'update', eq: ['id', settings.id], body,
      });

      if (!result.ok) {
        setError(result.error || 'Save failed');
      } else {
        // Save hours if changed
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

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const defaultBranch = branches.find((b) => b.is_default) || branches[0];

  // Branch modal
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

  // Hours helpers
  const updateHour = (idx: number, field: keyof BusinessHoursRow, val: any) => {
    setLocalHours((prev) => { const copy = [...prev]; copy[idx] = { ...copy[idx], [field]: val }; return copy; });
    setHoursDirty(true);
  };

  const copyHoursToWeekdays = () => {
    if (localHours.length === 0) return;
    const monIdx = localHours.findIndex((h) => h.day_of_week === 0);
    if (monIdx < 0) return;
    const mon = localHours[monIdx];
    setLocalHours((prev) => prev.map((h, i) => (h.day_of_week >= 0 && h.day_of_week <= 4 ? { ...mon, day_of_week: h.day_of_week, id: h.id } : h)));
    setHoursDirty(true);
  };

  const copyHoursFromMonday = (targetDay: number) => {
    const mon = localHours.find((h) => h.day_of_week === 0);
    if (!mon) return;
    setLocalHours((prev) => prev.map((h) => (h.day_of_week === targetDay ? { ...mon, day_of_week: targetDay, id: h.id } : h)));
    setHoursDirty(true);
  };

  const saveHoursOnly = async () => {
    setSaving(true);
    setError('');
    try {
      for (const h of localHours) {
        const hBody = { day_of_week: h.day_of_week, open_time: h.open_time, close_time: h.close_time, is_closed: h.is_closed };
        const existing = businessHours.find((bh) => bh.day_of_week === h.day_of_week);
        if (existing?.id) {
          await supa(slug, { table: 'business_hours', method: 'update', eq: ['id', existing.id], body: hBody });
        } else {
          const ins = await supa(slug, { table: 'business_hours', method: 'insert', body: hBody, select: '*' });
          if (ins.ok && ins.data?.[0]) {
            setLocalHours((prev) => prev.map((lh) => lh.day_of_week === h.day_of_week ? { ...lh, id: ins.data[0].id } : lh));
          }
        }
      }
      setHoursDirty(false);
      setHoursSaved(true);
      setTimeout(() => setHoursSaved(false), 2000);
      load();
    } catch (e: any) { setError(e.message || 'Hours save failed'); }
    setSaving(false);
  };

  const modules = settings?.enabled_modules?.modules || {};
  const toggleModule = (key: string, val: boolean) => {
    if (!settings) return;
    const newModules = { ...modules, [key]: val };
    const newSettings = { ...settings, enabled_modules: { ...(settings.enabled_modules || {}), modules: newModules } };
    setSettings(newSettings);
  };

  const previewData = useMemo(() => {
    const scRate = form.serviceChargeEnabled ? Number(form.serviceChargeRate) || 0 : 0;
    const scAmt = scRate > 0 ? 1000 * (scRate / 100) : 0;
    const taxRt = form.taxEnabled ? Number(form.taxRate) || 0 : 0;
    const taxable = form.taxServiceCharge ? 1000 + scAmt : 1000;
    const taxAmt = taxable * (taxRt / 100);
    const total = 1000 + scAmt + taxAmt;
    return { scRate, scAmt, taxRt, taxAmt, total, scName: form.serviceChargeName, taxName: form.taxName };
  }, [form]);

  const sectionNav = useMemo(() => SECTION_IDS.filter((id) => id !== 'branch_addr' || branches.length > 0), [branches]);

  if (!isLoaded || loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 min-h-screen">
        <p className="text-gray-500">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 min-h-screen">
      {/* Top header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 lg:px-6 py-3 flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Settings</span>
            <span>/</span>
            <span className="text-gray-700 font-medium truncate">Restaurant Settings</span>
          </div>
          <h1 className="text-lg font-bold text-gray-800 mt-0.5">Restaurant Settings</h1>
        </div>
        <div className="flex items-center gap-3">
          {(dirty || hoursDirty) && <span className="text-xs text-amber-600 font-medium hidden sm:inline">Unsaved changes</span>}
          {saved && <span className="text-xs text-green-600 font-medium">Saved!</span>}
          {canEdit && (
            <button onClick={save} disabled={saving || (!dirty && !hoursDirty)}
              className="px-5 py-2 text-sm text-white rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: theme.primaryColor }}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {!canEdit && (
        <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-800 px-4 py-2 text-xs text-center">
          View-only mode. Contact an admin for edit access.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 px-4 py-2 text-xs text-center">
          {error}
        </div>
      )}

      {/* Section nav (sticky, horizontal scroll on mobile) */}
      <div className="sticky top-14 z-10 bg-white border-b border-gray-200 overflow-x-auto scrollbar-hide shrink-0">
        <div className="flex gap-1 px-4 lg:px-6 py-2 text-xs font-medium whitespace-nowrap min-w-0">
          <span className="text-gray-400 mr-1 hidden sm:inline">Jump to:</span>
          {sectionNav.map((id) => (
            <button key={id} onClick={() => {
              const el = document.getElementById(`card-${id}`);
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
              className="px-2.5 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors shrink-0">
              {SECTION_LABELS[id]}
            </button>
          ))}
        </div>
      </div>

      {/* Main content: 72% form + 28% sidebar */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0 lg:gap-6 p-4 lg:p-6 max-w-7xl mx-auto w-full">
        {/* Left: main form cards */}
        <div className="flex-1 min-w-0 lg:w-[72%]">
          {/* 1. Branch Selector */}
          <Card id="card-branches" title="Branch Selector">
            {branches.length === 0 ? (
              <p className="text-sm text-gray-400">No branches configured.</p>
            ) : (
              <div className="flex flex-wrap gap-2 mb-3">
                {branches.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                    <span className="text-gray-700 font-medium">{b.name}</span>
                    {b.is_default && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Default</span>}
                    {canEdit && (
                      <div className="flex gap-1 ml-1">
                        <button onClick={() => openBranchModal(b)} className="text-xs text-blue-600 hover:underline">Edit</button>
                        <button onClick={() => deleteBranch(b.id)} className="text-xs text-red-500 hover:underline">Del</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {canEdit && (
              <button onClick={() => openBranchModal()} className="text-sm text-blue-600 hover:underline">
                + Add Branch
              </button>
            )}
          </Card>

          {/* 2. General Information */}
          <Card id="card-general" title="General Information">
            <Grid cols={2}>
              <div>{F('Restaurant Name', form.restaurantName, (v) => update('restaurantName', v), { placeholder: 'My Restaurant', disabled: !canEdit })}</div>
              <div>{F('Restaurant Type', form.restaurantType, (v) => update('restaurantType', v), { options: RESTAURANT_TYPES, disabled: !canEdit })}</div>
              <div>{F('Currency', form.currencySymbol, (v) => update('currencySymbol', v), { options: CURRENCIES, disabled: !canEdit })}</div>
              <div>{F('Default Language', form.defaultLanguage, (v) => update('defaultLanguage', v), { options: LANGUAGES, disabled: !canEdit })}</div>
              <div>{F('Timezone', form.timezone, (v) => update('timezone', v), { options: TIMEZONES, disabled: !canEdit })}</div>
              <div>{F('Date Format', form.dateFormat, (v) => update('dateFormat', v), { options: DATE_FORMATS, disabled: !canEdit })}</div>
              <div>{F('Time Format', form.timeFormat, (v) => update('timeFormat', v), { options: TIME_FORMATS, disabled: !canEdit })}</div>
              <div>{F('Default Landing Page', form.defaultLandingPage, (v) => update('defaultLandingPage', v), { options: LANDING_PAGES, disabled: !canEdit })}</div>
              <div className="md:col-span-2">{F('Dark Mode', form.darkMode, (v) => update('darkMode', v), { type: 'checkbox', disabled: !canEdit, help: 'Use dark theme for the POS interface' })}</div>
            </Grid>
          </Card>

          {/* 3. Contact Information */}
          <Card id="card-contact" title="Contact Information">
            <Grid cols={2}>
              <div>{F('Restaurant Email', form.email, (v) => update('email', v), { placeholder: 'info@restaurant.com', type: 'email', disabled: !canEdit })}</div>
              <div>{F('Primary Phone', form.phone, (v) => update('phone', v), { placeholder: '+92 300 1234567', type: 'tel', disabled: !canEdit })}</div>
              <div>{F('Secondary Phone', form.secondaryPhone, (v) => update('secondaryPhone', v), { placeholder: '+92 300 1234567', type: 'tel', disabled: !canEdit })}</div>
              <div>{F('Additional Emails', form.additionalEmails, (v) => update('additionalEmails', v), { placeholder: 'Comma separated', type: 'email', disabled: !canEdit })}</div>
              <div className="md:col-span-2">{F('Website', form.website, (v) => update('website', v), { placeholder: 'https://restaurant.com', type: 'url', disabled: !canEdit })}</div>
            </Grid>
          </Card>

          {/* 4. Business Details */}
          <Card id="card-business" title="Business Details">
            <Grid cols={2}>
              <div>{F('Legal Business Name', form.businessName, (v) => update('businessName', v), { placeholder: 'Legal entity name', disabled: !canEdit })}</div>
              <div>{F('Business Type', form.businessType, (v) => update('businessType', v), { options: BUSINESS_TYPES, disabled: !canEdit })}</div>
              <div>{F('Tagline', form.tagline, (v) => update('tagline', v), { placeholder: 'Short business tagline', disabled: !canEdit })}</div>
              <div className="md:col-span-2">{F('Description', form.description, (v) => update('description', v), { type: 'textarea', placeholder: 'Business description', disabled: !canEdit })}</div>
            </Grid>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-gray-100">
              <div className="bg-gray-50 rounded p-2 text-center"><p className="text-lg font-bold text-gray-700">{counts['branches'] || 0}</p><p className="text-xs text-gray-500">Branches</p></div>
              <div className="bg-gray-50 rounded p-2 text-center"><p className="text-lg font-bold text-gray-700">{counts['tables'] || 0}</p><p className="text-xs text-gray-500">Tables</p></div>
              <div className="bg-gray-50 rounded p-2 text-center"><p className="text-lg font-bold text-gray-700">{counts['staff'] || 0}</p><p className="text-xs text-gray-500">Staff</p></div>
              <div className="bg-gray-50 rounded p-2 text-center"><p className="text-lg font-bold text-gray-700">{counts['menu_items'] || 0}</p><p className="text-xs text-gray-500">Menu Items</p></div>
            </div>
          </Card>

          {/* 5. Branch Addresses (only if branches exist) */}
          {branches.length > 0 && (
            <Card id="card-branch_addr" title="Branch Addresses">
              {branches.map((b) => (
                <div key={b.id} className="mb-3 pb-3 border-b border-gray-100 last:border-0 last:mb-0 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-700">{b.name} {b.is_default && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded ml-1">Default</span>}</span>
                    {canEdit && <button onClick={() => openBranchModal(b)} className="text-xs text-blue-600 hover:underline">Edit</button>}
                  </div>
                  <Grid cols={2}>
                    <div className="text-xs text-gray-500">{b.address || 'No address'}</div>
                    <div className="text-xs text-gray-500">{b.city || ''}{b.city && b.province ? ', ' : ''}{b.province || ''}</div>
                    <div className="text-xs text-gray-500">{b.phone || ''}</div>
                    <div className="text-xs text-gray-500">{b.email || ''}</div>
                  </Grid>
                </div>
              ))}
            </Card>
          )}

          {/* 6. Business Hours */}
          <Card id="card-hours" title="Business Hours">
            <div className="space-y-1">
              {localHours.length === 0 && DAYS.map((_, i) => {
                const idx = i;
                if (!localHours.find((h) => h.day_of_week === idx)) {
                  setTimeout(() => setLocalHours(DAYS.map((_, di) => {
                    const existing = businessHours.find((bh) => bh.day_of_week === di);
                    return existing ? { ...existing } : { day_of_week: di, open_time: di < 5 ? '09:00' : '10:00', close_time: di < 5 ? '22:00' : '23:00', is_closed: di === 6 };
                  })), 0);
                }
                return null;
              })}
              {localHours.sort((a, b) => a.day_of_week - b.day_of_week).map((h, idx) => (
                <div key={h.day_of_week} className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0 flex-wrap">
                  <span className="w-24 text-sm font-medium text-gray-700 shrink-0">{DAYS[h.day_of_week]}</span>
                  <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                    <input type="checkbox" checked={h.is_closed} onChange={(e) => updateHour(idx, 'is_closed', e.target.checked)} disabled={!canEdit} className="w-3.5 h-3.5" />
                    Closed
                  </label>
                  {!h.is_closed && (
                    <>
                      <input type="time" value={formatTime24(h.open_time)} onChange={(e) => updateHour(idx, 'open_time', e.target.value)} disabled={!canEdit} className="px-2 py-1 border border-gray-300 rounded text-xs w-28" />
                      <span className="text-xs text-gray-400">to</span>
                      <input type="time" value={formatTime24(h.close_time)} onChange={(e) => updateHour(idx, 'close_time', e.target.value)} disabled={!canEdit} className="px-2 py-1 border border-gray-300 rounded text-xs w-28" />
                      {h.day_of_week > 0 && h.day_of_week <= 4 && (
                        <button onClick={() => copyHoursFromMonday(h.day_of_week)} disabled={!canEdit} className="text-xs text-blue-500 hover:underline ml-1 shrink-0" title="Copy from Monday">Copy</button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            {canEdit && localHours.length > 0 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                <button onClick={copyHoursToWeekdays} disabled={!canEdit} className="px-3 py-1 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50">Copy Mon to Weekdays</button>
                {(hoursDirty || hoursChanged) && (
                  <button onClick={saveHoursOnly} disabled={saving} className="px-3 py-1 text-xs text-white rounded" style={{ backgroundColor: theme.primaryColor }}>
                    {saving ? 'Saving...' : hoursSaved ? 'Saved!' : 'Save Hours'}
                  </button>
                )}
              </div>
            )}
          </Card>

          {/* 7. Legal & FBR Information */}
          <Card id="card-legal" title="Legal & FBR Information">
            <Grid cols={2}>
              <div>{F('Legal Business Name', form.businessName, (v) => update('businessName', v), { placeholder: 'As registered with FBR', disabled: !canEdit })}</div>
              <div>{F('NTN Number', form.ntn, (v) => update('ntn', v), { placeholder: 'National Tax Number', disabled: !canEdit })}</div>
              <div>{F('STRN Number', form.strn, (v) => update('strn', v), { placeholder: 'Sales Tax Registration Number (optional)', disabled: !canEdit })}</div>
              <div>{F('Business Registration Type', form.businessType, (v) => update('businessType', v), { options: BUSINESS_TYPES, disabled: !canEdit })}</div>
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
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
              FBR details are stored for receipts and business records. Automatic fiscal submission is not connected.
            </div>
          </Card>

          {/* 8. Tax & Service Charge */}
          <Card id="card-taxes" title="Tax & Service Charge">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Tax</h3>
            <Grid cols={2}>
              <div>{F('Enable Tax', form.taxEnabled, (v) => update('taxEnabled', v), { type: 'checkbox', disabled: !canEdit })}</div>
              {form.taxEnabled && (
                <>
                  <div>{F('Tax Name', form.taxName, (v) => update('taxName', v), { placeholder: 'GST, VAT, etc.', disabled: !canEdit })}</div>
                  <div>{F('Tax Rate (%)', form.taxRate, (v) => update('taxRate', v), { type: 'number', min: 0, max: 100, step: '0.01', disabled: !canEdit })}</div>
                  <div className="md:col-span-2">{F('Tax Inclusive Pricing', form.taxInclusive, (v) => update('taxInclusive', v), { type: 'checkbox', disabled: !canEdit, help: 'Prices already include tax' })}</div>
                </>
              )}
            </Grid>
            <h3 className="text-sm font-semibold text-gray-700 mt-4 mb-2">Service Charge</h3>
            <Grid cols={2}>
              <div>{F('Enable Service Charge', form.serviceChargeEnabled, (v) => update('serviceChargeEnabled', v), { type: 'checkbox', disabled: !canEdit })}</div>
              {form.serviceChargeEnabled && (
                <>
                  <div>{F('Service Charge Name', form.serviceChargeName, (v) => update('serviceChargeName', v), { placeholder: 'Service Charge', disabled: !canEdit })}</div>
                  <div>{F('Rate (%)', form.serviceChargeRate, (v) => update('serviceChargeRate', v), { type: 'number', min: 0, max: 100, step: '0.1', disabled: !canEdit })}</div>
                  <div>{F('Apply to Dine-In', form.serviceChargeDineIn, (v) => update('serviceChargeDineIn', v), { type: 'checkbox', disabled: !canEdit })}</div>
                  <div>{F('Apply to Takeaway', form.serviceChargeTakeaway, (v) => update('serviceChargeTakeaway', v), { type: 'checkbox', disabled: !canEdit })}</div>
                  <div>{F('Apply to Delivery', form.serviceChargeDelivery, (v) => update('serviceChargeDelivery', v), { type: 'checkbox', disabled: !canEdit })}</div>
                  <div>{F('Apply to Drive Thru', form.serviceChargeDriveThru, (v) => update('serviceChargeDriveThru', v), { type: 'checkbox', disabled: !canEdit })}</div>
                  <div className="md:col-span-2">{F('Apply Tax on Service Charge', form.taxServiceCharge, (v) => update('taxServiceCharge', v), { type: 'checkbox', disabled: !canEdit, help: 'Charge tax on the service charge amount' })}</div>
                </>
              )}
            </Grid>
          </Card>

          {/* 9. Receipt Settings */}
          <Card id="card-receipt" title="Receipt Settings">
            <Grid cols={2}>
              <div>{F('Receipt Header', form.receiptHeader, (v) => update('receiptHeader', v), { placeholder: 'Header text', disabled: !canEdit })}</div>
              <div>{F('Receipt Footer', form.receiptFooterText, (v) => update('receiptFooterText', v), { placeholder: 'Thank you for your order!', disabled: !canEdit })}</div>
              <div>{F('Thank You Message', form.thankYouMessage, (v) => update('thankYouMessage', v), { placeholder: 'Visit again!', disabled: !canEdit })}</div>
            </Grid>
            <Grid cols={2}>
              <div>{F('Show Logo', form.showLogo, (v) => update('showLogo', v), { type: 'checkbox', disabled: !canEdit })}</div>
              <div>{F('Show Address', form.showBranchAddress, (v) => update('showBranchAddress', v), { type: 'checkbox', disabled: !canEdit })}</div>
              <div>{F('Show Phone', form.showPhone, (v) => update('showPhone', v), { type: 'checkbox', disabled: !canEdit })}</div>
              <div>{F('Show NTN', form.showNtn, (v) => update('showNtn', v), { type: 'checkbox', disabled: !canEdit })}</div>
              <div>{F('Show Cashier Name', form.showCashierName, (v) => update('showCashierName', v), { type: 'checkbox', disabled: !canEdit })}</div>
              <div>{F('Show Payment Method', form.showPaymentMethod, (v) => update('showPaymentMethod', v), { type: 'checkbox', disabled: !canEdit })}</div>
              <div>{F('Show Tax Breakdown', form.showTaxBreakdown, (v) => update('showTaxBreakdown', v), { type: 'checkbox', disabled: !canEdit })}</div>
              <div>{F('Show Service Charge', form.showServiceCharge, (v) => update('showServiceCharge', v), { type: 'checkbox', disabled: !canEdit })}</div>
            </Grid>
          </Card>

          {/* 10. Order Settings */}
          <Card id="card-orders" title="Order Settings">
            <Grid cols={2}>
              <div>{F('Default Order Status', form.defaultOrderStatus, (v) => update('defaultOrderStatus', v), { options: ORDER_STATUSES, disabled: !canEdit })}</div>
              <div>{F('Default Payment Method', form.defaultPaymentMethod, (v) => update('defaultPaymentMethod', v), { options: PAYMENT_METHODS, disabled: !canEdit })}</div>
              <div>{F('Auto-send to Kitchen', form.autoSendToKitchen, (v) => update('autoSendToKitchen', v), { type: 'checkbox', disabled: !canEdit })}</div>
              <div>{F('Require Customer for Delivery', form.requireCustomerDelivery, (v) => update('requireCustomerDelivery', v), { type: 'checkbox', disabled: !canEdit })}</div>
              <div>{F('Require Customer for Credit', form.requireCustomerCredit, (v) => update('requireCustomerCredit', v), { type: 'checkbox', disabled: !canEdit })}</div>
              <div>{F('Allow Edit Before Payment', form.allowEditBeforePayment, (v) => update('allowEditBeforePayment', v), { type: 'checkbox', disabled: !canEdit })}</div>
              <div>{F('Allow Edit After Payment', form.allowEditAfterPayment, (v) => update('allowEditAfterPayment', v), { type: 'checkbox', disabled: !canEdit })}</div>
              <div>{F('Auto-print Receipt', form.autoPrintReceipt, (v) => update('autoPrintReceipt', v), { type: 'checkbox', disabled: !canEdit })}</div>
            </Grid>
          </Card>

          {/* 11. Inventory Settings */}
          <Card id="card-inventory" title="Inventory Settings">
            <Grid cols={2}>
              <div>{F('Low Stock Alerts', form.lowStockAlerts, (v) => update('lowStockAlerts', v), { type: 'checkbox', disabled: !canEdit })}</div>
              {form.lowStockAlerts && <div>{F('Default Low Stock Threshold', form.defaultLowStockThreshold, (v) => update('defaultLowStockThreshold', v), { type: 'number', min: 0, step: '1', disabled: !canEdit })}</div>}
              <div>{F('Allow Negative Stock', form.allowNegativeStock, (v) => update('allowNegativeStock', v), { type: 'checkbox', disabled: !canEdit, help: 'Allow sales with insufficient stock' })}</div>
              <div>{F('Auto-deduct Ingredients', form.autoDeductIngredients, (v) => update('autoDeductIngredients', v), { type: 'checkbox', disabled: !canEdit, help: 'Deduct ingredients when order completes' })}</div>
              <div>{F('Write Item Ledger', form.writeItemLedger, (v) => update('writeItemLedger', v), { type: 'checkbox', disabled: !canEdit, help: 'Record item-level inventory movements' })}</div>
            </Grid>
          </Card>

          {/* 12. Logo and Branding */}
          <Card id="card-logo" title="Logo and Branding">
            <p className="text-xs text-gray-400 mb-3">Upload your restaurant logo. Recommended size: 200x200px, PNG or SVG.</p>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gray-100 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs">Logo</div>
              <button disabled className="px-4 py-2 text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded cursor-not-allowed">Upload Logo (Coming Soon)</button>
            </div>
          </Card>

          {/* Mobile sticky save bar */}
          {canEdit && (dirty || hoursDirty) && (
            <div className="sticky bottom-0 z-20 lg:hidden bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
              <button onClick={save} disabled={saving} className="px-5 py-2 text-sm text-white rounded font-medium disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        {/* Right sidebar (25-28%) */}
        <div className="w-full lg:w-[28%] shrink-0 space-y-4 mt-4 lg:mt-0">
          {/* Restaurant Preview */}
          <Card title="Restaurant Preview">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-2 flex items-center justify-center text-gray-400 text-xs">Logo</div>
              <p className="font-bold text-gray-800 text-sm">{form.businessName || form.restaurantName || (defaultBranch?.name || 'Restaurant')}</p>
              {form.tagline && <p className="text-xs text-gray-500 mt-0.5">{form.tagline}</p>}
              <div className="text-xs text-gray-400 mt-2 space-y-0.5">
                {form.restaurantType && <p>{RESTAURANT_TYPES.find((t) => t.value === form.restaurantType)?.label || form.restaurantType}</p>}
                {form.phone && <p>{form.phone}</p>}
                {form.email && <p className="truncate">{form.email}</p>}
                {defaultBranch?.city && <p>{defaultBranch.city}{defaultBranch.country ? `, ${defaultBranch.country}` : ''}</p>}
              </div>
            </div>
            <hr className="my-3 border-gray-200" />
            {/* Receipt Preview */}
            <p className="text-xs font-semibold text-gray-600 mb-2 text-center">Receipt Preview</p>
            <div className="bg-gray-50 rounded-lg p-3 border border-dashed border-gray-200">
              <div className="text-center">
                <p className="font-bold text-gray-800 text-xs">{form.businessName || form.restaurantName || 'Restaurant'}</p>
                {form.receiptHeader && <p className="text-xs text-gray-500">{form.receiptHeader}</p>}
              </div>
              <hr className="my-1.5 border-dashed border-gray-300" />
              <div className="space-y-0.5 text-xs text-gray-600">
                <div className="flex justify-between"><span>Item x 2</span><span>1,000</span></div>
                <div className="flex justify-between"><span>Item x 1</span><span>500</span></div>
                {form.serviceChargeEnabled && previewData.scRate > 0 && (
                  <div className="flex justify-between text-gray-400"><span>{form.serviceChargeName} ({previewData.scRate}%)</span><span>{previewData.scAmt.toFixed(0)}</span></div>
                )}
                {form.taxEnabled && previewData.taxRt > 0 && (
                  <div className="flex justify-between text-gray-400"><span>{form.taxName} ({previewData.taxRt}%)</span><span>{previewData.taxAmt.toFixed(0)}</span></div>
                )}
                <hr className="border-gray-200" />
                <div className="flex justify-between font-bold text-gray-800"><span>Total</span><span>{previewData.total.toFixed(0)}</span></div>
              </div>
              <hr className="my-1.5 border-dashed border-gray-300" />
              <p className="text-xs text-gray-400 text-center">{form.receiptFooterText}</p>
              {form.thankYouMessage && <p className="text-xs text-gray-400 text-center mt-0.5">{form.thankYouMessage}</p>}
            </div>
          </Card>

          {/* Business Summary */}
          <Card title="Business Summary">
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Branches</span><span className="font-semibold text-gray-800">{counts['branches'] || 0}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Tables</span><span className="font-semibold text-gray-800">{counts['tables'] || 0}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Staff</span><span className="font-semibold text-gray-800">{counts['staff'] || 0}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Menu Items</span><span className="font-semibold text-gray-800">{counts['menu_items'] || 0}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Default Currency</span><span className="font-semibold text-gray-800">{form.currencySymbol || 'Rs.'}</span></div>
            </div>
          </Card>

          {/* System Settings */}
          <Card title="System Settings">
            <p className="text-xs text-gray-400 mb-3">Toggle available modules</p>
            <div className="space-y-1.5">
              {[
                { key: 'kitchen_display', label: 'Kitchen Display' },
                { key: 'table_management', label: 'Table Management' },
                { key: 'reservations', label: 'Reservations' },
                { key: 'inventory_alerts', label: 'Inventory Alerts' },
                { key: 'negative_stock', label: 'Negative Stock' },
                { key: 'customer_loyalty', label: 'Customer Loyalty' },
                { key: 'expenses', label: 'Expenses' },
                { key: 'accounts', label: 'Accounts' },
                { key: 'online_ordering', label: 'Online Ordering' },
              ].map((m) => (
                <label key={m.key} className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-700">{m.label}</span>
                  <input type="checkbox" checked={modules[m.key] !== false} onChange={(e) => toggleModule(m.key, e.target.checked)} disabled={!canEdit} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                </label>
              ))}
            </div>
          </Card>

          {/* Data Management */}
          <Card title="Data Management">
            <p className="text-xs text-gray-400 mb-3">Export, backup, and restore operations.</p>
            <div className="flex flex-col gap-2">
              <button disabled className="w-full px-4 py-2 text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded cursor-not-allowed">Export Settings</button>
              <button disabled className="w-full px-4 py-2 text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded cursor-not-allowed">Export Menu / Data</button>
              <button disabled className="w-full px-4 py-2 text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded cursor-not-allowed">Backup Now</button>
              <button disabled className="w-full px-4 py-2 text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded cursor-not-allowed">Restore</button>
              <p className="text-xs text-gray-400 text-center">Coming Soon</p>
            </div>
          </Card>
        </div>
      </div>

      {/* Branch modal */}
      {branchModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-xl shadow-lg p-5 w-full max-w-md">
            <h3 className="text-base font-semibold text-gray-800 mb-4">{branchModal.editing ? 'Edit Branch' : 'Add Branch'}</h3>
            <div className="space-y-3 mb-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Branch Name *</label>
                <input type="text" value={branchModal.data.name || ''} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, name: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                <input type="text" value={branchModal.data.address || ''} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, address: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">City</label><input type="text" value={branchModal.data.city || ''} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, city: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Province</label><input type="text" value={branchModal.data.province || ''} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, province: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Postal Code</label><input type="text" value={branchModal.data.postal_code || ''} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, postal_code: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Country</label><input type="text" value={branchModal.data.country || 'Pakistan'} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, country: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Phone</label><input type="tel" value={branchModal.data.phone || ''} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, phone: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Email</label><input type="email" value={branchModal.data.email || ''} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, email: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveBranchModal} disabled={saving || !branchModal.data.name} className="px-4 py-2 text-sm text-white rounded disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>{saving ? 'Saving...' : 'Save'}</button>
              <button onClick={() => setBranchModal({ open: false, data: {} })} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
