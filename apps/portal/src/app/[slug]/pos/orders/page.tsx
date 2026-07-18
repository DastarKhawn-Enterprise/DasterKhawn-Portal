'use client';

import { usePOS } from '../pos-context';
import { usePageGuard } from '../page-guard';
import CurrentOrdersView from '../CurrentOrdersView';

export default function OrdersPage() {
  const { supabaseUrl, supabaseAnonKey, theme, slug, brandName } = usePOS();
  if (usePageGuard()) return null;
  return <CurrentOrdersView slug={slug} supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} theme={theme} brandName={brandName} />;
}
