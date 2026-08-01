'use client';
import React from 'react';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  accentColor?: string;
  className?: string;
}

export default function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
  trendLabel,
  accentColor,
  className = '',
}: StatCardProps) {
  const trendColor =
    trend === 'up' ? 'var(--success)' : trend === 'down' ? 'var(--danger)' : 'var(--text-muted)';
  return (
    <div className={`card card-hover p-4 md:p-5 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
        {icon && (
          <div
            className="w-9 h-9 rounded-[var(--radius-btn)] flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: accentColor ? `${accentColor}18` : 'var(--primary-soft)',
              color: accentColor || 'var(--primary)',
            }}
          >
            {icon}
          </div>
        )}
      </div>
      <p className="mt-2 text-2xl md:text-[28px] font-bold tracking-tight text-[var(--text)] tabular-nums">
        {value}
      </p>
      {(hint || trendLabel) && (
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          {trendLabel && <span style={{ color: trendColor }}>{trendLabel}</span>}
          {hint && <span className="text-[var(--text-faint)]">{hint}</span>}
        </div>
      )}
    </div>
  );
}
