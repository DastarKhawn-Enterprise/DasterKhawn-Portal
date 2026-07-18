'use client';

import { usePOS } from '../pos-context';
import { usePageGuard } from '../page-guard';
import ReservationsView from '../ReservationsView';

export default function ReservationsPage() {
  const { theme, slug } = usePOS();
  if (usePageGuard()) return null;
  return <ReservationsView slug={slug} theme={theme} />;
}
