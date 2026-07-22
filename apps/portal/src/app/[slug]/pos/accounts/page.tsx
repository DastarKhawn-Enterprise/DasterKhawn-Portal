'use client';

import { usePOS } from '../pos-context';
import { usePageGuard } from '../page-guard';
import AccountsView from '../AccountsView';

export default function AccountsPage() {
  const { supabaseUrl, supabaseAnonKey, theme, slug, brandName, currencySymbol } = usePOS();
  if (usePageGuard()) return null;
  return <AccountsView slug={slug} theme={theme} currencySymbol={currencySymbol} />;
}
