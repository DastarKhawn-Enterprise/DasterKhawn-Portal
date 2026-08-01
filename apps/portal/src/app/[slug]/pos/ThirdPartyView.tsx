'use client';

import { useEffect } from 'react';
import { usePOS } from './pos-context';

export default function ThirdPartyView() {
  const { setPageTitle } = usePOS();
  useEffect(() => { setPageTitle('Third Party Integrations'); }, [setPageTitle]);

  const platforms = [
    { name: 'Foodpanda', initial: 'F', color: '#D70F64' },
    { name: 'Uber Eats', initial: 'U', color: '#06C167' },
    { name: 'Deliveroo', initial: 'D', color: '#00CCBC' },
    { name: 'Talabat', initial: 'T', color: '#F37320' },
  ];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-[var(--surface-2)] p-4 md:p-6 animate-fade-in">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {platforms.map((p) => (
            <div key={p.name} className="card p-5 flex items-center gap-4 hover:shadow-md transition-shadow duration-200">
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
                style={{ backgroundColor: p.color }}
              >
                {p.initial}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-[var(--text)]">{p.name}</span>
                  <span className="badge badge-info text-[10px] px-2 py-0.5 rounded-full font-medium">
                    Not Connected
                  </span>
                </div>
                <button
                  disabled
                  className="btn text-xs px-3 py-1 rounded opacity-50 cursor-not-allowed"
                  title="Integration coming soon — contact support to enable"
                >
                  Connect
                </button>
                <p className="text-[10px] text-[var(--text-faint)] mt-1">
                  Integration coming soon — contact support to enable
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
