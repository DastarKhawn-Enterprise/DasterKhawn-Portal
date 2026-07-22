'use client';

import { useState, useEffect, useCallback } from 'react';
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

const TYPE_ICONS: Record<string, string> = {
  cash: '💵', bank: '🏦', mobile_wallet: '📱', card: '💳', credit: '📋', other: '📁',
};

const TX_TYPE_LABELS: Record<string, string> = {
  sale: 'Sale', expense: 'Expense', income: 'Income', transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out', refund: 'Refund', adjustment: 'Adjustment',
  opening_balance: 'Opening Balance', credit_sale: 'Credit Sale', credit_payment: 'Credit Payment',
};

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
  const [loading, setLoading] = useState(true);
  const [txnLoading, setTxnLoading] = useState(false);
  const [tab, setTab] = useState<AccountTab>('all');
  const [selectedAccId, setSelectedAccId] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showIncome, setShowIncome] = useState(false);

  // Transfer form
  const [tfFrom, setTfFrom] = useState('');
  const [tfTo, setTfTo] = useState('');
  const [tfAmount, setTfAmount] = useState('');
  const [tfRef, setTfRef] = useState('');
  const [tfDesc, setTfDesc] = useState('');
  const [tfSaving, setTfSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Income / expense form
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

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);
  useEffect(() => { fetchTxns(selectedAccId); }, [fetchTxns, selectedAccId]);

  const filteredAccounts = tab === 'all' ? accounts : accounts.filter((a) => a.account_type === tab);

  const totalBalance = accounts.reduce((s, a) => s + Number(a.current_balance), 0);
  const cashBalance = accounts.filter((a) => a.account_type === 'cash').reduce((s, a) => s + Number(a.current_balance), 0);
  const bankBalance = accounts.filter((a) => a.account_type === 'bank').reduce((s, a) => s + Number(a.current_balance), 0);
  const walletBalance = accounts.filter((a) => a.account_type === 'mobile_wallet').reduce((s, a) => s + Number(a.current_balance), 0);
  const cardBalance = accounts.filter((a) => a.account_type === 'card').reduce((s, a) => s + Number(a.current_balance), 0);
  const creditReceivables = accounts.filter((a) => a.account_type === 'credit').reduce((s, a) => s + Number(a.current_balance), 0);

  // Determine income / expense from transactions (last 30 days rough)
  const recentTxnsIncome = txns.filter((t) => t.direction === 'credit' && t.transaction_type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const recentTxnsExpense = txns.filter((t) => t.direction === 'debit' && t.transaction_type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  const selectedAccount = accounts.find((a) => a.id === selectedAccId) || null;

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
      await fetchAccounts();
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
        // Income: direct insert into account_transactions (no RPC, handle inline)
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
      await fetchAccounts();
      if (selectedAccId) await fetchTxns(selectedAccId);
    } catch (e: any) { setError(e.message); }
    setIeSaving(false);
  };

  if (!isLoaded) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading...</p></div>;
  }

  if (!canView) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center"><h2 className="text-2xl font-bold text-gray-400 mb-2">Accounts</h2><p className="text-gray-300">You do not have permission to view accounts.</p></div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h1 className="text-2xl font-bold text-gray-800">Accounts</h1>
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <button onClick={() => { setIeType('income'); setIeAccountId(''); setIeAmount(''); setIeDesc(''); setError(''); setShowIncome(true); }} className="px-3 py-1.5 text-xs rounded text-white font-medium" style={{ backgroundColor: theme.primaryColor }}>+ Add Income</button>
            )}
            {canManage && (
              <button onClick={() => { setIeType('expense'); setIeAccountId(''); setIeAmount(''); setIeDesc(''); setError(''); setShowIncome(true); }} className="px-3 py-1.5 text-xs rounded border border-red-300 text-red-600 hover:bg-red-50">+ Add Expense</button>
            )}
            {canTransfer && (
              <button onClick={() => { setTfFrom(''); setTfTo(''); setTfAmount(''); setTfRef(''); setTfDesc(''); setError(''); setShowTransfer(true); }} className="px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50">Transfer</button>
            )}
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm mb-4">{error}</div>}
        {successMsg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded text-sm mb-4">{successMsg}</div>}

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total Balance</p>
            <p className="text-lg font-bold" style={{ color: theme.primaryColor }}>{currencySymbol}{totalBalance.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Cash 💵</p>
            <p className="text-lg font-bold text-gray-800">{currencySymbol}{cashBalance.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Bank 🏦</p>
            <p className="text-lg font-bold text-gray-800">{currencySymbol}{bankBalance.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Mobile Wallets 📱</p>
            <p className="text-lg font-bold text-gray-800">{currencySymbol}{walletBalance.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Cards 💳</p>
            <p className="text-lg font-bold text-gray-800">{currencySymbol}{cardBalance.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Credit Receivables 📋</p>
            <p className="text-lg font-bold text-gray-800">{currencySymbol}{creditReceivables.toFixed(2)}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mb-4">
          {(Object.entries(TAB_LABELS) as [AccountTab, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === key ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              style={tab === key ? { backgroundColor: theme.primaryColor } : {}}
            >{label}</button>
          ))}
        </div>

        {/* Accounts table */}
        {loading ? (
          <p className="text-gray-400 text-sm">Loading accounts...</p>
        ) : filteredAccounts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center"><p className="text-gray-400 text-sm">No accounts in this category.</p></div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-400 text-xs uppercase tracking-wider">
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
                        <div className="font-medium text-gray-800">{TYPE_ICONS[acc.account_type] || '📁'} {acc.name}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 capitalize">{acc.account_type.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {acc.institution_name && <div>{acc.institution_name}</div>}
                        {acc.account_number_masked && <div className="font-mono">{acc.account_number_masked}</div>}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${Number(acc.current_balance) >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                        {currencySymbol}{Number(acc.current_balance).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${acc.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          {acc.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {canTransfer && acc.account_type !== 'credit' && (
                          <button onClick={(e) => { e.stopPropagation(); setTfFrom(acc.id); setShowTransfer(true); }} className="text-[10px] text-blue-600 hover:text-blue-800">Transfer</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Selected account transactions */}
        {selectedAccount && (
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              Transactions — {selectedAccount.name}
              <span className="text-gray-400 font-normal ml-2">
                (Balance: {currencySymbol}{Number(selectedAccount.current_balance).toFixed(2)})
              </span>
            </h2>
            {txnLoading ? (
              <p className="text-gray-400 text-sm">Loading transactions...</p>
            ) : txns.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-center"><p className="text-gray-400 text-sm">No transactions yet.</p></div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-gray-400 text-xs uppercase tracking-wider">
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
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                          {new Date(t.created_at).toLocaleDateString()} {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-50 text-gray-600 border border-gray-200">
                            {TX_TYPE_LABELS[t.transaction_type] || t.transaction_type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${t.direction === 'credit' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {t.direction === 'credit' ? 'Credit' : 'Debit'}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-semibold ${t.direction === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                          {t.direction === 'credit' ? '+' : '-'}{currencySymbol}{Number(t.amount).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-700">{currencySymbol}{Number(t.balance_after).toFixed(2)}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{t.description || '—'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs font-mono">{t.reference_number || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transfer Modal */}
      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setShowTransfer(false)}>
          <div className="bg-white md:rounded-lg shadow-xl w-full md:max-w-md md:mx-4 p-6 rounded-t-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Transfer Money</h2>
              <button onClick={() => setShowTransfer(false)} className="md:hidden text-gray-400 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">From Account</label>
                <select value={tfFrom} onChange={(e) => setTfFrom(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                  <option value="">— Select —</option>
                  {accounts.filter((a) => a.is_active && a.account_type !== 'credit').map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({currencySymbol}{Number(a.current_balance).toFixed(2)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">To Account</label>
                <select value={tfTo} onChange={(e) => setTfTo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                  <option value="">— Select —</option>
                  {accounts.filter((a) => a.is_active && a.id !== tfFrom).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Amount ({currencySymbol})</label>
                <input type="number" step="0.01" min="0" value={tfAmount} onChange={(e) => setTfAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Reference (optional)</label>
                <input type="text" value={tfRef} onChange={(e) => setTfRef(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" placeholder="e.g. TFR-001" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Description (optional)</label>
                <input type="text" value={tfDesc} onChange={(e) => setTfDesc(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" placeholder="e.g. Monthly cash deposit" />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowTransfer(false)} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleTransfer} disabled={tfSaving} className="px-4 py-2 text-sm rounded text-white font-medium disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>
                {tfSaving ? 'Transferring...' : 'Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Income/Expense Modal */}
      {showIncome && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setShowIncome(false)}>
          <div className="bg-white md:rounded-lg shadow-xl w-full md:max-w-md md:mx-4 p-6 rounded-t-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">{ieType === 'income' ? 'Add Income' : 'Add Expense'}</h2>
              <button onClick={() => setShowIncome(false)} className="md:hidden text-gray-400 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Account</label>
                <select value={ieAccountId} onChange={(e) => setIeAccountId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                  <option value="">— Select —</option>
                  {accounts.filter((a) => a.is_active).map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({currencySymbol}{Number(a.current_balance).toFixed(2)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Amount ({currencySymbol})</label>
                <input type="number" step="0.01" min="0" value={ieAmount} onChange={(e) => setIeAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Date</label>
                <input type="date" value={ieDate} onChange={(e) => setIeDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Description</label>
                <input type="text" value={ieDesc} onChange={(e) => setIeDesc(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" placeholder="Description" />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowIncome(false)} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleIncomeExpense} disabled={ieSaving} className="px-4 py-2 text-sm rounded text-white font-medium disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>
                {ieSaving ? 'Saving...' : (ieType === 'income' ? 'Add Income' : 'Add Expense')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
