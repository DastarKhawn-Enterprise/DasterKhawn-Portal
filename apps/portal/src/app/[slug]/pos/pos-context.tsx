'use client';

import { createContext, useContext } from 'react';
import type { ThemeConfig } from '@sat-sys/pos-ui';

export interface POSContextValue {
  supabaseUrl: string;
  supabaseAnonKey: string;
  brandName: string;
  theme: ThemeConfig;
  slug: string;
  enabledModules: Record<string, boolean>;
  currencySymbol: string;
  hiddenViews: string[];
  pageTitle: string;
  setPageTitle: (title: string) => void;
}

const POSContext = createContext<POSContextValue | null>(null);

export function usePOS() {
  const ctx = useContext(POSContext);
  if (!ctx) throw new Error('usePOS must be used within POSProvider');
  return ctx;
}

export function POSProvider({ value, children }: { value: POSContextValue; children: React.ReactNode }) {
  return <POSContext.Provider value={value}>{children}</POSContext.Provider>;
}
