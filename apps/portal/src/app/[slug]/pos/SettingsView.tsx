'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  id: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'contact', label: 'Contact' },
  { id: 'business', label: 'Business' },
  { id: 'branches', label: 'Branches' },
  { id: 'hours', label: 'Hours' },
  { id: 'fbr', label: 'FBR' },
  { id: 'taxes', label: 'Tax & Service' },
  { id: 'receipt', label: 'Receipt' },
  { id: 'orders', label: 'Orders' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'system', label: 'System' },
  { id: 'summary', label: 'Summary' },
] as const;

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

export default function SettingsView({ slug, theme }: Props) {
  const { user, isLoaded } = useUser();
  const meta = user?.publicMetadata as Record<string, any> | undefined;
  const perms = (meta?.permissions ?? []) as string[];
  const role = (meta?.role ?? '') as string;
  const canEdit = hasPermission(perms, role, 'settings:edit');
  const isSuperAdmin = role === 'super_admin';

  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [businessHours, setBusinessHours] = useState<BusinessHoursRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState<string>('general');

  const r = useMemo(() => (settings?.enabled_modules?.restaurant || {}) as Record<string, any>, [settings]);

  const g = (key: string, fallback: any = '') => r[key] ?? fallback;

  // Edit mode for branch CRUD
  const [editBranch, setEditBranch] = useState<Partial<BranchRow> | null>(null);
  const [showBranchForm, setShowBranchForm] = useState(false);

  // Business hours editing
  const [editHours, setEditHours] = useState<BusinessHoursRow[]>([]);
  const [editingHours, setEditingHours] = useState(false);

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
      if (hRes.ok && hRes.data) setBusinessHours(hRes.data as unknown as BusinessHoursRow[]);

      // Fetch counts
      const countKeys = ['branches', 'tables', 'staff', 'menu_items'] as const;
      const countResults = await Promise.all(
        countKeys.map((t) => supa(slug, { table: t, select: 'id', head: true })),
      );
      const countMap: Record<string, number> = {};
      countKeys.forEach((t, i) => {
        if (countResults[i].ok) countMap[t] = Number(countResults[i].count || 0);
      });
      setCounts(countMap);
    } catch (e: any) {
      console.error('[Settings] load error:', e);
      setError(e.message || 'Failed to load settings');
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    if (isLoaded) load();
  }, [isLoaded, load]);

  // Form state - flattened from restaurant + top-level
  const [form, setForm] = useState({
    // Top level
    taxEnabled: false,
    taxRate: '0',
    currencySymbol: 'Rs.',
    receiptFooterText: 'Thank you for your order!',
    // General
    restaurantName: '',
    restaurantType: 'restaurant',
    defaultLanguage: 'en',
    timezone: 'Asia/Karachi',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '12h',
    darkMode: false,
    // Contact
    email: '',
    phone: '',
    secondaryPhone: '',
    additionalEmails: '',
    website: '',
    // Business
    businessName: '',
    businessType: 'sole_proprietorship',
    ntn: '',
    tagline: '',
    description: '',
    // Tax
    taxName: 'GST',
    taxInclusive: false,
    // Service charge
    serviceChargeEnabled: false,
    serviceChargeName: 'Service Charge',
    serviceChargeRate: '10',
    serviceChargeDineIn: true,
    serviceChargeTakeaway: false,
    serviceChargeDelivery: false,
    serviceChargeDriveThru: false,
    taxServiceCharge: false,
    // Receipt
    receiptHeader: '',
    showLogo: true,
    showBranchAddress: true,
    showPhone: true,
    showNtn: true,
    showCashierName: true,
    showPaymentMethod: true,
    showTaxBreakdown: true,
    showServiceCharge: true,
    thankYouMessage: '',
    // Order
    defaultOrderStatus: 'pending',
    autoSendToKitchen: true,
    requireCustomerDelivery: false,
    requireCustomerCredit: false,
    allowEditBeforePayment: true,
    allowEditAfterPayment: false,
    autoPrintReceipt: false,
    defaultPaymentMethod: 'cash',
    // Inventory
    lowStockAlerts: true,
    defaultLowStockThreshold: '10',
    allowNegativeStock: false,
    autoDeductIngredients: true,
    writeItemLedger: false,
  });

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

      // Build restaurant settings
      const restaurant: Record<string, any> = {
        restaurant_name: form.restaurantName,
        restaurant_type: form.restaurantType,
        currency: form.currencySymbol,
        default_language: form.defaultLanguage,
        timezone: form.timezone,
        date_format: form.dateFormat,
        time_format: form.timeFormat,
        dark_mode: form.darkMode,
        email: form.email,
        phone: form.phone,
        secondary_phone: form.secondaryPhone,
        additional_emails: form.additionalEmails,
        website: form.website,
        business_name: form.businessName,
        business_type: form.businessType,
        ntn: form.ntn,
        tagline: form.tagline,
        description: form.description,
        tax_name: form.taxName,
        tax_inclusive: form.taxInclusive,
        service_charge_enabled: form.serviceChargeEnabled,
        service_charge_name: form.serviceChargeName,
        service_charge_rate: form.serviceChargeRate,
        service_charge_dine_in: form.serviceChargeDineIn,
        service_charge_takeaway: form.serviceChargeTakeaway,
        service_charge_delivery: form.serviceChargeDelivery,
        service_charge_drive_thru: form.serviceChargeDriveThru,
        tax_service_charge: form.taxServiceCharge,
        receipt_header: form.receiptHeader,
        show_logo: form.showLogo,
        show_branch_address: form.showBranchAddress,
        show_phone: form.showPhone,
        show_ntn: form.showNtn,
        show_cashier_name: form.showCashierName,
        show_payment_method: form.showPaymentMethod,
        show_tax_breakdown: form.showTaxBreakdown,
        show_service_charge: form.showServiceCharge,
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
        table: 'settings',
        method: 'update',
        eq: ['id', settings.id],
        body,
      });

      if (!result.ok) {
        setError(result.error || 'Save failed');
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        // Reload to refresh
        load();
      }
    } catch (e: any) {
      setError(e.message || 'Save failed');
    }
    setSaving(false);
  }, [settings, canEdit, form, slug, load]);

  // Sync form when settings loaded
  useEffect(() => {
    if (!settings) return;
    setForm((f) => ({
      ...f,
      taxEnabled: settings.tax_enabled,
      taxRate: String(settings.tax_rate),
      currencySymbol: settings.currency_symbol || 'Rs.',
      receiptFooterText: settings.receipt_footer_text || 'Thank you for your order!',
      restaurantName: g('restaurant_name', f.restaurantName),
      restaurantType: g('restaurant_type', f.restaurantType),
      defaultLanguage: g('default_language', f.defaultLanguage),
      timezone: g('timezone', f.timezone),
      dateFormat: g('date_format', f.dateFormat),
      timeFormat: g('time_format', f.timeFormat),
      darkMode: !!g('dark_mode', f.darkMode),
      email: g('email', f.email),
      phone: g('phone', f.phone),
      secondaryPhone: g('secondary_phone', f.secondaryPhone),
      additionalEmails: g('additional_emails', f.additionalEmails),
      website: g('website', f.website),
      businessName: g('business_name', f.businessName),
      businessType: g('business_type', f.businessType),
      ntn: g('ntn', f.ntn),
      tagline: g('tagline', f.tagline),
      description: g('description', f.description),
      taxName: g('tax_name', f.taxName),
      taxInclusive: !!g('tax_inclusive', f.taxInclusive),
      serviceChargeEnabled: !!g('service_charge_enabled', f.serviceChargeEnabled),
      serviceChargeName: g('service_charge_name', f.serviceChargeName),
      serviceChargeRate: String(g('service_charge_rate', Number(f.serviceChargeRate))),
      serviceChargeDineIn: !!g('service_charge_dine_in', f.serviceChargeDineIn),
      serviceChargeTakeaway: !!g('service_charge_takeaway', f.serviceChargeTakeaway),
      serviceChargeDelivery: !!g('service_charge_delivery', f.serviceChargeDelivery),
      serviceChargeDriveThru: !!g('service_charge_drive_thru', f.serviceChargeDriveThru),
      taxServiceCharge: !!g('tax_service_charge', f.taxServiceCharge),
      receiptHeader: g('receipt_header', f.receiptHeader),
      showLogo: !!g('show_logo', f.showLogo),
      showBranchAddress: !!g('show_branch_address', f.showBranchAddress),
      showPhone: !!g('show_phone', f.showPhone),
      showNtn: !!g('show_ntn', f.showNtn),
      showCashierName: !!g('show_cashier_name', f.showCashierName),
      showPaymentMethod: !!g('show_payment_method', f.showPaymentMethod),
      showTaxBreakdown: !!g('show_tax_breakdown', f.showTaxBreakdown),
      showServiceCharge: !!g('show_service_charge', f.showServiceCharge),
      thankYouMessage: g('thank_you_message', f.thankYouMessage),
      defaultOrderStatus: g('default_order_status', f.defaultOrderStatus),
      autoSendToKitchen: !!g('auto_send_to_kitchen', f.autoSendToKitchen),
      requireCustomerDelivery: !!g('require_customer_delivery', f.requireCustomerDelivery),
      requireCustomerCredit: !!g('require_customer_credit', f.requireCustomerCredit),
      allowEditBeforePayment: !!g('allow_edit_before_payment', f.allowEditBeforePayment),
      allowEditAfterPayment: !!g('allow_edit_after_payment', f.allowEditAfterPayment),
      autoPrintReceipt: !!g('auto_print_receipt', f.autoPrintReceipt),
      defaultPaymentMethod: g('default_payment_method', f.defaultPaymentMethod),
      lowStockAlerts: !!g('low_stock_alerts', f.lowStockAlerts),
      defaultLowStockThreshold: String(g('default_low_stock_threshold', Number(f.defaultLowStockThreshold))),
      allowNegativeStock: !!g('allow_negative_stock', f.allowNegativeStock),
      autoDeductIngredients: !!g('auto_deduct_ingredients', f.autoDeductIngredients),
      writeItemLedger: !!g('write_item_ledger', f.writeItemLedger),
    }));
  }, [settings]);

  const update = (key: keyof typeof form, value: any) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSaveBranch = async () => {
    if (!editBranch || !editBranch.name) return;
    setSaving(true);
    setError('');
    try {
      const b = editBranch;
      const body: Record<string, any> = {
        name: b.name,
      };
      if (b.address) body.address = b.address;
      if (b.city) body.city = b.city;
      if (b.phone) body.phone = b.phone;
      if (b.email) body.email = b.email;
      body.is_active = true;

      if (b.id) {
        const res = await supa(slug, { table: 'branches', method: 'update', eq: ['id', b.id], body });
        if (!res.ok) {
          const txt = await (res as any).text?.();
          throw new Error(txt || 'Update branch failed');
        }
      } else {
        const res = await supa(slug, { table: 'branches', method: 'insert', body, select: '*' });
        if (!res.ok) {
          const txt = await (res as any).text?.();
          throw new Error(txt || 'Create branch failed');
        }
      }
      setShowBranchForm(false);
      setEditBranch(null);
      load();
    } catch (e: any) {
      setError(e.message || 'Branch save failed');
    }
    setSaving(false);
  };

  const handleDeleteBranch = async (id: string) => {
    setError('');
    try {
      const res = await supa(slug, { table: 'branches', method: 'delete', eq: ['id', id] });
      if (!res.ok) { setError(res.error || 'Delete failed'); return; }
      load();
    } catch (e: any) { setError(e.message || 'Delete failed'); }
  };

  const handleSaveHours = async () => {
    setSaving(true);
    setError('');
    try {
      for (const h of editHours) {
        const body = {
          day_of_week: h.day_of_week,
          open_time: h.open_time,
          close_time: h.close_time,
          is_closed: h.is_closed,
        };
        if (h.id) {
          await supa(slug, { table: 'business_hours', method: 'update', eq: ['id', h.id], body });
        } else {
          await supa(slug, { table: 'business_hours', method: 'insert', body });
        }
      }
      setEditingHours(false);
      load();
    } catch (e: any) { setError(e.message || 'Hours save failed'); }
    setSaving(false);
  };

  const startEditBranch = (branch?: BranchRow) => {
    if (branch) setEditBranch({ ...branch });
    else setEditBranch({ name: '', address: '', city: '', phone: '', email: '', is_default: false, is_active: true });
    setShowBranchForm(true);
  };

  const startEditHours = () => {
    const defaultHours: BusinessHoursRow[] = [];
    if (businessHours.length > 0) {
      setEditHours(businessHours.map((h) => ({ ...h })));
    } else {
      for (let i = 0; i < 7; i++) {
        defaultHours.push({
          id: `new-${i}`,
          day_of_week: i,
          open_time: i < 5 ? '09:00' : '10:00',
          close_time: i < 5 ? '22:00' : '23:00',
          is_closed: i === 6,
        });
      }
      setEditHours(defaultHours);
    }
    setEditingHours(true);
  };

  if (!isLoaded || loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading settings...</p>
      </div>
    );
  }

  const renderField = (
    label: string,
    value: string | number | boolean,
    onChange: (v: any) => void,
    opts?: { type?: string; disabled?: boolean; help?: string; placeholder?: string; min?: number; max?: number; step?: string; options?: { value: string; label: string }[] },
  ) => (
    <div className="mb-3">
      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">{label}</label>
      {opts?.options ? (
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          disabled={opts?.disabled || !canEdit}
          className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
        >
          {opts.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : opts?.type === 'checkbox' ? (
        <div className="flex items-center gap-2 mt-1">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            disabled={opts?.disabled || !canEdit}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
          />
          <span className="text-sm text-gray-500">{label}</span>
        </div>
      ) : (
        <input
          type={opts?.type || 'text'}
          value={String(value)}
          onChange={(e) => onChange(opts?.type === 'number' ? e.target.value : e.target.value)}
          disabled={opts?.disabled || !canEdit}
          placeholder={opts?.placeholder}
          min={opts?.min}
          max={opts?.max}
          step={opts?.step}
          className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
        />
      )}
      {opts?.help && <p className="text-xs text-gray-400 mt-0.5">{opts?.help}</p>}
    </div>
  );

  const renderSection = (id: string, title: string, children: React.ReactNode) => (
    <div id={`section-${id}`} className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
      <h2 className="text-base font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">{title}</h2>
      {children}
    </div>
  );

  const renderGeneral = () => (
    <>
      {renderSection('general', 'General', (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderField('Restaurant Name', form.restaurantName, (v) => update('restaurantName', v), { placeholder: 'My Restaurant' })}
          {renderField('Restaurant Type', form.restaurantType, (v) => update('restaurantType', v), { options: [
            { value: 'restaurant', label: 'Restaurant' },
            { value: 'cafe', label: 'Cafe' },
            { value: 'fast_food', label: 'Fast Food' },
            { value: 'bakery', label: 'Bakery' },
            { value: 'cloud_kitchen', label: 'Cloud Kitchen' },
            { value: 'other', label: 'Other' },
          ]})}
          {renderField('Currency', form.currencySymbol, (v) => update('currencySymbol', v), { options: CURRENCIES })}
          {renderField('Default Language', form.defaultLanguage, (v) => update('defaultLanguage', v), { options: [
            { value: 'en', label: 'English' },
            { value: 'ur', label: 'Urdu' },
            { value: 'ar', label: 'Arabic' },
          ]})}
          {renderField('Timezone', form.timezone, (v) => update('timezone', v), { options: [
            { value: 'Asia/Karachi', label: 'Asia/Karachi (PKT)' },
            { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
            { value: 'Asia/Riyadh', label: 'Asia/Riyadh (AST)' },
            { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
            { value: 'UTC', label: 'UTC' },
          ]})}
          {renderField('Date Format', form.dateFormat, (v) => update('dateFormat', v), { options: [
            { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
            { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
            { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
            { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY' },
          ]})}
          {renderField('Time Format', form.timeFormat, (v) => update('timeFormat', v), { options: [
            { value: '12h', label: '12-hour (AM/PM)' },
            { value: '24h', label: '24-hour' },
          ]})}
          {renderField('Dark Mode', form.darkMode, (v) => update('darkMode', v), { type: 'checkbox' })}
        </div>
      ))}
      {renderSection('contact', 'Contact Information', (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderField('Email', form.email, (v) => update('email', v), { placeholder: 'info@restaurant.com', type: 'email' })}
          {renderField('Phone', form.phone, (v) => update('phone', v), { placeholder: '+92 300 1234567', type: 'tel' })}
          {renderField('Secondary Phone', form.secondaryPhone, (v) => update('secondaryPhone', v), { placeholder: '+92 300 1234567', type: 'tel' })}
          {renderField('Additional Emails', form.additionalEmails, (v) => update('additionalEmails', v), { placeholder: 'Comma separated', type: 'email' })}
          {renderField('Website', form.website, (v) => update('website', v), { placeholder: 'https://restaurant.com', type: 'url' })}
        </div>
      ))}
      {renderSection('business', 'Business Information', (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderField('Business Name', form.businessName, (v) => update('businessName', v), { placeholder: 'Business legal name' })}
          {renderField('Business Type', form.businessType, (v) => update('businessType', v), { options: [
            { value: 'sole_proprietorship', label: 'Sole Proprietorship' },
            { value: 'partnership', label: 'Partnership' },
            { value: 'private_limited', label: 'Private Limited' },
            { value: 'public_limited', label: 'Public Limited' },
          ]})}
          {renderField('NTN', form.ntn, (v) => update('ntn', v), { placeholder: 'National Tax Number' })}
          {renderField('Tagline', form.tagline, (v) => update('tagline', v), { placeholder: 'Short business tagline' })}
          {renderField('Description', form.description, (v) => update('description', v), { placeholder: 'Business description' })}
        </div>
      ))}
    </>
  );

  const renderBranches = () => {
    const handleEditHoursSave = async () => {
      setSaving(true);
      setError('');
      try {
        for (const h of editHours) {
          const body = {
            day_of_week: h.day_of_week,
            open_time: h.open_time,
            close_time: h.close_time,
            is_closed: h.is_closed,
          };
          if (h.id && !h.id.startsWith('new-')) {
            await supa(slug, { table: 'business_hours', method: 'update', eq: ['id', h.id], body });
          } else {
            await supa(slug, { table: 'business_hours', method: 'insert', body });
          }
        }
        setEditingHours(false);
        load();
      } catch (e: any) { setError(e.message || 'Hours save failed'); }
      setSaving(false);
    };

    return (
      <>
        {renderSection('branches', 'Branches', (
          <div>
            {branches.length === 0 && <p className="text-sm text-gray-400 mb-3">No branches yet</p>}
            {branches.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <span className="text-sm font-medium text-gray-700">{b.name}</span>
                  {b.is_default && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Default</span>}
                  {b.city && <span className="ml-2 text-xs text-gray-400">{b.city}</span>}
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <button onClick={() => startEditBranch(b)} className="text-xs text-blue-600 hover:underline">Edit</button>
                    <button onClick={() => handleDeleteBranch(b.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                  </div>
                )}
              </div>
            ))}
            {canEdit && (
              <button onClick={() => startEditBranch()} className="mt-3 text-sm text-blue-600 hover:underline">+ Add branch</button>
            )}
          </div>
        ))}
        {renderSection('hours', 'Business Hours', (
          <div>
            {editingHours ? (
              <div>
                {editHours.map((h, i) => (
                  <div key={h.id || i} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                    <span className="w-24 text-sm text-gray-700 font-medium">{DAY_NAMES[h.day_of_week]}</span>
                    <label className="flex items-center gap-1 text-xs text-gray-500">
                      <input type="checkbox" checked={h.is_closed} onChange={(e) => {
                        const copy = [...editHours];
                        copy[i] = { ...copy[i], is_closed: e.target.checked };
                        setEditHours(copy);
                      }} disabled={!canEdit} className="w-3.5 h-3.5" />
                      Closed
                    </label>
                    {!h.is_closed && (
                      <>
                        <input type="time" value={h.open_time || '09:00'} onChange={(e) => {
                          const copy = [...editHours];
                          copy[i] = { ...copy[i], open_time: e.target.value };
                          setEditHours(copy);
                        }} disabled={!canEdit} className="px-2 py-1 border border-gray-300 rounded text-xs w-24" />
                        <span className="text-xs text-gray-400">to</span>
                        <input type="time" value={h.close_time || '22:00'} onChange={(e) => {
                          const copy = [...editHours];
                          copy[i] = { ...copy[i], close_time: e.target.value };
                          setEditHours(copy);
                        }} disabled={!canEdit} className="px-2 py-1 border border-gray-300 rounded text-xs w-24" />
                      </>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <div className="flex gap-2 mt-3">
                    <button onClick={handleEditHoursSave} disabled={saving} className="px-4 py-1.5 text-xs text-white rounded" style={{ backgroundColor: theme.primaryColor }}>
                      {saving ? 'Saving...' : 'Save Hours'}
                    </button>
                    <button onClick={() => setEditingHours(false)} className="px-4 py-1.5 text-xs text-gray-600 border border-gray-300 rounded">Cancel</button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {businessHours.length === 0 ? (
                  <p className="text-sm text-gray-400 mb-3">No hours set</p>
                ) : (
                  businessHours.map((h) => (
                    <div key={h.id} className="flex items-center py-1.5 border-b border-gray-100 last:border-0">
                      <span className="w-24 text-sm text-gray-700">{DAY_NAMES[h.day_of_week]}</span>
                      {h.is_closed ? (
                        <span className="text-xs text-red-400">Closed</span>
                      ) : (
                        <span className="text-xs text-gray-500">{h.open_time?.slice(0, 5)} - {h.close_time?.slice(0, 5)}</span>
                      )}
                    </div>
                  ))
                )}
                {canEdit && <button onClick={startEditHours} className="mt-3 text-sm text-blue-600 hover:underline">Edit hours</button>}
              </div>
            )}
          </div>
        ))}
        {showBranchForm && editBranch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
            <div className="bg-white rounded-xl shadow-lg p-5 w-full max-w-md">
              <h3 className="text-base font-semibold text-gray-800 mb-4">{editBranch.id ? 'Edit Branch' : 'Add Branch'}</h3>
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
                  <input type="text" value={editBranch.name || ''} onChange={(e) => setEditBranch({ ...editBranch, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                  <input type="text" value={editBranch.address || ''} onChange={(e) => setEditBranch({ ...editBranch, address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                    <input type="text" value={editBranch.city || ''} onChange={(e) => setEditBranch({ ...editBranch, city: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                    <input type="tel" value={editBranch.phone || ''} onChange={(e) => setEditBranch({ ...editBranch, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                  <input type="email" value={editBranch.email || ''} onChange={(e) => setEditBranch({ ...editBranch, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveBranch} disabled={saving || !editBranch.name}
                  className="px-4 py-2 text-sm text-white rounded disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => { setShowBranchForm(false); setEditBranch(null); }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderFbr = () => (
    renderSection('fbr', 'FBR Integration', (
      <div className="space-y-3">
        <p className="text-xs text-gray-400">FBR integration is not yet available. This section will allow you to configure real-time sales reporting to the Federal Board of Revenue.</p>
        <div className="bg-gray-50 rounded-lg p-4 border border-dashed border-gray-200">
          <p className="text-xs text-gray-400">Coming soon: Sales Tax Registration, POS Integration, Invoice Generation</p>
        </div>
      </div>
    ))
  );

  const renderTaxes = () => (
    <>
      {renderSection('tax', 'Tax Settings', (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderField('Enable Tax', form.taxEnabled, (v) => update('taxEnabled', v), { type: 'checkbox' })}
          {form.taxEnabled && (
            <>
              {renderField('Tax Name', form.taxName, (v) => update('taxName', v), { placeholder: 'GST, VAT, etc.' })}
              {renderField('Tax Rate (%)', form.taxRate, (v) => update('taxRate', v), { type: 'number', min: 0, max: 100, step: '0.01' })}
              {renderField('Tax Inclusive', form.taxInclusive, (v) => update('taxInclusive', v), { type: 'checkbox', help: 'Prices include tax (tax-inclusive pricing)' })}
            </>
          )}
        </div>
      ))}
      {renderSection('service-charge', 'Service Charge', (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderField('Enable Service Charge', form.serviceChargeEnabled, (v) => update('serviceChargeEnabled', v), { type: 'checkbox' })}
          {form.serviceChargeEnabled && (
            <>
              {renderField('Service Charge Name', form.serviceChargeName, (v) => update('serviceChargeName', v), { placeholder: 'Service Charge' })}
              {renderField('Rate (%)', form.serviceChargeRate, (v) => update('serviceChargeRate', v), { type: 'number', min: 0, max: 100, step: '0.1' })}
              {renderField('Apply to Dine-In', form.serviceChargeDineIn, (v) => update('serviceChargeDineIn', v), { type: 'checkbox' })}
              {renderField('Apply to Takeaway', form.serviceChargeTakeaway, (v) => update('serviceChargeTakeaway', v), { type: 'checkbox' })}
              {renderField('Apply to Delivery', form.serviceChargeDelivery, (v) => update('serviceChargeDelivery', v), { type: 'checkbox' })}
              {renderField('Apply to Drive Thru', form.serviceChargeDriveThru, (v) => update('serviceChargeDriveThru', v), { type: 'checkbox' })}
              {renderField('Apply Tax on Service Charge', form.taxServiceCharge, (v) => update('taxServiceCharge', v), { type: 'checkbox', help: 'Charge tax on the service charge amount' })}
            </>
          )}
        </div>
      ))}
    </>
  );

  const renderReceipt = () => (
    renderSection('receipt', 'Receipt Customization', (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderField('Receipt Header', form.receiptHeader, (v) => update('receiptHeader', v), { placeholder: 'Header text' })}
        {renderField('Footer Text', form.receiptFooterText, (v) => update('receiptFooterText', v), { placeholder: 'Thank you for your order!' })}
        {renderField('Thank You Message', form.thankYouMessage, (v) => update('thankYouMessage', v), { placeholder: 'Visit again!' })}
        {renderField('Show Logo', form.showLogo, (v) => update('showLogo', v), { type: 'checkbox' })}
        {renderField('Show Branch Address', form.showBranchAddress, (v) => update('showBranchAddress', v), { type: 'checkbox' })}
        {renderField('Show Phone', form.showPhone, (v) => update('showPhone', v), { type: 'checkbox' })}
        {renderField('Show NTN', form.showNtn, (v) => update('showNtn', v), { type: 'checkbox' })}
        {renderField('Show Cashier Name', form.showCashierName, (v) => update('showCashierName', v), { type: 'checkbox' })}
        {renderField('Show Payment Method', form.showPaymentMethod, (v) => update('showPaymentMethod', v), { type: 'checkbox' })}
        {renderField('Show Tax Breakdown', form.showTaxBreakdown, (v) => update('showTaxBreakdown', v), { type: 'checkbox' })}
        {renderField('Show Service Charge', form.showServiceCharge, (v) => update('showServiceCharge', v), { type: 'checkbox' })}
      </div>
    ))
  );

  const renderOrders = () => (
    renderSection('orders', 'Order Settings', (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderField('Default Order Status', form.defaultOrderStatus, (v) => update('defaultOrderStatus', v), { options: [
          { value: 'pending', label: 'Pending' },
          { value: 'confirmed', label: 'Confirmed' },
          { value: 'preparing', label: 'Preparing' },
        ]})}
        {renderField('Default Payment Method', form.defaultPaymentMethod, (v) => update('defaultPaymentMethod', v), { options: [
          { value: 'cash', label: 'Cash' },
          { value: 'jazzcash', label: 'JazzCash' },
          { value: 'easypaisa', label: 'EasyPaisa' },
          { value: 'credit_card', label: 'Credit Card' },
          { value: 'debit_card', label: 'Debit Card' },
        ]})}
        {renderField('Auto-send to Kitchen', form.autoSendToKitchen, (v) => update('autoSendToKitchen', v), { type: 'checkbox' })}
        {renderField('Require Customer for Delivery', form.requireCustomerDelivery, (v) => update('requireCustomerDelivery', v), { type: 'checkbox' })}
        {renderField('Require Customer for Credit', form.requireCustomerCredit, (v) => update('requireCustomerCredit', v), { type: 'checkbox' })}
        {renderField('Allow Edit Before Payment', form.allowEditBeforePayment, (v) => update('allowEditBeforePayment', v), { type: 'checkbox' })}
        {renderField('Allow Edit After Payment', form.allowEditAfterPayment, (v) => update('allowEditAfterPayment', v), { type: 'checkbox' })}
        {renderField('Auto-print Receipt', form.autoPrintReceipt, (v) => update('autoPrintReceipt', v), { type: 'checkbox' })}
      </div>
    ))
  );

  const renderInventory = () => (
    renderSection('inventory', 'Inventory Settings', (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderField('Low Stock Alerts', form.lowStockAlerts, (v) => update('lowStockAlerts', v), { type: 'checkbox' })}
        {form.lowStockAlerts && renderField('Default Low Stock Threshold', form.defaultLowStockThreshold, (v) => update('defaultLowStockThreshold', v), { type: 'number', min: 0, step: '1' })}
        {renderField('Allow Negative Stock', form.allowNegativeStock, (v) => update('allowNegativeStock', v), { type: 'checkbox', help: 'Allow sales to go through even if stock is insufficient' })}
        {renderField('Auto-deduct Ingredients', form.autoDeductIngredients, (v) => update('autoDeductIngredients', v), { type: 'checkbox', help: 'Automatically deduct ingredients when order is completed' })}
        {renderField('Write Item Ledger', form.writeItemLedger, (v) => update('writeItemLedger', v), { type: 'checkbox', help: 'Record item-level inventory movements in ledger' })}
      </div>
    ))
  );

  const renderModules = () => {
    const availableModules = settings?.enabled_modules?.modules || {};
    const moduleList = [
      { key: 'pos', label: 'POS (Point of Sale)' },
      { key: 'orders', label: 'Orders' },
      { key: 'menu', label: 'Menu Management' },
      { key: 'inventory', label: 'Inventory' },
      { key: 'staff', label: 'Staff Management' },
      { key: 'accounts', label: 'Accounts' },
      { key: 'reports', label: 'Reports' },
      { key: 'settings', label: 'Settings' },
      { key: 'kitchen_display', label: 'Kitchen Display' },
      { key: 'delivery', label: 'Delivery Integration' },
      { key: 'reservations', label: 'Reservations' },
      { key: 'loyalty', label: 'Loyalty Program' },
      { key: 'multi_currency', label: 'Multi-Currency' },
      { key: 'offline_mode', label: 'Offline Mode' },
      { key: 'fbr', label: 'FBR Integration' },
    ];

    return renderSection('system-modules', 'Module Toggles', (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {moduleList.map((m) => (
          <label key={m.key} className="flex items-center gap-2 py-1.5">
            <input
              type="checkbox"
              checked={availableModules[m.key] !== false}
              onChange={(e) => {
                const newModules = { ...availableModules, [m.key]: e.target.checked };
                const newEnabled = { ...(settings?.enabled_modules || {}), modules: newModules };
                setSettings(settings ? { ...settings, enabled_modules: newEnabled } : null);
              }}
              disabled={!canEdit}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">{m.label}</span>
          </label>
        ))}
      </div>
    ));
  };

  const renderDataManagement = () => (
    renderSection('data', 'Data Management', (
      <div className="space-y-3">
        <p className="text-xs text-gray-400">Export or import your data. These operations may take time for large datasets.</p>
        <div className="flex flex-wrap gap-2">
          <button disabled className="px-4 py-2 text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded cursor-not-allowed">Export CSV</button>
          <button disabled className="px-4 py-2 text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded cursor-not-allowed">Import CSV</button>
          <button disabled className="px-4 py-2 text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded cursor-not-allowed">Reset Settings</button>
        </div>
      </div>
    ))
  );

  const renderSummary = () => {
    const accountCount = Number(counts['branches'] || 0);
    return renderSection('summary', 'Business Summary', (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{accountCount}</p>
          <p className="text-xs text-blue-500">Branches</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{Number(counts['tables'] || 0)}</p>
          <p className="text-xs text-green-500">Tables</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-purple-700">{Number(counts['staff'] || 0)}</p>
          <p className="text-xs text-purple-500">Staff</p>
        </div>
        <div className="bg-amber-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{Number(counts['menu_items'] || 0)}</p>
          <p className="text-xs text-amber-500">Menu Items</p>
        </div>
      </div>
    ));
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'general': return renderGeneral();
      case 'contact':
      case 'business': setActiveSection('general'); return renderGeneral();
      case 'branches':
      case 'hours': return renderBranches();
      case 'fbr': return renderFbr();
      case 'taxes': return renderTaxes();
      case 'receipt': return renderReceipt();
      case 'orders': return renderOrders();
      case 'inventory': return renderInventory();
      case 'system': return <>{renderModules()}{renderDataManagement()}</>;
      case 'summary': return renderSummary();
      default: return renderGeneral();
    }
  };

  const currentRestaurant = settings?.enabled_modules?.restaurant as Record<string, any> | undefined;

  const previewReceipt = () => ({
    header: form.receiptHeader || 'Restaurant Name',
    footer: form.receiptFooterText,
    showLogo: form.showLogo,
    showAddress: form.showBranchAddress,
    showPhone: form.showPhone,
    showNtn: form.showNtn,
    showCashier: form.showCashierName,
    showPayment: form.showPaymentMethod,
    showTax: form.showTaxBreakdown,
    showServiceCharge: form.showServiceCharge,
    thankYou: form.thankYouMessage,
    restaurantName: form.businessName || form.restaurantName || 'Restaurant',
  });

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
      {!canEdit && (
        <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-800 px-4 py-2 text-xs text-center">
          View-only mode. Contact an admin for edit access.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-36 lg:w-44 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto scrollbar-hide py-2">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${
                activeSection === s.id
                  ? 'text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              style={activeSection === s.id ? { backgroundColor: theme.primaryColor } : undefined}
            >
              {s.label}
            </button>
          ))}
        </nav>

        {/* Main */}
        <div className="flex-1 overflow-y-auto scrollbar-hide p-4 lg:p-6">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-lg font-bold text-gray-800">Settings</h1>
              {canEdit && (
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-5 py-2 text-sm text-white rounded font-medium transition-colors disabled:opacity-50"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  {saving ? 'Saving...' : saved ? 'Saved!' : 'Save All'}
                </button>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-xs mb-4">
                {error}
              </div>
            )}

            {saved && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded text-xs mb-4">
                Settings saved successfully.
              </div>
            )}

            {renderContent()}

            {/* Live Preview */}
            {renderSection('preview', 'Receipt Preview', (
              <div className="bg-gray-50 rounded-lg p-4 border border-dashed border-gray-200 max-w-xs mx-auto">
                <div className="text-center">
                  <p className="font-bold text-gray-800 text-sm">{previewReceipt().restaurantName}</p>
                  {previewReceipt().header && <p className="text-xs text-gray-500">{previewReceipt().header}</p>}
                </div>
                <hr className="my-2 border-dashed border-gray-300" />
                <div className="space-y-1 text-xs text-gray-600">
                  <div className="flex justify-between"><span>Item 1 x 2</span><span>1,000</span></div>
                  <div className="flex justify-between"><span>Item 2 x 1</span><span>500</span></div>
                  {previewReceipt().showServiceCharge && (
                    <div className="flex justify-between text-gray-400"><span>Service Charge (10%)</span><span>150</span></div>
                  )}
                  {previewReceipt().showTax && (
                    <div className="flex justify-between text-gray-400"><span>Tax (0%)</span><span>0</span></div>
                  )}
                  <hr className="border-gray-200" />
                  <div className="flex justify-between font-bold text-gray-800"><span>Total</span><span>1,650</span></div>
                </div>
                <hr className="my-2 border-dashed border-gray-300" />
                <p className="text-xs text-gray-400 text-center">{form.receiptFooterText}</p>
                {form.thankYouMessage && <p className="text-xs text-gray-400 text-center mt-1">{form.thankYouMessage}</p>}
              </div>
            ))}

            {canEdit && (
              <div className="flex justify-end mt-4 mb-8">
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-6 py-2.5 text-sm text-white rounded font-medium transition-colors disabled:opacity-50"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  {saving ? 'Saving...' : saved ? 'Saved!' : 'Save All Settings'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
