export const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-blue-50 text-blue-700 border border-blue-200',
  new: 'bg-blue-50 text-blue-700 border border-blue-200',
  in_kitchen: 'bg-amber-50 text-amber-700 border border-amber-200',
  preparing: 'bg-amber-50 text-amber-700 border border-amber-200',
  ready: 'bg-green-50 text-green-700 border border-green-200',
  completed: 'bg-gray-50 text-gray-500 border border-gray-200',
  cancelled: 'bg-red-50 text-red-700 border border-red-200',
};

export const ORDER_TYPE_BADGE: Record<string, string> = {
  dine_in: 'bg-purple-50 text-purple-700 border border-purple-200',
  takeaway: 'bg-blue-50 text-blue-700 border border-blue-200',
  delivery: 'bg-orange-50 text-orange-700 border border-orange-200',
  drive_thru: 'bg-teal-50 text-teal-700 border border-teal-200',
  third_party: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
};

export const TABLE_BADGE: Record<string, string> = {
  available: 'bg-green-50 text-green-700',
  occupied: 'bg-red-50 text-red-700',
  reserved: 'bg-amber-50 text-amber-700',
};

export const TABLE_BORDER: Record<string, string> = {
  available: 'border-green-200 hover:border-green-400',
  occupied: 'border-red-200 hover:border-red-400',
  reserved: 'border-amber-200 hover:border-amber-400',
};

export const TABLE_BG: Record<string, string> = {
  available: 'bg-green-50/60',
  occupied: 'bg-red-50/60',
  reserved: 'bg-amber-50/60',
};

export const RESERVATION_BADGE: Record<string, string> = {
  confirmed: 'bg-blue-50 text-blue-700 border border-blue-200',
  seated: 'bg-green-50 text-green-700 border border-green-200',
  cancelled: 'bg-red-50 text-red-700 border border-red-200',
  no_show: 'bg-gray-50 text-gray-500 border border-gray-200',
};

export const CARD_CLASS = 'bg-white rounded-xl border border-gray-200';
export const CARD_NESTED_CLASS = 'bg-gray-50 rounded-xl border border-gray-100';
export const PAGE_PADDING = 'p-4 md:p-6';
export const SECTION_GAP = 'space-y-4 md:space-y-6';
export const CARD_GAP = 'gap-3 md:gap-4';

export const STATUS_LEFT_BORDER: Record<string, string> = {
  pending: 'border-l-[3px] border-blue-400',
  in_kitchen: 'border-l-[3px] border-amber-400',
  ready: 'border-l-[3px] border-green-400',
  completed: 'border-l-[3px] border-gray-300',
  cancelled: 'border-l-[3px] border-red-400',
};
