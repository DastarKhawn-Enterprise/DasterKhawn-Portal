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
  const credsRef = useRef({ slug, supabaseUrl, supabaseAnonKey });
  credsRef.current = { slug, supabaseUrl, supabaseAnonKey };

  useEffect(() => {
    // Attach a status listener to the shared bus (idempotent connect is handled by
    // getEventBus + subscribe, so the bus is never torn down/rebuilt here).
    const { slug: s, supabaseUrl: u, supabaseAnonKey: k } = credsRef.current;
    const bus = getEventBus(s, u, k);
    bus.connect();
    const unsubStatus = bus.onStatusChange(setStatus);
    return () => unsubStatus();
  }, [slug]);

  // Resolve the bus directly from creds on every call so subscriptions are never
  // dropped during the provider's own effect ordering (child effects run first).
  const resolveBus = useCallback(() => {
    const { slug: s, supabaseUrl: u, supabaseAnonKey: k } = credsRef.current;
    return getEventBus(s, u, k);
  }, []);

  const subscribe = useCallback((table: string | '*', callback: EventCallback): UnsubscribeFn => {
    const bus = resolveBus();
    bus.connect();
    return bus.subscribe(table, callback);
  }, [resolveBus]);

  const publish = useCallback((table: string, event: 'INSERT' | 'UPDATE' | 'DELETE', data?: Record<string, unknown>) => {
    resolveBus().publishManually(table, event, data);
  }, [resolveBus]);

  return (
    <EventContext.Provider value={{ subscribe, publish, status, slug }}>
      {children}
    </EventContext.Provider>
  );
}
