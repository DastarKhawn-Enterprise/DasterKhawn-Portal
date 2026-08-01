// Shared order sorting — newest first by created_at DESC, then order_number DESC as tiebreaker.
// Used consistently across Current Orders, KDS, Completed, Cancelled and search results.

export interface SortableOrder {
  created_at?: string | null;
  order_number?: number | null;
}

export function compareOrdersNewestFirst(a: SortableOrder, b: SortableOrder): number {
  const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
  const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
  if (tb !== ta) return tb - ta;
  const na = Number(a.order_number) || 0;
  const nb = Number(b.order_number) || 0;
  return nb - na;
}

export function sortOrdersNewestFirst<T extends SortableOrder>(orders: T[]): T[] {
  return [...orders].sort(compareOrdersNewestFirst);
}
