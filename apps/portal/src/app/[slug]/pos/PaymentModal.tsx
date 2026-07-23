'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { supa, supaRpc } from './supa-query';
import { processPayments, type PaymentInput } from './payment-actions';
import ReceiptView from './ReceiptView';
import PaymentMethodLogo from './PaymentMethodLogo';

interface Props {
  slug: string;
  theme: ThemeConfig;
  currencySymbol: string;
  orderId: string;
  orderNumber: number;
  orderTotal: number;
  amountPaid: number;
  amountDue: number;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  orderType?: string;
  items: { name: string; quantity: number; price: number }[];
  taxAmount?: number;
  brandName: string;
  onClose: () => void;
  onSuccess: (result: any) => void;
}

interface Account {
  id: string;
  name: string;
  account_type: string;
  payment_method: string;
  current_balance: number;
}

interface PaymentLine {
  id: string;
  account_id: string;
  payment_method: string;
  amount: string;
  cash_received: string;
  change_due: string;
  reference_number: string;
  notes: string;
}

function genId() { return Math.random().toString(36).slice(2, 9); }

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', jazzcash: 'JazzCash', easypaisa: 'Easypaisa',
  bank_transfer: 'Bank Transfer', card: 'Card', credit: 'Credit', split: 'Split', other: 'Other',
};

const SEED_ACCOUNTS = [
  { name: 'Cash in Hand', account_type: 'cash', payment_method: 'cash', is_default: true },
  { name: 'JazzCash Wallet', account_type: 'mobile_wallet', payment_method: 'jazzcash', is_default: false },
  { name: 'Easypaisa Wallet', account_type: 'mobile_wallet', payment_method: 'easypaisa', is_default: false },
  { name: 'Bank Account', account_type: 'bank', payment_method: 'bank_transfer', is_default: false },
  { name: 'Card Account', account_type: 'card', payment_method: 'card', is_default: false },
  { name: 'Customer Credit Account', account_type: 'credit', payment_method: 'credit', is_default: false },
  { name: 'Other Payments', account_type: 'other', payment_method: 'other', is_default: false },
];

function normalizeMethod(val: string): string {
  return val.toLowerCase().replace(/[\s_-]+/g, '_').replace(/^_|_$/g, '') || val;
}

function matchMethod(accMethod: string, target: string): boolean {
  return normalizeMethod(accMethod) === normalizeMethod(target);
}

export default function PaymentModal({
  slug, theme, currencySymbol, orderId, orderNumber, orderTotal, amountPaid, amountDue,
  customerId, customerName, customerPhone, orderType, items, taxAmount,
  brandName, onClose, onSuccess,
}: Props) {
  const { user } = useUser();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccs, setLoadingAccs] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [method, setMethod] = useState<string>('');
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  const due = amountDue || orderTotal - (amountPaid || 0);

  const loadAccounts = useCallback(async () => {
    setLoadingAccs(true);
    setFetchError('');
    try {
      const r = await supa(slug, { table: 'accounts', select: 'id,name,account_type,payment_method,current_balance', eq: ['is_active', true], order: 'name' });
      if (r.ok && r.data && (r.data as Account[]).length > 0) {
        setAccounts(r.data as Account[]);
      } else if (r.ok && r.data && (r.data as Account[]).length === 0) {
        // Auto-seed default accounts if none exist
        const results = await Promise.all(
          SEED_ACCOUNTS.map((a) =>
            supa(slug, { table: 'accounts', method: 'insert', body: a, single: true })
          )
        );
        const seeded = results.filter((r): r is { ok: true; data: Account } => r.ok && !!(r as any).data).map((r) => r.data);
        if (seeded.length > 0) {
          setAccounts(seeded);
        } else {
          setFetchError('Could not load or create payment accounts. Contact admin.');
        }
      } else {
        console.error('[PaymentModal] supa error:', r.error);
        setFetchError(r.error || 'Failed to load payment accounts');
      }
    } catch (e: any) {
      console.error('[PaymentModal] fetch exception:', e);
      setFetchError(e.message || 'Failed to load accounts');
    }
    setLoadingAccs(false);
  }, [slug]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const accountsByMethod = useCallback((pm: string) =>
    accounts.filter((a) => matchMethod(a.payment_method, pm)),
  [accounts]);

  const initLines = useCallback((pm: string) => {
    const accs = accountsByMethod(pm);
    const acc = accs.length > 0 ? accs[0] : null;
    const newLine: PaymentLine = {
      id: genId(), account_id: acc?.id || '', payment_method: pm,
      amount: pm === 'cash' ? String(due) : String(due > 0 ? Math.min(due, orderTotal) : 0),
      cash_received: '', change_due: '', reference_number: '', notes: '',
    };
    setPaymentLines((prev) => [...prev, newLine]);
  }, [accountsByMethod, due, orderTotal]);

  const updateLine = useCallback((id: string, field: keyof PaymentLine, value: string) => {
    setPaymentLines((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (field === 'cash_received' && l.payment_method === 'cash') {
        const received = parseFloat(value) || 0;
        const lineAmt = parseFloat(l.amount) || 0;
        updated.change_due = received >= lineAmt ? (received - lineAmt).toFixed(2) : '0';
      }
      if (field === 'account_id') {
        const acc = accounts.find((a) => a.id === value);
        if (acc) updated.payment_method = acc.payment_method;
      }
      return updated;
    }));
  }, [accounts]);

  const removeLine = useCallback((id: string) =>
    setPaymentLines((prev) => prev.filter((l) => l.id !== id)), []);

  const totalFromLines = useMemo(() =>
    paymentLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0),
  [paymentLines]);

  const remaining = due - totalFromLines;
  const isFullyCovered = remaining <= 0 && paymentLines.length > 0;

  const handleConfirm = async () => {
    if (paymentLines.length === 0 || !isFullyCovered) {
      setError('Payments do not cover the full amount');
      return;
    }
    for (const l of paymentLines) {
      if (!l.account_id) { setError('Select an account for all payments'); return; }
      const amt = parseFloat(l.amount);
      if (!amt || amt <= 0) { setError('All payment amounts must be positive'); return; }
    }
    setSaving(true);
    setError('');
    try {
      const payments: PaymentInput[] = paymentLines.map((l) => ({
        account_id: l.account_id,
        payment_method: l.payment_method,
        amount: parseFloat(l.amount),
        cash_received: l.payment_method === 'cash' ? (parseFloat(l.cash_received) || null) : null,
        change_due: l.payment_method === 'cash' ? (parseFloat(l.change_due) || null) : null,
        reference_number: l.reference_number || null,
        notes: l.notes || null,
        customer_id: l.payment_method === 'credit' ? (customerId || null) : null,
        idempotency_key: `${orderId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      }));
      const r = await processPayments(slug, orderId, payments);
      if (!r.success) {
        setError(r.error || 'Payment processing failed');
        setSaving(false);
        return;
      }
      setResult(r);
      setShowReceipt(true);
      onSuccess(r);
    } catch (e: any) {
      setError(e.message || 'Payment failed');
    }
    setSaving(false);
  };

  if (showReceipt && result) {
    return (
      <ReceiptView
        data={{
          orderNumber, status: 'paid', total: orderTotal, createdAt: new Date().toISOString(),
          orderType, customerName, customerPhone, items, taxAmount,
        }}
        brandName={brandName}
        theme={theme}
        onClose={onClose}
        currencySymbol={currencySymbol}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white md:rounded-lg shadow-xl w-full md:max-w-lg md:mx-4 rounded-t-xl max-h-[90vh] flex flex-col pb-[env(safe-area-inset-bottom,0px)]" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 truncate">Payment — Order #{orderNumber}</h2>
            <p className="text-xs text-gray-500">Total: {currencySymbol}{orderTotal.toFixed(2)} | Due: {currencySymbol}{due.toFixed(2)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 shrink-0 ml-2" aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>

        <div className="flex-1 overflow-y-auto text-[16px] space-y-4" style={{ padding: 'clamp(12px, 4vw, 16px)' }}>
          {(error || fetchError) && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm flex items-center justify-between">
              <span>{error || fetchError}</span>
              {fetchError && <button onClick={loadAccounts} className="ml-2 px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200">Retry</button>}
            </div>
          )}

          {loadingAccs ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-sm text-gray-500">Loading payment accounts...</p>
              </div>
            </div>
          ) : paymentLines.length === 0 ? (
            <>
              {accounts.length > 0 && (
                <>
                  <p className="text-sm font-medium text-gray-700">Select payment method</p>
                  <div className="grid grid-cols-2 gap-2">
                    {['cash', 'jazzcash', 'easypaisa', 'bank_transfer', 'card', 'credit', 'other'].map((pm) => {
                      const accs = accountsByMethod(pm);
                      const show = pm === 'credit' ? !!customerId : accs.length > 0 || pm === 'other';
                      if (!show) return null;
                      return (
                        <button
                          key={pm}
                          onClick={() => { setMethod(pm); initLines(pm); }}
                          className={`px-3 py-3 rounded-lg border text-sm font-medium text-left transition-colors min-h-[56px] ${
                            pm === 'credit' && !customerId ? 'opacity-40 cursor-not-allowed border-gray-200 text-gray-400' :
                            accs.length === 0 ? 'border-dashed border-gray-300 text-gray-500 hover:bg-gray-50' :
                            'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 font-semibold">
                            <PaymentMethodLogo method={pm} size={24} />
                            <span>{METHOD_LABELS[pm] || pm}</span>
                          </div>
                          {pm === 'credit' && !customerId && <div className="text-[10px] text-amber-600 mt-0.5">Select customer first</div>}
                          {accs.length > 0 && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{accs[0].name}</div>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              <button
                onClick={() => setMethod('split')}
                className="w-full px-3 py-2.5 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 hover:bg-gray-50 min-h-[44px]"
              >
                + Split Payment (multiple methods)
              </button>
            </>
          ) : (
            <>
              <div className="space-y-3">
                {paymentLines.map((line) => {
                  const isCash = line.payment_method === 'cash';
                  const accs = accountsByMethod(line.payment_method);
                  const lineAmt = parseFloat(line.amount) || 0;

                  return (
                    <div key={line.id} className="bg-gray-50 rounded-lg border border-gray-200 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <PaymentMethodLogo method={line.payment_method} size={16} />
                          <span className="text-xs font-semibold text-gray-500 uppercase">{METHOD_LABELS[line.payment_method] || line.payment_method}</span>
                        </div>
                        {paymentLines.length > 1 && (
                          <button onClick={() => removeLine(line.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                        )}
                      </div>

                      {accs.length > 1 && (
                        <select
                          value={line.account_id}
                          onChange={(e) => updateLine(line.id, 'account_id', e.target.value)}
                          className="w-full px-2 py-2 text-sm border border-gray-300 rounded min-h-[44px]"
                        >
                          {accs.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      )}
                      {accs.length === 1 && (
                        <p className="text-xs text-gray-600">{accs[0].name}</p>
                      )}

                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Amount ({currencySymbol})</label>
                        <input
                          type="number" step="0.01" min="0" inputMode="decimal"
                          value={line.amount}
                          onChange={(e) => updateLine(line.id, 'amount', e.target.value)}
                          className="w-full px-2 py-2.5 text-[16px] border border-gray-300 rounded"
                        />
                      </div>

                      {isCash && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Cash Received</label>
                            <input
                              type="number" step="0.01" min="0" inputMode="decimal"
                              value={line.cash_received}
                              onChange={(e) => updateLine(line.id, 'cash_received', e.target.value)}
                              className="w-full px-2 py-2.5 text-[16px] border border-gray-300 rounded"
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Change</label>
                            <input
                              type="number" step="0.01"
                              value={line.change_due}
                              readOnly
                              className="w-full px-2 py-2.5 text-sm border border-gray-200 bg-gray-100 rounded text-gray-500"
                            />
                          </div>
                        </div>
                      )}

                      {!isCash && (
                        <div>
                          <label className="block text-xs text-gray-500 mb-0.5">Reference # (optional)</label>
                          <input
                            type="text" value={line.reference_number} inputMode="text"
                            onChange={(e) => updateLine(line.id, 'reference_number', e.target.value)}
                            className="w-full px-2 py-2.5 text-[16px] border border-gray-300 rounded"
                            placeholder="e.g. Txn ID"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Notes (optional)</label>
                        <input
                          type="text" value={line.notes} inputMode="text"
                          onChange={(e) => updateLine(line.id, 'notes', e.target.value)}
                          className="w-full px-2 py-2.5 text-[16px] border border-gray-300 rounded"
                          placeholder="Notes"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {method === 'split' && remaining > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {['cash', 'jazzcash', 'easypaisa', 'bank_transfer', 'card', 'credit', 'other'].map((pm) => {
                    const accs = accountsByMethod(pm);
                    if (pm === 'credit' && !customerId) return null;
                    if (accs.length === 0 && pm !== 'other') return null;
                    return (
                      <button
                        key={pm}
                        onClick={() => {
                          const a = accs.length > 0 ? accs[0] : null;
                          const nl: PaymentLine = {
                            id: genId(), account_id: a?.id || '', payment_method: pm,
                            amount: String(remaining), cash_received: '', change_due: '',
                            reference_number: '', notes: '',
                          };
                          setPaymentLines((prev) => [...prev, nl]);
                        }}
                        className="px-2 py-2 text-[10px] rounded border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium min-h-[44px] flex items-center justify-center gap-1"
                      >
                        <PaymentMethodLogo method={pm} size={14} />
                        {METHOD_LABELS[pm] || pm}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Total Due</span>
                  <span>{currencySymbol}{due.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Total from payments</span>
                  <span>{currencySymbol}{totalFromLines.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-gray-200 pt-1">
                  <span>{remaining > 0 ? 'Remaining' : 'Overpaid'}</span>
                  <span className={remaining > 0 ? 'text-red-600' : 'text-green-600'}>
                    {remaining > 0 ? '+' : ''}{currencySymbol}{remaining.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-2 sticky bottom-0 bg-white pb-1">
                <button onClick={() => setPaymentLines([])} className="flex-1 px-3 py-2.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50 min-h-[44px]">
                  {method === 'split' && paymentLines.length === 1 ? 'Change method' : 'Reset'}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={saving || !isFullyCovered}
                  className="flex-1 px-3 py-2.5 text-sm rounded text-white font-medium min-h-[44px] disabled:opacity-50"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  {saving ? 'Processing...' : `Confirm (${currencySymbol}${totalFromLines.toFixed(2)})`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
