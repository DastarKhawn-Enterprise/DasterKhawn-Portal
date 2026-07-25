import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EventPayload, EventCallback, UnsubscribeFn, ConnectionStatus, SupportedTable, supportsRealtime } from './event-types';
import { getTableCategory } from './event-types';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export class EventBus {
  private client: SupabaseClient | null = null;
  private channel: ReturnType<SupabaseClient['channel']> | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private subscribers = new Map<string, Set<EventCallback>>();
  private statusListeners = new Set<(status: ConnectionStatus) => void>();
  private status: ConnectionStatus = 'disconnected';
  private slug: string;
  private supabaseUrl: string;
  private supabaseAnonKey: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private subscribedTables = new Set<string>();
  private destroyed = false;

  constructor(slug: string, supabaseUrl: string, supabaseAnonKey: string) {
    this.slug = slug;
    this.supabaseUrl = supabaseUrl;
    this.supabaseAnonKey = supabaseAnonKey;
  }

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.statusListeners.forEach((fn) => fn(s));
  }

  private getClient() {
    if (!this.client) {
      this.client = createClient(this.supabaseUrl, this.supabaseAnonKey, {
        auth: { persistSession: false },
      });
    }
    return this.client;
  }

  private getBroadcastChannel() {
    if (!this.broadcastChannel) {
      try {
        this.broadcastChannel = new BroadcastChannel(`dastarkhawn:${this.slug}`);
        this.broadcastChannel.onmessage = (e) => {
          const payload = e.data as EventPayload;
          if (payload && payload.table && payload.event) {
            this.dispatch(payload.table, payload);
          }
        };
      } catch {
        // BroadcastChannel not available (e.g., non-browser environment)
      }
    }
    return this.broadcastChannel;
  }

  private broadcastToOtherTabs(payload: EventPayload) {
    try {
      this.getBroadcastChannel()?.postMessage(payload);
    } catch {
      // Ignore broadcast errors
    }
  }

  connect() {
    if (this.destroyed) return;
    this.setStatus('connecting');
    this.reconnectAttempts = 0;
    this.doConnect();
  }

  private doConnect() {
    if (this.destroyed) return;
    const client = this.getClient();
    const channelName = `dastarkhawn:${this.slug}`;

    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }

    this.channel = client.channel(channelName, {
      config: { broadcast: { self: true } },
    });

    this.channel
      .on('system', { event: 'system' }, (msg: any) => {
        if (msg?.type === 'connected') {
          this.setStatus('connected');
          this.reconnectAttempts = 0;
        }
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          this.setStatus('connected');
          this.reconnectAttempts = 0;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.setStatus('reconnecting');
          this.scheduleReconnect();
        } else if (status === 'CLOSED') {
          this.setStatus('disconnected');
        }
      });

    this.subscribedTables.forEach((table) => {
      this.addTableSubscription(table);
    });
  }

  private addTableSubscription(table: string) {
    if (!this.channel) return;
    if (!(SUPPORTED_TABLES as readonly string[]).includes(table as any)) return;

    this.channel.on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table },
      (raw: any) => {
        const payload: EventPayload = {
          table,
          event: raw.event_type as 'INSERT' | 'UPDATE' | 'DELETE',
          new: raw.new ?? null,
          old: raw.old ?? null,
          timestamp: Date.now(),
          slug: this.slug,
        };
        this.dispatch(table, payload);
        this.broadcastToOtherTabs(payload);
      },
    );
  }

  private dispatch(table: string, payload: EventPayload) {
    const tableListeners = this.subscribers.get(table);
    if (tableListeners) {
      tableListeners.forEach((fn) => {
        try { fn(payload); } catch { /* subscriber error */ }
      });
    }
    const wildcardListeners = this.subscribers.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach((fn) => {
        try { fn(payload); } catch { /* subscriber error */ }
      });
    }
  }

  private scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer) return;
    this.reconnectAttempts++;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts - 1),
      RECONNECT_MAX_MS,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, delay);
  }

  subscribe(table: string | '*', callback: EventCallback): UnsubscribeFn {
    const key = table;
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(callback);

    if (table !== '*' && !this.subscribedTables.has(table)) {
      this.subscribedTables.add(table);
      this.addTableSubscription(table);
    }

    return () => {
      const set = this.subscribers.get(key);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.subscribers.delete(key);
        }
      }
    };
  }

  publishManually(table: string, event: 'INSERT' | 'UPDATE' | 'DELETE', data?: Record<string, unknown>) {
    const payload: EventPayload = {
      table,
      event,
      new: data ?? null,
      old: null,
      timestamp: Date.now(),
      slug: this.slug,
    };
    this.dispatch(table, payload);
    this.broadcastToOtherTabs(payload);
  }

  onStatusChange(fn: (status: ConnectionStatus) => void): UnsubscribeFn {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => { this.statusListeners.delete(fn); };
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  disconnect() {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    this.subscribers.clear();
    this.statusListeners.clear();
    this.subscribedTables.clear();
    this.setStatus('disconnected');
  }
}

const busInstances = new Map<string, EventBus>();

export function getEventBus(slug: string, supabaseUrl: string, supabaseAnonKey: string): EventBus {
  let bus = busInstances.get(slug);
  if (!bus) {
    bus = new EventBus(slug, supabaseUrl, supabaseAnonKey);
    busInstances.set(slug, bus);
  }
  return bus;
}

export function destroyEventBus(slug: string) {
  const bus = busInstances.get(slug);
  if (bus) {
    bus.disconnect();
    busInstances.delete(slug);
  }
}

const SUPPORTED_TABLES = [
  'orders', 'order_items', 'payments',
  'menu_items', 'categories',
  'inventory_transactions', 'inventory_items',
  'customers', 'customer_loyalty',
  'staff', 'staff_roles',
  'tables', 'reservations',
  'sales_summary', 'expenses',
  'settings', 'business_settings',
  'kitchen_tickets', 'kitchen_items',
] as const;
