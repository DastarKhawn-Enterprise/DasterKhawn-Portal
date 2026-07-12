'use server';

import { randomBytes } from 'crypto';
import { auth, clerkClient } from '@clerk/nextjs/server';
import {
  getTenantBySlug,
  getStaffByTenant,
  addStaffRole,
  removeStaffRole,
  PERMISSIONS,
} from '@sat-sys/gateway-sdk';

function generatePassword(): string {
  return 'Staff!' + randomBytes(6).toString('hex');
}

export interface StaffMember {
  id: string;
  clerkUserId: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  createdAt: string;
}

export interface StaffListResult {
  currentUser: { id: string; name: string; email: string; role: string; permissions: string[] };
  staff: StaffMember[];
  error?: string;
}

export async function getStaffList(slug: string): Promise<StaffListResult> {
  try {
    const { userId } = auth();
    if (!userId) return { staff: [], error: 'Not authenticated', currentUser: { id: '', name: '', email: '', role: '', permissions: [] } };

    const tenant = await getTenantBySlug(slug);
    if (!tenant) return { staff: [], error: 'Tenant not found', currentUser: { id: '', name: '', email: '', role: '', permissions: [] } };

    const client = await clerkClient();

    // Get current user details
    let currentUser: StaffListResult['currentUser'] = { id: userId, name: userId, email: '', role: '', permissions: [] };
    try {
      const cu = await client.users.getUser(userId);
      currentUser = {
        id: userId,
        name: `${cu.firstName || ''} ${cu.lastName || ''}`.trim() || cu.emailAddresses[0]?.emailAddress || userId,
        email: cu.emailAddresses[0]?.emailAddress || '',
        role: (cu.publicMetadata as any)?.role || 'owner',
        permissions: ((cu.publicMetadata as any)?.permissions as string[]) || [],
      };
    } catch {}

    // Get staff roles
    const rows = await getStaffByTenant(tenant.id);
    const staff: StaffMember[] = [];

    for (const row of rows) {
      try {
        const user = await client.users.getUser(row.clerk_user_id);
        staff.push({
          id: row.id,
          clerkUserId: row.clerk_user_id,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.emailAddresses[0]?.emailAddress || row.clerk_user_id,
          email: user.emailAddresses[0]?.emailAddress || '',
          role: row.role,
          permissions: row.permissions,
          createdAt: row.created_at,
        });
      } catch {
        staff.push({
          id: row.id,
          clerkUserId: row.clerk_user_id,
          name: row.clerk_user_id,
          email: '',
          role: row.role,
          permissions: row.permissions,
          createdAt: row.created_at,
        });
      }
    }

    return { currentUser, staff };
  } catch (e: any) {
    return { staff: [], error: e.message, currentUser: { id: '', name: '', email: '', role: '', permissions: [] } };
  }
}

const PERMISSIONS_BY_ROLE = {
  staff: [...PERMISSIONS.staff],
  owner: [...PERMISSIONS.owner],
} as const;

export async function createStaffAccount(
  slug: string,
  email: string,
  role: 'staff' | 'owner' = 'staff',
  password?: string,
): Promise<{ success: boolean; error?: string; credentials?: { email: string; password: string } }> {
  try {
    const { userId } = auth();
    if (!userId) return { success: false, error: 'Not authenticated' };

    const tenant = await getTenantBySlug(slug);
    if (!tenant) return { success: false, error: 'Tenant not found' };

    const client = await clerkClient();
    const existing = await client.users.getUserList({ emailAddress: [email] });

    const permissions = [...PERMISSIONS_BY_ROLE[role]];
    const finalPassword = password || generatePassword();

    if (existing.data.length > 0) {
      const targetUserId = existing.data[0].id;
      try {
        await client.users.updateUser(targetUserId, {
          publicMetadata: {
            tenant_id: tenant.id,
            role,
            permissions,
          },
        });
      } catch (e2: any) {
        let msg = e2.message || 'Failed to update existing user';
        if (e2.errors && Array.isArray(e2.errors) && e2.errors.length > 0) {
          msg = e2.errors.map((err: any) => err.longMessage || err.message).join('; ');
        }
        return { success: false, error: msg };
      }
      const result = await addStaffRole(targetUserId, tenant.id, role, permissions);
      if (!result.success) return { success: false, error: result.error };
      return { success: true };
    }

    let created;
    try {
      created = await client.users.createUser({
        emailAddress: [email],
        password: finalPassword,
        skipPasswordChecks: true,
        publicMetadata: {
          tenant_id: tenant.id,
          role,
          permissions,
        },
      });
    } catch (e2: any) {
      let msg = e2.message || 'Failed to create user';
      if (e2.errors && Array.isArray(e2.errors) && e2.errors.length > 0) {
        msg = e2.errors.map((err: any) => err.longMessage || err.message).join('; ');
      }
      return { success: false, error: msg };
    }

    const result = await addStaffRole(created.id, tenant.id, role, permissions);
    if (!result.success) return { success: false, error: result.error };

    return {
      success: true,
      credentials: { email, password: finalPassword },
    };
  } catch (e: any) {
    // Extract detailed Clerk error messages from the errors array
    let msg = e.message || 'Unknown error';
    if (e.errors && Array.isArray(e.errors) && e.errors.length > 0) {
      msg = e.errors.map((err: any) => err.longMessage || err.message).join('; ');
    }
    return { success: false, error: msg };
  }
}

export async function removeStaff(
  slug: string,
  clerkUserId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = auth();
    if (!userId) return { success: false, error: 'Not authenticated' };

    const tenant = await getTenantBySlug(slug);
    if (!tenant) return { success: false, error: 'Tenant not found' };

    // Prevent removing the last owner
    const allRows = await getStaffByTenant(tenant.id);
    const target = allRows.find((r) => r.clerk_user_id === clerkUserId);
    if (target?.role === 'owner') {
      const ownerCount = allRows.filter((r) => r.role === 'owner').length;
      if (ownerCount <= 1) {
        return { success: false, error: 'Cannot remove the last owner. At least one owner must remain.' };
      }
    }

    const client = await clerkClient();
    try {
      await client.users.updateUser(clerkUserId, {
        publicMetadata: { tenant_id: null, role: null, permissions: null },
      });
    } catch {
      // User might not exist — ignore
    }

    return await removeStaffRole(clerkUserId, tenant.id);
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
