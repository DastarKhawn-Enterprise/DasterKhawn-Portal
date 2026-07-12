import { auth, currentUser } from '@clerk/nextjs/server';
import { getTenantBySlug } from '@sat-sys/gateway-sdk';
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
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { tab?: string };
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

  if (!isAssigned && !isSuperAdmin) {
    return <AccessDeniedScreen brandName={tenant.brand_name} />;
  }

  return (
    <POSClient
      supabaseUrl={tenant.supabase_url}
      supabaseAnonKey={tenant.supabase_anon_key}
      brandName={tenant.brand_name}
      theme={tenant.theme_config}
      initialTab={searchParams?.tab ?? 'order'}
    />
  );
}
