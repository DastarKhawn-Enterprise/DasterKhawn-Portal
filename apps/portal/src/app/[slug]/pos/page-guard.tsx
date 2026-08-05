'use client';

import { usePathname, useRouter } from 'next/navigation';
import { usePOS } from './pos-context';
import { viewIdForPath } from '@/lib/sidebar-nav';

export function usePageGuard() {
  const { hiddenViews, slug } = usePOS();
  const pathname = usePathname();
  const router = useRouter();

  const posPath = '/' + pathname.split('/').slice(3).join('/');
  const viewId = viewIdForPath(posPath);

  if (viewId && hiddenViews.includes(viewId)) {
    router.replace(`/${slug}/pos/dashboard`);
    return true;
  }

  return false;
}
