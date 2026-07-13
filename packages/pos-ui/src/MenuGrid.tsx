'use client';
import { useState, useRef } from 'react';
import type { MenuItem, ThemeConfig } from './types';

interface MenuGridProps {
  menuItems: MenuItem[];
  onAddToCart: (item: MenuItem) => void;
  theme: ThemeConfig;
  currencySymbol?: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  mostOrderedItems?: MenuItem[];
}

export default function MenuGrid({ menuItems, onAddToCart, theme, currencySymbol, searchQuery = '', onSearchChange, mostOrderedItems }: MenuGridProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cs = currencySymbol || '$';
  const categories = [...new Set(menuItems.map((item) => item.category ?? 'Uncategorized'))].sort();

  const hasMostOrdered = focused && !searchQuery && mostOrderedItems && mostOrderedItems.length > 0;
  const isFiltering = searchQuery.length > 0;

  const filteredItems = isFiltering
    ? menuItems.filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : menuItems;

  const filteredCategories = isFiltering
    ? [...new Set(filteredItems.map((item) => item.category ?? 'Uncategorized'))].sort()
    : categories;

  const renderItem = (item: MenuItem) => (
    <button
      key={item.id}
      onClick={() => onAddToCart(item)}
      className="w-full flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-gray-900">{item.name}</div>
        {item.description && <div className="text-xs text-gray-400 truncate max-w-[280px]">{item.description}</div>}
      </div>
      <div className="text-sm font-semibold whitespace-nowrap tabular-nums" style={{ color: theme.primaryColor }}>
        {cs}{item.price.toFixed(2)}
      </div>
    </button>
  );

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {/* Search input */}
      <div className="relative mb-4">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange?.(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder="Search menu items..."
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent" />
        {searchQuery && (
          <button onClick={() => { onSearchChange?.(''); inputRef.current?.focus(); }} className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600">✕</button>
        )}
      </div>

      {/* Most Ordered section */}
      {hasMostOrdered && (
        <div className="mb-5">
          <h2 className="text-sm font-semibold mb-2 uppercase tracking-wider" style={{ color: theme.primaryColor }}>Most Ordered</h2>
          <div className="space-y-0.5">{mostOrderedItems.map(renderItem)}</div>
        </div>
      )}

      {/* No results */}
      {isFiltering && filteredCategories.length === 0 && (
        <div className="flex items-center justify-center pt-12">
          <p className="text-sm text-gray-400">No menu items matching &ldquo;{searchQuery}&rdquo;</p>
        </div>
      )}

      {/* Category groups */}
      {(!isFiltering || filteredCategories.length > 0) && filteredCategories.map((category) => {
        const items = filteredItems.filter((item) => (item.category ?? 'Uncategorized') === category && item.available !== false);
        if (items.length === 0) return null;
        return (
          <div key={category} className="mb-5">
            <h2 className="text-sm font-semibold mb-2 uppercase tracking-wider" style={{ color: theme.primaryColor }}>{category}</h2>
            <div className="space-y-0.5">{items.map(renderItem)}</div>
          </div>
        );
      })}
    </div>
  );
}
