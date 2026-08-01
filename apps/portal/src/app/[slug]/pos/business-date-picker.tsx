'use client';

import { useEffect, useRef, useState } from 'react';
import { useBusinessDate, todayKey, formatDisplay } from './business-date-context';
import type { BusinessDateMode } from './business-date-context';
import { usePOS } from './pos-context';

const PRESETS: { mode: BusinessDateMode; label: string }[] = [
  { mode: 'today', label: 'Today' },
  { mode: 'yesterday', label: 'Yesterday' },
  { mode: 'last7', label: 'Last 7 Days' },
  { mode: 'last30', label: 'Last 30 Days' },
];

export default function BusinessDatePicker() {
  const bd = useBusinessDate();
  const { theme } = usePOS();
  const [open, setOpen] = useState(false);
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
      </div>
      <div className="mt-3 border-t border-gray-100 pt-3">
        <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">Custom Date</label>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={bd.dateKey}
            max={todayKey()}
            onChange={(e) => {
              if (e.target.value) {
                bd.setCustomDate(e.target.value);
                setOpen(false);
              }
            }}
            className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white"
          />
        </div>
      </div>
      {bd.mode === 'custom' && (
        <p className="mt-2 text-[10px] text-gray-400">Viewing {formatDisplay(bd.dateKey)}</p>
      )}
    </>
  );

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:bg-gray-50"
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
