'use client';

import { usePOS } from '../pos-context';
import { usePageGuard } from '../page-guard';
import CurrentOrdersView from '../CurrentOrdersView';

export default function DriveThruPage() {
  const { supabaseUrl, supabaseAnonKey, theme, slug, brandName } = usePOS();
  if (usePageGuard()) return null;
  return <CurrentOrdersView slug={slug} theme={theme} brandName={brandName} viewConfig={{ title: 'Drive Thru', orderType: 'drive_thru', showCustomerFields: true }} />;
}
