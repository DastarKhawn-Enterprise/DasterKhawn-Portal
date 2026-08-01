export function validateCustomerName(name: string): string | null {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'Customer name is required.';
  if (trimmed.length < 2) return 'Customer name must be at least 2 characters.';
  if (trimmed.length > 100) return 'Customer name must be at most 100 characters.';
  return null;
}
