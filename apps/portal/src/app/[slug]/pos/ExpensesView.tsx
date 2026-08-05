'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePOS } from './pos-context';
import { useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { Badge, Button, ConfirmDialog, EmptyState, Modal, Skeleton, SkeletonTable } from '@sat-sys/ui';
import { hasPermission } from './permissions';
import { supa } from './supa-query';
import { processExpense } from './payment-actions';
import { useEvent, usePublish } from './use-event';
import { useBusinessDate } from './business-date-context';

interface Props {
  slug: string;
  theme: ThemeConfig;
  currencySymbol: string;
}

interface Expense {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  expense_date: string;
  account_id: string | null;
  created_at: string;
}

interface Account {
  id: string;
  name: string;
  current_balance: number;
}

const CATEGORIES = ['electricity', 'rent', 'salaries', 'repairs', 'purchases', 'other'] as const;

const CATEGORY_LABELS: Record<string, string> = {
  electricity: 'Electricity', rent: 'Rent', salaries: 'Salaries',
  repairs: 'Repairs', purchases: 'Purchases', other: 'Other',
};

export default function ExpensesView({ slug, theme, currencySymbol }: Props) {
  const publish = usePublish();
  const { user, isLoaded } = useUser();
  const meta = user?.publicMetadata as Record<string, any> | undefined;
  const perms = (meta?.permissions ?? []) as string[];
  const role = (meta?.role ?? '') as string;
  const canEdit = hasPermission(perms, role, 'settings:edit');
  const bd = useBusinessDate('expenses');

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsMap, setAccountsMap] = useState<Record<string, string>>({});

  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formCategory, setFormCategory] = useState('other');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formAccountId, setFormAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchExpenses = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const opts: any = { table: 'expenses', select: '*', order: { column: 'expense_date', ascending: false } };
      opts.gte = ['expense_date', bd.startDate];
      opts.lte = ['expense_date', bd.endDate];
      if (categoryFilter) opts.eq = ['category', categoryFilter];
      const result = await supa(slug, opts);
      if (result.ok && result.data) setExpenses(result.data as Expense[]);
    } catch (e) { console.error('[Expenses] fetch', e); }
    setLoading(false);
  }, [isLoaded, slug, bd.startDate, bd.endDate, categoryFilter]);

  useEffect(() => {
    fetchExpenses();
    supa(slug, { table: 'accounts', select: 'id, name', eq: ['is_active', true], order: 'name' }).then((r) => {
      if (r.ok && r.data) {
        setAccounts(r.data as Account[]);
        const m: Record<string, string> = {};
        (r.data as Account[]).forEach((a) => { m[a.id] = a.name; });
        setAccountsMap(m);
      }
    });
  }, [fetchExpenses, slug]);

  useEvent('expenses', () => { if (bd.isToday) fetchExpenses(); });

  const { setPageTitle } = usePOS();
  useEffect(() => { setPageTitle('Expenses'); }, [setPageTitle]);

  const openAddForm = () => {
    setEditingExpense(null); setFormCategory('other'); setFormDescription(''); setFormAmount('');
    setFormDate(new Date().toISOString().split('T')[0]); setFormAccountId(accounts[0]?.id || ''); setError(''); setShowForm(true);
  };

  const openEditForm = (exp: Expense) => {
    setEditingExpense(exp); setFormCategory(exp.category); setFormDescription(exp.description || '');
    setFormAmount(String(exp.amount)); setFormDate(exp.expense_date); setFormAccountId(exp.account_id || ''); setError(''); setShowForm(true);
  };

  const handleSave = async () => {
    if (!formAmount.trim() || isNaN(parseFloat(formAmount))) { setError('Valid amount is required'); return; }
    if (!formDate) { setError('Date is required'); return; }
    setSaving(true); setError('');
    try {
      if (editingExpense) {
        // Edit: update expense row only (account link via RPC is already set)
        const payload = { category: formCategory, description: formDescription.trim() || null, amount: parseFloat(formAmount), expense_date: formDate };
        if (formAccountId) (payload as any).account_id = formAccountId;
        const result = await supa(slug, { table: 'expenses', method: 'update', eq: ['id', editingExpense.id], body: payload });
        if (!result.ok) { setError(result.error); setSaving(false); return; }
        setExpenses((prev) => prev.map((e) => (e.id === editingExpense.id ? { ...e, ...payload } as Expense : e)));
        publish('expenses', 'UPDATE', { id: editingExpense.id });
      } else {
        if (!formAccountId) { setError('Select an account'); setSaving(false); return; }
        const r = await processExpense(slug, formAccountId, formCategory, formDescription.trim() || null, parseFloat(formAmount), formDate);
        if (!r.success) { setError(r.error); setSaving(false); return; }
        const newExp: Expense = {
          id: r.expense_id, category: formCategory, description: formDescription.trim() || null,
          amount: parseFloat(formAmount), expense_date: formDate, account_id: formAccountId, created_at: new Date().toISOString(),
        };
        setExpenses((prev) => [newExp, ...prev]);
        publish('expenses', 'INSERT', { id: r.expense_id });
      }
      setShowForm(false);
    } catch (e: any) { setError(e.message || 'Save failed'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const result = await supa(slug, { table: 'expenses', method: 'delete', eq: ['id', deleteId] });
      if (!result.ok) { setError(result.error); setDeleting(false); return; }
      setExpenses((prev) => prev.filter((e) => e.id !== deleteId));
      publish('expenses', 'DELETE', { id: deleteId });
      setDeleteId(null);
    } catch (e: any) { setError(e.message || 'Delete failed'); }
    setDeleting(false);
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const categoryTotals = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
    return acc;
  }, {});
  const maxCategoryTotal = Math.max(...Object.values(categoryTotals), 1);

  if (!isLoaded) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6">
        <div className="max-w-5xl mx-auto">
          <SkeletonTable rows={5} cols={4} />
        </div>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <EmptyState variant="permission-denied" title="Expenses" description="You do not have permission to view expenses." />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-end mb-4">
          <button onClick={openAddForm} className="px-4 py-2 text-white rounded text-sm font-medium transition-colors" style={{ backgroundColor: theme.primaryColor }}>+ Add Expense</button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="px-3 py-1.5 rounded text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-200">
              📅 {bd.isToday ? 'Today' : bd.display}
            </span>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-1.5 text-xs border border-gray-300 rounded">
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
            <button onClick={fetchExpenses} disabled={loading} className="px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>{loading ? '...' : 'Refresh'}</button>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Expenses</p>
            <p className="text-2xl font-bold" style={{ color: theme.primaryColor }}>{currencySymbol}{totalExpenses.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Category Breakdown</h3>
            {Object.keys(categoryTotals).length === 0 ? (
              <p className="text-sm text-gray-400">No expenses in this period.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(categoryTotals).sort(([, a], [, b]) => b - a).map(([cat, total]) => (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className="text-gray-600">{CATEGORY_LABELS[cat] || cat}</span>
                      <span className="text-gray-800 font-medium">{currencySymbol}{total.toFixed(2)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(total / maxCategoryTotal) * 100}%`, backgroundColor: theme.primaryColor }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <Skeleton variant="table" rows={4} cols={4} />
        ) : expenses.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <EmptyState variant="no-data" as="bare" />
          </div>
        ) : (
          <>
            <div className="md:hidden space-y-3">
              {expenses.map((exp) => (
                <div key={exp.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <Badge variant="info" className="mb-1">{CATEGORY_LABELS[exp.category] || exp.category}</Badge>
                      <div className="text-sm text-gray-500">{exp.expense_date}</div>
                    </div>
                    <div className="text-lg font-bold" style={{ color: theme.primaryColor }}>{currencySymbol}{Number(exp.amount).toFixed(2)}</div>
                  </div>
                  {exp.description && <p className="text-sm text-gray-600 mb-2">{exp.description}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => openEditForm(exp)} className="flex-1 px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Edit</button>
                    <button onClick={() => { setDeleteId(exp.id); setError(''); }} className="flex-1 px-3 py-1.5 text-xs rounded border border-red-300 text-red-600 hover:bg-red-50">Delete</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">Date</th>
                    <th className="text-left px-4 py-3 font-medium">Category</th>
                    <th className="text-left px-4 py-3 font-medium">Description</th>
                    <th className="text-right px-4 py-3 font-medium">Amount</th>
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{exp.expense_date}</td>
                      <td className="px-4 py-3"><Badge variant="info">{CATEGORY_LABELS[exp.category] || exp.category}</Badge></td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{exp.description || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold">{currencySymbol}{Number(exp.amount).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEditForm(exp)} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Edit</button>
                          <button onClick={() => { setDeleteId(exp.id); setError(''); }} className="px-2 py-1 text-xs rounded border border-red-300 text-red-600 hover:bg-red-50">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

<Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingExpense ? 'Edit Expense' : 'Add Expense'}
        size="md"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="primary" style={{ backgroundColor: theme.primaryColor }} onClick={handleSave} loading={saving}>
              {editingExpense ? 'Update' : 'Add'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Pay From Account</label>
            <select value={formAccountId} onChange={(e) => setFormAccountId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
              <option value="">— Select account —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div><label className="block text-sm text-gray-600 mb-1">Category</label>
            <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <div><label className="block text-sm text-gray-600 mb-1">Amount ({currencySymbol})</label><input type="number" step="0.01" min="0" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
          <div><label className="block text-sm text-gray-600 mb-1">Date</label><input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
          <div><label className="block text-sm text-gray-600 mb-1">Description (optional)</label><input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="e.g. July electricity bill" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Expense?"
        message={<>This action cannot be undone.{error && <span className="block text-red-600 mt-2">{error}</span>}</>}
        confirmLabel="Delete"
        loading={deleting}
        size="sm"
      />
    </div>
  );
}
