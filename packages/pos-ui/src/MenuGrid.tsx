'use client';
import type { MenuItem, ThemeConfig } from './types';

interface MenuGridProps {
  menuItems: MenuItem[];
  onAddToCart: (item: MenuItem) => void;
  theme: ThemeConfig;
}

export default function MenuGrid({ menuItems, onAddToCart, theme }: MenuGridProps) {
  const categories = [...new Set(menuItems.map((item) => item.category ?? 'Uncategorized'))].sort();

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {categories.map((category) => (
        <div key={category} className="mb-5">
          <h2 className="text-sm font-semibold mb-2 uppercase tracking-wider" style={{ color: theme.primaryColor }}>
            {category}
          </h2>
          <div className="space-y-0.5">
            {menuItems
              .filter((item) => (item.category ?? 'Uncategorized') === category)
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => onAddToCart(item)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900">{item.name}</div>
                    {item.description && (
                      <div className="text-xs text-gray-400 truncate max-w-[280px]">{item.description}</div>
                    )}
                  </div>
                  <div className="text-sm font-semibold whitespace-nowrap tabular-nums" style={{ color: theme.primaryColor }}>
                    ${item.price.toFixed(2)}
                  </div>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
