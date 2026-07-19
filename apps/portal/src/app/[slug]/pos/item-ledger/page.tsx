'use client';

import { usePOS } from '../pos-context';
import { usePageGuard } from '../page-guard';
import ItemLedgerView from '../ItemLedgerView';

export default function ItemLedgerPage() {
  const { theme, slug, currencySymbol } = usePOS();
  if (usePageGuard()) return null;
  return <ItemLedgerView slug={slug} theme={theme} currencySymbol={currencySymbol} />;
}
