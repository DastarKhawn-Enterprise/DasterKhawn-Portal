'use client';
import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  padded?: boolean;
}

export default function Card({ hoverable = false, padded = true, className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={`card ${hoverable ? 'card-hover' : ''} ${padded ? 'p-4 md:p-5' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className = '',
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 mb-4 ${className}`}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-[var(--text)] tracking-tight truncate">{title}</h3>
        {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
