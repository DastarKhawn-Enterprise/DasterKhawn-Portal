'use client';

import { usePOS } from '../../pos-context';
import { usePageGuard } from '../../page-guard';
import CurrentOrdersView from '../../CurrentOrdersView';

export default function OrdersCompletedPage() {
  const { supabaseUrl, supabaseAnonKey, theme, slug, brandName } = usePOS();
  if (usePageGuard()) return null;
  return <CurrentOrdersView slug={slug} theme={theme} brandName={brandName} viewConfig={{ title: 'Completed Orders', orderType: null, showCustomerFields: false, statusFilter: 'completed', hideNewOrder: true }} />;
}
