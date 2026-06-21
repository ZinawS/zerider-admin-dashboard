import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { Pagination } from '../../components/Pagination';
import { useRegionScope } from '../../stores/region-scope.store';
import { useToast } from '../../components/Toast';
import { QueryError } from '../../components/QueryError';
import { useDebounced } from '../../hooks/useDebounced';

// ─── helpers ────────────────────────────────────────────────────────────────

function isoToday() { return new Date().toISOString().slice(0, 10); }
function iso30DaysAgo() {
  const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10);
}
function fmtEtb(cents: number | null | undefined) {
  if (cents == null) return '—';
  return `ETB ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtId(id: string) { return id.slice(0, 8) + '…'; }

// ─── types ───────────────────────────────────────────────────────────────────

interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  notes?: string | null;
}

interface Order {
  id: string;
  merchant_id: string;
  customer_id: string;
  status: string;
  total_cents: number;
  subtotal_cents: number;
  delivery_fee_cents: number;
  platform_fee_cents: number;
  region_code: string;
  pickup_address: string;
  dropoff_address: string;
  customer_notes: string | null;
  scheduled_at: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  delivery_id: string | null;
  confirmed_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  refunded_at: string | null;
  created_at: string;
  updated_at: string | null;
  items?: OrderItem[];
}

interface ListResponse { items: Order[]; total: number; }

// ─── constants ───────────────────────────────────────────────────────────────

const ORDER_STATUSES = [
  '', 'pending', 'confirmed', 'preparing',
  'ready_for_pickup', 'assigned_to_driver', 'picked_up',
  'delivered', 'cancelled', 'refunded',
];

const CANCELLABLE = new Set(['pending', 'confirmed', 'preparing']);

function statusBadge(s: string): string {
  switch (s) {
    case 'pending':            return 'bg-slate-100 text-slate-700';
    case 'confirmed':          return 'bg-blue-100 text-blue-700';
    case 'preparing':          return 'bg-amber-100 text-amber-700';
    case 'ready_for_pickup':   return 'bg-indigo-100 text-indigo-700';
    case 'assigned_to_driver': return 'bg-violet-100 text-violet-700';
    case 'picked_up':          return 'bg-orange-100 text-orange-700';
    case 'delivered':          return 'bg-emerald-100 text-emerald-700';
    case 'cancelled':          return 'bg-red-100 text-red-700';
    case 'refunded':           return 'bg-rose-100 text-rose-700';
    default:                   return 'bg-gray-100 text-gray-600';
  }
}

const PAGE_SIZE = 25;

// ─── detail panel ────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value?: string | null | number }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xs font-medium text-right max-w-[60%] break-words">{String(value)}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{title}</div>
      {children}
    </div>
  );
}

interface DetailPanelProps { orderId: string; onClose: () => void; onCancelled: () => void; }

function OrderDetailPanel({ orderId, onClose, onCancelled }: DetailPanelProps): JSX.Element {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { data: order, isLoading } = useQuery({
    queryKey: ['admin-order-detail', orderId],
    queryFn: () => api<Order>(`/v1/admin/orders/${orderId}`),
    staleTime: 60_000,
  });

  const cancelMutation = useMutation({
    mutationFn: () => api(`/v1/admin/orders/${orderId}/cancel`, {
      method: 'POST',
      body: { reason: cancelReason || 'Admin cancellation' },
    }),
    onSuccess: () => {
      toast('Order cancelled.', 'success');
      setShowCancelForm(false);
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      qc.invalidateQueries({ queryKey: ['admin-order-detail', orderId] });
      onCancelled();
    },
    onError: (e: any) => toast('Cancel failed: ' + (e?.message ?? 'unknown error'), 'error'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-end z-50" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-white z-10">
          <div>
            <div className="font-semibold text-sm">Order {orderId.slice(0, 8)}…</div>
            {order && (
              <span className={`mt-0.5 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(order.status)}`}>
                {order.status.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        {isLoading && (
          <div className="px-5 py-8 text-center text-sm text-muted">Loading…</div>
        )}

        {order && (
          <div className="px-5 py-4 space-y-5 text-sm">

            {/* Financials */}
            <Section title="Financials">
              <Row label="Total" value={fmtEtb(order.total_cents)} />
              <Row label="Subtotal" value={fmtEtb(order.subtotal_cents)} />
              <Row label="Delivery fee" value={fmtEtb(order.delivery_fee_cents)} />
              <Row label="Platform fee" value={fmtEtb(order.platform_fee_cents)} />
            </Section>

            {/* Parties */}
            <Section title="Parties">
              <Row label="Merchant ID" value={order.merchant_id} />
              <Row label="Customer ID" value={order.customer_id} />
              <Row label="Region" value={order.region_code} />
              {order.delivery_id && <Row label="Delivery ID" value={order.delivery_id} />}
            </Section>

            {/* Addresses */}
            <Section title="Addresses">
              <Row label="Pickup" value={order.pickup_address} />
              <Row label="Dropoff" value={order.dropoff_address} />
            </Section>

            {/* Timeline */}
            <Section title="Timeline">
              <Row label="Created" value={fmtDate(order.created_at)} />
              <Row label="Confirmed" value={fmtDate(order.confirmed_at)} />
              <Row label="Preparing" value={fmtDate(order.preparing_at)} />
              <Row label="Ready" value={fmtDate(order.ready_at)} />
              <Row label="Picked up" value={fmtDate(order.picked_up_at)} />
              <Row label="Delivered" value={fmtDate(order.delivered_at)} />
              {order.scheduled_at && <Row label="Scheduled for" value={fmtDate(order.scheduled_at)} />}
              {order.cancelled_at && <Row label="Cancelled" value={fmtDate(order.cancelled_at)} />}
              {order.refunded_at && <Row label="Refunded" value={fmtDate(order.refunded_at)} />}
            </Section>

            {/* Notes */}
            {order.customer_notes && (
              <Section title="Customer Notes">
                <p className="text-xs text-ink">{order.customer_notes}</p>
              </Section>
            )}
            {order.cancellation_reason && (
              <Section title="Cancellation Reason">
                <p className="text-xs text-red-600">{order.cancellation_reason}</p>
              </Section>
            )}

            {/* Items */}
            {order.items && order.items.length > 0 && (
              <Section title={`Items (${order.items.length})`}>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-bg border-b border-border">
                        <th className="text-left px-3 py-2 font-semibold text-muted">Product</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted">Qty</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted">Unit</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item, i) => (
                        <tr key={item.product_id + i} className={i % 2 ? 'bg-bg/40' : ''}>
                          <td className="px-3 py-2">
                            <div className="font-medium">{item.product_name}</div>
                            {item.notes && <div className="text-muted">{item.notes}</div>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtEtb(item.unit_price_cents)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtEtb(item.total_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* Cancel action */}
            {CANCELLABLE.has(order.status) && (
              <Section title="Admin Actions">
                {!showCancelForm ? (
                  <button
                    onClick={() => setShowCancelForm(true)}
                    className="w-full px-3 py-2 border border-red-300 text-red-600 rounded text-xs hover:bg-red-50 transition-colors"
                  >
                    Cancel order
                  </button>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Reason for cancellation (optional)"
                      className="w-full border border-border rounded px-3 py-2 text-xs resize-none"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => cancelMutation.mutate()}
                        disabled={cancelMutation.isPending}
                        className="flex-1 px-3 py-2 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-60"
                      >
                        {cancelMutation.isPending ? 'Cancelling…' : 'Confirm cancel'}
                      </button>
                      <button
                        onClick={() => { setShowCancelForm(false); setCancelReason(''); }}
                        className="px-3 py-2 border border-border rounded text-xs hover:bg-bg"
                      >
                        Back
                      </button>
                    </div>
                  </div>
                )}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export function MerchantOrdersPage(): JSX.Element {
  const regionCode = useRegionScope((s) => s.regionCode);

  const [status, setStatus] = useState('');
  const [merchantSearch, setMerchantSearch] = useState('');
  const [from, setFrom] = useState(iso30DaysAgo());
  const [to, setTo] = useState(isoToday());
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const debouncedMerchant = useDebounced(merchantSearch, 400);

  const qs = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String((page - 1) * PAGE_SIZE),
    ...(status && { status }),
    ...(debouncedMerchant && { merchant: debouncedMerchant }),
    ...(from && { from }),
    ...(to && { to }),
    ...(regionCode && { region: regionCode }),
  }).toString();

  const { data, isLoading, isError, refetch } = useQuery<ListResponse>({
    queryKey: ['admin-orders', status, debouncedMerchant, from, to, regionCode, page],
    queryFn: () => api<ListResponse>(`/v1/admin/orders?${qs}`),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const orders = data?.items ?? [];
  const total = data?.total ?? 0;

  function resetPage() { setPage(1); }

  if (isError) return <QueryError onRetry={() => refetch()} />;

  return (
    <div>
      <PageHeader title="Merchant Orders" subtitle="View and manage all merchant marketplace orders" />

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 mb-5">
        {/* Status */}
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); resetPage(); }}
          className="text-sm px-3 py-2 border border-border rounded bg-surface text-ink"
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>

        {/* Merchant ID search */}
        <input
          type="text"
          value={merchantSearch}
          onChange={(e) => { setMerchantSearch(e.target.value); resetPage(); }}
          placeholder="Filter by merchant ID…"
          className="text-sm px-3 py-2 border border-border rounded bg-surface text-ink w-56"
        />

        {/* Date range */}
        <DateRangeFilter
          from={from} to={to}
          onChange={(f, t) => { setFrom(f || iso30DaysAgo()); setTo(t || isoToday()); resetPage(); }}
        />

        {/* Total count */}
        {!isLoading && (
          <div className="ml-auto flex items-center text-sm text-muted">
            {total.toLocaleString()} order{total !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* ── Stats bar ── */}
      <div className="flex gap-4 mb-5 flex-wrap">
        {[
          { label: 'Pending', status: 'pending', color: 'bg-slate-100 text-slate-700' },
          { label: 'Preparing', status: 'preparing', color: 'bg-amber-100 text-amber-700' },
          { label: 'Delivered', status: 'delivered', color: 'bg-emerald-100 text-emerald-700' },
          { label: 'Cancelled', status: 'cancelled', color: 'bg-red-100 text-red-700' },
        ].map((b) => (
          <button
            key={b.status}
            onClick={() => { setStatus(b.status); resetPage(); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${b.color} ${status === b.status ? 'ring-2 ring-offset-1 ring-current' : ''}`}
          >
            {b.label}
          </button>
        ))}
        {status && (
          <button onClick={() => { setStatus(''); resetPage(); }} className="px-3 py-1.5 text-xs text-muted hover:text-ink">
            Clear filter ×
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted">Order ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted">Merchant</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted">Customer</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted">Total</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted">Region</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">Loading…</td>
              </tr>
            )}
            {!isLoading && orders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">No orders match the current filters.</td>
              </tr>
            )}
            {orders.map((o, i) => (
              <tr
                key={o.id}
                className={`cursor-pointer hover:bg-bg/60 transition-colors ${i % 2 ? 'bg-bg/20' : ''} ${selectedId === o.id ? 'bg-indigo-50' : ''}`}
                onClick={() => setSelectedId((prev) => prev === o.id ? null : o.id)}
              >
                <td className="px-4 py-3 font-mono text-xs text-muted">{fmtId(o.id)}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted max-w-[100px] truncate" title={o.merchant_id}>
                  {fmtId(o.merchant_id)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted max-w-[100px] truncate" title={o.customer_id}>
                  {fmtId(o.customer_id)}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(o.status)}`}>
                    {o.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtEtb(o.total_cents)}</td>
                <td className="px-4 py-3 text-xs text-muted">{o.region_code}</td>
                <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{fmtDate(o.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {total > PAGE_SIZE && (
        <div className="mt-4 flex justify-center">
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={setPage}
          />
        </div>
      )}

      {/* ── Order detail drawer ── */}
      {selectedId && (
        <OrderDetailPanel
          orderId={selectedId}
          onClose={() => setSelectedId(null)}
          onCancelled={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
