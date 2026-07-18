'use client';

import { usePOS } from '../pos-context';
import { usePageGuard } from '../page-guard';
import StaffManagementView from '../StaffManagementView';

export default function StaffPage() {
  const { slug } = usePOS();
  if (usePageGuard()) return null;
  return <StaffManagementView slug={slug} />;
}
