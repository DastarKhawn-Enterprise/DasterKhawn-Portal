'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { usePageDate, todayKey, formatDisplay } from './business-date-context';
import type { BusinessDateMode } from './business-date-context';
import { usePOS } from './pos-context';

/** Route (POS-relative) → per-page date key. Keeps each page's filter independent. */
export const POS_PATH_TO_PAGE_KEY: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/reports': 'reports',
  '/accounts': 'accounts',
  '/expenses': 'expenses',
  '/customers': 'customers',
  '/item-ledger': 'item-ledger',
  '/inventory': 'inventory',
  '/wastage-management': 'wastage-management',
  '/reservations': 'reservations',
  '/menu': 'menu',
  '/settings': 'settings',
  '/staff': 'staff',
};

export function pageKeyForPath(posPath: string): string {
  if (POS_PATH_TO_PAGE_KEY[posPath]) return POS_PATH_TO_PAGE_KEY[posPath];
  if (posPath === '/' || posPath === '') return 'dashboard';
  if (posPath.startsWith('/orders')) return 'orders';
  return 'default';
}

const PRESETS: { mode: BusinessDateMode; label: string }[] = [
  { mode: 'today', label: 'Today' },
  { mode: 'yesterday', label: 'Yesterday' },
  { mode: 'this_week', label: 'This Week' },
  { mode: 'last_week', label: 'Last Week' },
  { mode: 'this_month', label: 'This Month' },
  { mode: 'last_month', label: 'Last Month' },
  { mode: 'last7', label: 'Last 7 Days' },
  { mode: 'last30', label: 'Last 30 Days' },
  { mode: 'last90', label: 'Last 90 Days' },
];

export default function BusinessDatePicker() {
  const pathname = usePathname();
  const posPath = '/' + pathname.split('/').slice(3).join('/');
  const pageKey = pageKeyForPath(posPath);

  const bd = usePageDate(pageKey);
  const { theme } = usePOS();
  const [open, setOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState(bd.rangeStart || todayKey());
  const [rangeEnd, setRangeEnd] = useState(bd.rangeEnd || todayKey());
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (m: BusinessDateMode) => {
    bd.setMode(m);
    setRangeStart(bd.rangeStart || todayKey());
    setRangeEnd(bd.rangeEnd || todayKey());
    setOpen(false);
  };

  const applyRange = () => {
    if (!rangeStart || !rangeEnd) return;
    const s = rangeStart <= rangeEnd ? rangeStart : rangeStart;
    const e = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
    bd.setRange(s, e);
    setOpen(false);
  };

  const body = (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.mode}
            onClick={() => pick(p.mode)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${bd.mode === p.mode ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            style={bd.mode === p.mode ? { backgroundColor: theme.primaryColor } : {}}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => { setRangeStart(bd.rangeStart || todayKey()); setRangeEnd(bd.rangeEnd || todayKey()); }}
          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${bd.mode === 'range' ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          style={bd.mode === 'range' ? { backgroundColor: theme.primaryColor } : {}}
        >
          Custom Range
        </button>
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">Single Date</label>
        <input
          type="date"
          value={bd.mode === 'range' ? bd.rangeStart : bd.dateKey}
          max={todayKey()}
          onChange={(e) => {
            if (e.target.value) {
              bd.setCustomDate(e.target.value);
              setOpen(false);
            }
          }}
          className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white"
        />
        <label className="block text-[10px] uppercase tracking-wider text-gray-400 mt-3 mb-1">Date Range</label>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={rangeStart}
            max={todayKey()}
            onChange={(e) => e.target.value && setRangeStart(e.target.value)}
            className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white"
          />
          <span className="text-gray-400 text-xs">→</span>
          <input
            type="date"
            value={rangeEnd}
            max={todayKey()}
            onChange={(e) => e.target.value && setRangeEnd(e.target.value)}
            className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white"
          />
        </div>
        <button
          onClick={applyRange}
          className="mt-2 w-full px-3 py-2 rounded-lg text-xs font-semibold text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: theme.primaryColor }}
        >
          Apply Range
        </button>
      </div>
      {(bd.mode === 'custom' || bd.mode === 'range') && (
        <p className="mt-2 text-[10px] text-gray-400">Viewing {bd.display}</p>
      )}
    </>
  );

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-white text-xs font-medium transition-colors hover:bg-gray-50"
        style={{ borderColor: theme.primaryColor, color: theme.secondaryColor }}
        title={bd.label}
      >
        <span>📅</span>
        <span className="hidden sm:inline whitespace-nowrap">{bd.isToday ? 'Today' : bd.display}</span>
        <span className="sm:hidden whitespace-nowrap">{bd.isToday ? 'Today' : bd.dateKey.slice(5)}</span>
        <span className={`text-[8px] transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <>
          <div className="hidden md:block absolute right-0 top-full mt-2 z-50 w-72 bg-white rounded-xl border border-gray-200 shadow-lg p-4">
            {body}
          </div>
          <div
            className="md:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/40"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full bg-white rounded-t-2xl p-4 pb-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800">Select Business Date</h3>
                <button onClick={() => setOpen(false)} className="text-gray-400 text-xl">✕</button>
              </div>
              {body}
            </div>
          </div>
        </>
      )}
    </div>
  );
}