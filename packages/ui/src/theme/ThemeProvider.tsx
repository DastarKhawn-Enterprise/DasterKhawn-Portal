'use client';

import { useMemo } from 'react';
import { resolveThemeConfig } from './resolve';
import { themeToCssVariables } from './css-variables';
import type { ThemeConfig } from './types';

/**
 * Injects a tenant theme into the DOM as CSS custom properties.
 *
 * Renders nothing visible — it hydrates a `<style>` element with the resolved
 * `:root { … }` variables. Every descendant component that uses a semantic
 * Tailwind utility (`bg-background`, `text-primary`, `border-border`, …) picks
 * the theme up automatically.
 *
 * Lightweight by design: no state, no re-renders on theme change (CSS
 * variables propagate natively), works in both SSR and client rendering.
 */
export function ThemeProvider({
  theme,
  children,
}: {
  theme?: Partial<ThemeConfig> | null;
  children: React.ReactNode;
}) {
  const css = useMemo(() => {
    const resolved = resolveThemeConfig(theme);
    const vars = themeToCssVariables(resolved);
    const body = Object.entries(vars)
      .map(([name, value]) => `${name}: ${value};`)
      .join('\n');
    return `:root { ${body} }`;
  }, [theme]);

  return (
    <>
      <style
        data-sat-sys-theme
        dangerouslySetInnerHTML={{ __html: css }}
      />
      {children}
    </>
  );
}
