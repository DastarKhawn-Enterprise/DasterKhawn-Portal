'use client';

import { useEffect } from 'react';
import { supa } from '@/app/[slug]/pos/supa-query';
import { cacheMenuItems, cacheSettings } from '@/lib/offline-db';
import useOnlineStatus from './useOnlineStatus';

export default function useOfflineSync(slug: string, authReady: boolean): void {
  const online = useOnlineStatus();

  useEffect(() => {
    if (!authReady || !online) return;

    let cancelled = false;

    (async () => {
      try {
        const [menuRes, settingsRes] = await Promise.all([
          supa(slug, {
            table: 'menu_items',
            select: 'id, name, description, price, category, available',
            order: 'name',
            limit: 500,
          }),
          supa(slug, {
            table: 'settings',
            select: 'tax_enabled, tax_rate, currency_symbol, receipt_footer_text',
            limit: 1,
          }),
        ]);

        if (cancelled) return;

        if (menuRes.ok && menuRes.data) {
          const items = (menuRes.data as any[]).map((item) => ({ slug, ...item }));
          await cacheMenuItems(slug, items);
        }

        if (settingsRes.ok && settingsRes.data?.[0]) {
          const s = settingsRes.data[0];
          await cacheSettings(slug, {
            slug,
            tax_enabled: s.tax_enabled,
            tax_rate: Number(s.tax_rate),
            currency_symbol: s.currency_symbol,
            receipt_footer_text: s.receipt_footer_text,
            enabled_modules: s.enabled_modules,
          });
        }
      } catch {
        // background sync failure is non-critical
      }
    })();

    return () => { cancelled = true; };
  }, [slug, authReady, online]);
}
