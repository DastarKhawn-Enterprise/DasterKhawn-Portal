export function hasPermission(
  permissions: string[],
  role: string,
  required: string,
): boolean {
  return permissions.includes(required) || role === 'super_admin' || role === 'owner';
}

export function decodeJwt(token: string): { permissions: string[]; tenant_role: string } | null {
  try {
    let base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const payload = JSON.parse(atob(base64));
    const perms = payload.permissions;
    const permList: string[] = typeof perms === 'string'
      ? (() => { try { return JSON.parse(perms); } catch { return []; } })()
      : (perms ?? []);
    return { permissions: permList, tenant_role: payload.tenant_role || '' };
  } catch {
    return null;
  }
}
