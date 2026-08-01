'use client';
import React from 'react';

interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: React.ReactNode; count?: number }[];
  variant?: 'underline' | 'pills';
  className?: string;
}

export default function Tabs({ value, onChange, items, variant = 'pills', className = '' }: TabsProps) {
  if (variant === 'underline') {
    return (
      <div className={`flex gap-1 border-b border-[var(--border)] ${className}`} role="tablist">
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.value)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                active
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {item.label}
              {item.count !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${active ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'bg-[var(--surface-3)] text-[var(--text-muted)]'}`}>
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`inline-flex p-1 rounded-[var(--radius-btn)] bg-[var(--surface-3)] gap-1 ${className}`} role="tablist">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-[10px] transition-all duration-150 flex items-center gap-1.5 ${
              active
                ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${active ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
