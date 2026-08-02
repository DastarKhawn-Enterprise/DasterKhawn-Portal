'use server';

import { randomBytes } from 'crypto';
import { auth, clerkClient } from '@clerk/nextjs/server';
import {
  getTenantBySlug,
  getStaffByTenant,
  addStaffRole,
  updateStaffRole,
  removeStaffRole,
} from '@sat-sys/gateway-sdk';
import type { StaffMember, StaffListResult, StaffMeta, CreateStaffData, UpdateStaffData } from './staff-types';
import { ROLE_DEFAULTS, getAllPermissions } from './staff-types';

function generatePassword(): string {
  return randomBytes(18)
    .toString('base64')
    .replace(/[/+]/g, () => '!@#$%^&*'[Math.floor(Math.random() * 8)]);
}

export type { StaffMember, StaffListResult, StaffMeta, CreateStaffData, UpdateStaffData };

async function getActorInfo(userId: string): Promise<{ name: string; role: string }> {
  try {
    const client = await clerkClient();
    const u = await client.users.getUser(userId);
    return {
      name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.emailAddresses[0]?.emailAddress || userId,
      role: ((u.publicMetadata as any)?.role as string) || '',
    };
  } catch {
    return { name: userId, role: '' };
  }
}

async function requireStaffAccess(slug: string): Promise<{
  authorized: false; reason: string
} | {
  authorized: true; tenant: { id: string; supabase_url: string; slug: string }; userId: string; actorRole: string; actorPerms: string[]
}> {
  const { userId } = auth();
  if (!userId) return { authorized: false, reason: 'Not authenticated' };

  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { authorized: false, reason: 'Tenant not found' };

  const staff = await getStaffByTenant(tenant.id);
  const me = staff.find((s) => s.clerk_user_id === userId);
  const actorRole = me?.role || '';
  const actorPerms = me?.permissions || [];

  if (me && (me.role === 'owner' || me.role === 'super_admin')) {
    return { authorized: true, tenant, userId, actorRole, actorPerms };
  }

  if (me && actorPerms.includes('staff:manage')) {
    return { authorized: true, tenant, userId, actorRole, actorPerms };
  }

  // Check super_admin via Clerk metadata
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = (user.publicMetadata as any)?.role;
  if (role === 'super_admin') {
    return { authorized: true, tenant, userId, actorRole: 'super_admin', actorPerms: getAllPermissions().map((p) => p.key) };
  }

  return { authorized: false, reason: 'Forbidden: missing staff:manage permission' };
}

export async function getStaffList(slug: string): Promise<StaffListResult> {
  try {
    const access = await requireStaffAccess(slug);
    if (!access.authorized) {
      return { staff: [], total: 0, totalActive: 0, totalLeave: 0, totalInactive: 0, error: access.reason, currentUser: { id: '', name: '', email: '', role: '', permissions: [] } };
    }

    const { userId } = access;
    const tenant = access.tenant;
    const client = await clerkClient();

    let currentUser: StaffListResult['currentUser'] = { id: userId, name: userId, email: '', role: '', permissions: [] };
    try {
      const cu = await client.users.getUser(userId);
      currentUser = {
        id: userId,
        name: `${cu.firstName || ''} ${cu.lastName || ''}`.trim() || cu.emailAddresses[0]?.emailAddress || userId,
        email: cu.emailAddresses[0]?.emailAddress || '',
        role: (cu.publicMetadata as any)?.role || '',
        permissions: ((cu.publicMetadata as any)?.permissions as string[]) || [],
      };
    } catch {}

    const rows = await getStaffByTenant(tenant.id);
    const staff: StaffMember[] = [];

    const now = new Date();

    for (const row of rows) {
      const meta: StaffMeta = (row.metadata as StaffMeta) || {};
      const empStatus = meta.employment_status || 'active';
      const loginEnabled = meta.login_enabled !== false;
      if (empStatus === 'on_leave') {
        const ls = meta.leave_start ? new Date(meta.leave_start) : null;
        const le = meta.leave_end ? new Date(meta.leave_end) : null;
        if (ls && le && (now < ls || now > le)) {
          meta.employment_status = 'active';
        }
      }

      let name = row.clerk_user_id;
      let email = '';
      try {
        const u = await client.users.getUser(row.clerk_user_id);
        name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.emailAddresses[0]?.emailAddress || row.clerk_user_id;
        email = u.emailAddresses[0]?.emailAddress || '';
      } catch {}

      staff.push({
        id: row.id,
        clerkUserId: row.clerk_user_id,
        name,
        email,
        phone: meta.phone || '',
        role: row.role,
        permissions: row.permissions,
        createdAt: row.created_at,
        metadata: meta,
      });
    }

    const total = staff.length;
    const totalActive = staff.filter((s) => {
      const m = s.metadata;
      const es = m.employment_status || 'active';
      if (es === 'active' && m.login_enabled !== false) return true;
      if (es === 'on_leave') {
        const ls = m.leave_start ? new Date(m.leave_start) : null;
        const le = m.leave_end ? new Date(m.leave_end) : null;
        if (ls && le && now >= ls && now <= le) return false;
        return m.login_enabled !== false;
      }
      return false;
    }).length;
    const totalLeave = staff.filter((s) => {
      const m = s.metadata;
      if (m.employment_status !== 'on_leave') return false;
      const ls = m.leave_start ? new Date(m.leave_start) : null;
      const le = m.leave_end ? new Date(m.leave_end) : null;
      return ls && le && now >= ls && now <= le;
    }).length;
    const totalInactive = total - totalActive - totalLeave;

    return { currentUser, staff, total, totalActive, totalLeave, totalInactive };
  } catch (e: any) {
    return { staff: [], total: 0, totalActive: 0, totalLeave: 0, totalInactive: 0, error: e.message, currentUser: { id: '', name: '', email: '', role: '', permissions: [] } };
  }
}

export async function createStaffAccount(
  slug: string,
  email: string,
  name: string,
  role: string,
  phone?: string,
  employmentStatus?: string,
  customPermissions?: string[],
): Promise<{ success: boolean; error?: string; credentials?: { email: string; password: string } }> {
  try {
    const access = await requireStaffAccess(slug);
    if (!access.authorized) return { success: false, error: access.reason };

    if (role !== 'owner' && !access.actorPerms.includes('staff:manage')) {
      return { success: false, error: 'You do not have permission to add staff' };
    }

    if (role === 'owner' && access.actorRole !== 'owner' && access.actorRole !== 'super_admin') {
      return { success: false, error: 'Only owners can add owners' };
    }

    const tenant = access.tenant;
    if (!email.trim()) return { success: false, error: 'Email is required' };

    const client = await clerkClient();
    const existing = await client.users.getUserList({ emailAddress: [email] });

    const permissions = customPermissions && customPermissions.length > 0
      ? customPermissions
      : [...(ROLE_DEFAULTS[role] || [])];

    const finalPassword = generatePassword();
    const meta: StaffMeta = {
      phone: phone || '',
      employment_status: employmentStatus || 'active',
      login_enabled: true,
    };

    if (existing.data.length > 0) {
      const targetUserId = existing.data[0].id;
      try {
        await client.users.updateUser(targetUserId, {
          firstName: name.split(' ')[0] || name,
          lastName: name.split(' ').slice(1).join(' ') || '',
        });
        await client.users.updateUserMetadata(targetUserId, {
          publicMetadata: {
            tenant_id: tenant.id,
            role,
            permissions,
            login_enabled: true,
          },
        });
      } catch (e2: any) {
        let msg = e2.message || 'Failed to update existing user';
        if (e2.errors) msg = e2.errors.map((err: any) => err.longMessage || err.message).join('; ');
        return { success: false, error: msg };
      }
      const result = await addStaffRole(targetUserId, tenant.id, role, permissions, meta);
      if (!result.success) return { success: false, error: result.error };
      return { success: true, credentials: { email, password: finalPassword } };
    }

    let created;
    try {
      created = await client.users.createUser({
        firstName: name.split(' ')[0] || name,
        lastName: name.split(' ').slice(1).join(' ') || '',
        emailAddress: [email],
        password: finalPassword,
        skipPasswordChecks: true,
      });
      await client.users.updateUserMetadata(created.id, {
        publicMetadata: {
          tenant_id: tenant.id,
          role,
          permissions,
          login_enabled: true,
        },
      });
    } catch (e2: any) {
      let msg = e2.message || 'Failed to create user';
      if (e2.errors) msg = e2.errors.map((err: any) => err.longMessage || err.message).join('; ');
      return { success: false, error: msg };
    }

    const result = await addStaffRole(created.id, tenant.id, role, permissions, meta);
    if (!result.success) return { success: false, error: result.error };

    return {
      success: true,
      credentials: { email, password: finalPassword },
    };
  } catch (e: any) {
    let msg = e.message || 'Unknown error';
    if (e.errors) msg = e.errors.map((err: any) => err.longMessage || err.message).join('; ');
    return { success: false, error: msg };
  }
}

export async function updateStaff(
  slug: string,
  clerkUserId: string,
  updates: UpdateStaffData,
): Promise<{ success: boolean; error?: string }> {
  try {
    const access = await requireStaffAccess(slug);
    if (!access.authorized) return { success: false, error: access.reason };

    const tenant = access.tenant;
    const allRows = await getStaffByTenant(tenant.id);
    const target = allRows.find((r) => r.clerk_user_id === clerkUserId);
    if (!target) return { success: false, error: 'Staff not found' };

    // Last owner protections
    if (updates.role && updates.role !== target.role && target.role === 'owner') {
      const ownerCount = allRows.filter((r) => r.role === 'owner').length;
      if (ownerCount <= 1) {
        return { success: false, error: 'Cannot downgrade the last owner. At least one owner must remain.' };
      }
    }

    // Non-owners cannot grant permissions they don't have
    if (updates.permissions && access.actorRole !== 'owner' && access.actorRole !== 'super_admin') {
      const forbidden = updates.permissions.filter((p) => !access.actorPerms.includes(p));
      if (forbidden.length > 0) {
        return { success: false, error: `You cannot grant permissions you do not have: ${forbidden.join(', ')}` };
      }
    }

    const client = await clerkClient();

    if (updates.name) {
      try {
        await client.users.updateUser(clerkUserId, {
          firstName: updates.name.split(' ')[0] || updates.name,
          lastName: updates.name.split(' ').slice(1).join(' ') || '',
        });
      } catch {}
    }

    const existingMeta: StaffMeta = (target.metadata as StaffMeta) || {};
    const newMeta: StaffMeta = { ...existingMeta };
    if (updates.phone !== undefined) newMeta.phone = updates.phone;
    if (updates.employmentStatus !== undefined) newMeta.employment_status = updates.employmentStatus;

    const gatewayUpdates: { role?: string; permissions?: string[]; metadata?: Record<string, any> } = { metadata: newMeta };
    if (updates.role) gatewayUpdates.role = updates.role;
    if (updates.permissions) gatewayUpdates.permissions = updates.permissions;

    const gatewayResult = await updateStaffRole(clerkUserId, tenant.id, gatewayUpdates);
    if (!gatewayResult.success) return { success: false, error: gatewayResult.error };

    try {
      await client.users.updateUserMetadata(clerkUserId, {
        publicMetadata: {
          tenant_id: tenant.id,
          role: updates.role || target.role,
          permissions: updates.permissions || target.permissions,
          login_enabled: existingMeta.login_enabled !== false,
        },
      });
    } catch {}

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function updateStaffPermissions(
  slug: string,
  clerkUserId: string,
  permissions: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const access = await requireStaffAccess(slug);
    if (!access.authorized) return { success: false, error: access.reason };
    const tenant = access.tenant;

    if (access.actorRole !== 'owner' && access.actorRole !== 'super_admin') {
      const forbidden = permissions.filter((p) => !access.actorPerms.includes(p));
      if (forbidden.length > 0) {
        return { success: false, error: `You cannot grant permissions you do not have: ${forbidden.join(', ')}` };
      }
    }

    const allRows = await getStaffByTenant(tenant.id);
    const target = allRows.find((r) => r.clerk_user_id === clerkUserId);
    if (!target) return { success: false, error: 'Staff not found' };

    const meta: StaffMeta = (target.metadata as StaffMeta) || {};
    const gatewayResult = await updateStaffRole(clerkUserId, tenant.id, { permissions, metadata: { ...meta, login_enabled: meta.login_enabled !== false } });
    if (!gatewayResult.success) return { success: false, error: gatewayResult.error };

    const client = await clerkClient();
    try {
      await client.users.updateUserMetadata(clerkUserId, {
        publicMetadata: {
          tenant_id: tenant.id,
          role: target.role,
          permissions,
          login_enabled: meta.login_enabled !== false,
        },
      });
    } catch {}

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function resetPassword(
  slug: string,
  clerkUserId: string,
): Promise<{ success: boolean; error?: string; password?: string }> {
  try {
    const access = await requireStaffAccess(slug);
    if (!access.authorized) return { success: false, error: access.reason };
    const tenant = access.tenant;

    const allRows = await getStaffByTenant(tenant.id);
    const target = allRows.find((r) => r.clerk_user_id === clerkUserId);
    if (!target) return { success: false, error: 'Staff not found' };

    const newPassword = generatePassword();
    const client = await clerkClient();

    try {
      await client.users.updateUser(clerkUserId, {
        password: newPassword,
        skipPasswordChecks: true,
      });
    } catch (e2: any) {
      let msg = e2.message || 'Failed to reset password';
      if (e2.errors) msg = e2.errors.map((err: any) => err.longMessage || err.message).join('; ');
      return { success: false, error: msg };
    }

    const existingMeta: StaffMeta = (target.metadata as StaffMeta) || {};
    const actor = await getActorInfo(access.userId);
    await updateStaffRole(clerkUserId, tenant.id, {
      metadata: { ...existingMeta, password_reset_at: new Date().toISOString(), password_reset_by: actor.name },
    });

    return { success: true, password: newPassword };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function toggleLogin(
  slug: string,
  clerkUserId: string,
  enable: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const access = await requireStaffAccess(slug);
    if (!access.authorized) return { success: false, error: access.reason };
    const tenant = access.tenant;

    const allRows = await getStaffByTenant(tenant.id);
    const target = allRows.find((r) => r.clerk_user_id === clerkUserId);
    if (!target) return { success: false, error: 'Staff not found' };

    if (!enable && target.role === 'owner') {
      const ownerCount = allRows.filter((r) => r.role === 'owner').length;
      if (ownerCount <= 1) {
        return { success: false, error: 'Cannot disable login for the last owner. At least one owner must remain.' };
      }
    }

    const client = await clerkClient();
    const actor = await getActorInfo(access.userId);

    if (enable) {
      await client.users.unbanUser(clerkUserId);
    } else {
      await client.users.banUser(clerkUserId);
    }

    const existingMeta: StaffMeta = (target.metadata as StaffMeta) || {};
    await updateStaffRole(clerkUserId, tenant.id, {
      metadata: {
        ...existingMeta,
        login_enabled: enable,
        disabled_at: enable ? null : new Date().toISOString(),
        disabled_by: enable ? null : actor.name,
      },
    });

    try {
      await client.users.updateUserMetadata(clerkUserId, {
        publicMetadata: {
          ...(target.role ? { role: target.role } : {}),
          permissions: target.permissions,
          tenant_id: tenant.id,
          login_enabled: enable,
        },
      });
    } catch {}

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function setStaffLeave(
  slug: string,
  clerkUserId: string,
  leaveData: { start: string; end: string; reason: string } | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const access = await requireStaffAccess(slug);
    if (!access.authorized) return { success: false, error: access.reason };
    const tenant = access.tenant;

    const allRows = await getStaffByTenant(tenant.id);
    const target = allRows.find((r) => r.clerk_user_id === clerkUserId);
    if (!target) return { success: false, error: 'Staff not found' };

    const existingMeta: StaffMeta = (target.metadata as StaffMeta) || {};
    const actor = await getActorInfo(access.userId);

    if (leaveData) {
      await updateStaffRole(clerkUserId, tenant.id, {
        metadata: {
          ...existingMeta,
          employment_status: 'on_leave',
          leave_start: leaveData.start,
          leave_end: leaveData.end,
          leave_reason: leaveData.reason,
          approved_by: actor.name,
        },
      });
    } else {
      await updateStaffRole(clerkUserId, tenant.id, {
        metadata: {
          ...existingMeta,
          employment_status: 'active',
          leave_start: null,
          leave_end: null,
          leave_reason: null,
          approved_by: null,
        },
      });
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function removeStaff(
  slug: string,
  clerkUserId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const access = await requireStaffAccess(slug);
    if (!access.authorized) return { success: false, error: access.reason };
    const tenant = access.tenant;

    const allRows = await getStaffByTenant(tenant.id);
    const target = allRows.find((r) => r.clerk_user_id === clerkUserId);
    if (!target) return { success: false, error: 'Staff not found' };

    if (target.role === 'owner') {
      const ownerCount = allRows.filter((r) => r.role === 'owner').length;
      if (ownerCount <= 1) {
        return { success: false, error: 'Cannot remove the last owner. At least one owner must remain.' };
      }
    }

    const client = await clerkClient();

    try {
      await client.users.banUser(clerkUserId);
    } catch {}

    try {
      await client.users.updateUserMetadata(clerkUserId, {
        publicMetadata: { tenant_id: null, role: null, permissions: null, login_enabled: false },
      });
    } catch {}

    return await removeStaffRole(clerkUserId, tenant.id);
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function exportStaffCsv(slug: string): Promise<{ success: boolean; error?: string; csv?: string }> {
  try {
    const list = await getStaffList(slug);
    if (list.error) return { success: false, error: list.error };

    const header = 'Name,Email/Login ID,Phone,Role,Employment Status,Login Status,Permissions,Created Date';
    const rows = list.staff.map((s) => {
      const empStatus = s.metadata.employment_status || 'active';
      const loginStatus = s.metadata.login_enabled !== false ? 'Enabled' : 'Disabled';
      const permSummary = s.permissions.join('; ');
      const created = s.createdAt ? new Date(s.createdAt).toISOString().split('T')[0] : '';
      return [
        `"${s.name.replace(/"/g, '""')}"`,
        s.email,
        s.phone,
        s.role,
        empStatus,
        loginStatus,
        `"${permSummary}"`,
        created,
      ].join(',');
    });

    return { success: true, csv: [header, ...rows].join('\n') };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
