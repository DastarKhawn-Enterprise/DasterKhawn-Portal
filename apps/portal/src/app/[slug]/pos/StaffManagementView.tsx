'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePOS } from './pos-context';
import { useUser } from '@clerk/nextjs';
import {
  getStaffList, createStaffAccount, updateStaff, updateStaffPermissions,
  resetPassword, toggleLogin, setStaffLeave, removeStaff, exportStaffCsv, getBranches,
} from './staff-actions';
import type { StaffMember, StaffListResult, StaffMeta, CreateStaffData, UpdateStaffData } from './staff-types';
import { Badge, EmptyState, Modal, Skeleton, SkeletonTable, type BadgeVariant } from '@sat-sys/ui';
import {
  getRoleLabel, getAllPermissions, ROLE_DEFAULTS, STAFF_ROLES, PERMISSION_PAGES,
} from './staff-types';
import { hasPermission } from './permissions';
import { useEvent, usePublish } from './use-event';

interface Props { slug: string }

const PAGE_SIZE = 15;

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

const ROLE_VARIANT: Record<string, BadgeVariant> = {
  owner: 'purple',
  manager: 'info',
  cashier: 'success',
  chef: 'orange',
  kitchen_helper: 'warning',
  waiter: 'teal',
  storekeeper: 'indigo',
  accountant: 'danger',
  cleaner: 'neutral',
  custom: 'teal',
};

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant={ROLE_VARIANT[role] ?? 'neutral'}>
      {getRoleLabel(role)}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = status === 'login_disabled' ? 'Login Disabled' : status === 'on_leave' ? 'On Leave' : status.charAt(0).toUpperCase() + status.slice(1);
  const variant: BadgeVariant =
    status === 'active' ? 'success'
      : status === 'on_leave' ? 'warning'
      : status === 'login_disabled' ? 'danger'
      : 'neutral';
  return (
    <Badge variant={variant}>{label}</Badge>
  );
}

function AccessBadges({ permissions }: { permissions: string[] }) {
  const pageMap: Record<string, string> = {
    'orders:create': 'POS', 'orders:view': 'Orders', 'orders:update': 'Orders+',
    'menu:view': 'Menu', 'menu:edit': 'Menu+', 'reports:view': 'Reports',
    'staff:manage': 'Staff', 'settings:edit': 'Settings', 'accounts:view': 'Accounts',
    'accounts:manage': 'Accounts+', 'customers:view': 'Customers', 'customers:create': 'Customers+', 'customers:edit': 'Customers++',
  };
  const allKeys = ['orders:create', 'orders:view', 'menu:view', 'reports:view', 'staff:manage', 'settings:edit', 'accounts:view', 'customers:view'];
  const hasAll = allKeys.every((k) => permissions.includes(k));
  if (hasAll) {
    return <Badge variant="info">All Access</Badge>;
  }
  const shown: string[] = [];
  const order = ['orders:create', 'orders:view', 'menu:view', 'accounts:view', 'reports:view', 'staff:manage', 'settings:edit', 'customers:view'];
  for (const k of order) {
    if (permissions.includes(k) && pageMap[k]) shown.push(pageMap[k]);
  }
  const extra = permissions.filter((p) => !order.includes(p)).length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.slice(0, 3).map((l) => (
        <Badge key={l} variant="secondary" size="sm">{l}</Badge>
      ))}
      {shown.length > 3 && <Badge variant="secondary" size="sm">+{shown.length - 3} more</Badge>}
      {extra > 0 && <Badge variant="secondary" size="sm">+{extra}</Badge>}
    </div>
  );
}

export default function StaffManagementView({ slug }: Props) {
  const publish = usePublish();
  const { user, isLoaded } = useUser();
  const meta = user?.publicMetadata as Record<string, any> | undefined;
  const metaPerms = (meta?.permissions ?? []) as string[];
  const metaRole = (meta?.role ?? '') as string;

  const [currentUser, setCurrentUser] = useState<StaffListResult['currentUser'] | null>(null);

  const effRole = currentUser?.role || metaRole;
  const effPerms = currentUser?.permissions && currentUser.permissions.length > 0
    ? currentUser.permissions
    : metaPerms;
  const canManage = hasPermission(effPerms, effRole, 'staff:manage');
  const isOwnerOrSuper = effRole === 'owner' || effRole === 'super_admin';
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [summaryCounts, setSummaryCounts] = useState({ total: 0, active: 0, onLeave: 0, inactive: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<NodeJS.Timeout>();

  const [filterStatus, setFilterStatus] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterLogin, setFilterLogin] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [page, setPage] = useState(1);

  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<StaffMember | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState<StaffMember | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState('');

  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  const [branches, setBranches] = useState<{ id: string; name: string; is_default: boolean }[]>([]);

  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const { setPageTitle } = usePOS();
  useEffect(() => { setPageTitle('Staff Management'); }, [setPageTitle]);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await getStaffList(slug);
    if (result.error) {
      setError(result.error);
    } else {
      setCurrentUser(result.currentUser);
      setStaff(result.staff);
      setSummaryCounts({ total: result.total, active: result.totalActive, onLeave: result.totalLeave, inactive: result.totalInactive });
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    if (isLoaded && user) fetchData();
  }, [isLoaded, user, fetchData]);

  // Load branches for assignment (only shown if the tenant has branches configured).
  useEffect(() => {
    getBranches(slug).then((r) => {
      if (r.success && r.branches) setBranches(r.branches);
    }).catch(() => {});
  }, [slug]);

  useEvent('staff', () => { fetchData(); });

  // Filter + sort staff
  const filteredStaff = staff.filter((s) => {
    const m = s.metadata;
    const empStatus = m.employment_status || 'active';
    const loginEnabled = m.login_enabled !== false;
    let status = empStatus;
    if (empStatus === 'active' && !loginEnabled) status = 'login_disabled';

    if (filterStatus && status !== filterStatus) return false;
    if (filterRole && s.role !== filterRole) return false;
    if (filterLogin === 'enabled' && !loginEnabled) return false;
    if (filterLogin === 'disabled' && loginEnabled) return false;

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q) && !s.phone.toLowerCase().includes(q) && !getRoleLabel(s.role).toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const sortedStaff = [...filteredStaff].sort((a, b) => {
    switch (sortKey) {
      case 'name': return a.name.localeCompare(b.name);
      case 'newest': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'role': return a.role.localeCompare(b.role);
      case 'status': {
        const sa = (a.metadata.employment_status || 'active');
        const sb = (b.metadata.employment_status || 'active');
        return sa.localeCompare(sb);
      }
      default: return 0;
    }
  });

  const totalPages = Math.max(1, Math.ceil(sortedStaff.length / PAGE_SIZE));
  const pagedStaff = sortedStaff.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const startItem = sortedStaff.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, sortedStaff.length);

  const handleCreate = async (data: { email: string; name: string; role: string; phone: string; employmentStatus: string; permissions: string[]; password?: string; branchId?: string }) => {
    const branch = branches.find((b) => b.id === data.branchId);
    const result = await createStaffAccount(slug, data.email, data.name, data.role, data.phone, data.employmentStatus, data.permissions, data.password, data.branchId, branch?.name);
    if (result.success) {
      if (result.credentials) setTempPassword(result.credentials);
      setShowAddModal(false);
      publish('staff', 'INSERT', {});
      fetchData();
    }
    return result;
  };

  const handleEdit = async (clerkUserId: string, data: { name?: string; role?: string; phone?: string; employmentStatus?: string; permissions?: string[]; password?: string; branchId?: string }) => {
    const branch = branches.find((b) => b.id === data.branchId);
    const result = await updateStaff(slug, clerkUserId, {
      name: data.name,
      role: data.role,
      phone: data.phone,
      employmentStatus: data.employmentStatus,
      permissions: data.permissions,
      branchId: data.branchId,
      branchName: branch?.name,
    });
    if (result.success) {
      setShowEditModal(null);
      fetchData();
      publish('staff', 'UPDATE', { id: clerkUserId });
      if (selectedStaff?.clerkUserId === clerkUserId) {
        setSelectedStaff(null);
      }
    }
    return result;
  };

  const handleSaveAccess = async (clerkUserId: string, newPerms: string[]) => {
    const result = await updateStaffPermissions(slug, clerkUserId, newPerms);
    if (result.success) {
      fetchData();
      publish('staff', 'UPDATE', { id: clerkUserId });
      if (selectedStaff?.clerkUserId === clerkUserId) {
        setSelectedStaff((prev) => prev ? { ...prev, permissions: newPerms } : null);
      }
    }
    return result;
  };

  const handleResetPassword = async (clerkUserId: string) => {
    const result = await resetPassword(slug, clerkUserId);
    if (result.success && result.password) {
      const s = staff.find((x) => x.clerkUserId === clerkUserId);
      setTempPassword({ email: s?.email || '', password: result.password });
      publish('staff', 'UPDATE', { id: clerkUserId });
    }
    return result;
  };

  const handleToggleLogin = async (clerkUserId: string, enable: boolean) => {
    const result = await toggleLogin(slug, clerkUserId, enable);
    if (result.success) {
      fetchData();
      publish('staff', 'UPDATE', { id: clerkUserId });
      if (selectedStaff?.clerkUserId === clerkUserId) {
        setSelectedStaff((prev) => prev ? { ...prev, metadata: { ...prev.metadata, login_enabled: enable } } : null);
      }
    }
    return result;
  };

  const handleSetLeave = async (clerkUserId: string, leaveData: { start: string; end: string; reason: string } | null) => {
    const result = await setStaffLeave(slug, clerkUserId, leaveData);
    if (result.success) {
      setShowLeaveModal(null);
      fetchData();
      publish('staff', 'UPDATE', { id: clerkUserId });
      if (selectedStaff?.clerkUserId === clerkUserId) setSelectedStaff(null);
    }
    return result;
  };

  const handleRemove = async (clerkUserId: string) => {
    setRemovingId(clerkUserId);
    setConfirmRemove(null);
    const result = await removeStaff(slug, clerkUserId);
    if (!result.success) setError(result.error || 'Failed to remove');
    fetchData();
    publish('staff', 'DELETE', { id: clerkUserId });
    setRemovingId('');
    if (selectedStaff?.clerkUserId === clerkUserId) setSelectedStaff(null);
  };

  const handleExport = async () => {
    const result = await exportStaffCsv(slug);
    if (!result.success || !result.csv) { setError(result.error || 'Export failed'); return; }
    const blob = new Blob(['\ufeff' + result.csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `staff-${slug}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  if (!isLoaded) return <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6"><div className="max-w-6xl mx-auto"><SkeletonTable rows={6} cols={6} /></div></div>;
  if (!canManage) return <div className="flex-1 flex items-center justify-center bg-gray-50"><EmptyState variant="permission-denied" title="Staff Management" description="You do not have permission to manage staff." /></div>;

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-y-auto scrollbar-hide">
      <div className="flex flex-col lg:flex-row flex-1">
        {/* Main area */}
        <div className="flex-1 min-w-0 p-4 md:p-6 pb-20 lg:pb-6">
          <div className="flex items-center justify-end gap-3 mb-4">
            <div className="flex items-center gap-2">
              <button onClick={handleExport} className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Export CSV</button>
              {isOwnerOrSuper && (
                <button onClick={() => setShowAddModal(true)} className="px-4 py-1.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover">+ Add Staff</button>
              )}
            </div>
          </div>

          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Total Staff', value: summaryCounts.total, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Active', value: summaryCounts.active, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'On Leave', value: summaryCounts.onLeave, color: 'text-yellow-600', bg: 'bg-yellow-50' },
              { label: 'Inactive', value: summaryCounts.inactive, color: 'text-gray-500', bg: 'bg-gray-100' },
            ].map((c) => (
              <div key={c.label} className={`${c.bg} rounded-xl p-3 md:p-4 border border-gray-200`}>
                <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                <p className={`text-xl md:text-2xl font-bold ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Search / Filters / Sort */}
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input
                type="text" placeholder="Search name, phone, email, role..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
              />
            </div>
            <div className="flex gap-2">
              <select value={filterRole} onChange={(e) => { setFilterRole(e.target.value); setPage(1); }} className="px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-input-focus">
                <option value="">All Roles</option>
                {STAFF_ROLES.map((r) => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
              </select>
              <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-input-focus max-sm:hidden">
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="on_leave">On Leave</option>
                <option value="inactive">Inactive</option>
                <option value="login_disabled">Login Disabled</option>
              </select>
              <select value={filterLogin} onChange={(e) => { setFilterLogin(e.target.value); setPage(1); }} className="px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-input-focus max-sm:hidden">
                <option value="">All Login</option>
                <option value="enabled">Login Enabled</option>
                <option value="disabled">Login Disabled</option>
              </select>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-input-focus">
                <option value="name">Sort: Name</option>
                <option value="newest">Sort: Newest</option>
                <option value="role">Sort: Role</option>
                <option value="status">Sort: Status</option>
              </select>
              <button onClick={() => setMobileFilterOpen(true)} className="lg:hidden px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 110 2H4a1 1 0 01-1-1zm4 6a1 1 0 011-1h8a1 1 0 110 2H8a1 1 0 01-1-1zm2 6a1 1 0 011-1h4a1 1 0 110 2h-4a1 1 0 01-1-1z"/></svg>
              </button>
            </div>
          </div>

          {/* Desktop table */}
          {loading ? (
            <div className="p-8"><Skeleton variant="table" rows={4} cols={6} /></div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-sm:hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-400 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3 font-medium">Staff Name</th>
                      <th className="text-left px-4 py-3 font-medium">Role</th>
                      <th className="text-left px-4 py-3 font-medium max-md:hidden">Phone</th>
                      <th className="text-left px-4 py-3 font-medium max-md:hidden">Email</th>
                      <th className="text-left px-4 py-3 font-medium max-lg:hidden">Access</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="text-right px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedStaff.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center"><div className="max-w-md mx-auto"><EmptyState variant="no-staff" as="bare" /></div></td></tr>
                    ) : pagedStaff.map((s) => {
                      const empStatus = s.metadata.employment_status || 'active';
                      const loginEnabled = s.metadata.login_enabled !== false;
                      const status = empStatus === 'active' && !loginEnabled ? 'login_disabled' : empStatus;
                      const isCurrent = currentUser?.id === s.clerkUserId;
                      return (
                        <tr
                          key={s.clerkUserId}
                          className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${selectedStaff?.clerkUserId === s.clerkUserId ? 'bg-blue-50' : ''}`}
                          onClick={() => { setSelectedStaff(s); setMobileDrawerOpen(true); }}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">{initials(s.name)}</div>
                              <div>
                                <div className="font-medium text-gray-800">{s.name}{isCurrent && <span className="text-xs text-gray-400 ml-1">(You)</span>}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3"><RoleBadge role={s.role} /></td>
                          <td className="px-4 py-3 text-gray-600 max-md:hidden">{s.phone || '-'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs max-md:hidden">{s.email || '-'}</td>
                          <td className="px-4 py-3 max-lg:hidden"><AccessBadges permissions={s.permissions} /></td>
                          <td className="px-4 py-3"><StatusBadge status={status} /></td>
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            {confirmRemove === s.clerkUserId ? (
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-xs text-red-600">Remove?</span>
                                <button onClick={() => handleRemove(s.clerkUserId)} disabled={removingId === s.clerkUserId} className="px-2 py-1 text-xs font-medium text-white bg-danger rounded hover:opacity-90 disabled:opacity-50">{removingId === s.clerkUserId ? '...' : 'Yes'}</button>
                                <button onClick={() => setConfirmRemove(null)} className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-200 rounded hover:bg-gray-300">No</button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => setShowEditModal(s)} className="px-2 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded hover:bg-blue-50">Edit</button>
                                {isOwnerOrSuper && (
                                  <button onClick={() => setConfirmRemove(s.clerkUserId)} className="px-2 py-1 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50">Remove</button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="lg:hidden space-y-3">
                {pagedStaff.length === 0 ? (
                  <div className="p-8 text-center"><div className="max-w-md mx-auto"><EmptyState variant="no-staff" as="bare" /></div></div>
                ) : pagedStaff.map((s) => {
                  const empStatus = s.metadata.employment_status || 'active';
                  const loginEnabled = s.metadata.login_enabled !== false;
                  const status = empStatus === 'active' && !loginEnabled ? 'login_disabled' : empStatus;
                  const isCurrent = currentUser?.id === s.clerkUserId;
                  return (
                    <div
                      key={s.clerkUserId}
                      className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer active:bg-gray-50"
                      onClick={() => { setSelectedStaff(s); setMobileDrawerOpen(true); }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">{initials(s.name)}</div>
                          <div>
                            <div className="font-medium text-gray-800 text-sm">{s.name}{isCurrent && <span className="text-xs text-gray-400 ml-1">(You)</span>}</div>
                            <div className="text-xs text-gray-500">{s.email || s.phone || ''}</div>
                          </div>
                        </div>
                        <StatusBadge status={status} />
                      </div>
                      <div className="flex items-center gap-2">
                        <RoleBadge role={s.role} />
                        <span className="text-xs text-gray-400">{s.phone || ''}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {sortedStaff.length > PAGE_SIZE && (
                <div className="flex items-center justify-between mt-4 px-1">
                  <p className="text-xs text-gray-500">Showing {startItem} to {endItem} of {sortedStaff.length} staff</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">Previous</button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let p: number;
                      if (totalPages <= 5) p = i + 1;
                      else if (page <= 3) p = i + 1;
                      else if (page >= totalPages - 2) p = totalPages - 4 + i;
                      else p = page - 2 + i;
                      return (
                        <button key={p} onClick={() => setPage(p)} className={`px-2 py-1 text-xs border rounded ${page === p ? 'bg-primary text-primary-foreground border-primary' : 'border-gray-300 hover:bg-gray-50'}`}>{p}</button>
                      );
                    })}
                    <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right access panel - desktop */}
        {selectedStaff && (
          <div className="hidden lg:block w-96 border-l border-gray-200 bg-white p-4 overflow-y-auto">
            <AccessPanel
              staff={selectedStaff}
              currentUserId={currentUser?.id}
              isOwnerOrSuper={isOwnerOrSuper}
              onEdit={() => setShowEditModal(selectedStaff)}
              onResetPassword={handleResetPassword}
              onToggleLogin={handleToggleLogin}
              onSaveAccess={handleSaveAccess}
              onSetLeave={() => setShowLeaveModal(selectedStaff)}
              onClose={() => setSelectedStaff(null)}
            />
          </div>
        )}
      </div>

      {/* Mobile drawer - staff detail + access */}
      {mobileDrawerOpen && selectedStaff && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileDrawerOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[90vh] bg-white rounded-t-2xl overflow-y-auto safe-bottom">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between rounded-t-2xl">
              <h3 className="font-semibold text-gray-800">Staff Access & Login</h3>
              <button onClick={() => setMobileDrawerOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg"><svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <div className="p-4 pb-8">
              <AccessPanel
                staff={selectedStaff}
                currentUserId={currentUser?.id}
                isOwnerOrSuper={isOwnerOrSuper}
                onEdit={() => setShowEditModal(selectedStaff)}
                onResetPassword={handleResetPassword}
                onToggleLogin={handleToggleLogin}
                onSaveAccess={handleSaveAccess}
                onSetLeave={() => setShowLeaveModal(selectedStaff)}
                onClose={() => setMobileDrawerOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile filter drawer */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileFilterOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-4 safe-bottom">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Filters</h3>
              <button onClick={() => setMobileFilterOpen(false)} className="text-sm text-blue-600 font-medium">Done</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Status</label>
                <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm">
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="on_leave">On Leave</option>
                  <option value="inactive">Inactive</option>
                  <option value="login_disabled">Login Disabled</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Login</label>
                <select value={filterLogin} onChange={(e) => { setFilterLogin(e.target.value); setPage(1); }} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm">
                  <option value="">All Login</option>
                  <option value="enabled">Login Enabled</option>
                  <option value="disabled">Login Disabled</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Temp password modal */}
      {tempPassword && (
        <Modal open placement="centered" size="sm" onClose={() => setTempPassword(null)}>
          <h3 className="text-lg font-bold text-green-700 mb-2">Account Created</h3>
          <p className="text-sm text-gray-600 mb-4">Share these credentials with the staff member. The password will not be shown again.</p>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-gray-700"><span className="font-medium">Email:</span> {tempPassword.email}</p>
            <p className="text-sm text-gray-700 mt-1"><span className="font-medium">Password:</span> <span className="font-mono text-green-800">{tempPassword.password}</span></p>
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(`Email: ${tempPassword.email}\nPassword: ${tempPassword.password}`); }}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover mb-2"
          >Copy Credentials</button>
          <button onClick={() => setTempPassword(null)} className="w-full px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Done</button>
        </Modal>
      )}

      {/* Add Staff Modal */}
      {showAddModal && (
        <StaffFormModal
          title="Add Staff"
          branches={branches}
          onSave={handleCreate}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Edit Staff Modal */}
      {showEditModal && (
        <StaffFormModal
          title="Edit Staff"
          staff={showEditModal}
          branches={branches}
          onSave={async (data) => {
            const result = await handleEdit(showEditModal.clerkUserId, data);
            return result;
          }}
          onClose={() => setShowEditModal(null)}
        />
      )}

      {/* Leave Modal */}
      {showLeaveModal && (
        <LeaveModal
          staff={showLeaveModal}
          onSave={handleSetLeave}
          onClose={() => setShowLeaveModal(null)}
        />
      )}
    </div>
  );
}

function AccessPanel({
  staff, currentUserId, isOwnerOrSuper,
  onEdit, onResetPassword, onToggleLogin, onSaveAccess, onSetLeave, onClose,
}: {
  staff: StaffMember; currentUserId?: string; isOwnerOrSuper: boolean;
  onEdit: () => void; onResetPassword: (id: string) => Promise<any>;
  onToggleLogin: (id: string, enable: boolean) => Promise<any>;
  onSaveAccess: (id: string, perms: string[]) => Promise<any>;
  onSetLeave: () => void; onClose: () => void;
}) {
  const loginEnabled = staff.metadata.login_enabled !== false;
  const empStatus = staff.metadata.employment_status || 'active';

  const [editingPerms, setEditingPerms] = useState(false);
  const [perms, setPerms] = useState<string[]>([...staff.permissions]);
  const [saving, setSaving] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [accessMsg, setAccessMsg] = useState('');
  const [resetting, setResetting] = useState(false);

  // Sync perms when staff changes
  useEffect(() => {
    setPerms([...staff.permissions]);
    setEditingPerms(false);
    setAccessError('');
    setAccessMsg('');
  }, [staff.clerkUserId]);

  const handleSave = async () => {
    setSaving(true); setAccessError(''); setAccessMsg('');
    const result = await onSaveAccess(staff.clerkUserId, perms);
    if (result.success) {
      setAccessMsg('Access permissions saved');
      setEditingPerms(false);
    } else {
      setAccessError(result.error || 'Failed to save');
    }
    setSaving(false);
  };

  const allPermKeys = getAllPermissions().map((p) => p.key);
  const selectAll = () => setPerms([...allPermKeys]);
  const clearAll = () => setPerms([]);
  const applyRoleDefaults = () => {
    const defaults = ROLE_DEFAULTS[staff.role];
    if (defaults) setPerms([...defaults]);
  };

  const togglePerm = (key: string) => {
    setPerms((prev) => prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]);
  };

  return (
    <div>
      {/* Staff info */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Staff Access & Login</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg max-lg:hidden"><svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
      </div>

      <div className="space-y-2 mb-4 p-3 bg-gray-50 rounded-lg text-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs font-bold text-gray-600">{initials(staff.name)}</div>
          <div>
            <p className="font-medium text-gray-800">{staff.name}{currentUserId === staff.clerkUserId ? <span className="text-xs text-gray-400 ml-1">(You)</span> : ''}</p>
            <RoleBadge role={staff.role} />
          </div>
        </div>
        <p className="text-gray-500"><span className="text-gray-400">Email:</span> {staff.email || '-'}</p>
        <p className="text-gray-500"><span className="text-gray-400">Phone:</span> {staff.phone || '-'}</p>
        <p className="text-gray-500">
          <span className="text-gray-400">Login:</span>{' '}
          <span className={loginEnabled ? 'text-green-600' : 'text-red-600'}>{loginEnabled ? 'Enabled' : 'Disabled'}</span>
        </p>
        <p className="text-gray-500"><span className="text-gray-400">Status:</span> {empStatus}</p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={onEdit} className="flex-1 min-w-[80px] px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100">Edit</button>
        <button onClick={() => { setResetting(true); onResetPassword(staff.clerkUserId).finally(() => setResetting(false)); }} disabled={resetting} className="flex-1 min-w-[80px] px-3 py-2 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50">{resetting ? '...' : 'Reset Pwd'}</button>
        <button onClick={() => onToggleLogin(staff.clerkUserId, !loginEnabled)} className="flex-1 min-w-[80px] px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200">{loginEnabled ? 'Disable Login' : 'Enable Login'}</button>
        {isOwnerOrSuper && (
          <button onClick={onSetLeave} className="flex-1 min-w-[80px] px-3 py-2 text-xs font-medium text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg hover:bg-yellow-100">{empStatus === 'on_leave' ? 'Edit Leave' : 'Set Leave'}</button>
        )}
      </div>

      {/* Page Access Permissions */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-700">Page Access Permissions</h4>
          {!editingPerms ? (
            <button onClick={() => setEditingPerms(true)} className="text-xs text-blue-600 font-medium hover:underline">Edit</button>
          ) : (
            <button onClick={() => { setEditingPerms(false); setPerms([...staff.permissions]); }} className="text-xs text-gray-500 font-medium hover:underline">Cancel</button>
          )}
        </div>

        {accessError && <p className="text-xs text-red-600 mb-2">{accessError}</p>}
        {accessMsg && <p className="text-xs text-green-600 mb-2">{accessMsg}</p>}

        {editingPerms && (
          <div className="flex flex-wrap gap-1 mb-3">
            <button onClick={selectAll} className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100">Select All</button>
            <button onClick={clearAll} className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded hover:bg-gray-200">Clear All</button>
            <button onClick={applyRoleDefaults} className="px-2 py-1 text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded hover:bg-purple-100">Apply Role Defaults</button>
          </div>
        )}

        <div className="space-y-1 max-h-80 overflow-y-auto">
          {PERMISSION_PAGES.map((pp) => {
            const isChecked = pp.perm ? perms.includes(pp.perm) : true;
            return (
              <label key={pp.key} className={`flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer ${!editingPerms ? 'opacity-90' : ''}`}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={!editingPerms || !pp.perm}
                  onChange={() => pp.perm && togglePerm(pp.perm)}
                  className="rounded border-gray-300 text-primary focus:ring-input-focus disabled:opacity-50"
                />
                <span className="text-sm text-gray-700 flex-1">{pp.label}</span>
                {!editingPerms && (
                  <span className={`text-xs ${isChecked ? 'text-green-600' : 'text-gray-400'}`}>{isChecked ? 'Granted' : 'None'}</span>
                )}
              </label>
            );
          })}
        </div>

        {editingPerms && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="sticky bottom-0 mt-3 w-full px-4 py-2.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Access'}
          </button>
        )}
      </div>
    </div>
  );
}

function StaffFormModal({
  title, staff, branches, onSave, onClose,
}: {
  title: string; staff?: StaffMember;
  branches: { id: string; name: string; is_default: boolean }[];
  onSave: (data: { email: string; name: string; role: string; phone: string; employmentStatus: string; permissions: string[]; password?: string; branchId?: string }) => Promise<any>;
  onClose: () => void;
}) {
  const [email, setEmail] = useState(staff?.email || '');
  const [name, setName] = useState(staff?.name || '');
  const [role, setRole] = useState(staff?.role || 'cashier');
  const [phone, setPhone] = useState(staff?.phone || '');
  const [employmentStatus, setEmploymentStatus] = useState(staff?.metadata.employment_status || 'active');
  const [perms, setPerms] = useState<string[]>([...(staff?.permissions || ROLE_DEFAULTS.cashier || [])]);
  const [branchId, setBranchId] = useState(staff?.metadata.branch_id || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPerms, setShowPerms] = useState(false);
  const isEdit = !!staff;

  const allPermKeys = getAllPermissions().map((p) => p.key);

  const togglePerm = (key: string) => {
    setPerms((prev) => prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]);
  };

  const applyDefaults = (r: string) => {
    const defaults = ROLE_DEFAULTS[r];
    if (defaults) setPerms([...defaults]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Full name is required'); return; }
    if (!isEdit && !email.trim()) { setError('Email is required'); return; }
    setSaving(true);
    const result = await onSave({
      email: email.trim(),
      name: name.trim(),
      role,
      phone: phone.trim(),
      employmentStatus,
      permissions: perms,
      password: password.trim() || undefined,
      branchId: branchId || undefined,
    });
    if (result.success) {
      setSuccess(true);
    } else {
      setError(result.error || 'Failed');
    }
    setSaving(false);
  };

  return (
    <Modal open placement="centered" size="lg" title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">Saved successfully</div>}

          {!isEdit && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Email/Login ID</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" placeholder="staff@example.com" required />
            </div>
          )}

          {!isEdit && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" placeholder="Set staff login password (leave blank to auto-generate)" />
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Full Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" placeholder="John Doe" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Role</label>
              <select value={role} onChange={(e) => { setRole(e.target.value); if (!isEdit) applyDefaults(e.target.value); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-input-focus">
                {STAFF_ROLES.filter((r) => r !== 'custom').map((r) => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Status</label>
              <select value={employmentStatus} onChange={(e) => setEmploymentStatus(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-input-focus">
                <option value="active">Active</option>
                <option value="on_leave">On Leave</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" placeholder="0300-1234567" />
          </div>

          {branches.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Branch</label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-input-focus">
                <option value="">No branch (all branches)</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.is_default ? ' (Default)' : ''}</option>)}
              </select>
            </div>
          )}

          {/* Permissions */}
          <div>
            <button type="button" onClick={() => setShowPerms(!showPerms)} className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700">
              {showPerms ? 'Hide' : 'Show'} Permissions ({perms.length})
              <svg className={`w-4 h-4 transition-transform ${showPerms ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
            </button>
            {showPerms && (
              <div className="mt-2 space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
                {allPermKeys.map((key) => {
                  const pDef = getAllPermissions().find((p) => p.key === key);
                  return (
                    <label key={key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={perms.includes(key)} onChange={() => togglePerm(key)} className="rounded border-gray-300 text-primary focus:ring-input-focus" />
                      <span className="text-sm text-gray-700">{pDef?.label || key}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Account'}
            </button>
          </div>
      </form>
    </Modal>
  );
}

function LeaveModal({
  staff, onSave, onClose,
}: {
  staff: StaffMember;
  onSave: (clerkUserId: string, data: { start: string; end: string; reason: string } | null) => Promise<any>;
  onClose: () => void;
}) {
  const [start, setStart] = useState(staff.metadata.leave_start || '');
  const [end, setEnd] = useState(staff.metadata.leave_end || '');
  const [reason, setReason] = useState(staff.metadata.leave_reason || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isOnLeave = staff.metadata.employment_status === 'on_leave';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!start || !end) { setError('Start and end dates are required'); return; }
    if (new Date(end) < new Date(start)) { setError('End date must be after start date'); return; }
    setSaving(true);
    const result = await onSave(staff.clerkUserId, { start, end, reason });
    if (!result.success) setError(result.error || 'Failed to set leave');
    setSaving(false);
  };

  const handleRemoveLeave = async () => {
    setSaving(true);
    const result = await onSave(staff.clerkUserId, null);
    if (!result.success) setError(result.error || 'Failed to remove leave');
    setSaving(false);
  };

return (
    <Modal open placement="centered" size="md" title={isOnLeave ? 'Edit Leave' : 'Set Leave'} onClose={onClose}>
      {staff.name && <p className="text-sm text-gray-500 mb-3">{staff.name}</p>}
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-3">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Start Date</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" required />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">End Date</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" required />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Reason</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" placeholder="Optional reason for leave" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
            {isOnLeave && (
              <button type="button" onClick={handleRemoveLeave} disabled={saving} className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50">Remove Leave</button>
            )}
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-50">
              {saving ? 'Saving...' : isOnLeave ? 'Update Leave' : 'Set Leave'}
            </button>
          </div>
        </form>
    </Modal>
  );
}
