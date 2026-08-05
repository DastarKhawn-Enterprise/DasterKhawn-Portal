'use client';

import { usePOS } from '../pos-context';
import { usePageGuard } from '../page-guard';
import CustomersView from '../CustomersView';

export default function CustomersPage() {
  const { theme, slug, currencySymbol } = usePOS();
  if (usePageGuard()) return null;
  return <CustomersView
    slug={slug}
    theme={theme}
    loyaltyPointsEnabled={true}
    currencySymbol={currencySymbol}
  />;
}
