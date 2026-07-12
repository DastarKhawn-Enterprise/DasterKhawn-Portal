'use client';
import { useEffect, useRef } from 'react';
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
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      window.print();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const subtotal = data.items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #receipt-print-area, #receipt-print-area * { visibility: visible; }
          #receipt-print-area { position: absolute; left: 0; top: 0; width: 80mm; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 no-print" onClick={onClose}>
        <div
          ref={printRef}
          id="receipt-print-area"
          className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6"
          onClick={(e) => e.stopPropagation()}
        >
          {receiptContent(brandName, theme, data, subtotal)}
          <button
            onClick={onClose}
            className="no-print mt-4 w-full px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}

function receiptContent(brandName: string, theme: ThemeConfig, data: ReceiptData, subtotal: number) {
  const orderTypeLabel = data.orderType
    ? { dine_in: 'Dine In', takeaway: 'Take Away', delivery: 'Delivery', drive_thru: 'Drive Thru' }[data.orderType] || data.orderType
    : '';

  return (
    <div className="text-sm">
      {/* Header */}
      <div className="text-center mb-4 pb-3 border-b-2 border-dashed border-gray-300">
        <div className="text-lg font-bold" style={{ color: theme.primaryColor }}>
          {brandName}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">Order Receipt</div>
      </div>

      {/* Info rows */}
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

      {/* Items */}
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

      {/* Totals */}
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

      {/* Footer */}
      <div className="text-center mt-4 pt-3 border-t-2 border-dashed border-gray-300 text-xs text-gray-400">
        <p>Thank you for your order!</p>
      </div>
    </div>
  );
}

export { receiptContent };
