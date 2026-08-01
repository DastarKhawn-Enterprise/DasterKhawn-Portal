'use server';

import { supa } from './supa-query';

export async function generateUniqueOrderNumber(slug: string): Promise<number> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const num = Math.floor(1000 + Math.random() * 9000);
    const r = await supa(slug, { table: 'orders', select: 'id', eq: ['order_number', num], limit: 1 });
    if (r.ok && (!r.data || r.data.length === 0)) return num;
  }
  throw new Error('Could not generate a unique order number');
}
