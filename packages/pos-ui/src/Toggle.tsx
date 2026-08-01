'use client';
import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  id?: string;
}

export default function Toggle({ checked, onChange, disabled, label, description, id }: ToggleProps) {
  const toggleId = id || `toggle-${label?.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label className={`flex items-center justify-between gap-3 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <span className="min-w-0">
        {label && <span className="text-sm font-medium text-[var(--text)]">{label}</span>}
        {description && <span className="block text-xs text-[var(--text-muted)] mt-0.5">{description}</span>}
      </span>
      <input
        id={toggleId}
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={`relative inline-flex flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
          checked ? 'bg-[var(--primary)]' : 'bg-[var(--surface-3)] border border-[var(--border)]'
        }`}
      >
        <span
          className={`inline-block w-5 h-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </label>
  );
}
