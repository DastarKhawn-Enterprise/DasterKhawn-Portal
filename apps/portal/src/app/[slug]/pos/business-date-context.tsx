'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type BusinessDateMode = 'today' | 'yesterday' | 'last7' | 'last30' | 'custom';

export interface BusinessDateValue {
  mode: BusinessDateMode;
  dateKey: string;
  start: string;
  end: string;
  startDate: string;
  endDate: string;
  isToday: boolean;
  label: string;
  display: string;
  setMode: (m: BusinessDateMode) => void;
  setCustomDate: (d: string) => void;
}

const STORAGE_KEY = 'satpos.businessDate';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(key: string, days: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function startOfDay(key: string): Date {
  return parseDateKey(key);
}

export function endOfDay(key: string): Date {
  const d = parseDateKey(key);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function formatDisplay(key: string): string {
  const d = parseDateKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const MODES: BusinessDateMode[] = ['today', 'yesterday', 'last7', 'last30', 'custom'];

const MODE_LABELS: Record<BusinessDateMode, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 Days',
  last30: 'Last 30 Days',
  custom: 'Custom',
};

export function computeRange(mode: BusinessDateMode, dateKey: string): { start: string; end: string } {
  const now = new Date();
  switch (mode) {
    case 'today':
      return { start: startOfDay(dateKey).toISOString(), end: endOfDay(dateKey).toISOString() };
    case 'yesterday':
      return { start: startOfDay(dateKey).toISOString(), end: endOfDay(dateKey).toISOString() };
    case 'last7': {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      return { start: s.toISOString(), end: endOfDay(todayKey()).toISOString() };
    }
    case 'last30': {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      return { start: s.toISOString(), end: endOfDay(todayKey()).toISOString() };
    }
    case 'custom':
      return { start: startOfDay(dateKey).toISOString(), end: endOfDay(dateKey).toISOString() };
  }
}

export function computeDateRange(mode: BusinessDateMode, dateKey: string): { startDate: string; endDate: string } {
  const now = new Date();
  switch (mode) {
    case 'today':
      return { startDate: dateKey, endDate: todayKey() };
    case 'yesterday':
      return { startDate: dateKey, endDate: dateKey };
    case 'last7':
      return { startDate: toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), endDate: todayKey() };
    case 'last30':
      return { startDate: toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)), endDate: todayKey() };
    case 'custom':
      return { startDate: dateKey, endDate: dateKey };
  }
}

export function previousRange(start: string, end: string): { start: string; end: string } {
  const dur = new Date(end).getTime() - new Date(start).getTime();
  const prevEnd = new Date(new Date(start).getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - dur);
  return { start: prevStart.toISOString(), end: prevEnd.toISOString() };
}

interface PersistedState {
  mode: BusinessDateMode;
  dateKey: string;
}

function loadInitial(): PersistedState {
  const today = todayKey();
  const defaults: PersistedState = { mode: 'today', dateKey: today };
  if (typeof window === 'undefined') return defaults;
  try {
    const url = new URL(window.location.href);
    const urlDate = url.searchParams.get('date');
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
      if (urlDate === today) return { mode: 'today', dateKey: urlDate };
      if (urlDate === addDays(today, -1)) return { mode: 'yesterday', dateKey: urlDate };
      return { mode: 'custom', dateKey: urlDate };
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dateKey)) {
        const mode: BusinessDateMode = MODES.includes(parsed.mode) ? parsed.mode : 'custom';
        if (mode === 'today' || mode === 'yesterday') {
          const expected = mode === 'today' ? today : addDays(today, -1);
          return { mode, dateKey: expected };
        }
        if (mode === 'last7' || mode === 'last30') return { mode, dateKey: today };
        return { mode, dateKey: parsed.dateKey };
      }
    }
  } catch {}
  return defaults;
}

const BusinessDateContext = createContext<BusinessDateValue | null>(null);

export function useBusinessDate() {
  const ctx = useContext(BusinessDateContext);
  if (!ctx) throw new Error('useBusinessDate must be used within BusinessDateProvider');
  return ctx;
}

export function BusinessDateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadInitial);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('date', state.dateKey);
      window.history.replaceState(null, '', url.toString());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const setMode = useCallback((mode: BusinessDateMode) => {
    setState((prev) => {
      if (mode === 'custom') return { mode, dateKey: prev.dateKey };
      const today = todayKey();
      if (mode === 'today') return { mode, dateKey: today };
      if (mode === 'yesterday') return { mode, dateKey: addDays(today, -1) };
      return { mode, dateKey: today };
    });
  }, []);

  const setCustomDate = useCallback((d: string) => {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    setState({ mode: 'custom', dateKey: d });
  }, []);

  const value = useMemo<BusinessDateValue>(() => {
    const { start, end } = computeRange(state.mode, state.dateKey);
    const { startDate, endDate } = computeDateRange(state.mode, state.dateKey);
    return {
      mode: state.mode,
      dateKey: state.dateKey,
      start,
      end,
      startDate,
      endDate,
      isToday: state.mode === 'today',
      label: MODE_LABELS[state.mode],
      display: formatDisplay(state.dateKey),
      setMode,
      setCustomDate,
    };
  }, [state, setMode, setCustomDate]);

  return <BusinessDateContext.Provider value={value}>{children}</BusinessDateContext.Provider>;
}
