'use client';

import { usePOS } from '../pos-context';
import { usePageGuard } from '../page-guard';
import ReportsView from '../ReportsView';

export default function ReportsPage() {
  const { theme, slug, currencySymbol } = usePOS();
  if (usePageGuard()) return null;
  return <ReportsView slug={slug} theme={theme} currencySymbol={currencySymbol} />;
}
