'use client';

import { usePOS } from '../pos-context';
import { usePageGuard } from '../page-guard';
import ExpensesView from '../ExpensesView';

export default function ExpensesPage() {
  const { theme, slug, currencySymbol } = usePOS();
  if (usePageGuard()) return null;
  return <ExpensesView slug={slug} theme={theme} currencySymbol={currencySymbol} />;
}
