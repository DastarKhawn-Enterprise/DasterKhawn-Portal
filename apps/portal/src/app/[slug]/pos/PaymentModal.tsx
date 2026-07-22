'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { supa } from './supa-query';
import { processPayments, type PaymentInput } from './payment-actions';
import ReceiptView, { receiptContent } from './ReceiptView';

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

export default function PaymentModal({
  slug, theme, currencySymbol, orderId, orderNumber, orderTotal, amountPaid, amountDue,
  customerId, customerName, customerPhone, orderType, items, taxAmount,
  brandName, onClose, onSuccess,
}: Props) {
  const { user } = useUser();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccs, setLoadingAccs] = useState(true);
  const [method, setMethod] = useState<string>('');
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  const due = amountDue || orderTotal - (amountPaid || 0);

  useEffect(() => {
    supa(slug, { table: 'accounts', select: 'id, name, account_type, payment_method, current_balance', eq: ['is_active', true], order: 'name' }).then((r) => {
      if (r.ok && r.data) setAccounts(r.data as Account[]);
      setLoadingAccs(false);
    });
  }, [slug]);

  const accountsByMethod = (pm: string) => accounts.filter((a) => a.payment_method === pm);

  const initLines = useCallback((pm: string) => {
    const accs = accountsByMethod(pm);
    const acc = accs.length > 0 ? accs[0] : null;
    const line: PaymentLine = {
      id: genId(), account_id: acc?.id || '', payment_method: pm,
      amount: pm === 'cash' ? String(due) : String(due > 0 ? Math.min(due, orderTotal) : 0),
      cash_received: '', change_due: '', reference_number: '', notes: '',
    };
    // For split: if adding another line, default to remaining due
    if (paymentLines.length > 0) {
      const remaining = due - paymentLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
      line.amount = String(Math.max(0, remaining));
    }
    setPaymentLines((prev) => [...prev, line]);
  }, [accounts, due, paymentLines.length, orderTotal]);

  const updateLine = (id: string, field: keyof PaymentLine, value: string) => {
    setPaymentLines((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (field === 'amount') {
        const amt = parseFloat(value) || 0;
        // Auto-switch to the correct account based on amount
      }
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
  };

  const removeLine = (id: string) => setPaymentLines((prev) => prev.filter((l) => l.id !== id));

  const totalFromLines = paymentLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const remaining = due - totalFromLines;
  const isFullyCovered = remaining <= 0 && paymentLines.length > 0;

  // For single-method cash, auto-compute
  const singleCashLine = method === 'cash' && paymentLines.length === 1 ? paymentLines[0] : null;
  const cashReceived = singleCashLine ? parseFloat(singleCashLine.cash_received) || 0 : 0;
  const totalChange = paymentLines.reduce((s, l) => s + (parseFloat(l.change_due) || 0), 0);

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

  // Receipt view after success
  if (showReceipt && result) {
    const receiptData = {
      orderNumber,
      status: 'paid',
      total: orderTotal,
      createdAt: new Date().toISOString(),
      orderType,
      customerName,
      customerPhone,
      items,
      taxAmount,
    };
    return (
      <ReceiptView
        data={receiptData}
        brandName={brandName}
        theme={theme}
        onClose={onClose}
        currencySymbol={currencySymbol}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white md:rounded-lg shadow-xl w-full md:max-w-lg md:mx-4 rounded-t-xl max-h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Payment — Order #{orderNumber}</h2>
            <p className="text-xs text-gray-500">Total: {currencySymbol}{orderTotal.toFixed(2)} | Due: {currencySymbol}{due.toFixed(2)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}

          {/* Method selector (when no lines yet or split) */}
          {paymentLines.length === 0 ? (
            <>
              <p className="text-sm font-medium text-gray-700">Select payment method</p>
              <div className="grid grid-cols-2 gap-2">
                {['cash', 'jazzcash', 'easypaisa', 'bank_transfer', 'card', 'credit', 'other'].map((pm) => {
                  const accs = accountsByMethod(pm);
                  if (pm !== 'credit' && accs.length === 0) return null;
                  if (pm === 'credit' && !customerId) return null;
                  return (
                    <button
                      key={pm}
                      onClick={() => { setMethod(pm); initLines(pm); }}
                      disabled={pm !== 'credit' && accs.length === 0}
                      className={`px-3 py-3 rounded-lg border text-sm font-medium text-left transition-colors ${
                        pm === 'credit' && !customerId ? 'opacity-40 cursor-not-allowed border-gray-200 text-gray-400' :
                        accs.length === 0 ? 'opacity-40 cursor-not-allowed border-gray-200 text-gray-400' :
                        'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <div className="font-semibold">{METHOD_LABELS[pm] || pm}</div>
                      {pm === 'credit' && !customerId && <div className="text-[10px] text-amber-600 mt-0.5">Select customer first</div>}
                      {accs.length > 0 && <div className="text-[10px] text-gray-400 mt-0.5">{accs[0].name}</div>}
                    </button>
                  );
                })}
              </div>
              {/* Split button */}
              <button
                onClick={() => setMethod('split')}
                className="w-full px-3 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 hover:bg-gray-50"
              >
                + Split Payment (multiple methods)
              </button>
            </>
          ) : (
            <>
              {/* Payment lines */}
              <div className="space-y-3">
                {paymentLines.map((line, idx) => {
                  const isCash = line.payment_method === 'cash';
                  const accs = accountsByMethod(line.payment_method);
                  if (accs.length === 0 && line.payment_method !== 'split') return null;
                  const lineAmt = parseFloat(line.amount) || 0;
                  const cashRecv = parseFloat(line.cash_received) || 0;
                  const change = parseFloat(line.change_due) || 0;

                  return (
                    <div key={line.id} className="bg-gray-50 rounded-lg border border-gray-200 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500 uppercase">{METHOD_LABELS[line.payment_method] || line.payment_method}</span>
                        {paymentLines.length > 1 && (
                          <button onClick={() => removeLine(line.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                        )}
                      </div>

                      {/* Account selector */}
                      {accs.length > 1 && (
                        <select
                          value={line.account_id}
                          onChange={(e) => updateLine(line.id, 'account_id', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                        >
                          {accs.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      )}
                      {accs.length === 1 && (
                        <p className="text-xs text-gray-600">{accs[0].name}</p>
                      )}

                      {/* Amount */}
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Amount ({currencySymbol})</label>
                        <input
                          type="number" step="0.01" min="0"
                          value={line.amount}
                          onChange={(e) => updateLine(line.id, 'amount', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                          placeholder={String(due)}
                        />
                      </div>

                      {/* Cash received + change */}
                      {isCash && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Cash Received</label>
                            <input
                              type="number" step="0.01" min="0"
                              value={line.cash_received}
                              onChange={(e) => updateLine(line.id, 'cash_received', e.target.value)}
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Change</label>
                            <input
                              type="number" step="0.01"
                              value={line.change_due}
                              readOnly
                              className="w-full px-2 py-1.5 text-sm border border-gray-200 bg-gray-100 rounded text-gray-500"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      )}

                      {/* Reference */}
                      {!isCash && (
                        <div>
                          <label className="block text-xs text-gray-500 mb-0.5">Reference # (optional)</label>
                          <input
                            type="text" value={line.reference_number}
                            onChange={(e) => updateLine(line.id, 'reference_number', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                            placeholder="e.g. Txn ID"
                          />
                        </div>
                      )}

                      {/* Notes */}
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Notes (optional)</label>
                        <input
                          type="text" value={line.notes}
                          onChange={(e) => updateLine(line.id, 'notes', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                          placeholder="Notes"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary */}
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

              {/* Add another payment (for split) */}
              {method === 'split' && remaining > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {['cash', 'jazzcash', 'easypaisa', 'bank_transfer', 'card', 'credit', 'other'].map((pm) => {
                    const accs = accountsByMethod(pm);
                    if (pm !== 'credit' && accs.length === 0) return null;
                    if (pm === 'credit' && !customerId) return null;
                    return (
                      <button
                        key={pm}
                        onClick={() => {
                          const newLine: PaymentLine = {
                            id: genId(), account_id: accs[0]?.id || '', payment_method: pm,
                            amount: String(remaining), cash_received: '', change_due: '',
                            reference_number: '', notes: '',
                          };
                          setPaymentLines((prev) => [...prev, newLine]);
                        }}
                        className="px-2 py-1.5 text-[10px] rounded border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium"
                      >
                        +{METHOD_LABELS[pm] || pm}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                {method === 'split' && paymentLines.length === 1 && (
                  <button onClick={() => setPaymentLines([])} className="flex-1 px-3 py-2 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                    Change method
                  </button>
                )}
                {(method !== 'split' || paymentLines.length > 1) && (
                  <button onClick={() => setPaymentLines([])} className="flex-1 px-3 py-2 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                    Reset
                  </button>
                )}
                <button
                  onClick={handleConfirm}
                  disabled={saving || !isFullyCovered}
                  className="flex-1 px-3 py-2 text-sm rounded text-white font-medium disabled:opacity-50"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  {saving ? 'Processing...' : `Confirm Payment (${currencySymbol}${totalFromLines.toFixed(2)})`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
