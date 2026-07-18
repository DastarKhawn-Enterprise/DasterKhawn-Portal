'use client';

import { usePOS } from '../../pos-context';
import { usePageGuard } from '../../page-guard';

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-400 mb-2">{title}</h2>
        <p className="text-gray-300">Coming Soon</p>
      </div>
    </div>
  );
}

export default function OrdersDraftPage() {
  const { hiddenViews } = usePOS();
  if (usePageGuard()) return null;
  return <PlaceholderPage title="Draft Orders" />;
}
