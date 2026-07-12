import { auth, currentUser, clerkClient } from '@clerk/nextjs/server';
import { getTenantBySlug, getStaffByEmail, updateStaffRoleUserId } from '@sat-sys/gateway-sdk';
import { notFound, redirect } from 'next/navigation';
import POSClient from './POSClient';

export const dynamic = 'force-dynamic';

function ServicePausedScreen({ brandName }: { brandName: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Service Paused</h1>
        <p className="text-gray-600">
          {brandName}&apos;s POS has been suspended. Contact support for details.
        </p>
      </div>
    </div>
  );
}

function AccessDeniedScreen({ brandName }: { brandName: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
        <h1 className="text-2xl font-bold text-red-700 mb-2">Access Denied</h1>
        <p className="text-gray-600">
          This POS ({brandName}) is not assigned to your account. Contact your administrator
          if you believe this is an error.
        </p>
      </div>
    </div>
  );
}

export default async function POSPage({
  params,
}: {
  params: { slug: string };
}) {
  const tenant = await getTenantBySlug(params.slug);

  if (!tenant) {
    notFound();
  }

  if (tenant.status === 'suspended') {
    return <ServicePausedScreen brandName={tenant.brand_name} />;
  }

  const { userId } = auth();
  if (!userId) redirect('/sign-in');

  const user = await currentUser();
  const metadata = (user?.publicMetadata ?? {}) as {
    tenant_id?: string;
    role?: string;
  };
  const tenantId = metadata.tenant_id;
  const role = metadata.role;

  const isAssigned = tenantId && tenantId === tenant.id;
  const isSuperAdmin = role === 'super_admin';

  // Auto-fix: Clerk invitation publicMetadata is NOT applied on signup.
  // If user has no tenant_id but was invited via staff_roles, apply metadata now.
  if (!isAssigned && !isSuperAdmin && user) {
    try {
      const email = user.emailAddresses?.[0]?.emailAddress;
      if (email) {
        const pending = await getStaffByEmail(email, tenant.id);
        if (pending) {
          const client = await clerkClient();
          await client.users.updateUser(userId, {
            publicMetadata: { tenant_id: tenant.id, role: pending.role, permissions: pending.permissions },
          });
          await updateStaffRoleUserId(email, userId, tenant.id);
          redirect(`/${params.slug}/pos`);
        }
      }
    } catch {
      // Graceful fallback — show AccessDenied below
    }
  }

  if (!isAssigned && !isSuperAdmin) {
    return <AccessDeniedScreen brandName={tenant.brand_name} />;
  }

  return (
    <POSClient
      supabaseUrl={tenant.supabase_url}
      supabaseAnonKey={tenant.supabase_anon_key}
      brandName={tenant.brand_name}
      theme={tenant.theme_config}
      slug={params.slug}
    />
  );
}
