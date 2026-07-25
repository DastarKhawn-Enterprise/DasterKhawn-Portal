'use client';
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { EventPayload, EventCallback, UnsubscribeFn, ConnectionStatus } from './event-types';
import { getEventBus, destroyEventBus } from './event-bus';

export interface EventContextValue {
  subscribe: (table: string | '*', callback: EventCallback) => UnsubscribeFn;
  publish: (table: string, event: 'INSERT' | 'UPDATE' | 'DELETE', data?: Record<string, unknown>) => void;
  status: ConnectionStatus;
  slug: string;
}

const EventContext = createContext<EventContextValue | null>(null);

export function useEventContext() {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error('useEventContext must be used within EventProvider');
  return ctx;
}

export function EventProvider({
  slug,
  supabaseUrl,
  supabaseAnonKey,
  children,
}: {
  slug: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const busRef = useRef<ReturnType<typeof getEventBus> | null>(null);

  useEffect(() => {
    const bus = getEventBus(slug, supabaseUrl, supabaseAnonKey);
    busRef.current = bus;
    const unsubStatus = bus.onStatusChange(setStatus);
    bus.connect();

    return () => {
      unsubStatus();
      destroyEventBus(slug);
    };
  }, [slug, supabaseUrl, supabaseAnonKey]);

  const subscribe = useCallback((table: string | '*', callback: EventCallback): UnsubscribeFn => {
    const bus = busRef.current;
    if (!bus) return () => {};
    return bus.subscribe(table, callback);
  }, []);

  const publish = useCallback((table: string, event: 'INSERT' | 'UPDATE' | 'DELETE', data?: Record<string, unknown>) => {
    busRef.current?.publishManually(table, event, data);
  }, []);

  return (
    <EventContext.Provider value={{ subscribe, publish, status, slug }}>
      {children}
    </EventContext.Provider>
  );
}
