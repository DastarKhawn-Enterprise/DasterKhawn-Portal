'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { supa, supaRpc } from './supa-query';
import { processPayments, type PaymentInput } from './payment-actions';
import ReceiptView from './ReceiptView';
import PaymentMethodLogo from './PaymentMethodLogo';
import { usePublish } from './use-event';

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
  serviceChargeAmount?: number;
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
  customerId, customerName, customerPhone, orderType, items, taxAmount, serviceChargeAmount,
  brandName, onClose, onSuccess,
}: Props) {
  const { user } = useUser();
  const publish = usePublish();
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

  const addPaymentLine = useCallback(async (pm: string, partialAmount?: string) => {
    let accs = accountsByMethod(pm);
    let acc = accs.length > 0 ? accs[0] : null;
    if (!acc) {
      const defaultAcc = SEED_ACCOUNTS.find(a => a.payment_method === pm);
      if (defaultAcc) {
        try {
          const r = await supa(slug, { table: 'accounts', method: 'insert', body: defaultAcc, single: true });
          if (r.ok && r.data) {
            acc = r.data;
            setAccounts(prev => [...prev, r.data]);
          }
        } catch (e: any) {
          console.error('[PaymentModal] auto-create account failed:', e);
        }
      }
    }
    const amount = partialAmount ?? (pm === 'cash' ? String(due) : String(due > 0 ? Math.min(due, orderTotal) : 0));
    const newLine: PaymentLine = {
      id: genId(), account_id: acc?.id || '', payment_method: pm,
      amount, cash_received: '', change_due: '', reference_number: '', notes: '',
    };
    setPaymentLines((prev) => [...prev, newLine]);
  }, [accountsByMethod, due, orderTotal, slug]);

  const initLines = useCallback((pm: string) => { addPaymentLine(pm); }, [addPaymentLine]);

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

  const handleConfirm = useCallback(async () => {
    if (paymentLines.length === 0) {
      setError('Select at least one payment method');
      return;
    }
    const seenMethods = new Set<string>();
    for (const l of paymentLines) {
      if (!l.account_id) { setError('Select an account for all payments'); return; }
      if (!l.payment_method) { setError('All payments must have a method selected'); return; }
      if (seenMethods.has(l.payment_method)) { setError(`Duplicate payment method "${METHOD_LABELS[l.payment_method] || l.payment_method}". Use Split Payment for multiple methods.`); return; }
      seenMethods.add(l.payment_method);
      const amt = parseFloat(l.amount);
      if (!amt || amt <= 0) { setError('All payment amounts must be greater than zero'); return; }
      if (l.payment_method === 'cash') {
        const received = parseFloat(l.cash_received) || 0;
        if (received < amt) { setError(`Cash received (${currencySymbol}${received.toFixed(2)}) is less than amount due (${currencySymbol}${amt.toFixed(2)})`); return; }
      }
    }
    if (!isFullyCovered && due > 0) {
      setError(`Payments (${currencySymbol}${totalFromLines.toFixed(2)}) do not cover the full amount due (${currencySymbol}${due.toFixed(2)})`);
      return;
    }
    if (remaining > 0) {
      setError(`Remaining amount ${currencySymbol}${remaining.toFixed(2)} must be covered`);
      return;
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
      publish('orders', 'UPDATE', { id: orderId, payment_status: 'paid' });
      publish('payments', 'INSERT', { order_id: orderId });
      setResult(r);
      setShowReceipt(true);
      onSuccess(r);
    } catch (e: any) {
      setError(e.message || 'Payment failed');
    }
    setSaving(false);
  }, [paymentLines, isFullyCovered, totalFromLines, remaining, due, currencySymbol, slug, orderId, customerId, onSuccess, publish]);

  if (showReceipt && result) {
    return (
      <ReceiptView
        data={{
          orderNumber, status: 'paid', total: orderTotal, createdAt: new Date().toISOString(),
          orderType, customerName, customerPhone, items, taxAmount, serviceChargeAmount,
        }}
        brandName={brandName}
        theme={theme}
        onClose={onClose}
        currencySymbol={currencySymbol}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 anim-fade" onClick={onClose}>
      <div className="bg-white md:rounded-lg shadow-xl w-full md:max-w-lg md:mx-4 rounded-t-xl max-h-[90vh] flex flex-col pb-[env(safe-area-inset-bottom,0px)] anim-scale" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-[var(--text)] truncate">Payment — Order #{orderNumber}</h2>
            <p className="text-xs text-[var(--text-muted)]">Total: {currencySymbol}{orderTotal.toFixed(2)} | Due: {currencySymbol}{due.toFixed(2)}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost p-1.5 shrink-0 ml-2" aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>

        <div className="flex-1 overflow-y-auto text-[16px] space-y-4" style={{ padding: 'clamp(12px, 4vw, 16px)' }}>
          {(error || fetchError) && (
            <div className="badge badge-error flex items-center justify-between">
              <span>{error || fetchError}</span>
              {fetchError && <button onClick={loadAccounts} className="btn btn-ghost ml-2 px-2 py-1 text-xs">Retry</button>}
            </div>
          )}

          {loadingAccs ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-[var(--border)] border-t-[var(--text-muted)] rounded-full animate-spin mx-auto mb-2" />
                <p className="text-sm text-[var(--text-muted)]">Loading payment accounts...</p>
              </div>
            </div>
          ) : paymentLines.length === 0 ? (
            <>
              <>
                <p className="text-sm font-medium text-[var(--text)]">Select payment method</p>
                <div className="grid grid-cols-2 gap-2">
                  {['cash', 'jazzcash', 'easypaisa', 'bank_transfer', 'card', 'credit', 'other'].map((pm) => {
                    const accs = accountsByMethod(pm);
                    if (pm === 'credit' && !customerId) return null;
                    return (
                      <button
                        key={pm}
                        onClick={() => { setMethod(pm); initLines(pm); }}
                        className={`btn btn-outline px-3 py-3 text-sm font-medium text-left transition-colors min-h-[56px] ${
                          pm === 'credit' && !customerId ? 'opacity-40 cursor-not-allowed border-[var(--border)] text-[var(--text-muted)]' :
                          accs.length === 0 ? 'border-dashed border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]' :
                          'border-[var(--border)] hover:border-[var(--text-muted)] hover:bg-[var(--surface-2)] text-[var(--text)]'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-semibold">
                          <PaymentMethodLogo method={pm} size={24} />
                          <span>{METHOD_LABELS[pm] || pm}</span>
                        </div>
                        {pm === 'credit' && !customerId && <div className="text-[10px] text-amber-600 mt-0.5">Select customer first</div>}
                        {accs.length > 0 && <div className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">{accs[0].name}</div>}
                      </button>
                    );
                  })}
                </div>
              </>
              <button
                onClick={() => setMethod('split')}
                className="btn btn-outline w-full px-3 py-2.5 border-dashed min-h-[44px]"
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
                    <div key={line.id} className="card p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <PaymentMethodLogo method={line.payment_method} size={16} />
                          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">{METHOD_LABELS[line.payment_method] || line.payment_method}</span>
                        </div>
                        {paymentLines.length > 1 && (
                          <button onClick={() => removeLine(line.id)} className="btn btn-ghost text-xs text-red-500 hover:text-red-700">Remove</button>
                        )}
                      </div>

                      {accs.length > 1 && (
                        <select
                          value={line.account_id}
                          onChange={(e) => updateLine(line.id, 'account_id', e.target.value)}
                          className="input w-full min-h-[44px]"
                        >
                          {accs.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      )}
                      {accs.length === 1 && (
                        <p className="text-xs text-[var(--text-muted)]">{accs[0].name}</p>
                      )}

                      <div>
                        <label className="block text-xs text-[var(--text-muted)] mb-0.5">Amount ({currencySymbol})</label>
                        <input
                          type="number" step="0.01" min="0" inputMode="decimal"
                          value={line.amount}
                          onChange={(e) => updateLine(line.id, 'amount', e.target.value)}
                          className="input w-full"
                        />
                      </div>

                      {isCash && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-[var(--text-muted)] mb-0.5">Cash Received</label>
                            <input
                              type="number" step="0.01" min="0" inputMode="decimal"
                              value={line.cash_received}
                              onChange={(e) => updateLine(line.id, 'cash_received', e.target.value)}
                              className="input w-full"
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[var(--text-muted)] mb-0.5">Change</label>
                            <input
                              type="number" step="0.01"
                              value={line.change_due}
                              readOnly
                              className="input w-full bg-[var(--surface-2)] text-[var(--text-muted)]"
                            />
                          </div>
                        </div>
                      )}

                      {!isCash && (
                        <div>
                          <label className="block text-xs text-[var(--text-muted)] mb-0.5">Reference # (optional)</label>
                          <input
                            type="text" value={line.reference_number} inputMode="text"
                            onChange={(e) => updateLine(line.id, 'reference_number', e.target.value)}
                            className="input w-full"
                            placeholder="e.g. Txn ID"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs text-[var(--text-muted)] mb-0.5">Notes (optional)</label>
                        <input
                          type="text" value={line.notes} inputMode="text"
                          onChange={(e) => updateLine(line.id, 'notes', e.target.value)}
                          className="input w-full"
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
                    if (pm === 'credit' && !customerId) return null;
                    return (
                      <button
                        key={pm}
                        onClick={() => addPaymentLine(pm, String(remaining))}
                        className="btn btn-outline px-2 py-2 text-[10px] min-h-[44px] flex items-center justify-center gap-1"
                      >
                        <PaymentMethodLogo method={pm} size={14} />
                        {METHOD_LABELS[pm] || pm}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="card p-3 space-y-1 text-sm">
                <div className="flex justify-between text-[var(--text-muted)]">
                  <span>Total Due</span>
                  <span>{currencySymbol}{due.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[var(--text-muted)]">
                  <span>Total from payments</span>
                  <span>{currencySymbol}{totalFromLines.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-[var(--border)] pt-1">
                  <span>{remaining > 0 ? 'Remaining' : 'Overpaid'}</span>
                  <span className={remaining > 0 ? 'text-red-600' : 'text-green-600'}>
                    {remaining > 0 ? '+' : ''}{currencySymbol}{remaining.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-2 sticky bottom-0 bg-white pb-1">
                <button onClick={() => setPaymentLines([])} className="btn btn-outline flex-1 px-3 py-2.5 min-h-[44px]">
                  {method === 'split' && paymentLines.length === 1 ? 'Change method' : 'Reset'}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={saving || !isFullyCovered}
                  className="btn btn-primary flex-1 px-3 py-2.5 min-h-[44px] disabled:opacity-50"
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
