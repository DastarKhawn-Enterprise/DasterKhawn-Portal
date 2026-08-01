'use client';
import React from 'react';

type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
}

const TONES: Record<Tone, string> = {
  info: 'badge-info',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  neutral: 'badge-neutral',
  primary: 'badge-primary',
};

export default function Badge({ tone = 'neutral', dot = false, className = '', children, ...rest }: BadgeProps) {
  return (
    <span className={`badge ${TONES[tone]} ${className}`} {...rest}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
