'use client';
import { useState, useEffect } from 'react';
import type { ConnectionStatus } from './event-types';
import { useRealtimeStatus } from './use-event';

function StatusDot({ status }: { status: ConnectionStatus }) {
  const colors: Record<ConnectionStatus, string> = {
    connected: 'bg-[var(--success)]',
    connecting: 'bg-[var(--warning)] anim-pulse-soft',
    reconnecting: 'bg-[var(--warning)] anim-pulse-soft',
    disconnected: 'bg-[var(--danger)]',
  };
  const labels: Record<ConnectionStatus, string> = {
    connected: 'Live',
    connecting: 'Connecting...',
    reconnecting: 'Reconnecting...',
    disconnected: 'Offline',
  };
  return (
    <div className="flex items-center gap-1.5" title={labels[status]}>
      <span className={'w-2 h-2 rounded-full ' + colors[status]} />
      <span className="text-[9px] text-[var(--text-faint)] hidden xl:inline">{labels[status]}</span>
    </div>
  );
}

export function RealtimeIndicator() {
  const status = useRealtimeStatus();
  return <StatusDot status={status} />;
}
