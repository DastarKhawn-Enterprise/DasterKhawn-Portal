'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { Badge, Button, EmptyState, Modal, Skeleton, SkeletonTable } from '@sat-sys/ui';
import { supa } from './supa-query';
import { normalizePhone, checkDuplicatePhone } from './customer-utils';
import { usePOS } from './pos-context';
import { useEvent, usePublish } from './use-event';
import { useBusinessDate, previousRange } from './business-date-context';

interface Props {
  slug: string;
  theme: ThemeConfig;
  loyaltyPointsEnabled?: boolean;
  currencySymbol: string;
}

interface Customer {
  id: string; name: string; phone: string | null; email: string | null;
  loyalty_points: number; total_orders: number; total_spent: number;
  notes: string | null; created_at: string; status: string; last_order_date: string | null;
}

interface OrderRow {
  id: string; order_number: number; status: string; total: number;
  created_at: string; order_type: string; customer_id: string | null;
}

type SortField = 'name' | 'created_at' | 'total_orders' | 'total_spent' | 'last_order_date';
type FilterKey = 'active' | 'inactive' | 'new_month' | 'has_orders' | 'no_orders' | 'high_value';

const PAGE_SIZE = 15;
const AVATAR_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
function avatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function formatDate(d: string | null) {
  if (!d) return '-';
  const dt = new Date(d);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

export default function CustomersView({ slug, theme, loyaltyPointsEnabled = true, currencySymbol }: Props) {
  const publish = usePublish();
  const { user, isLoaded } = useUser();
  // The Customers module gates this whole page; inside a module, full access.
  const canView = true;
  const canCreate = true;
  const canEdit = true;
  const canManage = true;
  const [authReady, setAuthReady] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);

  const [summaryData, setSummaryData] = useState<{
    total: number; newMonth: number; newPrev: number;
    salesMonth: number; salesPrev: number; avgOrder: number; avgPrev: number;
  } | null>(null);
  const [topCustomers, setTopCustomers] = useState<{ id: string; name: string; total: number }[]>([]);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [orderHistory, setOrderHistory] = useState<OrderRow[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const HISTORY_PAGE_SIZE = 10;

  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState('active');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState<{ id: string; name: string } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const bd = useBusinessDate('customers');
  const monthStart = bd.start;
  const monthEnd = bd.end;
  const { start: prevStart, end: prevEnd } = previousRange(bd.start, bd.end);

  useEffect(() => {
    if (isLoaded) setAuthReady(true);
  }, [isLoaded]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const sortDir = useMemo(() => sortAsc ? 'asc' : 'desc', [sortAsc]);
  const sortOrder = useMemo(() => {
    const col = sortField === 'last_order_date' ? `${sortField}.${sortDir}.nullsfirst` : `${sortField}.${sortDir}`;
    return col;
  }, [sortField, sortDir]);

  const fetchSummary = useCallback(async () => {
    const [totalRes, newRes, prevNewRes, salesRes, prevSalesRes] = await Promise.all([
      supa(slug, { table: 'customers', head: true, select: 'id' }),
      supa(slug, { table: 'customers', head: true, select: 'id', gte: ['created_at', monthStart], lte: ['created_at', monthEnd] }),
      supa(slug, { table: 'customers', head: true, select: 'id', gte: ['created_at', prevStart], lte: ['created_at', prevEnd] }),
      supa(slug, { table: 'orders', select: 'total', eq: ['status', 'completed'], notNull: ['customer_id'], gte: ['created_at', monthStart], lte: ['created_at', monthEnd] }),
      supa(slug, { table: 'orders', select: 'total', eq: ['status', 'completed'], notNull: ['customer_id'], gte: ['created_at', prevStart], lte: ['created_at', prevEnd] }),
    ]);
    const total = totalRes.count ?? 0;
    const newMonth = newRes.count ?? 0;
    const newPrev = prevNewRes.count ?? 0;
    const sData: any[] = salesRes.ok ? (salesRes.data ?? []) : [];
    const psData: any[] = prevSalesRes.ok ? (prevSalesRes.data ?? []) : [];
    const sales = sData.reduce((s: number, o: any) => s + Number(o.total), 0);
    const salesPrev = psData.reduce((s: number, o: any) => s + Number(o.total), 0);
    const count = sData.length;
    const countPrev = psData.length;
    setSummaryData({
      total, newMonth, newPrev, salesMonth: sales, salesPrev,
      avgOrder: count > 0 ? sales / count : 0,
      avgPrev: countPrev > 0 ? salesPrev / countPrev : 0,
    });
  }, [slug, monthStart, monthEnd, prevStart, prevEnd]);
  const fetchTopCustomers = useCallback(async () => {
    const orderRes = await supa(slug, {
      table: 'orders', select: 'customer_id, total',
      eq: ['status', 'completed'], notNull: ['customer_id'], limit: 5000,
    });
    if (!orderRes.ok || !orderRes.data) return;
    const grouped = new Map<string, number>();
    for (const o of orderRes.data) {
      const cid = o.customer_id;
      if (cid) grouped.set(cid, (grouped.get(cid) || 0) + Number(o.total));
    }
    const topIds = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
    if (topIds.length === 0) return;
    const custRes = await supa(slug, {
      table: 'customers', select: 'id, name',
      in: ['id', topIds],
    });
    if (!custRes.ok || !custRes.data) return;
    const nameMap = new Map<string, string>(custRes.data.map((c: any) => [c.id, String(c.name)]));
    setTopCustomers(topIds.map(id => ({ id, name: nameMap.get(id) || 'Unknown', total: grouped.get(id) || 0 })));
  }, [slug]);

  const fetchCustomers = useCallback(async () => {
    if (!authReady) return;
    setLoading(true);
    try {
      const searchTerm = debouncedSearch.trim();
      const offs = (page - 1) * PAGE_SIZE;
      const baseOpts: any = { table: 'customers', select: '*', order: sortOrder, limit: PAGE_SIZE, offset: offs };

      if (activeFilter === 'active') baseOpts.eq = ['status', 'active'];
      else if (activeFilter === 'inactive') baseOpts.eq = ['status', 'inactive'];
      else if (activeFilter === 'new_month') { baseOpts.gte = ['created_at', monthStart]; baseOpts.lte = ['created_at', monthEnd]; }
      else if (activeFilter === 'has_orders') baseOpts.notEq = ['total_orders', 0];
      else if (activeFilter === 'no_orders') baseOpts.eq = ['total_orders', 0];
      else if (activeFilter === 'high_value') { baseOpts.gte = ['total_spent', 5000]; baseOpts.order = 'total_spent.desc'; }

      if (searchTerm) {
        const term = `%${searchTerm}%`;
        baseOpts.or = `name.ilike.${term},phone.ilike.${term},email.ilike.${term}`;
      }

      const [dataRes, countRes] = await Promise.all([
        supa(slug, baseOpts),
        supa(slug, { ...baseOpts, head: true, limit: undefined, offset: undefined }),
      ]);

      if (dataRes.ok && dataRes.data) setCustomers(dataRes.data as Customer[]);
      setTotalCount(countRes.count ?? dataRes.count ?? 0);
    } catch (e) { console.error('[Customers] fetch', e); }
    setLoading(false);
  }, [authReady, slug, debouncedSearch, activeFilter, sortOrder, page, monthStart, monthEnd]);

  useEffect(() => {
    if (!authReady || !canView) return;
    fetchSummary();
    fetchTopCustomers();
  }, [authReady, canView, slug, monthStart, monthEnd, fetchSummary, fetchTopCustomers]);

  useEffect(() => {
    if (!authReady || !canView) return;
    fetchCustomers();
  }, [fetchCustomers, authReady, canView]);
  useEvent('customers', () => { if (bd.isToday) fetchCustomers(); });

  const { setPageTitle } = usePOS();
  useEffect(() => { setPageTitle('Customers'); }, [setPageTitle]);
  useEffect(() => { setPage(1); }, [debouncedSearch, activeFilter, sortField, sortAsc]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const fetchOrderHistory = useCallback(async (customerId: string, p: number) => {
    setHistoryLoading(true);
    try {
      const offs = (p - 1) * HISTORY_PAGE_SIZE;
      const [dataRes, countRes] = await Promise.all([
        supa(slug, {
          table: 'orders', select: 'id, order_number, status, total, created_at, order_type',
          eq: ['customer_id', customerId], order: { column: 'created_at', ascending: false },
          limit: HISTORY_PAGE_SIZE, offset: offs,
        }),
        supa(slug, {
          table: 'orders', head: true, select: 'id',
          eq: ['customer_id', customerId],
        }),
      ]);
      if (dataRes.ok && dataRes.data) setOrderHistory(dataRes.data as OrderRow[]);
      setHistoryTotal(countRes.count ?? dataRes.count ?? 0);
    } catch (e) { console.error('[Customers] history', e); }
    setHistoryLoading(false);
  }, [slug]);

  const openAddForm = () => {
    setEditingCustomer(null);
    setFormName(''); setFormPhone(''); setFormEmail(''); setFormNotes(''); setFormStatus('active');
    setFormError(''); setDuplicateWarning(null); setShowForm(true);
  };

  const openEditForm = (c: Customer) => {
    setEditingCustomer(c);
    setFormName(c.name); setFormPhone(c.phone || ''); setFormEmail(c.email || '');
    setFormNotes(c.notes || ''); setFormStatus(c.status || 'active');
    setFormError(''); setDuplicateWarning(null); setShowForm(true);
  };

  const validateForm = (): boolean => {
    if (!formName.trim()) { setFormError('Name is required'); return false; }
    if (formPhone.trim()) {
      const normalized = normalizePhone(formPhone);
      if (normalized.length < 10) { setFormError('Invalid phone number'); return false; }
    }
    if (formEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formEmail.trim())) {
      setFormError('Invalid email address'); return false;
    }
    return true;
  };

  const handleSave = async () => {
    setFormError(''); setDuplicateWarning(null);
    if (!validateForm()) return;
    setSaving(true);
    try {
      if (formPhone.trim()) {
        const dup = await checkDuplicatePhone(slug, formPhone, editingCustomer?.id);
        if (dup) { setDuplicateWarning(dup); setSaving(false); return; }
      }

      const normPhone = formPhone.trim() ? normalizePhone(formPhone.trim()) : null;
      const payload: any = {
        name: formName.trim(), phone: normPhone,
        email: formEmail.trim() || null, notes: formNotes.trim() || null,
      };
      if (formStatus !== 'active') payload.status = formStatus;
        if (editingCustomer) {
        const result = await supa(slug, { table: 'customers', method: 'update', eq: ['id', editingCustomer.id], body: payload });
        if (!result.ok) { setFormError(result.error); setSaving(false); return; }
        publish('customers', 'UPDATE', { id: editingCustomer.id });
        setCustomers((prev) => prev.map((c) => (c.id === editingCustomer.id ? { ...c, ...payload } : c)));
        if (selectedCustomer?.id === editingCustomer.id) setSelectedCustomer((prev) => prev ? { ...prev, ...payload } : null);
      } else {
        payload.loyalty_points = 0; payload.total_orders = 0; payload.total_spent = 0;
        const result = await supa(slug, { table: 'customers', method: 'insert', body: payload, single: true });
        if (!result.ok) { setFormError(result.error); setSaving(false); return; }
        publish('customers', 'INSERT', { id: result.data?.id });
        if (result.data) setCustomers((prev) => [result.data as Customer, ...prev]);
        setTotalCount((c) => c + 1);
      }
      setShowForm(false);
      fetchSummary();
    } catch (e: any) { setFormError(e.message || 'Save failed'); }
    setSaving(false);
  };

  const handleDelete = async (customer: Customer) => {
    setDeleteError('');
    if (customer.total_orders > 0) {
      setDeleteError(`Cannot delete — has order history. Deactivate instead.`);
      return;
    }
    setDeleting(true);
    try {
      const result = await supa(slug, { table: 'customers', method: 'delete', eq: ['id', customer.id] });
      if (!result.ok) { setDeleteError(result.error); setDeleting(false); return; }
      publish('customers', 'DELETE', { id: customer.id });
      setCustomers((prev) => prev.filter((c) => c.id !== customer.id));
      setTotalCount((c) => c - 1);
      if (selectedCustomer?.id === customer.id) setSelectedCustomer(null);
      setDeleteTarget(null);
      fetchSummary();
    } catch (e: any) { setDeleteError(e.message || 'Delete failed'); }
    setDeleting(false);
  };

  const handleDeactivate = async (customer: Customer) => {
    const newStatus = (customer.status || 'active') === 'active' ? 'inactive' : 'active';
    await supa(slug, { table: 'customers', method: 'update', eq: ['id', customer.id], body: { status: newStatus } });
    publish('customers', 'UPDATE', { id: customer.id });
    setCustomers((prev) => prev.map((c) => c.id === customer.id ? { ...c, status: newStatus } : c));
    if (selectedCustomer?.id === customer.id) setSelectedCustomer((prev) => prev ? { ...prev, status: newStatus } : null);
    fetchSummary();
  };

  const openProfile = (c: Customer) => {
    setSelectedCustomer(c);
    setHistoryPage(1);
    fetchOrderHistory(c.id, 1);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc((p) => !p);
    else { setSortField(field); setSortAsc(field === 'name'); }
  };

  const statusColor: Record<string, string> = {
    pending: 'text-yellow-600', in_kitchen: 'text-blue-600', ready: 'text-green-600',
    completed: 'text-gray-500', cancelled: 'text-red-500',
  };
  const statusBg: Record<string, string> = {
    pending: 'bg-yellow-50', in_kitchen: 'bg-blue-50', ready: 'bg-green-50',
    completed: 'bg-gray-50', cancelled: 'bg-red-50',
  };
  const typeLabels: Record<string, string> = {
    dine_in: 'Dine In', takeaway: 'Take Away', delivery: 'Delivery', drive_thru: 'Drive Thru',
  };

  const getPayMethods = useCallback(async (orderId: string) => {
    const res = await supa(slug, { table: 'payments', select: 'payment_method', eq: ['order_id', orderId] });
    if (!res.ok || !res.data) return '-';
    return res.data.map((p: any) => p.payment_method).filter(Boolean).join(', ') || '-';
  }, [slug]);

  const [payMethods, setPayMethods] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!selectedCustomer || orderHistory.length === 0) return;
    orderHistory.forEach(o => {
      if (!payMethods[o.id]) getPayMethods(o.id).then(m => setPayMethods(p => ({ ...p, [o.id]: m })));
    });
  }, [selectedCustomer, orderHistory, getPayMethods, payMethods]);

  const exportCSV = () => {
    const headers = ['Name', 'Phone', 'Email', 'Status', 'Total Orders', 'Total Spent', 'Loyalty Points', 'Last Order', 'Created', 'Notes'];
    const rows = customers.map(c => [
      c.name, c.phone || '', c.email || '', c.status || 'active',
      c.total_orders, Number(c.total_spent).toFixed(2), c.loyalty_points,
      c.last_order_date ? formatDate(c.last_order_date) : '', formatDate(c.created_at), c.notes || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `customers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (!isLoaded) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6">
        <div className="max-w-5xl mx-auto">
          <SkeletonTable rows={6} cols={5} />
        </div>
      </div>
    );
  }
  if (!canView) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <EmptyState variant="permission-denied" title="Customers" description="You do not have permission to view customers." />
      </div>
    );
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-gray-500 ml-1">{sortAsc ? '↑' : '↓'}</span>;
  };

  const filterOptions: { key: FilterKey; label: string }[] = [
    { key: 'active', label: 'Active' }, { key: 'inactive', label: 'Inactive' },
    { key: 'new_month', label: 'New Customers' }, { key: 'has_orders', label: 'Has Orders' },
    { key: 'no_orders', label: 'No Orders' }, { key: 'high_value', label: 'High Value' },
  ];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50">
      <div className="p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-5">
            <button onClick={exportCSV} className="px-3 py-2 text-xs font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              Export CSV
            </button>
            {canCreate && <button onClick={openAddForm} className="px-4 py-2 text-white rounded text-sm font-medium transition-colors flex items-center gap-1.5" style={{ backgroundColor: theme.primaryColor }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
              Add Customer
            </button>}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <SummaryCard label="Total Customers" value={summaryData?.total ?? 0} icon="users" theme={theme} currencySymbol={currencySymbol} format="number" />
            <SummaryCard label="New Customers" value={summaryData?.newMonth ?? 0} icon="user-plus" theme={theme} currencySymbol={currencySymbol} format="number"
              previous={summaryData?.newPrev} />
            <SummaryCard label="Customer Sales" value={summaryData?.salesMonth ?? 0} icon="cash" theme={theme} currencySymbol={currencySymbol} format="currency"
              previous={summaryData?.salesPrev} />
            <SummaryCard label="Avg Order Value" value={summaryData?.avgOrder ?? 0} icon="chart" theme={theme} currencySymbol={currencySymbol} format="currency"
              previous={summaryData?.avgPrev} />
          </div>

          {formError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">{formError}</div>}

          <div className="flex flex-col lg:flex-row gap-5">
            {/* Main Content */}
            <div className="flex-1 min-w-0">
              {/* Search & Filters */}
              <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="relative flex-1">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    <input type="text" placeholder="Search by name, phone or email..." value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm" />
                  </div>
                  <div className="hidden sm:flex items-center gap-2 flex-wrap">
                    {filterOptions.map(f => (
                      <button key={f.key} onClick={() => setActiveFilter(activeFilter === f.key ? null : f.key)}
                        className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${activeFilter === f.key ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        style={activeFilter === f.key ? { backgroundColor: theme.primaryColor } : {}}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setMobileFilterOpen(true)} className="sm:hidden px-3 py-2 text-xs font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                    Filters ({activeFilter ? 1 : 0})
                  </button>
                </div>
                {/* Sort row */}
                <div className="flex items-center flex-wrap gap-3 mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                  <span className="text-gray-400">Sort:</span>
                  {(['name', 'created_at', 'total_orders', 'total_spent', 'last_order_date'] as SortField[]).map(f => (
                    <button key={f} onClick={() => toggleSort(f)}
                      className={`hover:text-gray-700 flex items-center ${sortField === f ? 'font-semibold text-gray-700' : ''}`}>
                      {f === 'created_at' ? 'Newest' : f === 'total_orders' ? 'Orders' : f === 'total_spent' ? 'Spent' : f === 'last_order_date' ? 'Last Order' : 'Name'}
                      <SortIcon field={f} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
                {loading ? (
                  <div className="p-8"><Skeleton variant="table" rows={4} cols={5} /></div>
                ) : customers.length === 0 ? (
                  <div className="p-8">
                    <EmptyState
                      variant={debouncedSearch || activeFilter ? 'no-search-results' : 'no-customers'}
                      as="bare"
                      description={debouncedSearch || activeFilter ? 'No customers match your search or filters.' : undefined}
                    />
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-gray-400 text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-3 font-medium">Customer</th>
                        <th className="text-left px-4 py-3 font-medium">Phone</th>
                        <th className="text-left px-4 py-3 font-medium">Email</th>
                        <th className="text-right px-4 py-3 font-medium">Orders</th>
                        <th className="text-right px-4 py-3 font-medium">Total Spent</th>
                        <th className="text-right px-4 py-3 font-medium">Last Order</th>
                        <th className="text-center px-4 py-3 font-medium">Status</th>
                        {(canEdit || canManage) && <th className="text-right px-4 py-3 font-medium"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map((c) => (
                        <tr key={c.id} className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${selectedCustomer?.id === c.id ? 'bg-blue-50' : ''}`}
                          onClick={() => openProfile(c)}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                                style={{ backgroundColor: avatarColor(c.name) }}>{initials(c.name)}</div>
                              <div>
                                <div className="font-medium text-gray-800">{c.name}</div>
                                {loyaltyPointsEnabled && c.loyalty_points > 0 && <div className="text-[10px] text-gray-400">{c.loyalty_points} pts</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{c.phone || '-'}</td>
                          <td className="px-4 py-3 text-gray-500 max-w-[140px] truncate">{c.email || '-'}</td>
                          <td className="px-4 py-3 text-right text-gray-700 font-medium">{c.total_orders}</td>
                          <td className="px-4 py-3 text-right text-gray-700 font-medium">{currencySymbol}{Number(c.total_spent).toFixed(2)}</td>
                          <td className="px-4 py-3 text-right text-gray-500 text-xs">{c.last_order_date ? formatDate(c.last_order_date) : '-'}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant={c.status === 'active' ? 'success' : 'neutral'} pill>{c.status === 'active' ? 'Active' : 'Inactive'}</Badge>
                          </td>
                          {(canEdit || canManage) && <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canEdit && <button onClick={(e) => { e.stopPropagation(); openEditForm(c); }}
                                className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-500 hover:bg-gray-50">Edit</button>}
                              {canManage && <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
                                className="px-2 py-1 text-xs rounded border border-gray-200 text-red-400 hover:bg-red-50">Delete</button>}
                            </div>
                          </td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {totalCount > 0 && <PaginationControls page={page} totalPages={totalPages} totalCount={totalCount} pageSize={PAGE_SIZE} setPage={setPage} />}
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {loading ? (
                  <div className="py-8"><Skeleton variant="lines" rows={3} /></div>
                ) : customers.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-8">
                    <EmptyState
                      variant={debouncedSearch || activeFilter ? 'no-search-results' : 'no-customers'}
                      as="bare"
                      description={debouncedSearch || activeFilter ? 'No customers match your search or filters.' : undefined}
                    />
                  </div>
                ) : (
                  customers.map((c) => (
                    <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:bg-gray-50" onClick={() => openProfile(c)}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                            style={{ backgroundColor: avatarColor(c.name) }}>{initials(c.name)}</div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-800 truncate">{c.name}</div>
                            <div className="text-xs text-gray-400 truncate">{c.phone || 'No phone'}</div>
                          </div>
                        </div>
                        <Badge variant={c.status === 'active' ? 'success' : 'neutral'} size="sm" pill className="flex-shrink-0">{c.status === 'active' ? 'Active' : 'Inactive'}</Badge>
                      </div>
                      <div className="flex gap-4 text-sm text-gray-600 mt-2">
                        <div><span className="text-gray-400">Orders:</span> <span className="font-medium">{c.total_orders}</span></div>
                        <div><span className="text-gray-400">Spent:</span> <span className="font-medium">{currencySymbol}{Number(c.total_spent).toFixed(2)}</span></div>
                        {c.last_order_date && <div className="text-xs text-gray-400 ml-auto self-center">{formatDate(c.last_order_date)}</div>}
                      </div>
                      {(canEdit || canManage) && (
                        <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                          {canEdit && <button onClick={(e) => { e.stopPropagation(); openEditForm(c); }} className="px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Edit</button>}
                          {canManage && <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }} className="px-3 py-1.5 text-xs rounded border border-gray-300 text-red-500 hover:bg-red-50">Delete</button>}
                        </div>
                      )}
                    </div>
                  ))
                )}
                {totalCount > 0 && <PaginationControls page={page} totalPages={totalPages} totalCount={totalCount} pageSize={PAGE_SIZE} setPage={setPage} />}
              </div>
            </div>

            {/* Right Sidebar */}
            <div className="hidden lg:block w-72 flex-shrink-0 space-y-4">
              {/* Customer Summary */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Customer Summary</h3>
                <div className="space-y-2.5">
                  <SummaryStat label="Total Customers" value={String(summaryData?.total ?? 0)} />
                  <SummaryStat label="Active" value={String(customers.filter(c => c.status !== 'inactive').length + ' / ' + (summaryData?.total ?? 0))} />
                  <SummaryStat label="Inactive" value={String(customers.filter(c => c.status === 'inactive').length)} />
                  <SummaryStat label="New Customers" value={String(summaryData?.newMonth ?? 0)} />
                </div>
                <button className="mt-3 w-full text-xs font-medium text-center py-2 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                  View Customer Report →
                </button>
              </div>

              {/* Top Customers */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Customers</h3>
                {topCustomers.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No customer sales yet</p>
                ) : (
                  <div className="space-y-2.5">
                    {topCustomers.map((tc, i) => (
                      <div key={tc.id} className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                          style={{ backgroundColor: avatarColor(tc.name) }}>{initials(tc.name)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-700 truncate">{tc.name}</div>
                          <div className="text-[10px] text-gray-400">{currencySymbol}{tc.total.toFixed(2)}</div>
                        </div>
                        <div className="text-[11px] font-semibold text-gray-500">#{i + 1}</div>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => { setActiveFilter(null); setSortField('total_spent'); setSortAsc(false); setPage(1); }}
                  className="mt-3 w-full text-xs font-medium text-center py-2 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                  View All →
                </button>
              </div>

              {/* Quick Actions */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  {canCreate && <button onClick={openAddForm}
                    className="w-full text-sm font-medium py-2.5 rounded text-white transition-colors" style={{ backgroundColor: theme.primaryColor }}>
                    + Add Customer
                  </button>}
                  <button disabled className="w-full text-sm font-medium py-2.5 rounded border border-gray-200 text-gray-400 cursor-not-allowed">
                    Import Customers <span className="text-[10px]">(Coming Soon)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Filter Drawer */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMobileFilterOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Filters</h3>
              <button onClick={() => setMobileFilterOpen(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="space-y-2">
              {filterOptions.map(f => (
                <button key={f.key} onClick={() => { setActiveFilter(activeFilter === f.key ? null : f.key); setMobileFilterOpen(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium ${activeFilter === f.key ? 'text-white' : 'bg-gray-50 text-gray-600'}`}
                  style={activeFilter === f.key ? { backgroundColor: theme.primaryColor } : {}}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Customer Detail Drawer */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 lg:hidden bg-gray-50 overflow-y-auto" onClick={() => setSelectedCustomer(null)}>
          <div className="min-h-full" onClick={(e) => e.stopPropagation()}>
            <CustomerDetailContent
              customer={selectedCustomer}
              orderHistory={orderHistory}
              historyLoading={historyLoading}
              historyTotal={historyTotal}
              historyPage={historyPage}
              historyPageSize={HISTORY_PAGE_SIZE}
              currencySymbol={currencySymbol}
              loyaltyPointsEnabled={loyaltyPointsEnabled}
              theme={theme}
              canEdit={canEdit}
              canManage={canManage}
              onClose={() => setSelectedCustomer(null)}
              onEdit={() => { const c = selectedCustomer; setSelectedCustomer(null); openEditForm(c); }}
              onToggleStatus={() => handleDeactivate(selectedCustomer)}
              onDelete={() => { setDeleteTarget(selectedCustomer); setSelectedCustomer(null); }}
              onHistoryPageChange={(p) => { setHistoryPage(p); fetchOrderHistory(selectedCustomer.id, p); }}
              payMethods={payMethods}
              typeLabels={typeLabels}
              statusColor={statusColor}
              statusBg={statusBg}
            />
          </div>
        </div>
      )}

      {/* Desktop Customer Detail Sidebar */}
      {selectedCustomer && (
        <div className="hidden lg:block fixed right-0 top-0 h-full w-96 bg-white border-l border-gray-200 z-40 overflow-y-auto shadow-xl"
          style={{ marginTop: '57px', height: 'calc(100vh - 57px)' }}>
          <CustomerDetailContent
            customer={selectedCustomer}
            orderHistory={orderHistory}
            historyLoading={historyLoading}
            historyTotal={historyTotal}
            historyPage={historyPage}
            historyPageSize={HISTORY_PAGE_SIZE}
            currencySymbol={currencySymbol}
            loyaltyPointsEnabled={loyaltyPointsEnabled}
            theme={theme}
            canEdit={canEdit}
            canManage={canManage}
            onClose={() => setSelectedCustomer(null)}
            onEdit={() => { const c = selectedCustomer; openEditForm(c); }}
            onToggleStatus={() => handleDeactivate(selectedCustomer)}
            onDelete={() => { setDeleteTarget(selectedCustomer); }}
            onHistoryPageChange={(p) => { setHistoryPage(p); fetchOrderHistory(selectedCustomer.id, p); }}
            payMethods={payMethods}
            typeLabels={typeLabels}
            statusColor={statusColor}
            statusBg={statusBg}
          />
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        placement="centered"
        size="lg"
        title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="primary" style={{ backgroundColor: theme.primaryColor }} onClick={handleSave} loading={saving}>
              {saving ? 'Saving...' : (editingCustomer ? 'Update Customer' : 'Add Customer')}
            </Button>
          </div>
        }
      >
        {duplicateWarning && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
            <p className="text-sm text-amber-800 font-medium">Possible duplicate found</p>
            <p className="text-xs text-amber-600 mt-1">{'\u201c'}{duplicateWarning.name}{'\u201d'} already has this phone number. Save anyway?</p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setDuplicateWarning(null)} className="text-xs font-medium px-3 py-1.5 rounded bg-amber-100 text-amber-800 hover:bg-amber-200">Save Anyway</button>
              <button onClick={() => setShowForm(false)} className="text-xs font-medium px-3 py-1.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        )}
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" autoFocus /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
            <input type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="03XX-XXXXXXX" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={formStatus} onChange={(e) => setFormStatus(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="active">Active</option><option value="inactive">Inactive</option>
            </select></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
          {formError && <p className="text-red-600 text-sm">{formError}</p>}
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(''); } }}
        title="Delete Customer"
        placement="centered"
        size="sm"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button type="button" variant="outline" onClick={() => { setDeleteTarget(null); setDeleteError(''); }} disabled={deleting}>Cancel</Button>
            {deleteTarget && deleteTarget.total_orders === 0 ? (
              <Button type="button" variant="danger" onClick={() => handleDelete(deleteTarget)} loading={deleting}>Delete</Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                onClick={() => { if (deleteTarget) { handleDeactivate(deleteTarget); setDeleteTarget(null); } }}
              >
                Deactivate Instead
              </Button>
            )}
          </div>
        }
      >
        <p className="text-sm text-gray-600 mb-1">Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?</p>
        {deleteTarget?.total_orders === 0 && <p className="text-xs text-gray-400">This customer has no order history and can be safely deleted.</p>}
        {deleteError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">{deleteError}</p>}
      </Modal>
    </div>
  );
}

function SummaryCard({ label, value, icon, theme, currencySymbol, format, previous }: {
  label: string; value: number; icon: string; theme: ThemeConfig; currencySymbol: string; format: 'number' | 'currency'; previous?: number;
}) {
  const displayVal = format === 'currency' ? `${currencySymbol}${value.toFixed(2)}` : String(value);
  let diff: number | null = null;
  if (previous !== undefined && previous !== 0) diff = ((value - previous) / previous) * 100;
  const noPrev = previous !== undefined && previous === 0 && value === 0;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">{label}</p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: theme.primaryColor + '15' }}>
          {icon === 'users' ? <svg className="w-3.5 h-3.5" style={{ color: theme.primaryColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg> :
          icon === 'user-plus' ? <svg className="w-3.5 h-3.5" style={{ color: theme.primaryColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg> :
          icon === 'cash' ? <svg className="w-3.5 h-3.5" style={{ color: theme.primaryColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg> :
          <svg className="w-3.5 h-3.5" style={{ color: theme.primaryColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-800">{displayVal}</p>
      {previous !== undefined && !noPrev && (
        <div className={`flex items-center gap-1 mt-1 text-xs ${diff === null ? 'text-gray-400' : diff && diff > 0 ? 'text-green-600' : diff && diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
          {diff !== null && (diff > 0 ? '↑' : diff < 0 ? '↓' : '→')}
          <span>{diff !== null ? `${Math.abs(diff).toFixed(1)}% vs last month` : 'No previous data'}</span>
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-800">{value}</span>
    </div>
  );
}

function PaginationControls({ page, totalPages, totalCount, pageSize, setPage }: {
  page: number; totalPages: number; totalCount: number; pageSize: number; setPage: (p: number) => void;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);
  const pages: (number | string)[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) pages.push(i);
    else if (pages[pages.length - 1] !== '...') pages.push('...');
  }
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
      <p className="text-xs text-gray-500">Showing {from} to {to} of {totalCount}</p>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}
          className="px-2.5 py-1.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">← Prev</button>
        {pages.map((p, i) => typeof p === 'string' ? <span key={`e${i}`} className="px-1.5 text-xs text-gray-400">...</span> :
          <button key={p} onClick={() => setPage(p)}
            className={`px-2.5 py-1.5 text-xs rounded font-medium ${p === page ? 'text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-100'}`}
            style={p === page ? { backgroundColor: 'var(--primary)' } : {}}>{p}</button>
        )}
        <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
          className="px-2.5 py-1.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">Next →</button>
      </div>
    </div>
  );
}

function CustomerDetailContent({ customer, orderHistory, historyLoading, historyTotal, historyPage, historyPageSize,
  currencySymbol, loyaltyPointsEnabled, theme, canEdit, canManage, onClose, onEdit, onToggleStatus, onDelete, onHistoryPageChange,
  payMethods, typeLabels, statusColor, statusBg }: {
  customer: Customer; orderHistory: OrderRow[]; historyLoading: boolean; historyTotal: number;
  historyPage: number; historyPageSize: number; currencySymbol: string; loyaltyPointsEnabled: boolean;
  theme: ThemeConfig; canEdit: boolean; canManage: boolean; onClose: () => void; onEdit: () => void;
  onToggleStatus: () => void; onDelete: () => void; onHistoryPageChange: (p: number) => void;
  payMethods: Record<string, string>; typeLabels: Record<string, string>;
  statusColor: Record<string, string>; statusBg: Record<string, string>;
}) {
  const avgOrder = customer.total_orders > 0 ? Number(customer.total_spent) / customer.total_orders : 0;
  const totalHPages = Math.ceil(historyTotal / historyPageSize);

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
            style={{ backgroundColor: avatarColor(customer.name) }}>{initials(customer.name)}</div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{customer.name}</h2>
                        <Badge variant={customer.status === 'active' ? 'success' : 'neutral'} size="sm" pill>{customer.status === 'active' ? 'Active' : 'Inactive'}</Badge>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
      </div>

      <div className="space-y-2 text-sm text-gray-600 mb-4 bg-gray-50 rounded-xl p-4">
        {customer.phone && <p className="flex items-center gap-2"><span className="text-gray-400 w-4">Phone:</span><span>{customer.phone}</span></p>}
        {customer.email && <p className="flex items-center gap-2"><span className="text-gray-400 w-4">Email:</span><span>{customer.email}</span></p>}
        {customer.notes && <p className="flex items-start gap-2"><span className="text-gray-400 w-4">Notes:</span><span className="text-gray-500">{customer.notes}</span></p>}
        <p className="flex items-center gap-2"><span className="text-gray-400 w-4">Since:</span><span className="text-gray-500">{formatDate(customer.created_at)}</span></p>
      </div>

      <div className={`grid ${loyaltyPointsEnabled ? 'grid-cols-4' : 'grid-cols-3'} gap-2 mb-4`}>
        <MetricBox label="Orders" value={String(customer.total_orders)} />
        <MetricBox label="Total Spent" value={`${currencySymbol}${Number(customer.total_spent).toFixed(2)}`} />
        <MetricBox label="Avg Order" value={`${currencySymbol}${avgOrder.toFixed(2)}`} />
        {loyaltyPointsEnabled && <MetricBox label="Points" value={String(customer.loyalty_points)} color={theme.primaryColor} />}
      </div>

      {(canEdit || canManage) && (
        <div className="flex gap-2 mb-4">
          {canEdit && <button onClick={onEdit} className="flex-1 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Edit</button>}
          <button onClick={onToggleStatus}
            className="flex-1 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
            {customer.status === 'active' ? 'Deactivate' : 'Activate'}
          </button>
          {canManage && customer.total_orders === 0 && <button onClick={onDelete} className="px-3 py-2 text-sm font-medium rounded-lg border border-red-200 text-red-500 hover:bg-red-50">Delete</button>}
        </div>
      )}

      <h3 className="text-sm font-semibold text-gray-700 mb-3 mt-5">Order History</h3>
      {historyLoading ? (
        <Skeleton variant="lines" rows={2} />
      ) : orderHistory.length === 0 ? (
        <div className="py-4"><EmptyState variant="no-orders" as="bare" /></div>
      ) : (
        <>
          <div className="space-y-2">
            {orderHistory.map((o) => (
              <div key={o.id} className={`rounded-lg border border-gray-100 p-3 ${statusBg[o.status] || 'bg-white'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-gray-700">#{o.order_number}</span>
                  <span className={`text-[10px] font-medium ${statusColor[o.status] || 'text-gray-500'}`}>{o.status}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{new Date(o.created_at).toLocaleDateString()} {typeLabels[o.order_type] || o.order_type}</span>
                  <span className="font-semibold text-gray-700">{currencySymbol}{Number(o.total).toFixed(2)}</span>
                </div>
                <div className="text-[10px] text-gray-400 mt-1">{payMethods[o.id] || '-'}</div>
              </div>
            ))}
          </div>
          {totalHPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button disabled={historyPage <= 1} onClick={() => onHistoryPageChange(historyPage - 1)}
                className="px-2.5 py-1.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-30">←</button>
              <span className="text-xs text-gray-500">{historyPage} / {totalHPages}</span>
              <button disabled={historyPage >= totalHPages} onClick={() => onHistoryPageChange(historyPage + 1)}
                className="px-2.5 py-1.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-30">→</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2.5 text-center">
      <div className="text-lg font-bold" style={color ? { color } : { color: '#1f2937' }}>{value}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  );
}
