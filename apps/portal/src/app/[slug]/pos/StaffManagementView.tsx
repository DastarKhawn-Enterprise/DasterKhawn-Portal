'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { getStaffList, createStaffAccount, removeStaff } from './staff-actions';
import type { StaffMember, StaffListResult } from './staff-actions';
import { hasPermission, decodeJwt } from './permissions';

interface Props {
  slug: string;
}

export default function StaffManagementView({ slug }: Props) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [authReady, setAuthReady] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [currentUser, setCurrentUser] = useState<StaffListResult['currentUser'] | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<'staff' | 'owner'>('staff');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  const [createError, setCreateError] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);

  const [removingId, setRemovingId] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setAuthReady(true);
    (async () => {
      try {
        const token = await getToken({ template: 'supabase' });
        if (token) {
          const decoded = decodeJwt(token);
          if (decoded) setCanManage(hasPermission(decoded.permissions, decoded.tenant_role, 'staff:manage'));
        }
      } catch {}
    })();
  }, [isLoaded, isSignedIn, getToken]);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await getStaffList(slug);
    if (result.error) {
      setError(result.error);
    } else {
      setCurrentUser(result.currentUser);
      setStaff(result.staff);
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    if (authReady) fetchStaff();
  }, [authReady, fetchStaff]);

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCreatePassword(pwd);
  };

  const handleCreate = async () => {
    const email = createEmail.trim();
    if (!email) return;
    const password = createPassword.trim() || undefined;
    setCreating(true);
    setCreateMsg('');
    setCreateError('');
    setCreatedCredentials(null);
    const result = await createStaffAccount(slug, email, createRole, password);
    if (result.success) {
      if (result.credentials) {
        setCreatedCredentials(result.credentials);
      }
      setCreateMsg(result.credentials ? 'Account created' : 'Team member added');
      setCreateEmail('');
      setCreatePassword('');
      fetchStaff();
    } else {
      setCreateError(result.error || 'Failed to create account');
    }
    setCreating(false);
  };

  const handleRemove = async (clerkUserId: string) => {
    setRemovingId(clerkUserId);
    setConfirmRemove(null);
    const result = await removeStaff(slug, clerkUserId);
    if (!result.success) {
      setError(result.error || 'Failed to remove');
    }
    fetchStaff();
    setRemovingId('');
  };

  if (!isLoaded || !authReady) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <h2 className="text-2xl font-bold text-gray-400 mb-2">Staff Management</h2>
          <p className="text-gray-300">You do not have permission to manage staff.</p>
        </div>
      </div>
    );
  }

  const allMembers = currentUser
    ? [{
        id: currentUser.id,
        clerkUserId: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role,
        permissions: currentUser.permissions,
        createdAt: '',
      } as StaffMember, ...staff.filter((s) => s.clerkUserId !== currentUser.id)]
    : staff;

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-y-auto">
      <div className="max-w-4xl w-full mx-auto p-4 md:p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Staff Management</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        {/* Create account form */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Add Team Member</h2>
          <div className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="team@example.com"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCreateRole('staff')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  createRole === 'staff'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Staff
              </button>
              <button
                type="button"
                onClick={() => setCreateRole('owner')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  createRole === 'owner'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Owner
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Password (or generate one)"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <button
                onClick={generatePassword}
                type="button"
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300"
              >
                Generate
              </button>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !createEmail.trim()}
              className="w-full px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : `+ Add ${createRole === 'owner' ? 'Owner' : 'Staff'}`}
            </button>
          </div>
          {createMsg && <p className="mt-2 text-sm text-green-600">{createMsg}</p>}
          {createError && <p className="mt-2 text-sm text-red-600">{createError}</p>}
          {createdCredentials && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-semibold text-green-800 mb-1">Account Created — Share these credentials:</p>
              <p className="text-sm text-green-700 font-mono">Email: {createdCredentials.email}</p>
              <p className="text-sm text-green-700 font-mono">Password: {createdCredentials.password}</p>
              <p className="text-xs text-green-600 mt-1">The team member can sign in at the login page with these credentials.</p>
            </div>
          )}
        </div>

        {/* Staff list */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 md:px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-700">Team Members ({allMembers.length})</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading staff...</div>
          ) : allMembers.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No staff members yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 text-xs uppercase">
                    <th className="text-left px-4 md:px-6 py-3 font-medium">Name / Email</th>
                    <th className="text-left px-4 py-3 font-medium">Role</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Permissions</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Added</th>
                    <th className="text-right px-4 md:px-6 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allMembers.map((member) => (
                    <tr key={member.clerkUserId} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 md:px-6 py-3">
                        <div className="font-medium text-gray-800">{member.name}</div>
                        {member.email && <div className="text-xs text-gray-400">{member.email}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          member.role === 'owner' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {member.role === 'owner' ? 'Owner' : 'Staff'}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {member.permissions.map((p) => (
                            <span key={p} className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                              {p}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">
                        {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 md:px-6 py-3 text-right">
                        {member.clerkUserId === currentUser?.id ? (
                          <span className="text-xs text-gray-300 italic">You</span>
                        ) : confirmRemove === member.clerkUserId ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-red-600">Remove?</span>
                            <button
                              onClick={() => handleRemove(member.clerkUserId)}
                              disabled={removingId === member.clerkUserId}
                              className="px-2 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                            >
                              {removingId === member.clerkUserId ? '...' : 'Yes'}
                            </button>
                            <button
                              onClick={() => setConfirmRemove(null)}
                              className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-200 rounded hover:bg-gray-300"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmRemove(member.clerkUserId)}
                            className="px-3 py-1 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-gray-400">
          Accounts are created directly with email + password. Owners have full access (staff management, menu editing, reports).
          At least one owner must always remain.
        </p>
      </div>
    </div>
  );
}
