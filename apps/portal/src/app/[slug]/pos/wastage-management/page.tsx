'use client';

import { usePOS } from '../pos-context';
import { usePageGuard } from '../page-guard';
import WastageManagementView from '../WastageManagementView';

export default function WastageManagementPage() {
  const { theme, slug, currencySymbol } = usePOS();
  if (usePageGuard()) return null;
  return <WastageManagementView slug={slug} theme={theme} currencySymbol={currencySymbol} />;
}