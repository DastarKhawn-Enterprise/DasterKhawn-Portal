'use client';

import { usePOS } from '../pos-context';
import { usePageGuard } from '../page-guard';
import MenuManagementView from '../MenuManagementView';

export default function MenuPage() {
  const { theme, slug, currencySymbol } = usePOS();
  if (usePageGuard()) return null;
  return <MenuManagementView slug={slug} theme={theme} currencySymbol={currencySymbol} />;
}
