'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { hasPermission } from './permissions';
import { supa } from './supa-query';
import { processTransfer, processExpense } from './payment-actions';

interface Props {
  slug: string;
  theme: ThemeConfig;
  currencySymbol: string;
}

interface Account {
  id: string;
  name: string;
  account_type: string;
  payment_method: string;
  institution_name: string | null;
  account_number_masked: string | null;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

interface Transaction {
  id: string;
  account_id: string;
  payment_id: string | null;
  order_id: string | null;
  expense_id: string | null;
  transaction_type: string;
  direction: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_number: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

type AccountTab = 'all' | 'cash' | 'bank' | 'mobile_wallet' | 'card' | 'credit';

const TAB_LABELS: Record<AccountTab, string> = {
  all: 'All', cash: 'Cash', bank: 'Bank', mobile_wallet: 'Mobile Wallets', card: 'Cards', credit: 'Credit',
};

const TYPE_COLORS: Record<string, string> = {
  cash: '#10b981', bank: '#3b82f6', mobile_wallet: '#f59e0b',
  card: '#8b5cf6', credit: '#ef4444', other: '#6b7280',
};

const TX_TYPE_LABELS: Record<string, string> = {
  sale: 'Sale', expense: 'Expense', income: 'Income', transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out', refund: 'Refund', adjustment: 'Adjustment',
  opening_balance: 'Opening Balance', credit_sale: 'Credit Sale', credit_payment: 'Credit Payment',
};

function AccountIcon({ type, className }: { type: string; className?: string }) {
  const cls = `inline-block ${className || ''}`;
  if (type === 'cash') return <svg className={cls} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={TYPE_COLORS.cash} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>;
  if (type === 'bank') return <svg className={cls} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={TYPE_COLORS.bank} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11"/><path d="M20 10v11"/><path d="M8 14v3"/><path d="M12 14v3"/><path d="M16 14v3"/></svg>;
  if (type === 'mobile_wallet') return <svg className={cls} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={TYPE_COLORS.mobile_wallet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 2v2"/><path d="M12 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 11h.01"/><path d="M11 11h.01"/><path d="M8 11h.01"/><path d="M11 15h.01"/><path d="M16 15h.01"/><path d="M8 15h.01"/></svg>;
  if (type === 'card') return <svg className={cls} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={TYPE_COLORS.card} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
  if (type === 'credit') return <svg className={cls} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={TYPE_COLORS.credit} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>;
  return <svg className={cls} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>;
}

function SummaryIcon({ icon, className }: { icon: string; className?: string }) {
  const cls = `inline-block ${className || ''}`;
  if (icon === 'total') return <svg className={cls} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
  if (icon === 'wallet') return <svg className={cls} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 000 4h4v-4z"/></svg>;
  return null;
}

function DonutChart({ data, total, currencySymbol }: { data: { label: string; value: number; color: string }[]; total: number; currencySymbol: string }) {
  const cx = 60, cy = 60, r = 48, sw = 18;
  const circumference = 2 * Math.PI * r;
  const slices = useMemo(() => {
    let off = 0;
    return data.filter(d => d.value > 0).map(d => {
      const pct = total > 0 ? d.value / total : 0;
      const dash = pct * circumference;
      const seg = { ...d, dash, offset: off, pct };
      off += dash;
      return seg;
    });
  }, [data, total, circumference]);

  if (total === 0) {
    return (
      <svg viewBox="0 0 120 120" className="w-full h-auto max-w-[160px] mx-auto">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={sw} />
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-gray-400 text-[10px]" fontSize="10">0</text>
        <text x={cx} y={cy + 10} textAnchor="middle" className="fill-gray-400 text-[7px]" fontSize="7">Total</text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 120" className="w-full h-auto max-w-[160px] mx-auto">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={sw} />
      {slices.map((s, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={sw}
          strokeDasharray={`${Math.max(s.dash, 0.5)} ${circumference}`}
          strokeDashoffset={-s.offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          className="transition-all duration-300"
        />
      ))}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="13" fontWeight="bold" fill="#374151">{currencySymbol}{total.toFixed(0)}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8" fill="#9ca3af">Total</text>
    </svg>
  );
}

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full md:max-w-md md:mx-4 bg-white md:rounded-lg rounded-t-xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100" aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div className="overflow-y-auto p-4 text-[16px]">{children}</div>
      </div>
    </div>
  );
}

export default function AccountsView({ slug, theme, currencySymbol }: Props) {
  const { user, isLoaded } = useUser();
  const meta = user?.publicMetadata as Record<string, any> | undefined;
  const perms = (meta?.permissions ?? []) as string[];
  const role = (meta?.role ?? '') as string;
  const canView = hasPermission(perms, role, 'accounts:view');
  const canManage = hasPermission(perms, role, 'accounts:manage');
  const canTransfer = hasPermission(perms, role, 'accounts:transfer');
  const canAdjust = hasPermission(perms, role, 'accounts:adjust');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [recentTxns, setRecentTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [txnLoading, setTxnLoading] = useState(false);
  const [tab, setTab] = useState<AccountTab>('all');
  const [selectedAccId, setSelectedAccId] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showIncome, setShowIncome] = useState(false);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);

  const [tfFrom, setTfFrom] = useState('');
  const [tfTo, setTfTo] = useState('');
  const [tfAmount, setTfAmount] = useState('');
  const [tfRef, setTfRef] = useState('');
  const [tfDesc, setTfDesc] = useState('');
  const [tfSaving, setTfSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [ieType, setIeType] = useState<'income' | 'expense'>('income');
  const [ieAccountId, setIeAccountId] = useState('');
  const [ieAmount, setIeAmount] = useState('');
  const [ieDate, setIeDate] = useState(new Date().toISOString().split('T')[0]);
  const [ieDesc, setIeDesc] = useState('');
  const [ieSaving, setIeSaving] = useState(false);

  const fetchAccounts = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const r = await supa(slug, { table: 'accounts', select: '*', order: 'name' });
      if (r.ok && r.data) setAccounts(r.data as Account[]);
    } catch (e) { console.error('[Accounts] fetch', e); }
    setLoading(false);
  }, [isLoaded, slug]);

  const fetchTxns = useCallback(async (accountId: string | null) => {
    if (!accountId) { setTxns([]); return; }
    setTxnLoading(true);
    try {
      const r = await supa(slug, {
        table: 'account_transactions', select: '*',
        eq: ['account_id', accountId],
        order: { column: 'created_at', ascending: false },
        limit: 100,
      });
      if (r.ok && r.data) setTxns(r.data as Transaction[]);
    } catch (e) { console.error('[Txn] fetch', e); }
    setTxnLoading(false);
  }, [slug]);

  const fetchRecentTxns = useCallback(async () => {
    try {
      const r = await supa(slug, {
        table: 'account_transactions', select: 'id, account_id, transaction_type, direction, amount, description, reference_number, created_at',
        order: { column: 'created_at', ascending: false }, limit: 6,
      });
      if (r.ok && r.data) setRecentTxns(r.data as Transaction[]);
    } catch (e) { /* silent */ }
  }, [slug]);

  useEffect(() => { fetchAccounts(); fetchRecentTxns(); }, [fetchAccounts, fetchRecentTxns]);
  useEffect(() => { fetchTxns(selectedAccId); }, [fetchTxns, selectedAccId]);

  const filteredAccounts = useMemo(() =>
    tab === 'all' ? accounts : accounts.filter((a) => a.account_type === tab),
  [accounts, tab]);

  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + Number(a.current_balance), 0), [accounts]);
  const cashBalance = useMemo(() => accounts.filter((a) => a.account_type === 'cash').reduce((s, a) => s + Number(a.current_balance), 0), [accounts]);
  const bankBalance = useMemo(() => accounts.filter((a) => a.account_type === 'bank').reduce((s, a) => s + Number(a.current_balance), 0), [accounts]);
  const walletBalance = useMemo(() => accounts.filter((a) => a.account_type === 'mobile_wallet').reduce((s, a) => s + Number(a.current_balance), 0), [accounts]);
  const ezpBalance = useMemo(() => accounts.filter((a) => a.payment_method === 'easypaisa').reduce((s, a) => s + Number(a.current_balance), 0), [accounts]);

  const chartData = useMemo(() => {
    const groups = new Map<string, { label: string; value: number; color: string }>();
    for (const acc of accounts) {
      const key = acc.account_type;
      const prev = groups.get(key) || { label: acc.account_type.replace('_', ' '), value: 0, color: TYPE_COLORS[key] || '#6b7280' };
      prev.value += Number(acc.current_balance);
      groups.set(key, prev);
    }
    return Array.from(groups.values()).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [accounts]);

  const selectedAccount = useMemo(() => accounts.find((a) => a.id === selectedAccId) || null, [accounts, selectedAccId]);

  const handleTransfer = async () => {
    if (!tfFrom || !tfTo) { setError('Select both accounts'); return; }
    if (tfFrom === tfTo) { setError('Cannot transfer to the same account'); return; }
    const amt = parseFloat(tfAmount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return; }
    setTfSaving(true); setError('');
    try {
      const r = await processTransfer(slug, tfFrom, tfTo, amt, tfRef || null, tfDesc || null);
      if (!r.success) { setError(r.error); setTfSaving(false); return; }
      setSuccessMsg(`Transferred ${currencySymbol}${amt.toFixed(2)} successfully`);
      setShowTransfer(false);
      setTfAmount(''); setTfRef(''); setTfDesc('');
      await Promise.all([fetchAccounts(), fetchRecentTxns()]);
      if (selectedAccId) await fetchTxns(selectedAccId);
    } catch (e: any) { setError(e.message); }
    setTfSaving(false);
  };

  const handleIncomeExpense = async () => {
    if (!ieAccountId) { setError('Select an account'); return; }
    const amt = parseFloat(ieAmount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return; }
    setIeSaving(true); setError('');
    try {
      if (ieType === 'expense') {
        const r = await processExpense(slug, ieAccountId, 'other', ieDesc || null, amt, ieDate);
        if (!r.success) { setError(r.error); setIeSaving(false); return; }
      } else {
        const acc = accounts.find((a) => a.id === ieAccountId);
        if (!acc) { setError('Account not found'); setIeSaving(false); return; }
        const bal = Number(acc.current_balance);
        const newBal = bal + amt;
        const { ok } = await supa(slug, { table: 'accounts', method: 'update', eq: ['id', ieAccountId], body: { current_balance: newBal } });
        if (!ok) { setError('Failed to update balance'); setIeSaving(false); return; }
        await supa(slug, {
          table: 'account_transactions', method: 'insert', body: {
            account_id: ieAccountId, transaction_type: 'income', direction: 'credit',
            amount: amt, balance_before: bal, balance_after: newBal,
            description: ieDesc || 'Direct income', created_by: user?.id || null,
          },
        });
      }
      setSuccessMsg(`${ieType === 'income' ? 'Income' : 'Expense'} of ${currencySymbol}${amt.toFixed(2)} recorded`);
      setShowIncome(false);
      setIeAmount(''); setIeDesc('');
      await Promise.all([fetchAccounts(), fetchRecentTxns()]);
      if (selectedAccId) await fetchTxns(selectedAccId);
    } catch (e: any) { setError(e.message); }
    setIeSaving(false);
  };

  if (!isLoaded) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50 p-4"><p className="text-gray-500">Loading...</p></div>;
  }

  if (!canView) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center"><h2 className="text-2xl font-bold text-gray-400 mb-2">Accounts</h2><p className="text-gray-300">You do not have permission to view accounts.</p></div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-3 sm:p-4 md:p-6">
      <div className="mx-auto" style={{ maxWidth: 1200 }}>
        {/* ── HEADER ── */}
        <div className="mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Accounts</h1>
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
              className="self-start sm:self-auto px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white w-full sm:w-auto max-w-[180px]" />
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
            {canManage && (
              <button onClick={() => { setIeType('income'); setIeAccountId(''); setIeAmount(''); setIeDesc(''); setError(''); setShowIncome(true); }}
                className="shrink-0 px-3 py-2 text-xs sm:text-sm rounded text-white font-medium whitespace-nowrap"
                style={{ backgroundColor: theme.primaryColor }}>+ Add Income</button>
            )}
            {canManage && (
              <button onClick={() => { setIeType('expense'); setIeAccountId(''); setIeAmount(''); setIeDesc(''); setError(''); setShowIncome(true); }}
                className="shrink-0 px-3 py-2 text-xs sm:text-sm rounded border border-red-300 text-red-600 hover:bg-red-50 whitespace-nowrap">+ Add Expense</button>
            )}
            {canTransfer && (
              <button onClick={() => { setTfFrom(''); setTfTo(''); setTfAmount(''); setTfRef(''); setTfDesc(''); setError(''); setShowTransfer(true); }}
                className="shrink-0 px-3 py-2 text-xs sm:text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap">Transfer</button>
            )}
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded text-sm mb-4">{error}</div>}
        {successMsg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2.5 rounded text-sm mb-4">{successMsg}</div>}

        {/* ── MAIN CONTENT ── */}
        <div className="lg:flex lg:gap-6">

          {/* ── LEFT COLUMN ── */}
          <div className="lg:w-[73%] space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm col-span-2 sm:col-span-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: theme.primaryColor + '20', color: theme.primaryColor }}>
                    <SummaryIcon icon="total" className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Total Balance</p>
                <p className="text-lg sm:text-xl font-bold" style={{ color: theme.primaryColor }}>{currencySymbol}{totalBalance.toFixed(2)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">All accounts combined</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: TYPE_COLORS.cash + '20', color: TYPE_COLORS.cash }}>
                    <AccountIcon type="cash" className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Cash in Hand</p>
                <p className="text-base sm:text-lg font-bold text-gray-800">{currencySymbol}{cashBalance.toFixed(2)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Physical cash</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: TYPE_COLORS.bank + '20', color: TYPE_COLORS.bank }}>
                    <AccountIcon type="bank" className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Bank Balance</p>
                <p className="text-base sm:text-lg font-bold text-gray-800">{currencySymbol}{bankBalance.toFixed(2)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Bank accounts</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: TYPE_COLORS.mobile_wallet + '20', color: TYPE_COLORS.mobile_wallet }}>
                    <AccountIcon type="mobile_wallet" className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">JazzCash</p>
                <p className="text-base sm:text-lg font-bold text-gray-800">{currencySymbol}{walletBalance.toFixed(2)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Mobile wallets</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: TYPE_COLORS.mobile_wallet + '20', color: TYPE_COLORS.mobile_wallet }}>
                    <AccountIcon type="mobile_wallet" className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Easypaisa</p>
                <p className="text-base sm:text-lg font-bold text-gray-800">{currencySymbol}{ezpBalance.toFixed(2)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Easypaisa balance</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="overflow-x-auto scrollbar-hide -mx-3 px-3">
              <div className="flex gap-1 min-w-0 pb-1">
                {(Object.entries(TAB_LABELS) as [AccountTab, string][]).map(([key, label]) => (
                  <button key={key} onClick={() => setTab(key)}
                    className={`shrink-0 px-3 py-2 text-xs sm:text-sm rounded-lg font-medium transition-colors min-h-[44px] ${
                      tab === key ? 'text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}
                    style={tab === key ? { backgroundColor: theme.primaryColor, borderColor: theme.primaryColor } : {}}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* Account List */}
            {loading ? (
              <div className="flex items-center justify-center py-12"><p className="text-gray-400 text-sm">Loading accounts...</p></div>
            ) : filteredAccounts.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center"><p className="text-gray-400 text-sm">No accounts in this category.</p></div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden lg:block bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wider">
                        <th className="text-left px-4 py-3 font-medium">Account</th>
                        <th className="text-left px-4 py-3 font-medium">Type</th>
                        <th className="text-left px-4 py-3 font-medium">Details</th>
                        <th className="text-right px-4 py-3 font-medium">Balance</th>
                        <th className="text-center px-4 py-3 font-medium">Status</th>
                        <th className="text-center px-4 py-3 font-medium w-[80px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAccounts.map((acc) => {
                        const isSelected = acc.id === selectedAccId;
                        return (
                          <tr key={acc.id}
                            className={`border-b border-gray-100 cursor-pointer transition-colors ${isSelected ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                            onClick={() => setSelectedAccId(isSelected ? null : acc.id)}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <AccountIcon type={acc.account_type} className="w-5 h-5 shrink-0" />
                                <span className="font-medium text-gray-800">{acc.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-500 capitalize text-xs">{acc.account_type.replace('_', ' ')}</td>
                            <td className="px-4 py-3 text-gray-500 text-[11px]">
                              {acc.institution_name && <div>{acc.institution_name}</div>}
                              {acc.account_number_masked && <div className="font-mono">{acc.account_number_masked}</div>}
                            </td>
                            <td className={`px-4 py-3 text-right font-mono font-semibold ${Number(acc.current_balance) > 0 ? 'text-green-600' : Number(acc.current_balance) < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                              {currencySymbol}{Number(acc.current_balance).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${acc.is_active ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                                {acc.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {canTransfer && acc.account_type !== 'credit' && (
                                <button onClick={(e) => { e.stopPropagation(); setTfFrom(acc.id); setShowTransfer(true); }}
                                  className="text-[11px] text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50">Transfer</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="lg:hidden space-y-2">
                  {filteredAccounts.map((acc) => {
                    const isSelected = acc.id === selectedAccId;
                    return (
                      <div key={acc.id}
                        className={`bg-white rounded-xl border shadow-sm transition-colors ${isSelected ? 'border-gray-300' : 'border-gray-200'}`}>
                        <button onClick={() => setSelectedAccId(isSelected ? null : acc.id)}
                          className="w-full flex items-center justify-between p-3 min-h-[56px]">
                          <div className="flex items-center gap-3 min-w-0">
                            <AccountIcon type={acc.account_type} className="w-6 h-6 shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium text-sm text-gray-800 truncate">{acc.name}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] text-gray-500 capitalize bg-gray-100 px-1.5 py-0.5 rounded">{acc.account_type.replace('_', ' ')}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${acc.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {acc.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <div className={`font-semibold text-sm ${Number(acc.current_balance) > 0 ? 'text-green-600' : Number(acc.current_balance) < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                              {currencySymbol}{Number(acc.current_balance).toFixed(2)}
                            </div>
                            <svg className={`w-4 h-4 mx-auto mt-0.5 text-gray-400 transition-transform ${isSelected ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                          </div>
                        </button>
                        {isSelected && (
                          <div className="px-3 pb-3 pt-0 border-t border-gray-100 mt-0">
                            <div className="pt-2 space-y-2 text-sm text-gray-600">
                              {acc.institution_name && <div className="flex justify-between"><span className="text-gray-400">Institution</span><span>{acc.institution_name}</span></div>}
                              {acc.account_number_masked && <div className="flex justify-between"><span className="text-gray-400">Account #</span><span className="font-mono">{acc.account_number_masked}</span></div>}
                              <div className="flex justify-between"><span className="text-gray-400">Default</span><span>{acc.is_default ? 'Yes' : 'No'}</span></div>
                              {canTransfer && acc.account_type !== 'credit' && (
                                <button onClick={(e) => { e.stopPropagation(); setTfFrom(acc.id); setShowTransfer(true); }}
                                  className="w-full mt-1 px-3 py-2 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                                  style={{ color: theme.primaryColor, borderColor: theme.primaryColor }}>Transfer from this account</button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Selected Account Transactions */}
            {selectedAccount && (
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span>Transactions — {selectedAccount.name}</span>
                  <span className="text-gray-400 font-normal text-xs">(Balance: {currencySymbol}{Number(selectedAccount.current_balance).toFixed(2)})</span>
                </h2>
                {txnLoading ? (
                  <div className="flex items-center justify-center py-8"><p className="text-gray-400 text-sm">Loading transactions...</p></div>
                ) : txns.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-6 text-center"><p className="text-gray-400 text-sm">No transactions yet.</p></div>
                ) : (
                  <>
                    {/* Desktop Txn Table */}
                    <div className="hidden lg:block bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wider">
                            <th className="text-left px-4 py-3 font-medium">Date</th>
                            <th className="text-left px-4 py-3 font-medium">Type</th>
                            <th className="text-left px-4 py-3 font-medium">Direction</th>
                            <th className="text-right px-4 py-3 font-medium">Amount</th>
                            <th className="text-right px-4 py-3 font-medium">Balance</th>
                            <th className="text-left px-4 py-3 font-medium">Description</th>
                            <th className="text-left px-4 py-3 font-medium">Reference</th>
                          </tr>
                        </thead>
                        <tbody>
                          {txns.map((t) => (
                            <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-[11px]">
                                {new Date(t.created_at).toLocaleDateString()} {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-50 text-gray-600 border border-gray-200">
                                  {TX_TYPE_LABELS[t.transaction_type] || t.transaction_type}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${t.direction === 'credit' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                                  {t.direction === 'credit' ? 'Credit' : 'Debit'}
                                </span>
                              </td>
                              <td className={`px-4 py-3 text-right font-mono font-semibold ${t.direction === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                                {t.direction === 'credit' ? '+' : '-'}{currencySymbol}{Number(t.amount).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-gray-700">{currencySymbol}{Number(t.balance_after).toFixed(2)}</td>
                              <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate text-xs">{t.description || '—'}</td>
                              <td className="px-4 py-3 text-gray-400 text-[11px] font-mono">{t.reference_number || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Mobile Txn Cards */}
                    <div className="lg:hidden space-y-1.5">
                      {txns.slice(0, 10).map((t) => (
                        <div key={t.id} className="bg-white rounded-lg border border-gray-200 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{TX_TYPE_LABELS[t.transaction_type] || t.transaction_type}</span>
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${t.direction === 'credit' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                  {t.direction === 'credit' ? 'Credit' : 'Debit'}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 truncate">{t.description || '—'}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">{new Date(t.created_at).toLocaleDateString()} {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <div className={`font-semibold text-sm ${t.direction === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                                {t.direction === 'credit' ? '+' : '-'}{currencySymbol}{Number(t.amount).toFixed(2)}
                              </div>
                              <div className="text-[10px] text-gray-400">Bal: {currencySymbol}{Number(t.balance_after).toFixed(2)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Right sidebar sections (mobile only — after account list) */}
            <div className="lg:hidden space-y-4 pb-4">
              {/* Account Summary (Mobile) */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Account Summary</h3>
                <div className="flex flex-col items-center">
                  <DonutChart data={chartData} total={totalBalance} currencySymbol={currencySymbol} />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 w-full max-w-[280px]">
                    {chartData.map((d, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="text-gray-600 truncate">{d.label}</span>
                        <span className="ml-auto font-medium text-gray-800">{((d.value / Math.max(totalBalance, 1)) * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quick Actions (Mobile) */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-2">
                  {canManage && <ActionButton label="Add Account" onClick={() => {}} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>} />}
                  {canTransfer && <ActionButton label="Transfer Money" onClick={() => { setTfFrom(''); setTfTo(''); setTfAmount(''); setTfRef(''); setTfDesc(''); setError(''); setShowTransfer(true); }} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>} />}
                  {canManage && <ActionButton label="Add Income" onClick={() => { setIeType('income'); setIeAccountId(''); setIeAmount(''); setIeDesc(''); setError(''); setShowIncome(true); }} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>} />}
                  {canManage && <ActionButton label="Add Expense" onClick={() => { setIeType('expense'); setIeAccountId(''); setIeAmount(''); setIeDesc(''); setError(''); setShowIncome(true); }} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>} />}
                  {canAdjust && <ActionButton label="Adjustment" onClick={() => {}} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>} />}
                </div>
              </div>

              {/* Recent Transactions (Mobile) */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Transactions</h3>
                {recentTxns.length === 0 ? (
                  <p className="text-sm text-gray-400">No transactions yet.</p>
                ) : (
                  <div className="space-y-2">
                    {recentTxns.map((t) => (
                      <div key={t.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-gray-100 last:border-0">
                        <div className="min-w-0">
                          <p className="text-xs text-gray-700 truncate">{t.description || TX_TYPE_LABELS[t.transaction_type] || t.transaction_type}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{new Date(t.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className={`text-xs font-semibold shrink-0 whitespace-nowrap ${t.direction === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                          {t.direction === 'credit' ? '+' : '-'}{currencySymbol}{Number(t.amount).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN (Desktop only) ── */}
          <div className="hidden lg:block lg:w-[27%] space-y-4">
            {/* Account Summary */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Account Summary</h3>
              <div className="flex flex-col items-center">
                <DonutChart data={chartData} total={totalBalance} currencySymbol={currencySymbol} />
                <div className="w-full space-y-1.5 mt-3">
                  {chartData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-gray-600 flex-1 truncate">{d.label}</span>
                      <span className="text-gray-800 font-medium">{currencySymbol}{d.value.toFixed(0)}</span>
                      <span className="text-gray-400 w-10 text-right">{((d.value / Math.max(totalBalance, 1)) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                {canManage && <ActionButton label="Add Account" onClick={() => {}} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>} />}
                {canTransfer && <ActionButton label="Transfer" onClick={() => { setTfFrom(''); setTfTo(''); setTfAmount(''); setTfRef(''); setTfDesc(''); setError(''); setShowTransfer(true); }} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>} />}
                {canManage && <ActionButton label="Add Income" onClick={() => { setIeType('income'); setIeAccountId(''); setIeAmount(''); setIeDesc(''); setError(''); setShowIncome(true); }} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>} />}
                {canManage && <ActionButton label="Add Expense" onClick={() => { setIeType('expense'); setIeAccountId(''); setIeAmount(''); setIeDesc(''); setError(''); setShowIncome(true); }} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>} />}
                {canAdjust && <ActionButton label="Adjustment" onClick={() => {}} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>} />}
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Transactions</h3>
              {recentTxns.length === 0 ? (
                <p className="text-sm text-gray-400">No transactions yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {recentTxns.map((t) => (
                    <div key={t.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-gray-100 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-700 truncate">{t.description || TX_TYPE_LABELS[t.transaction_type] || t.transaction_type}</p>
                        <p className="text-[10px] text-gray-400">{new Date(t.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className={`text-xs font-semibold shrink-0 whitespace-nowrap ${t.direction === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                        {t.direction === 'credit' ? '+' : '-'}{currencySymbol}{Number(t.amount).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Transfer Modal */}
      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} title="Transfer Money">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">From Account</label>
            <select value={tfFrom} onChange={(e) => setTfFrom(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"><option value="">— Select —</option>
              {accounts.filter((a) => a.is_active && a.account_type !== 'credit').map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({currencySymbol}{Number(a.current_balance).toFixed(2)})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">To Account</label>
            <select value={tfTo} onChange={(e) => setTfTo(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"><option value="">— Select —</option>
              {accounts.filter((a) => a.is_active && a.id !== tfFrom).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Amount ({currencySymbol})</label>
            <input type="number" step="0.01" min="0" inputMode="decimal" value={tfAmount} onChange={(e) => setTfAmount(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Reference (optional)</label>
            <input type="text" value={tfRef} onChange={(e) => setTfRef(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" placeholder="e.g. TFR-001" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Description (optional)</label>
            <input type="text" value={tfDesc} onChange={(e) => setTfDesc(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" placeholder="e.g. Monthly cash deposit" />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => setShowTransfer(false)} className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 min-h-[44px]">Cancel</button>
          <button onClick={handleTransfer} disabled={tfSaving} className="flex-1 px-4 py-2.5 text-sm rounded-lg text-white font-medium min-h-[44px] disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>
            {tfSaving ? 'Transferring...' : 'Transfer'}
          </button>
        </div>
      </Modal>

      {/* Income/Expense Modal */}
      <Modal open={showIncome} onClose={() => setShowIncome(false)} title={ieType === 'income' ? 'Add Income' : 'Add Expense'}>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Account</label>
            <select value={ieAccountId} onChange={(e) => setIeAccountId(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"><option value="">— Select —</option>
              {accounts.filter((a) => a.is_active).map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({currencySymbol}{Number(a.current_balance).toFixed(2)})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Amount ({currencySymbol})</label>
            <input type="number" step="0.01" min="0" inputMode="decimal" value={ieAmount} onChange={(e) => setIeAmount(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Date</label>
            <input type="date" value={ieDate} onChange={(e) => setIeDate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
            <input type="text" value={ieDesc} onChange={(e) => setIeDesc(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" placeholder="Description" />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => setShowIncome(false)} className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 min-h-[44px]">Cancel</button>
          <button onClick={handleIncomeExpense} disabled={ieSaving} className="flex-1 px-4 py-2.5 text-sm rounded-lg text-white font-medium min-h-[44px] disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>
            {ieSaving ? 'Saving...' : (ieType === 'income' ? 'Add Income' : 'Add Expense')}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function ActionButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors min-h-[44px]">
      <span className="text-gray-400 shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
