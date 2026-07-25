'use client';

import { usePOS } from '../../pos-context';
import { usePageGuard } from '../../page-guard';
import NewOrderView from '../../NewOrderView';

export default function OrdersNewPage() {
  const { supabaseUrl, supabaseAnonKey, theme, slug, brandName } = usePOS();
  if (usePageGuard()) return null;
  return <NewOrderView slug={slug} supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} theme={theme} brandName={brandName} />;
}
