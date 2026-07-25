'use client';

import { usePOS } from '../pos-context';
import { usePageGuard } from '../page-guard';
import DineInView from '../DineInView';

export default function DineInPage() {
  const { supabaseUrl, supabaseAnonKey, theme, slug, brandName } = usePOS();
  if (usePageGuard()) return null;
  return <DineInView slug={slug} theme={theme} brandName={brandName} />;
}
