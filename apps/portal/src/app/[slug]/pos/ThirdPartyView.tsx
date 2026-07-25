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
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">


        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {platforms.map((p) => (
            <div key={p.name} className="bg-white rounded-lg border border-gray-200 p-5 flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
                style={{ backgroundColor: p.color }}
              >
                {p.initial}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-gray-800">{p.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium border border-gray-200">
                    Not Connected
                  </span>
                </div>
                <button
                  disabled
                  className="text-xs px-3 py-1 rounded bg-gray-100 text-gray-400 cursor-not-allowed"
                  title="Integration coming soon — contact support to enable"
                >
                  Connect
                </button>
                <p className="text-[10px] text-gray-400 mt-1">
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
