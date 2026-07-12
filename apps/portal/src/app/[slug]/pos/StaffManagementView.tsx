'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { getStaffList, inviteStaff, removeStaff } from './staff-actions';
import type { StaffMember, StaffListResult } from './staff-actions';

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

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteError, setInviteError] = useState('');

  const [removingId, setRemovingId] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setAuthReady(true);
    (async () => {
      try {
        const token = await getToken({ template: 'supabase' });
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const perms: string[] = payload.user_roles ?? [];
          setCanManage(perms.includes('staff:manage'));
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

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    setInviteMsg('');
    setInviteError('');
    const result = await inviteStaff(slug, email);
    if (result.success) {
      setInviteMsg(result.message || 'Success');
      setInviteEmail('');
      fetchStaff();
    } else {
      setInviteError(result.error || 'Failed to invite');
    }
    setInviting(false);
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

        {/* Invite form */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Invite Staff Member</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              placeholder="staff@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            />
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {inviting ? 'Inviting...' : '+ Invite Staff'}
            </button>
          </div>
          {inviteMsg && <p className="mt-2 text-sm text-green-600">{inviteMsg}</p>}
          {inviteError && <p className="mt-2 text-sm text-red-600">{inviteError}</p>}
        </div>

        {/* Staff list */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 md:px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-700">Staff Members ({allMembers.length})</h2>
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
                        {member.role === 'owner' ? (
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
          Staff invites replace the manual set-user-tenant.ts script for staff roles.
          Owner assignments should still use the script.
        </p>
      </div>
    </div>
  );
}
