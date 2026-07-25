'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePOS } from './pos-context';
import type { ThemeConfig } from '@sat-sys/pos-ui';
import { fetchKDSOrders, updateKDSOrderStatus } from './orders-actions';

interface KDSOrderItem {
  menu_item_id: string;
  quantity: number;
  price_at_order: number;
  menu_items: { name: string };
}

interface KDSOrder {
  id: string;
  order_number: number;
  status: string;
  total: number;
  created_at: string;
  order_type?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  pickup_time?: string | null;
  customer_id?: string | null;
  order_items: KDSOrderItem[];
}

interface Props {
  slug: string;
  theme: ThemeConfig;
  brandName: string;
}

type StatusTab = 'all' | 'pending' | 'in_kitchen' | 'ready' | 'completed';
type ViewMode = 'grid' | 'list';
type OrderTypeFilter = 'all' | 'dine_in' | 'takeaway' | 'delivery' | 'drive_thru';

const STATUS_TABS: { key: StatusTab; label: string; colors: string }[] = [
  { key: 'all', label: 'All Orders', colors: 'text-gray-700 border-gray-400' },
  { key: 'pending', label: 'New', colors: 'text-blue-600 border-blue-500' },
  { key: 'in_kitchen', label: 'Preparing', colors: 'text-amber-600 border-amber-500' },
  { key: 'ready', label: 'Ready', colors: 'text-green-600 border-green-500' },
  { key: 'completed', label: 'Completed', colors: 'text-gray-500 border-gray-400' },
];

const STATUS_LABELS: Record<string, string> = {
  pending: 'New',
  in_kitchen: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const ORDER_TYPE_BADGES: Record<string, string> = {
  dine_in: 'bg-purple-100 text-purple-800',
  takeaway: 'bg-blue-100 text-blue-800',
  delivery: 'bg-orange-100 text-orange-800',
  drive_thru: 'bg-teal-100 text-teal-800',
  third_party: 'bg-gray-100 text-gray-800',
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: 'Dine In',
  takeaway: 'Take Away',
  delivery: 'Delivery',
  drive_thru: 'Drive Thru',
  third_party: '3rd Party',
};

function formatElapsed(ms: number) {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hrs = Math.floor(min / 60);
  if (hrs > 0) return `${hrs}h ${min % 60}m ${sec % 60}s`;
  if (min > 0) return `${min}m ${sec % 60}s`;
  return `${sec}s`;
}

function formatDuration(ms: number) {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  if (min > 0) return `${min}m ${sec % 60}s`;
  return `${sec}s`;
}

const ELAPSED_THRESHOLD_MS = 10 * 60 * 1000;

function Timer({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const createdRef = useRef(new Date(createdAt).getTime());

  useEffect(() => {
    startRef.current = Date.now();
    createdRef.current = new Date(createdAt).getTime();

    const update = () => {
      setElapsed(Date.now() - createdRef.current);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [createdAt]);

  const overdue = elapsed > ELAPSED_THRESHOLD_MS;

  return (
    <span className={`tabular-nums font-mono text-sm font-bold ${overdue ? 'text-red-500' : 'text-gray-700'}`}>
      {formatElapsed(elapsed)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-blue-100 text-blue-800',
    in_kitchen: 'bg-amber-100 text-amber-800',
    ready: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-500',
    cancelled: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function OrderCard({
  order,
  theme,
  updating,
  onAccept,
  onReady,
  onComplete,
  onCancel,
  onSelect,
}: {
  order: KDSOrder;
  theme: ThemeConfig;
  updating: boolean;
  onAccept: () => void;
  onReady: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onSelect: () => void;
}) {
  const elapsed = Date.now() - new Date(order.created_at).getTime();
  const overdue = elapsed > ELAPSED_THRESHOLD_MS;

  return (
    <div
      className={`bg-white rounded-2xl border-2 shadow-sm hover:shadow-md transition-shadow flex flex-col ${overdue ? 'border-red-400' : 'border-gray-200'}`}
    >
      <div className="p-4 flex-1 flex flex-col gap-2 cursor-pointer" onClick={onSelect}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold text-gray-900">#{order.order_number}</h3>
            <Timer createdAt={order.created_at} />
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {order.order_type && (
              <span className={`text-[9px] px-2 py-0.5 rounded font-semibold ${ORDER_TYPE_BADGES[order.order_type] || 'bg-gray-100 text-gray-600'}`}>
                {ORDER_TYPE_LABELS[order.order_type] || order.order_type}
              </span>
            )}
            <StatusBadge status={order.status} />
          </div>
        </div>

        {(order.customer_name || order.customer_phone) && (
          <div className="text-sm text-gray-600 font-medium truncate">
            {order.customer_name}
            {order.customer_phone && <span className="text-gray-400 ml-1">{order.customer_phone}</span>}
          </div>
        )}

        <div className="flex-1 min-h-0">
          <div className="text-xs text-gray-400 font-medium mb-1 uppercase tracking-wide">
            {order.order_items?.length || 0} Item{(order.order_items?.length || 0) !== 1 ? 's' : ''}
          </div>
          <div className="space-y-0.5">
            {order.order_items?.slice(0, 8).map((item, i) => (
              <div key={i} className="flex items-center gap-1.5 text-sm">
                <span className="font-bold text-gray-800 w-5 text-right shrink-0">{item.quantity}&times;</span>
                <span className="truncate text-gray-700">{item.menu_items?.name || 'Unknown'}</span>
              </div>
            ))}
            {(order.order_items?.length || 0) > 8 && (
              <div className="text-xs text-gray-400 pl-7">+{order.order_items.length - 8} more</div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 flex flex-wrap gap-2">
        {order.status === 'pending' && (
          <button
            onClick={onAccept}
            disabled={updating}
            className="flex-1 px-3 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: '#2563eb' }}
          >
            {updating ? '...' : 'Accept'}
          </button>
        )}
        {order.status === 'in_kitchen' && (
          <button
            onClick={onReady}
            disabled={updating}
            className="flex-1 px-3 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: '#d97706' }}
          >
            {updating ? '...' : 'Ready'}
          </button>
        )}
        {order.status === 'ready' && (
          <button
            onClick={onComplete}
            disabled={updating}
            className="flex-1 px-3 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: '#16a34a' }}
          >
            {updating ? '...' : 'Complete'}
          </button>
        )}
        {order.status !== 'completed' && order.status !== 'cancelled' && (
          <button
            onClick={onCancel}
            disabled={updating}
            className="px-3 py-2 rounded-xl text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function BottomBar({
  orders,
  lastUpdated,
}: {
  orders: KDSOrder[];
  lastUpdated: number;
}) {
  const newCount = orders.filter((o) => o.status === 'pending').length;
  const preppingCount = orders.filter((o) => o.status === 'in_kitchen').length;
  const readyCount = orders.filter((o) => o.status === 'ready').length;
  const completedCount = orders.filter((o) => o.status === 'completed').length;

  const activeOrders = orders.filter((o) => o.status === 'pending' || o.status === 'in_kitchen' || o.status === 'ready');
  const totalTime = activeOrders.reduce((sum, o) => sum + (Date.now() - new Date(o.created_at).getTime()), 0);
  const avgTime = activeOrders.length > 0 ? totalTime / activeOrders.length : 0;
  const longestTime = activeOrders.length > 0
    ? Math.max(...activeOrders.map((o) => Date.now() - new Date(o.created_at).getTime()))
    : 0;

  return (
    <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 md:px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs md:text-sm">
      <div className="flex items-center gap-4 font-medium">
        <span className="text-blue-600">New: <strong>{newCount}</strong></span>
        <span className="text-amber-600">Prep: <strong>{preppingCount}</strong></span>
        <span className="text-green-600">Ready: <strong>{readyCount}</strong></span>
        <span className="text-gray-500">Done: <strong>{completedCount}</strong></span>
      </div>
      <div className="hidden sm:flex items-center gap-4 text-gray-500">
        <span>Avg: {formatDuration(avgTime)}</span>
        {longestTime > 0 && <span>Longest: <span className="text-red-500 font-semibold">{formatDuration(longestTime)}</span></span>}
      </div>
      <span className="ml-auto text-gray-400 text-[10px] md:text-xs whitespace-nowrap">
        Updated {formatDuration(Date.now() - lastUpdated)} ago
      </span>
    </div>
  );
}

function ListView({
  orders,
  theme,
  updating,
  onAccept,
  onReady,
  onComplete,
  onCancel,
}: {
  orders: KDSOrder[];
  theme: ThemeConfig;
  updating: boolean;
  onAccept: (id: string) => void;
  onReady: (id: string) => void;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-200">
            <th className="text-left py-3 px-4 font-medium">#</th>
            <th className="text-left py-3 px-4 font-medium">Status</th>
            <th className="text-left py-3 px-4 font-medium">Time</th>
            <th className="text-left py-3 px-4 font-medium">Type</th>
            <th className="text-left py-3 px-4 font-medium">Customer</th>
            <th className="text-left py-3 px-4 font-medium">Items</th>
            <th className="text-right py-3 px-4 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const elapsed = Date.now() - new Date(order.created_at).getTime();
            const overdue = elapsed > ELAPSED_THRESHOLD_MS;
            return (
              <tr key={order.id} className={`border-b border-gray-50 hover:bg-gray-50/50 ${overdue ? 'bg-red-50/30' : ''}`}>
                <td className="py-3 px-4 font-bold">#{order.order_number}</td>
                <td className="py-3 px-4">
                  <StatusBadge status={order.status} />
                </td>
                <td className={`py-3 px-4 tabular-nums font-mono ${overdue ? 'text-red-500 font-semibold' : 'text-gray-600'}`}>
                  <Timer createdAt={order.created_at} />
                </td>
                <td className="py-3 px-4">
                  {order.order_type && (
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${ORDER_TYPE_BADGES[order.order_type] || 'bg-gray-100 text-gray-600'}`}>
                      {ORDER_TYPE_LABELS[order.order_type] || order.order_type}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-gray-600">
                  {order.customer_name || <span className="text-gray-300">—</span>}
                </td>
                <td className="py-3 px-4 text-gray-600">
                  {order.order_items?.length || 0} items
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {order.status === 'pending' && (
                      <button
                        onClick={() => onAccept(order.id)}
                        disabled={updating}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                      >
                        Accept
                      </button>
                    )}
                    {order.status === 'in_kitchen' && (
                      <button
                        onClick={() => onReady(order.id)}
                        disabled={updating}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
                      >
                        Ready
                      </button>
                    )}
                    {order.status === 'ready' && (
                      <button
                        onClick={() => onComplete(order.id)}
                        disabled={updating}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                      >
                        Complete
                      </button>
                    )}
                    {order.status !== 'completed' && order.status !== 'cancelled' && (
                      <button
                        onClick={() => onCancel(order.id)}
                        disabled={updating}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DetailPanel({
  order,
  onClose,
  updating,
  onAccept,
  onReady,
  onComplete,
  onCancel,
}: {
  order: KDSOrder | null;
  onClose: () => void;
  updating: boolean;
  onAccept: () => void;
  onReady: () => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden" style={{ animation: 'slideIn 0.2s ease-out' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Order #{order.order_number}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <Timer createdAt={order.created_at} />
            <StatusBadge status={order.status} />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide">Type</span>
              <p className="font-semibold text-gray-800">
                {order.order_type ? ORDER_TYPE_LABELS[order.order_type] || order.order_type : '—'}
              </p>
            </div>
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide">Order Total</span>
              <p className="font-semibold text-gray-800">Rs. {Number(order.total).toFixed(2)}</p>
            </div>
            {order.customer_name && (
              <div>
                <span className="text-gray-400 text-xs uppercase tracking-wide">Customer</span>
                <p className="font-semibold text-gray-800">{order.customer_name}</p>
              </div>
            )}
            {order.customer_phone && (
              <div>
                <span className="text-gray-400 text-xs uppercase tracking-wide">Phone</span>
                <p className="font-semibold text-gray-800">{order.customer_phone}</p>
              </div>
            )}
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide">Created</span>
              <p className="font-semibold text-gray-800">{new Date(order.created_at).toLocaleString()}</p>
            </div>
          </div>

          <div>
            <h3 className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">Items ({order.order_items?.length || 0})</h3>
            <div className="space-y-2">
              {order.order_items?.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-bold text-gray-800 w-6 text-center shrink-0">{item.quantity}&times;</span>
                    <span className="truncate text-gray-700">{item.menu_items?.name || 'Unknown'}</span>
                  </div>
                  <span className="text-gray-500 text-sm shrink-0 ml-2">
                    Rs. {(item.quantity * Number(item.price_at_order)).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex flex-wrap gap-2">
          {order.status === 'pending' && (
            <button onClick={onAccept} disabled={updating} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-all">
              {updating ? '...' : 'Accept Order'}
            </button>
          )}
          {order.status === 'in_kitchen' && (
            <button onClick={onReady} disabled={updating} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-all">
              {updating ? '...' : 'Mark Ready'}
            </button>
          )}
          {order.status === 'ready' && (
            <button onClick={onComplete} disabled={updating} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-all">
              {updating ? '...' : 'Complete Order'}
            </button>
          )}
          {order.status !== 'completed' && order.status !== 'cancelled' && (
            <button onClick={onCancel} disabled={updating} className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-200 disabled:opacity-50 transition-all">
              Cancel Order
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function KDSView({ slug, theme, brandName }: Props) {
  const [orders, setOrders] = useState<KDSOrder[]>([]);
  const [activeTab, setActiveTab] = useState<StatusTab>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [selectedOrder, setSelectedOrder] = useState<KDSOrder | null>(null);
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderTypeFilter>('all');
  const [stationFilter, setStationFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');

  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const prevCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchOrders = useCallback(async () => {
    setFetchLoading(true);
    setFetchError('');
    const excludeCompleted = activeTab !== 'completed';
    const result = await fetchKDSOrders(
      slug,
      activeTab === 'all' ? undefined : activeTab,
      excludeCompleted && activeTab === 'all' ? ['completed', 'cancelled'] : undefined,
    );
    if (result.ok && result.data) {
      const prev = prevCountRef.current;
      const curr = result.data.length;
      if (soundEnabled && curr > prev && prev > 0 && activeTab === 'all') {
        try {
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play();
          }
        } catch {}
      }
      prevCountRef.current = curr;
      setOrders(result.data as KDSOrder[]);
    } else if (!result.ok) {
      setFetchError(result.error || 'Failed to load orders');
    }
    setFetchLoading(false);
    setLastUpdated(Date.now());
  }, [slug, activeTab, soundEnabled]);

  const { setPageTitle } = usePOS();
  useEffect(() => { setPageTitle('Kitchen Display'); }, [setPageTitle]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const id = setInterval(fetchOrders, 10000);
    return () => clearInterval(id);
  }, [fetchOrders]);

  const handleStatusUpdate = useCallback(async (orderId: string, newStatus: string) => {
    setUpdating(orderId);
    try {
      await updateKDSOrderStatus(slug, orderId, newStatus);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev) => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (e) {
      console.error('[KDS Status]', e);
    }
    setUpdating(null);
  }, [slug, selectedOrder]);

  const filteredOrders = orders.filter((o) => {
    if (search) {
      const q = search.toLowerCase();
      const matchNumber = String(o.order_number).includes(q);
      const matchCustomer = o.customer_name?.toLowerCase().includes(q);
      const matchItems = o.order_items?.some((i) => i.menu_items?.name?.toLowerCase().includes(q));
      if (!matchNumber && !matchCustomer && !matchItems) return false;
    }
    if (orderTypeFilter !== 'all' && o.order_type !== orderTypeFilter) return false;
    return true;
  });

  const groupedByStatus = (() => {
    const grouped: Record<string, KDSOrder[]> = {};
    if (activeTab === 'all') {
      for (const status of ['pending', 'in_kitchen', 'ready', 'completed']) {
        const items = filteredOrders.filter((o) => o.status === status);
        if (items.length > 0) grouped[status] = items;
      }
    } else {
      grouped[activeTab] = filteredOrders;
    }
    return grouped;
  })();

  return (
    <div className="flex-1 flex flex-col bg-gray-100 min-w-0 overflow-hidden">
      <audio ref={audioRef} preload="none">
        <source src="/sounds/notification.mp3" type="audio/mpeg" />
      </audio>

      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex flex-wrap items-center">
        <div className="flex-1 min-w-[140px] max-w-xs">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders..."
            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={orderTypeFilter}
            onChange={(e) => setOrderTypeFilter(e.target.value as OrderTypeFilter)}
            className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
          >
            <option value="all">All Types</option>
            <option value="dine_in">Dine In</option>
            <option value="takeaway">Take Away</option>
            <option value="delivery">Delivery</option>
            <option value="drive_thru">Drive Thru</option>
          </select>

          <div className="hidden md:flex items-center border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === 'grid' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
              title="Grid View"
            >
              &#9638;&#9638;
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
              title="List View"
            >
              &#9776;
            </button>
          </div>

          <button
            onClick={() => setSoundEnabled((p) => !p)}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${soundEnabled ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}
            title={soundEnabled ? 'Sound On' : 'Sound Off'}
          >
            {soundEnabled ? 'Sound' : 'Muted'}
          </button>

          <button
            onClick={fetchOrders}
            disabled={fetchLoading}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            title="Refresh"
          >
            {fetchLoading ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 overflow-x-auto scrollbar-hide">
        <div className="flex gap-1 min-w-max py-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs opacity-60">
                ({orders.filter((o) => tab.key === 'all' || o.status === tab.key).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Error Banner */}
      {fetchError && (
        <div className="bg-red-50 border-b border-red-200 px-4 md:px-6 py-2 flex items-center gap-2">
          <span className="text-red-600 text-sm">{fetchError}</span>
          <button onClick={fetchOrders} className="text-xs text-red-700 underline font-medium">Retry</button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 md:p-6">
        {viewMode === 'grid' && (
          <div className="space-y-6">
            {Object.entries(groupedByStatus).length === 0 && !fetchLoading && (
              <div className="flex items-center justify-center min-h-[300px]">
                <p className="text-gray-400 text-lg">No orders to display</p>
              </div>
            )}
            {Object.entries(groupedByStatus).map(([status, statusOrders]) => (
              <div key={status}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
                    {STATUS_LABELS[status] || status}
                  </h2>
                  <span className="text-xs text-gray-400 font-mono">({statusOrders.length})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {statusOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      theme={theme}
                      updating={updating === order.id}
                      onAccept={() => handleStatusUpdate(order.id, 'in_kitchen')}
                      onReady={() => handleStatusUpdate(order.id, 'ready')}
                      onComplete={() => handleStatusUpdate(order.id, 'completed')}
                      onCancel={() => handleStatusUpdate(order.id, 'cancelled')}
                      onSelect={() => setSelectedOrder(order)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {viewMode === 'list' && (
          filteredOrders.length === 0 && !fetchLoading ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <p className="text-gray-400 text-lg">No orders to display</p>
            </div>
          ) : (
            <ListView
              orders={filteredOrders}
              theme={theme}
              updating={!!updating}
              onAccept={(id) => handleStatusUpdate(id, 'in_kitchen')}
              onReady={(id) => handleStatusUpdate(id, 'ready')}
              onComplete={(id) => handleStatusUpdate(id, 'completed')}
              onCancel={(id) => handleStatusUpdate(id, 'cancelled')}
            />
          )
        )}

        {fetchLoading && orders.length === 0 && (
          <div className="flex items-center justify-center min-h-[300px]">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <BottomBar orders={orders} lastUpdated={lastUpdated} />

      {/* Detail Panel */}
      <DetailPanel
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        updating={updating === selectedOrder?.id}
        onAccept={() => selectedOrder && handleStatusUpdate(selectedOrder.id, 'in_kitchen')}
        onReady={() => selectedOrder && handleStatusUpdate(selectedOrder.id, 'ready')}
        onComplete={() => selectedOrder && handleStatusUpdate(selectedOrder.id, 'completed')}
        onCancel={() => selectedOrder && handleStatusUpdate(selectedOrder.id, 'cancelled')}
      />
    </div>
  );
}
