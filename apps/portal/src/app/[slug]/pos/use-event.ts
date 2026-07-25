'use client';
import { useEffect, useCallback, useRef } from 'react';
import type { EventPayload, EventCallback, UnsubscribeFn, ConnectionStatus, SupportedTable } from './event-types';
import { getTableCategory } from './event-types';
import { useEventContext } from './event-context';

export function useEvent(table: string | '*', callback: EventCallback) {
  const { subscribe } = useEventContext();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const unsub = subscribe(table, (payload) => {
      callbackRef.current(payload);
    });
    return unsub;
  }, [table, subscribe]);
}

export function useEventByCategory(category: string, callback: EventCallback) {
  const { subscribe } = useEventContext();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const unsub = subscribe('*', (payload) => {
      const cat = getTableCategory(payload.table as any);
      if (cat === category) {
        callbackRef.current(payload);
      }
    });
    return unsub;
  }, [category, subscribe]);
}

export function usePublish() {
  const { publish } = useEventContext();
  return publish;
}

export function useRealtimeStatus(): ConnectionStatus {
  const { status } = useEventContext();
  return status;
}
