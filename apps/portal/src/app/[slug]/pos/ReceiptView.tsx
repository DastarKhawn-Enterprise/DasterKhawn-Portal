'use client';
import { useEffect, useState } from 'react';
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
}

interface Props {
  data: ReceiptData;
  brandName: string;
  theme: ThemeConfig;
  onClose: () => void;
}

export default function ReceiptView({ data, brandName, theme, onClose }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, []);

  const subtotal = data.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const content = receiptContent(brandName, theme, data, subtotal);

  return (
    <>
      {/* Screen modal — shown on screen, hidden during print via #__next { display:none } */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
        <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
          {content}
          <button
            onClick={onClose}
            className="mt-4 w-full px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>

      {/* Print-only: styles in <head> + receipt at end of <body>, both outside #__next */}
      {mounted && createPortal(
        <style>{`
          .receipt-print-area { display: none; }
          @media print {
            #__next { display: none !important; }
            .receipt-print-area {
              display: block !important;
              position: absolute;
              top: 0;
              left: 0;
              width: 80mm;
              padding: 10mm;
              background: white;
              font-size: 12px;
              font-family: 'Courier New', Courier, monospace;
            }
          }
        `}</style>,
        document.head
      )}
      {mounted && createPortal(
        <div className="receipt-print-area">{content}</div>,
        document.body
      )}
    </>
  );
}

function receiptContent(brandName: string, theme: ThemeConfig, data: ReceiptData, subtotal: number) {
  const orderTypeLabel = data.orderType
    ? ({ dine_in: 'Dine In', takeaway: 'Take Away', delivery: 'Delivery', drive_thru: 'Drive Thru' } as Record<string, string>)[data.orderType] || data.orderType
    : '';

  return (
    <div className="text-sm">
      <div className="text-center mb-4 pb-3 border-b-2 border-dashed border-gray-300">
        <div className="text-lg font-bold" style={{ color: theme.primaryColor }}>
          {brandName}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">Order Receipt</div>
      </div>

      <div className="mb-3 space-y-0.5 text-xs text-gray-600">
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
          <tr className="border-t border-b border-gray-300 text-gray-500">
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
              <td className="text-right py-1">${item.price.toFixed(2)}</td>
              <td className="text-right py-1 font-medium">${(item.price * item.quantity).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-gray-300 pt-2 space-y-0.5 text-xs">
        <div className="flex justify-between text-gray-500">
          <span>Subtotal</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-bold text-sm border-t border-gray-300 pt-1">
          <span>Total</span>
          <span>${data.total.toFixed(2)}</span>
        </div>
      </div>

      <div className="text-center mt-4 pt-3 border-t-2 border-dashed border-gray-300 text-xs text-gray-400">
        <p>Thank you for your order!</p>
      </div>
    </div>
  );
}

export { receiptContent };
