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
        <div key={category} className="mb-6">
          <h2 className="text-lg font-semibold mb-3" style={{ color: theme.primaryColor }}>
            {category}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {menuItems
              .filter((item) => (item.category ?? 'Uncategorized') === category)
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => onAddToCart(item)}
                  className="text-left p-3 rounded-lg border hover:shadow-md transition-shadow"
                  style={{ borderColor: theme.primaryColor + '30' }}
                >
                  <div className="font-medium text-gray-900">{item.name}</div>
                  {item.description && (
                    <div className="text-sm text-gray-500 mt-1">{item.description}</div>
                  )}
                  <div className="text-sm font-bold mt-2" style={{ color: theme.primaryColor }}>
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
