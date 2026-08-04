import { auth, currentUser, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantMemberships, ensureStaffRoleMetadata } from '@sat-sys/gateway-sdk';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner', manager: 'Manager', cashier: 'Cashier',
  chef: 'Chef', kitchen_helper: 'Kitchen Helper', waiter: 'Waiter',
  storekeeper: 'Storekeeper', accountant: 'Accountant',
  cleaner: 'Cleaner', custom: 'Custom Role',
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] || (role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Staff');
}

function NoAssignedTenant() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-3">No POS Assigned</h1>
        <p className="text-gray-600">
          No POS has been assigned to your account yet. Contact your administrator to get set up.
        </p>
      </div>
    </div>
  );
}

function PosCard({ brandName, slug }: { brandName: string; slug: string }) {
  return (
    <Link
      href={`/${slug}/pos/dashboard`}
      className="block p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200"
    >
      <h2 className="text-xl font-semibold text-gray-800">{brandName}</h2>
      <p className="text-sm text-blue-600 mt-1">Open POS &rarr;</p>
    </Link>
  );
}

// Idempotent repair: if Clerk publicMetadata or the gateway staff_roles metadata is
// missing the assignment fields for the active tenant, backfill them. Never creates
// duplicate records (only fills missing values).
async function repairAssignment(
  clerkUserId: string,
  tenantId: string,
  role: string,
  permissions: string[],
  enrichment: Record<string, any>,
) {
  try {
    const user = await currentUser();
    const meta = (user?.publicMetadata ?? {}) as Record<string, any>;
    const wants = {
      tenant_id: tenantId,
      role,
      permissions,
      login_enabled: meta.login_enabled !== false,
    };
    const changed =
      meta.tenant_id !== wants.tenant_id ||
      meta.role !== wants.role ||
      JSON.stringify(meta.permissions || []) !== JSON.stringify(permissions);
    if (changed) {
      const client = await clerkClient();
      await client.users.updateUserMetadata(clerkUserId, { publicMetadata: wants });
    }
    await ensureStaffRoleMetadata(clerkUserId, tenantId, enrichment);
  } catch {}
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { from?: string };
}) {
  const { userId } = auth();
  if (!userId) redirect('/sign-in');

  const user = await currentUser();
  if (!user) redirect('/sign-in');

  const metadata = user.publicMetadata as {
    tenant_id?: string;
    role?: string;
  };
  const role = metadata?.role;
  const tenantId = metadata?.tenant_id;

  const fromAdmin = searchParams?.from === 'admin';

  if (role === 'super_admin') {
    return (
      <main className="min-h-screen bg-gray-50 p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-1">Super Admin Dashboard</h1>
          <p className="text-gray-500 mb-4">
            Go to{' '}
            <a href="/admin" className="text-blue-600 underline">
              Admin Dashboard
            </a>{' '}
            for full tenant management.
          </p>
          <p className="text-gray-500 mb-6">Select a POS to open, or use the admin panel above.</p>
        </div>
      </main>
    );
  }

  // Resolve the user's POS from the authoritative gateway membership table.
  // Any staff role (owner, manager, cashier, chef, waiter, ...) resolves here, so
  // correctly-assigned staff never see "No POS Assigned".
  const memberships = await getTenantMemberships(userId);

  if (memberships.length === 0) {
    return <NoAssignedTenant />;
  }

  const active =
    memberships.find((m) => m.tenant_id === tenantId) ||
    memberships[0];

  // Repair stale/missing Clerk metadata + staff_roles metadata (idempotent, no duplicates).
  await repairAssignment(userId, active.tenant_id, active.role, active.permissions, {
    role_name: roleLabel(active.role),
    tenant_slug: active.tenant.slug,
    brand_id: active.tenant_id,
    assigned_at: active.metadata?.assigned_at || new Date().toISOString(),
    status: 'active',
  });

  const banner = fromAdmin ? (
    <div className="mb-4 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
      You do not have super admin access. Redirected to your dashboard.
    </div>
  ) : null;

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {banner}
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-1">Dashboard</h1>
        <p className="text-gray-500 mb-6">
          {roleLabel(active.role)} &mdash; {active.tenant.brand_name}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <PosCard brandName={active.tenant.brand_name} slug={active.tenant.slug} />
        </div>
      </div>
    </main>
  );
}
