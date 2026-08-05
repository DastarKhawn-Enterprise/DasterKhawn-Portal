'use client';

import { useEffect, useRef } from 'react';
import { useEvent } from './use-event';
import { supa } from './supa-query';
import { resolveNotificationPrefs, playNotificationSound, type NotificationPrefs } from './notification-sound';

/**
 * Mounted at the POSShell level (below EventProvider). Subscribes to the
 * tenant event bus exactly once and plays the new-order alert whenever an
 * `orders` row is INSERTed. Notification prefs are loaded from the settings
 * row and refreshed whenever settings change.
 *
 * Only `orders` INSERT events trigger a sound — status changes
 * (prepare/ready/complete/cancel) are UPDATEs and are ignored. Because the
 * event bus is keyed per tenant slug, only users viewing the same tenant hear
 * the alert.
 */
export default function NotificationSoundProvider({ slug }: { slug: string }) {
  const prefsRef = useRef<NotificationPrefs>({ soundEnabled: true, volume: 70, sound: 'ding' });
  const fetchedRef = useRef(false);

  const loadPrefs = () => {
    supa(slug, { table: 'settings', select: '*', limit: 1, single: true })
      .then((r) => {
        if (r.ok && r.data) prefsRef.current = resolveNotificationPrefs(r.data as unknown as Record<string, unknown>);
      })
      .catch(() => {});
  };

  // Load notification prefs from the tenant settings row once.
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    loadPrefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Keep pref changes made in Settings in sync (the settings view publishes
  // `settings / UPDATE` after saving).
  useEvent('settings', () => {
    loadPrefs();
  });

  useEvent('orders', (payload) => {
    if (payload.event !== 'INSERT') return;
    const row = (payload.new ?? null) as Record<string, unknown> | null;
    // Only newly-created orders (not status updates) should alert.
    if (!row || row.order_number == null) return;
    playNotificationSound(prefsRef.current);
  });

  return null;
}