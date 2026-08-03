export function validateCustomerName(name: string): string | null {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'Customer name is required.';
  if (trimmed.length < 2) return 'Customer name must be at least 2 characters.';
  if (trimmed.length > 100) return 'Customer name must be at most 100 characters.';
  return null;
}

export function validateCustomerPhone(phone: string): string | null {
  const trimmed = (phone ?? '').trim();
  if (!trimmed) return 'Phone number is required.';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7) return 'Enter a valid phone number.';
  return null;
}

export function validateDeliveryAddress(address: string): string | null {
  const trimmed = (address ?? '').trim();
  if (!trimmed) return 'Delivery address is required.';
  if (trimmed.length < 5) return 'Delivery address must be at least 5 characters.';
  return null;
}
