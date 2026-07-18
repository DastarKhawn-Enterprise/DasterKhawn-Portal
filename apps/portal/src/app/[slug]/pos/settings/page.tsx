'use client';

import { usePOS } from '../pos-context';
import { usePageGuard } from '../page-guard';
import SettingsView from '../SettingsView';

export default function SettingsPage() {
  const { theme, slug } = usePOS();
  if (usePageGuard()) return null;
  return <SettingsView slug={slug} theme={theme} />;
}
