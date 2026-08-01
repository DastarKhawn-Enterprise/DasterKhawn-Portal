'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ThemeConfig } from '@sat-sys/pos-ui';

interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
}

interface ReceiptData {
  orderNumber: number;
  status: string;
  total: number;
  createdAt: string;
  orderType?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  pickupTime?: string | null;
  tableNumber?: string | null;
  items: ReceiptItem[];
  taxAmount?: number;
  serviceChargeAmount?: number;
}

interface Props {
  data: ReceiptData;
  brandName: string;
  theme: ThemeConfig;
  onClose: () => void;
  footerText?: string;
  currencySymbol?: string;
}

const PRINT_STYLE = `
  @page { size: 80mm auto; margin: 0; }
  @media print {
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 80mm !important;
      min-height: auto !important;
    }
    body > * {
      display: none !important;
    }
    .no-print { display: none !important; }
    .receipt-print-area {
      display: block !important;
      width: 80mm !important;
      padding: 3mm 4mm;
      background: white;
      font-family: 'Courier New', Courier, monospace;
      box-sizing: border-box;
      overflow-y: auto;
    }
  }
`;

export default function ReceiptView({ data, brandName, theme, onClose, footerText, currencySymbol }: Props) {
  useEffect(() => {
    requestAnimationFrame(() => window.print());
  }, []);

  const subtotal = data.items.reduce((s, i) => s + i.price * i.quantity, 0);

  const content = receiptContent(brandName, theme, data, subtotal, footerText, currencySymbol);

  return (
    <>
      {/* Screen modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
        <div className="card bg-[var(--surface-2)] rounded-lg shadow-xl w-full max-w-sm mx-4 p-6 anim-fade" onClick={(e) => e.stopPropagation()}>
          {content}
          <button
            onClick={onClose}
            className="no-print btn btn-primary mt-4 w-full px-4 py-2 rounded border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-3)] text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>

      {/* Print style and receipt — rendered immediately via portal, outside app root */}
      {typeof document !== 'undefined' && createPortal(<style>{PRINT_STYLE}</style>, document.head)}
      {typeof document !== 'undefined' && createPortal(<div className="receipt-print-area">{content}</div>, document.body)}
    </>
  );
}

function receiptContent(brandName: string, theme: ThemeConfig, data: ReceiptData, subtotal: number, footerText?: string, currencySymbol?: string) {
  const curr = currencySymbol || 'Rs.';
  const tax = data.taxAmount ?? 0;
  const orderTypeLabel = data.orderType
    ? ({ dine_in: 'Dine In', takeaway: 'Take Away', delivery: 'Delivery', drive_thru: 'Drive Thru' } as Record<string, string>)[data.orderType] || data.orderType
    : '';

  return (
    <div className="text-sm">
      <div className="text-center mb-4 pb-3 border-b-2 border-dashed border-[var(--border)]">
        <div className="text-lg font-bold" style={{ color: 'var(--primary)' }}>
          {brandName}
        </div>
        <div className="text-xs text-[var(--text-muted)] mt-0.5">Order Receipt</div>
      </div>

      <div className="mb-3 space-y-0.5 text-xs text-[var(--text-muted)]">
        <div className="flex justify-between">
          <span>Order #</span>
          <span className="font-semibold">{data.orderNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Date</span>
          <span>{new Date(data.createdAt).toLocaleString()}</span>
        </div>
        {orderTypeLabel && (
          <div className="flex justify-between">
            <span>Type</span>
            <span>{orderTypeLabel}</span>
          </div>
        )}
        {data.tableNumber && (
          <div className="flex justify-between">
            <span>Table</span>
            <span>{data.tableNumber}</span>
          </div>
        )}
        {data.customerName && (
          <div className="flex justify-between">
            <span>Customer</span>
            <span>{data.customerName}{data.customerPhone ? ` · ${data.customerPhone}` : ''}</span>
          </div>
        )}
        {data.pickupTime && (
          <div className="flex justify-between">
            <span>Pickup</span>
            <span>
              {new Date(data.pickupTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
      </div>

      <table className="w-full text-xs mb-3">
        <thead>
          <tr className="border-t border-b border-[var(--border)] text-[var(--text-muted)]">
            <th className="text-left py-1 font-medium">Item</th>
            <th className="text-center py-1 font-medium">Qty</th>
            <th className="text-right py-1 font-medium">Price</th>
            <th className="text-right py-1 font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i}>
              <td className="py-1">{item.name}</td>
              <td className="text-center py-1">{item.quantity}</td>
              <td className="text-right py-1">{curr}{item.price.toFixed(2)}</td>
              <td className="text-right py-1 font-medium">{curr}{(item.price * item.quantity).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-[var(--border)] pt-2 space-y-0.5 text-xs">
        <div className="flex justify-between text-[var(--text-muted)]">
          <span>Subtotal</span>
          <span>{curr}{subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-[var(--text-muted)]">
          <span>Tax</span>
          <span>{curr}{tax.toFixed(2)}</span>
        </div>
        {(data.serviceChargeAmount ?? 0) > 0 && (
          <div className="flex justify-between text-[var(--text-muted)]">
            <span>Service Charge</span>
            <span>{curr}{(data.serviceChargeAmount ?? 0).toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm border-t border-[var(--border)] pt-1">
          <span>Total</span>
          <span>{curr}{data.total.toFixed(2)}</span>
        </div>
      </div>

      <div className="text-center mt-4 pt-3 border-t-2 border-dashed border-[var(--border)] text-xs text-[var(--text-faint)]">
        <p>{footerText || 'Thank you for your order!'}</p>
      </div>
    </div>
  );
}

export { receiptContent };
