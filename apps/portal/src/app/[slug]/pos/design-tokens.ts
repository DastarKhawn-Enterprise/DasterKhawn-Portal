export const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-info',
  new: 'badge-info',
  in_kitchen: 'badge-warning',
  preparing: 'badge-warning',
  ready: 'badge-success',
  completed: 'badge-neutral',
  cancelled: 'badge-danger',
};

export const ORDER_TYPE_BADGE: Record<string, string> = {
  dine_in: 'bg-purple-100 text-purple-700 border border-purple-200',
  takeaway: 'bg-blue-100 text-blue-700 border border-blue-200',
  delivery: 'bg-orange-100 text-orange-700 border border-orange-200',
  drive_thru: 'bg-teal-100 text-teal-700 border border-teal-200',
  third_party: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
};

export const TABLE_BADGE: Record<string, string> = {
  available: 'badge-success',
  occupied: 'badge-danger',
  reserved: 'badge-warning',
};

export const TABLE_BORDER: Record<string, string> = {
  available: 'border-[var(--success)]/30 hover:border-[var(--success)]',
  occupied: 'border-[var(--danger)]/30 hover:border-[var(--danger)]',
  reserved: 'border-[var(--warning)]/30 hover:border-[var(--warning)]',
};

export const TABLE_BG: Record<string, string> = {
  available: 'bg-[var(--success-soft)]',
  occupied: 'bg-[var(--danger-soft)]',
  reserved: 'bg-[var(--warning-soft)]',
};

export const RESERVATION_BADGE: Record<string, string> = {
  confirmed: 'badge-info',
  seated: 'badge-success',
  cancelled: 'badge-danger',
  no_show: 'badge-neutral',
};

export const CARD_CLASS = 'card p-4 md:p-5';
export const CARD_NESTED_CLASS = 'rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-2)] p-4';
export const PAGE_PADDING = 'p-4 md:p-6';
export const SECTION_GAP = 'space-y-4 md:space-y-6';
export const CARD_GAP = 'gap-3 md:gap-4';

export const STATUS_LEFT_BORDER: Record<string, string> = {
  pending: 'border-l-[3px] border-l-[var(--info)]',
  in_kitchen: 'border-l-[3px] border-l-[var(--warning)]',
  ready: 'border-l-[3px] border-l-[var(--success)]',
  completed: 'border-l-[3px] border-l-[var(--text-faint)]',
  cancelled: 'border-l-[3px] border-l-[var(--danger)]',
};
