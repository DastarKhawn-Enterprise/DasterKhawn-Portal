'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SIDEBAR_NAV as NAV_ITEMS, viewIdForPath } from '@/lib/sidebar-nav';
import type { ViewId } from '@/lib/sidebar-nav';

export type { ViewId };

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  accentColor: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  hiddenViews?: ViewId[];
  slug: string;
}

function navLink(path: string, slug: string) {
  return `/${slug}/pos${path}`;
}

export default function Sidebar({ collapsed, onToggleCollapse, accentColor, mobileOpen, onMobileClose, hiddenViews, slug }: SidebarProps) {
  const pathname = usePathname();
  const posPath = '/' + pathname.split('/').slice(3).join('/');
  const activeView = viewIdForPath(posPath);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ orders: true });

  const isActive = (id: ViewId) => activeView === id;

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!hiddenViews || hiddenViews.length === 0) return true;
    if (item.children) {
      const filteredChildren = item.children.filter((c) => !hiddenViews.includes(c.id));
      return filteredChildren.length > 0 || !hiddenViews.includes(item.id);
    }
    return !hiddenViews.includes(item.id);
  });

  const handleMobileClose = () => onMobileClose?.();

  const content = (
    <>
      <button
        onClick={onToggleCollapse}
        className="hidden md:flex items-center justify-center h-12 text-sidebar-foreground hover:text-white hover:bg-sidebar-hover"
      >
        <span className="text-lg">{collapsed ? '▶' : '◀'}</span>
      </button>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {visibleItems.map((item) => {
          if (item.children) {
            const groupOpen = openGroups[item.id] !== false;
            return (
              <div key={item.id}>
                <button
                  onClick={() => setOpenGroups((prev) => ({ ...prev, [item.id]: !(prev[item.id] !== false) }))}
                  className={`flex items-center w-full px-4 py-2.5 text-sm transition-colors ${
                    isActive(item.id) || item.children?.some((c) => isActive(c.id))
                      ? 'font-semibold'
                      : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-white'
                  }`}
                  style={(isActive(item.id) || item.children?.some((c) => isActive(c.id))) ? { backgroundColor: accentColor + '26', color: accentColor } : {}}
                >
                  <span className="text-[17px] w-6 text-center flex-shrink-0">{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span className="ml-3 flex-1 text-left">{item.label}</span>
                      <span className="text-xs text-gray-500">{groupOpen ? '▾' : '▸'}</span>
                    </>
                  )}
                </button>
                {groupOpen && !collapsed && item.children.map((child) => (
                  <Link
                    key={child.id}
                    href={navLink(child.path, slug)}
                    onClick={handleMobileClose}
                    className={`flex items-center w-full pl-12 pr-4 py-2 text-sm transition-colors ${
                      isActive(child.id)
                        ? 'font-semibold'
                        : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-white'
                    }`}
                    style={isActive(child.id) ? { backgroundColor: accentColor + '26', color: accentColor } : {}}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            );
          }

          return (
            <Link
              key={item.id}
              href={navLink(item.path, slug)}
              onClick={handleMobileClose}
              className={`flex items-center w-full px-4 py-2.5 text-sm transition-colors ${
                isActive(item.id)
                  ? 'font-semibold'
                  : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-white'
              }`}
              style={isActive(item.id) ? { backgroundColor: accentColor + '26', color: accentColor } : {}}
            >
              <span className="text-[17px] w-6 text-center flex-shrink-0">{item.icon}</span>
              {!collapsed && <span className="ml-3">{item.label}</span>}
            </Link>
          );
        })}
      </div>
    </>
  );

  return (
    <>
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={onMobileClose} />
      )}

      <nav
        className={`hidden md:flex flex-col bg-sidebar text-white transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        {content}
      </nav>

      <nav
        className={`md:hidden fixed top-0 left-0 z-50 h-full bg-sidebar text-white transition-all duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } w-64`}
      >
        <button
          onClick={onMobileClose}
          className="flex items-center justify-center h-12 w-full text-sidebar-foreground hover:text-white hover:bg-sidebar-hover"
        >
          <span className="text-lg">✕</span>
        </button>
        {content}
      </nav>
    </>
  );
}
