'use client';

import { usePOS } from '../pos-context';
import { usePageGuard } from '../page-guard';
import DashboardView from '../DashboardView';

export default function DashboardPage() {
  const { supabaseUrl, supabaseAnonKey, theme, slug, currencySymbol } = usePOS();
  if (usePageGuard()) return null;
  return <DashboardView theme={theme} slug={slug} currencySymbol={currencySymbol} />;
}
