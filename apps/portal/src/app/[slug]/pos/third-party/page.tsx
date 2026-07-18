'use client';

import { usePOS } from '../pos-context';
import { usePageGuard } from '../page-guard';
import ThirdPartyView from '../ThirdPartyView';

export default function ThirdPartyPage() {
  if (usePageGuard()) return null;
  return <ThirdPartyView />;
}
