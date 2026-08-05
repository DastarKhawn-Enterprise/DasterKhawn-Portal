/* Single source of truth for modules across the platform.
   A module is EXACTLY one sidebar tab. The list is derived from the sidebar
   navigation configuration (lib/sidebar-nav.ts) so there is always a 1:1
   relationship between a visible sidebar tab and its ON/OFF toggle.

   - Order types (Dine In, Take Away, Delivery, Drive Thru, Third Party) are
     sidebar entries but are NOT modules.
   - Order status sub-tabs (Completed, Cancelled, Draft) are NOT modules; they
     are covered by the "Orders" module.
   - There are no feature-level permissions (no Create/Edit/Delete/Print/etc.).
     When a module is enabled, the user has access to everything inside it.

   Future-proofing: this registry is intentionally kept small so a granular
   permission model (Inventory.View / Inventory.Edit / ...) can be layered on
   later without reworking the module concept. */

import type { SidebarNavItem, ViewId } from './sidebar-nav';
import { SIDEBAR_NAV } from './sidebar-nav';

export interface ModuleDef {
  key: string;
  label: string;
  description: string;
  /** Effective default when the tenant record has no stored value for this key. */
  defaultEnabled: boolean;
  /** Sidebar views hidden when this module is disabled. */
  views: ViewId[];
  /** POS-relative routes blocked when this module is disabled. */
  routes: string[];
}

/**
 * Expand one sidebar nav item into module coverage.
 * - A plain item covers itself.
 * - A group covers the group plus all children that are NOT themselves modules
 *   (e.g. "Orders" covers Current Orders / Completed / Cancelled / Draft).
 */
function expandItem(item: SidebarNavItem): { views: ViewId[]; routes: string[] } {
  if (!item.children) {
    return { views: [item.id], routes: [item.path] };
  }
  const views: ViewId[] = [item.id];
  const routes: string[] = [item.path];
  for (const child of item.children) {
    if (child.isModule === false) {
      views.push(child.id);
      routes.push(child.path);
    }
  }
  return { views, routes };
}

/** Every sidebar tab that is a module, in sidebar order. */
export const MODULES: ModuleDef[] = (() => {
  const out: ModuleDef[] = [];
  for (const item of SIDEBAR_NAV) {
    if (item.isModule === false) continue;
    const { views, routes } = expandItem(item);
    out.push({
      key: item.id,
      label: item.label,
      description: `${item.label} module.`,
      defaultEnabled: true,
      views,
      routes,
    });
    // Child nav items that are their own modules (e.g. New Order).
    for (const child of item.children || []) {
      if (child.isModule === true) {
        out.push({
          key: child.id,
          label: child.label,
          description: `${child.label} module.`,
          defaultEnabled: true,
          views: [child.id],
          routes: [child.path],
        });
      }
    }
  }
  return out;
})();

export const MODULE_BY_KEY: Record<string, ModuleDef> = Object.fromEntries(MODULES.map((m) => [m.key, m]));

/** Single flat group so the admin editor lists every module as one toggle. */
export const MODULE_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Modules', keys: MODULES.map((m) => m.key) },
];

export const MODULE_LABELS: Record<string, string> = Object.fromEntries(MODULES.map((m) => [m.key, m.label]));

/** Default state for every known module key presented to the admin editor. */
export function defaultModules(): Record<string, boolean> {
  return Object.fromEntries(MODULES.map((m) => [m.key, m.defaultEnabled]));
}

/**
 * Produces the EFFECTIVE enabled map for a tenant. Missing keys fall back to
 * their registry default so a deleted key can never silently re-enable.
 * Unknown keys stored on the tenant are ignored (they are not modules).
 */
export function resolveEnabledModules(raw: Record<string, boolean> | undefined): Record<string, boolean> {
  return { ...defaultModules(), ...(raw || {}) };
}

/** ViewIds to hide in the sidebar when a module is disabled. */
export function hiddenViewsForModules(raw: Record<string, boolean> | undefined): ViewId[] {
  const effective = resolveEnabledModules(raw);
  const hidden: ViewId[] = [];
  for (const m of MODULES) {
    if (effective[m.key] === false) {
      for (const v of m.views) if (!hidden.includes(v)) hidden.push(v);
    }
  }
  return hidden;
}

/** POS-relative routes that must be blocked when a module is disabled. */
export function disabledRoutesForModules(raw: Record<string, boolean> | undefined): string[] {
  const effective = resolveEnabledModules(raw);
  const routes: string[] = [];
  for (const m of MODULES) {
    if (effective[m.key] === false) {
      for (const r of m.routes) if (!routes.includes(r)) routes.push(r);
    }
  }
  return routes;
}

export function effectiveDetailed(raw: Record<string, boolean> | undefined): Record<string, { enabled: boolean; dependencyBlocked: boolean; label: string; description: string; category: string; locked: boolean; dependencies: string[] }> {
  const effective = resolveEnabledModules(raw);
  const out: Record<string, any> = {};
  for (const m of MODULES) {
    out[m.key] = {
      enabled: effective[m.key],
      dependencyBlocked: false,
      label: m.label,
      description: m.description,
      category: 'Modules',
      locked: false,
      dependencies: [],
    };
  }
  return out;
}