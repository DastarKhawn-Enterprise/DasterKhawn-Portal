'use server';

import { supa } from './supa-query';

const KDS_SELECT = 'id, order_number, status, total, created_at, order_type, customer_name, customer_phone, pickup_time, customer_id, payment_status, tax_amount, service_charge_amount, discount_amount, discount_type, discount_value, notes, invoice_number, order_items (menu_item_id, quantity, price_at_order, menu_items (name))';

export async function fetchKDSOrders(slug: string, statusFilter?: string, excludeStatus?: string[]) {
  const opts: any = {
    table: 'orders',
    select: KDS_SELECT,
    order: [
      { column: 'created_at', ascending: false },
      { column: 'order_number', ascending: false },
    ],
    limit: 200,
  };
  if (statusFilter) {
    opts.eq = ['status', statusFilter];
  } else if (excludeStatus && excludeStatus.length > 0) {
    opts.notIn = ['status', excludeStatus];
  }
  return supa(slug, opts);
}

export async function updateKDSOrderStatus(slug: string, orderId: string, newStatus: string) {
  await supa(slug, { table: 'orders', method: 'update', eq: ['id', orderId], body: { status: newStatus } });
  return { ok: true };
}

export async function fetchKDSOrderItems(slug: string, orderId: string) {
  return supa(slug, { table: 'order_items', select: 'menu_item_id, quantity, price_at_order, menu_items (name)', eq: ['order_id', orderId] });
}

export async function fetchKDSOrderDetail(slug: string, orderId: string) {
  return supa(slug, { table: 'orders', select: KDS_SELECT, eq: ['id', orderId], single: true });
}
