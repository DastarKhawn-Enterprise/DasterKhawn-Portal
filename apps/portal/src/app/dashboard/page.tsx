import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantById } from '@sat-sys/gateway-sdk';

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
      href={`/${slug}/pos`}
      className="block p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200"
    >
      <h2 className="text-xl font-semibold text-gray-800">{brandName}</h2>
      <p className="text-sm text-blue-600 mt-1">Open POS &rarr;</p>
    </Link>
  );
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
      <main className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-800 mb-1">Super Admin Dashboard</h1>
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

  if (role === 'owner' || role === 'staff') {
    const banner = fromAdmin ? (
      <div className="mb-4 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
        You do not have super admin access. Redirected to your dashboard.
      </div>
    ) : null;

    if (!tenantId) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
            {banner}
            <h1 className="text-2xl font-bold text-gray-800 mb-3">No POS Assigned</h1>
            <p className="text-gray-600">
              No POS has been assigned to your account yet. Contact your administrator to get set up.
            </p>
          </div>
        </div>
      );
    }

    const tenant = await getTenantById(tenantId);

    if (!tenant) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
            {banner}
            <h1 className="text-2xl font-bold text-gray-800 mb-3">POS Not Found</h1>
            <p className="text-gray-600">
              Your assigned POS tenant could not be found. Contact your administrator.
            </p>
          </div>
        </div>
      );
    }

    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          {banner}
          <h1 className="text-3xl font-bold text-gray-800 mb-1">Dashboard</h1>
          <p className="text-gray-500 mb-6">
            {role === 'owner' ? 'Owner' : 'Staff'} &mdash; {tenant.brand_name}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <PosCard brandName={tenant.brand_name} slug={tenant.slug} />
          </div>
        </div>
      </main>
    );
  }

  return <NoAssignedTenant />;
}
