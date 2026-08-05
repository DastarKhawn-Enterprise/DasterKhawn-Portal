/* ============================================================================
   MODULE REGISTRY — derived 100% from lib/sidebar-nav.ts.

   There is no second module list here. The navigation configuration is the
   single source of truth: every sidebar tab (except namespace groups) is a
   module, and this file turns that nav tree into the flat module definitions
   used by Module Management, permissions, route guards, and every surface.

   PERMISSION semantics: a module maps to a feature-level permission key. When
   a module is enabled the user has access to everything inside it; the
   permission key is metadata (for the access panel) sourced from the registry.
   ========================================================================== */

import type { SidebarNavItem, ViewId } from './sidebar-nav';
import { SIDEBAR_NAV } from './sidebar-nav';

export interface ModuleDef {
  /** Unique module ID == sidebar tab id. */
  key: string;
  label: string;
  description: string;
  /** Effective default when the tenant has no stored value for this key. */
  defaultEnabled: boolean;
  /** Sidebar views hidden when this module is disabled (always just itself). */
  views: ViewId[];
  /** POS-relative routes blocked when this module is disabled. */
  routes: string[];
  /** Feature-level permission key that gates this module. */
  permission: string | null;
  /** Sidebar namespace parent id ('' for root modules). */
  parent: ViewId | '';
  /** Ordering within the parent group. */
  sort: number;
  /** Future feature-flag name (empty when unused). */
  feature: string;
  /** Sidebar icon. */
  icon?: string;
}

function buildModule(item: SidebarNavItem): ModuleDef {
  return {
    key: item.id,
    label: item.label,
    description: item.description || `${item.label} module.`,
    defaultEnabled: true,
    views: [item.id],
    routes: [item.path],
    permission: item.permission ?? null,
    parent: item.parent ?? '',
    sort: item.sort ?? 1000,
    feature: item.feature ?? '',
    icon: item.icon,
  };
}

/** Every module in sidebar order. Namespace groups (isModule:false) are skipped. */
export const MODULES: ModuleDef[] = (() => {
  const out: ModuleDef[] = [];
  for (const item of SIDEBAR_NAV) {
    if (item.isModule === false) {
      // Namespace group (Orders / Inventory): its children are independent modules.
      for (const child of item.children || []) {
        if (child.isModule === false) continue;
        out.push(buildModule(child));
      }
      continue;
    }
    out.push(buildModule(item));
    for (const child of item.children || []) {
      if (child.isModule === true) out.push(buildModule(child));
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

/** Permission key per module (reads from the registry). */
export function modulePermission(moduleId: string): string | null {
  return MODULE_BY_KEY[moduleId]?.permission ?? null;
}

/** Feature-flag name per module (future-proofing). */
export function moduleFeature(moduleId: string): string {
  return MODULE_BY_KEY[moduleId]?.feature ?? '';
}

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

/** Enabled/disabled status for a single module key. */
export function moduleEnabled(modules: Record<string, boolean> | undefined, key: string): boolean {
  return resolveEnabledModules(modules)[key] !== false;
}

/** Rich per-module state used by the admin Module Management editor. */
export function effectiveDetailed(raw: Record<string, boolean> | undefined): Record<string, {
  enabled: boolean; dependencyBlocked: boolean; label: string; description: string;
  permission: string | null; parent: ViewId | ''; sort: number; feature: string; icon?: string;
}> {
  const effective = resolveEnabledModules(raw);
  const out: Record<string, any> = {};
  for (const m of MODULES) {
    out[m.key] = {
      key: m.key,
      enabled: effective[m.key],
      dependencyBlocked: false,
      label: m.label,
      description: m.description,
      permission: m.permission,
      parent: m.parent,
      sort: m.sort,
      feature: m.feature,
      icon: m.icon,
    };
  }
  return out;
}