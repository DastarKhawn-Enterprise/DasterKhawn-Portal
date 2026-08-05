'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type BusinessDateMode =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'last7'
  | 'last30'
  | 'last90'
  | 'custom'
  | 'range';

export interface BusinessDateValue {
  mode: BusinessDateMode;
  dateKey: string;
  start: string;
  end: string;
  startDate: string;
  endDate: string;
  /** Custom range start/end for 'range' mode (date-key form). */
  rangeStart: string;
  rangeEnd: string;
  isToday: boolean;
  label: string;
  display: string;
  setMode: (m: BusinessDateMode) => void;
  setCustomDate: (d: string) => void;
  setRange: (start: string, end: string) => void;
}

const STORAGE_PREFIX = 'satpos.businessDate';

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

export function addMonths(key: string, months: number): string {
  const d = parseDateKey(key);
  d.setMonth(d.getMonth() + months);
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

const ALL_MODES: BusinessDateMode[] = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last7', 'last30', 'last90', 'custom', 'range'];

const MODE_LABELS: Record<BusinessDateMode, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This Week',
  last_week: 'Last Week',
  this_month: 'This Month',
  last_month: 'Last Month',
  last7: 'Last 7 Days',
  last30: 'Last 30 Days',
  last90: 'Last 90 Days',
  custom: 'Custom',
  range: 'Custom Range',
};

/** Monday-start week helper. */
function weekStartKey(today: string): string {
  const d = parseDateKey(today);
  const day = d.getDay(); // 0=Sun
  const delta = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - delta);
  return toDateKey(d);
}

/** Returns [startKey, endKey] for a mode, using today as the anchor for rolling presets. */
function computeKeyRange(mode: BusinessDateMode, dateKey: string, rangeStart?: string, rangeEnd?: string): [string, string] {
  const today = todayKey();
  switch (mode) {
    case 'today':
      return [today, today];
    case 'yesterday':
      return [addDays(today, -1), addDays(today, -1)];
    case 'this_week': {
      const ws = weekStartKey(today);
      return [ws, today];
    }
    case 'last_week': {
      const ws = weekStartKey(today);
      const lws = addDays(ws, -7);
      return [lws, addDays(ws, -1)];
    }
    case 'this_month': {
      const d = parseDateKey(today);
      return [toDateKey(new Date(d.getFullYear(), d.getMonth(), 1)), today];
    }
    case 'last_month': {
      const first = new Date(parseDateKey(today).getFullYear(), parseDateKey(today).getMonth(), 1);
      const lmStart = new Date(first.getFullYear(), first.getMonth() - 1, 1);
      const lmEnd = new Date(first.getFullYear(), first.getMonth(), 0);
      return [toDateKey(lmStart), toDateKey(lmEnd)];
    }
    case 'last7':
      return [addDays(today, -6), today];
    case 'last30':
      return [addDays(today, -29), today];
    case 'last90':
      return [addDays(today, -89), today];
    case 'range':
      return [rangeStart || dateKey, rangeEnd || dateKey];
    case 'custom':
      return [dateKey, dateKey];
  }
}

export function computeRange(mode: BusinessDateMode, dateKey: string, rangeStart?: string, rangeEnd?: string): { start: string; end: string } {
  const [s, e] = computeKeyRange(mode, dateKey, rangeStart, rangeEnd);
  return { start: startOfDay(s).toISOString(), end: endOfDay(e).toISOString() };
}

export function computeDateRange(mode: BusinessDateMode, dateKey: string, rangeStart?: string, rangeEnd?: string): { startDate: string; endDate: string } {
  const [s, e] = computeKeyRange(mode, dateKey, rangeStart, rangeEnd);
  return { startDate: s, endDate: e };
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
  rangeStart?: string;
  rangeEnd?: string;
}

function defaultState(): PersistedState {
  return { mode: 'today', dateKey: todayKey() };
}

function storageKey(pageKey: string): string {
  return `${STORAGE_PREFIX}.${pageKey}`;
}

function loadInitial(pageKey: string): PersistedState {
  const defaults = defaultState();
  if (typeof window === 'undefined') return defaults;
  try {
    const url = new URL(window.location.href);
    const urlDate = url.searchParams.get('date');
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
      const today = todayKey();
      if (urlDate === today) return { mode: 'today', dateKey: urlDate };
      if (urlDate === addDays(today, -1)) return { mode: 'yesterday', dateKey: urlDate };
      return { mode: 'custom', dateKey: urlDate };
    }
    const raw = localStorage.getItem(storageKey(pageKey));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dateKey)) {
        const mode: BusinessDateMode = ALL_MODES.includes(parsed.mode) ? parsed.mode : 'custom';
        return {
          mode,
          dateKey: parsed.dateKey,
          rangeStart: typeof parsed.rangeStart === 'string' ? parsed.rangeStart : undefined,
          rangeEnd: typeof parsed.rangeEnd === 'string' ? parsed.rangeEnd : undefined,
        };
      }
    }
  } catch {}
  return defaults;
}

interface PageDateController {
  stateMap: Record<string, PersistedState>;
  setMode: (pageKey: string, mode: BusinessDateMode) => void;
  setCustomDate: (pageKey: string, d: string) => void;
  setRange: (pageKey: string, start: string, end: string) => void;
}

const PageDateContext = createContext<PageDateController | null>(null);

export function usePageDate(pageKey: string): BusinessDateValue {
  const ctx = useContext(PageDateContext);
  if (!ctx) throw new Error('usePageDate must be used within BusinessDateProvider');
  // Stable per-page localStorage value used until the user changes it via a setter.
  const fallback = useMemo(() => loadInitial(pageKey), [pageKey]);
  const state = ctx.stateMap[pageKey] ?? fallback;

  return useMemo(() => {
    const { mode, dateKey } = state;
    const { start, end } = computeRange(mode, dateKey, state.rangeStart, state.rangeEnd);
    const { startDate, endDate } = computeDateRange(mode, dateKey, state.rangeStart, state.rangeEnd);
    const isToday = mode === 'today';
    let display: string;
    if (mode === 'range' && state.rangeStart && state.rangeEnd) {
      display = `${formatDisplay(state.rangeStart)} – ${formatDisplay(state.rangeEnd)}`;
    } else {
      display = formatDisplay(startDate);
    }
    return {
      mode,
      dateKey,
      start,
      end,
      startDate,
      endDate,
      rangeStart: state.rangeStart || startDate,
      rangeEnd: state.rangeEnd || endDate,
      isToday,
      label: MODE_LABELS[mode],
      display,
      setMode: (m) => ctx.setMode(pageKey, m),
      setCustomDate: (d) => ctx.setCustomDate(pageKey, d),
      setRange: (s, e) => ctx.setRange(pageKey, s, e),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, pageKey, ctx.setMode, ctx.setCustomDate, ctx.setRange]);
}

/** Back-compat default page helper used by the header picker & pages. */
export function useBusinessDate(pageKey = 'default'): BusinessDateValue {
  return usePageDate(pageKey);
}

export function BusinessDateProvider({ children }: { children: React.ReactNode }) {
  const [stateMap, setStateMap] = useState<Record<string, PersistedState>>({});

  const persist = useCallback((pageKey: string, state: PersistedState) => {
    try {
      localStorage.setItem(storageKey(pageKey), JSON.stringify(state));
    } catch {}
  }, []);

  const setMode = useCallback((pageKey: string, mode: BusinessDateMode) => {
    const today = todayKey();
    let next: PersistedState;
    if (mode === 'custom') {
      next = { mode, dateKey: today };
    } else if (mode === 'range') {
      // Entering range mode keeps an existing single-day range until setRange is used.
      next = { mode, dateKey: today, rangeStart: today, rangeEnd: today };
    } else {
      const [startDate, endDate] = computeKeyRange(mode, today, today, today);
      next = { mode, dateKey: mode === 'yesterday' ? addDays(today, -1) : startDate };
    }
    setStateMap((prev) => ({ ...prev, [pageKey]: next }));
    persist(pageKey, next);
  }, [persist]);

  const setCustomDate = useCallback((pageKey: string, d: string) => {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    const next: PersistedState = { mode: 'custom', dateKey: d };
    setStateMap((prev) => ({ ...prev, [pageKey]: next }));
    persist(pageKey, next);
  }, [persist]);

  const setRange = useCallback((pageKey: string, start: string, end: string) => {
    if (!start || !end) return;
    const next: PersistedState = { mode: 'range', dateKey: start, rangeStart: start, rangeEnd: end };
    setStateMap((prev) => ({ ...prev, [pageKey]: next }));
    persist(pageKey, next);
  }, [persist]);

  const value = useMemo<PageDateController>(
    () => ({ stateMap, setMode, setCustomDate, setRange }),
    [stateMap, setMode, setCustomDate, setRange],
  );

  return <PageDateContext.Provider value={value}>{children}</PageDateContext.Provider>;
}