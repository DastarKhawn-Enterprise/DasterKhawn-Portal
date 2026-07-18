'use client';

import { usePOS } from '../pos-context';
import { usePageGuard } from '../page-guard';
import InventoryView from '../InventoryView';

export default function InventoryPage() {
  const { theme, slug } = usePOS();
  if (usePageGuard()) return null;
  return <InventoryView slug={slug} theme={theme} />;
}
