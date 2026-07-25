'use client';

import { usePOS } from '../pos-context';
import { usePageGuard } from '../page-guard';
import KDSView from '../KDSView';

export default function OrdersPage() {
  const { theme, slug, brandName } = usePOS();
  if (usePageGuard()) return null;
  return <KDSView slug={slug} theme={theme} brandName={brandName} />;
}
