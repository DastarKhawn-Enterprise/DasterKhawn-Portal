import { auth, currentUser } from '@clerk/nextjs/server';
import { getTenantBySlug, getTenantEnabledModules } from '@sat-sys/gateway-sdk';
import { notFound, redirect } from 'next/navigation';
import POSShell from './POSShell';

export const dynamic = 'force-dynamic';

function ServicePausedScreen({ brandName }: { brandName: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
      <div className="card p-8 max-w-md text-center anim-scale">
        <div className="w-14 h-14 mx-auto mb-4 rounded-[var(--radius-card)] bg-[var(--warning-soft)] flex items-center justify-center">
          <svg className="w-7 h-7 text-[var(--warning)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-[var(--text)] mb-2">Service Paused</h1>
        <p className="text-sm text-[var(--text-muted)]">
          {brandName}&apos;s POS has been suspended. Contact support for details.
        </p>
      </div>
    </div>
  );
}

function AccessDeniedScreen({ brandName }: { brandName: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
      <div className="card p-8 max-w-md text-center anim-scale">
        <div className="w-14 h-14 mx-auto mb-4 rounded-[var(--radius-card)] bg-[var(--danger-soft)] flex items-center justify-center">
          <svg className="w-7 h-7 text-[var(--danger)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-[var(--danger)] mb-2">Access Denied</h1>
        <p className="text-sm text-[var(--text-muted)]">
          This POS ({brandName}) is not assigned to your account. Contact your administrator
          if you believe this is an error.
        </p>
      </div>
    </div>
  );
}

export default async function POSLayout({
  params,
  children,
}: {
  params: { slug: string };
  children: React.ReactNode;
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

  const enabledModules = await getTenantEnabledModules(tenant.id);

  return (
    <POSShell
      supabaseUrl={tenant.supabase_url}
      supabaseAnonKey={tenant.supabase_anon_key}
      brandName={tenant.brand_name}
      theme={tenant.theme_config}
      slug={params.slug}
      enabledModules={enabledModules}
    >
      {children}
    </POSShell>
  );
}
