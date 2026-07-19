'use client';

import { usePathname, useRouter } from 'next/navigation';
import { usePOS } from './pos-context';

const PATH_TO_VIEW: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/orders': 'current-orders',
  '/orders/new': 'orders-new',
  '/orders/completed': 'orders-completed',
  '/orders/cancelled': 'orders-cancelled',
  '/orders/draft': 'orders-draft',
  '/dine-in': 'dine-in',
  '/take-away': 'take-away',
  '/delivery': 'delivery',
  '/drive-thru': 'drive-thru',
  '/third-party': 'third-party',
  '/reservations': 'reservations',
  '/menu': 'menu',
  '/inventory': 'inventory',
  '/item-ledger': 'item-ledger',
  '/customers': 'customers',
  '/reports': 'reports',
  '/expenses': 'expenses',
  '/staff': 'staff',
  '/settings': 'settings',
};

export function usePageGuard() {
  const { hiddenViews, slug } = usePOS();
  const pathname = usePathname();
  const router = useRouter();

  const posPath = '/' + pathname.split('/').slice(3).join('/');
  const viewId = PATH_TO_VIEW[posPath];

  if (viewId && hiddenViews.includes(viewId)) {
    router.replace(`/${slug}/pos/dashboard`);
    return true;
  }

  return false;
}
