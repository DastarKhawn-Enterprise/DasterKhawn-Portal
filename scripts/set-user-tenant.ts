/**
 * Temporary admin utility to set a Clerk user's tenant_id and role in publicMetadata.
 *
 * Usage:
 *   pnpm tsx scripts/set-user-tenant.ts <clerk-user-id> <tenant-id> <role>
 *
 *   Roles: super_admin | owner | staff
 *
 * Examples:
 *   pnpm tsx scripts/set-user-tenant.ts user_2abcdef1234567890 7e928cd7-e593-4955-b031-9aec79ed55d8 owner
 *   pnpm tsx scripts/set-user-tenant.ts user_2abcdef1234567890 "" super_admin
 *
 * For super_admin, omit tenant-id (pass empty string) — super_admin can see all tenants.
 */

import { createClerkClient } from '@clerk/backend';

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

async function main() {
  const [, , clerkUserId, tenantId, role] = process.argv;

  if (!clerkUserId || !role) {
    console.error('Usage: pnpm tsx scripts/set-user-tenant.ts <clerk-user-id> <tenant-id> <role>');
    console.error('  <tenant-id> is the tenant UUID from the gateway tenants table.');
    console.error('  Pass "" for super_admin (no tenant binding).');
    console.error('  Roles: super_admin | owner | staff');
    process.exit(1);
  }

  const validRoles = ['super_admin', 'owner', 'staff'];
  if (!validRoles.includes(role)) {
    console.error(`Invalid role "${role}". Must be one of: ${validRoles.join(', ')}`);
    process.exit(1);
  }

  const PERMISSIONS_BY_ROLE: Record<string, string[]> = {
    owner: [
      'orders:create', 'orders:view', 'orders:update',
      'menu:view', 'menu:edit',
      'reports:view', 'staff:manage', 'settings:edit',
    ],
    staff: [
      'orders:create', 'orders:view', 'orders:update',
      'menu:view',
    ],
    customer: ['orders:create:own', 'orders:view:own'],
  };

  const publicMetadata: Record<string, any> = { role };
  publicMetadata.permissions = PERMISSIONS_BY_ROLE[role] ?? [];

  if (tenantId && tenantId.length > 0 && tenantId !== 'none') {
    publicMetadata.tenant_id = tenantId;
  } else if (role === 'super_admin') {
    publicMetadata.tenant_id = null;
  }

  try {
    const user = await clerk.users.updateUserMetadata(clerkUserId, { publicMetadata });
    console.log(`✅ Updated user ${clerkUserId}:`);
    console.log(`   Email:     ${user.emailAddresses[0]?.emailAddress ?? '(none)'}`);
    console.log(`   Tenant ID: ${(user.publicMetadata as any).tenant_id ?? '(none — super admin)'}`);
    console.log(`   Role:      ${(user.publicMetadata as any).role}`);
  } catch (err: any) {
    console.error('❌ Failed to update user:', err.message || err);
    process.exit(1);
  }
}

main();
