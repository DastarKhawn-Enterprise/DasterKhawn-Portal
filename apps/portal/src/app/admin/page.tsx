import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getAllTenantsWithBilling } from '@sat-sys/gateway-sdk';
import AdminDashboard from './AdminDashboard';

export default async function AdminPage() {
  const { userId } = auth();
  if (!userId) redirect('/sign-in');

  const user = await currentUser();
  if (!user) redirect('/sign-in');

  const metadata = (user?.publicMetadata ?? {}) as { role?: string };
  if (metadata.role !== 'super_admin') {
    redirect('/dashboard?from=admin');
  }

  const tenants = await getAllTenantsWithBilling();

  return <AdminDashboard tenants={tenants} />;
}
