'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { hasPermission } from './permissions';
import { supa } from './supa-query';

interface Props {
  slug: string;
  theme: ThemeConfig;
}

interface Expense {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  expense_date: string;
  created_at: string;
}

const CATEGORIES = ['electricity', 'rent', 'salaries', 'repairs', 'purchases', 'other'] as const;

const CATEGORY_LABELS: Record<string, string> = {
  electricity: 'Electricity', rent: 'Rent', salaries: 'Salaries',
  repairs: 'Repairs', purchases: 'Purchases', other: 'Other',
};

type DatePreset = 'this-month' | 'this-week' | 'custom';

export default function ExpensesView({ slug, theme }: Props) {
  const { user, isLoaded } = useUser();
  const meta = user?.publicMetadata as Record<string, any> | undefined;
  const perms = (meta?.permissions ?? []) as string[];
  const role = (meta?.role ?? '') as string;
  const canEdit = hasPermission(perms, role, 'settings:edit');

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<DatePreset>('this-month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formCategory, setFormCategory] = useState('other');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const getDateRange = useCallback(() => {
    const now = new Date();
    let start: Date;
    const end = now;
    switch (datePreset) {
      case 'this-week':
        const day = now.getDay();
        const diff = day === 0 ? 6 : day - 1;
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
        break;
      case 'custom':
        start = customStart ? new Date(customStart) : new Date(now.getFullYear(), now.getMonth(), 1);
        if (customEnd) end.setTime(new Date(customEnd + 'T23:59:59').getTime());
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }
    return { start: start.toISOString(), end: end.toISOString() };
  }, [datePreset, customStart, customEnd]);

  const fetchExpenses = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const opts: any = { table: 'expenses', select: '*', order: { column: 'expense_date', ascending: false } };
      opts.gte = ['expense_date', start.split('T')[0]];
      opts.lte = ['expense_date', end.split('T')[0]];
      if (categoryFilter) opts.eq = ['category', categoryFilter];
      const result = await supa(slug, opts);
      if (result.ok && result.data) setExpenses(result.data as Expense[]);
    } catch (e) { console.error('[Expenses] fetch', e); }
    setLoading(false);
  }, [isLoaded, slug, getDateRange, categoryFilter]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const openAddForm = () => {
    setEditingExpense(null); setFormCategory('other'); setFormDescription(''); setFormAmount('');
    setFormDate(new Date().toISOString().split('T')[0]); setError(''); setShowForm(true);
  };

  const openEditForm = (exp: Expense) => {
    setEditingExpense(exp); setFormCategory(exp.category); setFormDescription(exp.description || '');
    setFormAmount(String(exp.amount)); setFormDate(exp.expense_date); setError(''); setShowForm(true);
  };

  const handleSave = async () => {
    if (!formAmount.trim() || isNaN(parseFloat(formAmount))) { setError('Valid amount is required'); return; }
    if (!formDate) { setError('Date is required'); return; }
    setSaving(true); setError('');
    try {
      const payload = { category: formCategory, description: formDescription.trim() || null, amount: parseFloat(formAmount), expense_date: formDate };
      if (editingExpense) {
        const result = await supa(slug, { table: 'expenses', method: 'update', eq: ['id', editingExpense.id], body: payload });
        if (!result.ok) { setError(result.error); setSaving(false); return; }
        setExpenses((prev) => prev.map((e) => (e.id === editingExpense.id ? { ...e, ...payload } as Expense : e)));
      } else {
        const result = await supa(slug, { table: 'expenses', method: 'insert', body: payload, single: true });
        if (!result.ok) { setError(result.error); setSaving(false); return; }
        if (result.data) setExpenses((prev) => [result.data as Expense, ...prev]);
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
    return <div className="flex-1 flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading...</p></div>;
  }

  if (!canEdit) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center"><h2 className="text-2xl font-bold text-gray-400 mb-2">Expenses</h2><p className="text-gray-300">You do not have permission to view expenses.</p></div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Expenses</h1>
          <button onClick={openAddForm} className="px-4 py-2 text-white rounded text-sm font-medium transition-colors" style={{ backgroundColor: theme.primaryColor }}>+ Add Expense</button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1.5">
              {(['this-month', 'this-week', 'custom'] as DatePreset[]).map((p) => (
                <button key={p} onClick={() => setDatePreset(p)}
                  className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${datePreset === p ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  style={datePreset === p ? { backgroundColor: theme.primaryColor } : {}}>
                  {p === 'this-month' ? 'This Month' : p === 'this-week' ? 'This Week' : 'Custom'}
                </button>
              ))}
            </div>
            {datePreset === 'custom' && (
              <div className="flex items-center gap-2">
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="px-2 py-1.5 text-xs border border-gray-300 rounded" />
                <span className="text-xs text-gray-400">to</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="px-2 py-1.5 text-xs border border-gray-300 rounded" />
              </div>
            )}
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-1.5 text-xs border border-gray-300 rounded">
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
            <button onClick={fetchExpenses} disabled={loading} className="px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>{loading ? '...' : 'Refresh'}</button>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Expenses</p>
            <p className="text-2xl font-bold" style={{ color: theme.primaryColor }}>${totalExpenses.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Category Breakdown</h3>
            {Object.keys(categoryTotals).length === 0 ? (
              <p className="text-sm text-gray-400">No expenses in this period.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(categoryTotals).sort(([, a], [, b]) => b - a).map(([cat, total]) => (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className="text-gray-600">{CATEGORY_LABELS[cat] || cat}</span>
                      <span className="text-gray-800 font-medium">${total.toFixed(2)}</span>
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
          <p className="text-gray-400 text-sm">Loading expenses...</p>
        ) : expenses.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center"><p className="text-gray-400 text-sm">No expenses in this period.</p></div>
        ) : (
          <>
            <div className="md:hidden space-y-3">
              {expenses.map((exp) => (
                <div key={exp.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 mb-1">{CATEGORY_LABELS[exp.category] || exp.category}</span>
                      <div className="text-sm text-gray-500">{exp.expense_date}</div>
                    </div>
                    <div className="text-lg font-bold" style={{ color: theme.primaryColor }}>${Number(exp.amount).toFixed(2)}</div>
                  </div>
                  {exp.description && <p className="text-sm text-gray-600 mb-2">{exp.description}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => openEditForm(exp)} className="flex-1 px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Edit</button>
                    <button onClick={() => { setDeleteId(exp.id); setError(''); }} className="flex-1 px-3 py-1.5 text-xs rounded border border-red-300 text-red-600 hover:bg-red-50">Delete</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
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
                      <td className="px-4 py-3"><span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">{CATEGORY_LABELS[exp.category] || exp.category}</span></td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{exp.description || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold">${Number(exp.amount).toFixed(2)}</td>
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

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setShowForm(false)}>
          <div className="bg-white md:rounded-lg shadow-xl w-full md:max-w-md md:mx-4 p-6 rounded-t-xl md:max-h-[90vh] md:overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">{editingExpense ? 'Edit Expense' : 'Add Expense'}</h2>
              <button onClick={() => setShowForm(false)} className="md:hidden text-gray-400 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div><label className="block text-sm text-gray-600 mb-1">Category</label>
                <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </div>
              <div><label className="block text-sm text-gray-600 mb-1">Amount ($)</label><input type="number" step="0.01" min="0" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">Date</label><input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">Description (optional)</label><input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="e.g. July electricity bill" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded text-white font-medium disabled:opacity-50" style={{ backgroundColor: theme.primaryColor }}>
                {saving ? 'Saving...' : (editingExpense ? 'Update' : 'Add')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setDeleteId(null)}>
          <div className="bg-white md:rounded-lg shadow-xl w-full md:max-w-sm md:mx-4 p-6 rounded-t-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">Delete Expense?</h2>
              <button onClick={() => setDeleteId(null)} className="md:hidden text-gray-400 text-xl">✕</button>
            </div>
            <p className="text-sm text-gray-600 mb-4">This action cannot be undone.</p>
            {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm rounded bg-red-600 text-white font-medium disabled:opacity-50">{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
