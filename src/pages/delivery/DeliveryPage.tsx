import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useRegionScope } from '../../stores/region-scope.store.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Pagination } from '../../components/Pagination.js';
import { useDebounced } from '../../hooks/useDebounced.js';

interface Delivery {
  id: string;
  type: string;
  status: string;
  requester_id: string;
  driver_id: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  fare_cents: number | null;
  created_at: string;
  tracking_points_count?: number;
  proof_of_delivery?: string | null;
}

interface ListResponse {
  items: Delivery[];
  total: number;
  has_more: boolean;
}

const STATUSES = ['', 'pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled'];

function deliveryStatusColor(s: string): string {
  switch (s) {
    case 'pending':    return 'bg-yellow-100 text-yellow-800';
    case 'assigned':   return 'bg-blue-100 text-blue-800';
    case 'picked_up':  return 'bg-orange-100 text-orange-800';
    case 'in_transit': return 'bg-purple-100 text-purple-800';
    case 'delivered':  return 'bg-green-100 text-green-800';
    case 'failed':     return 'bg-red-100 text-red-800';
    case 'cancelled':  return 'bg-gray-100 text-gray-600';
    default:           return 'bg-gray-100 text-gray-600';
  }
}

function fmtUsd(c: number | null | undefined) {
  return `$${(Number(c ?? 0) / 100).toFixed(2)}`;
}

const PAGE_SIZE = 25;

interface DetailPanelProps {
  delivery: Delivery;
  onClose: () => void;
}

function DeliveryDetailPanel({ delivery, onClose }: DetailPanelProps): JSX.Element {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-end z-50" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md h-full overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="font-semibold text-sm">Delivery {delivery.id.slice(0, 8)}</div>
          <button onClick={onClose} className="text-muted hover:text-ink text-lg leading-none">&times;</button>
        </div>
        <div className="px-5 py-4 space-y-4 text-sm">
          <div className="flex gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${deliveryStatusColor(delivery.status)}`}>
              {delivery.status.replace(/_/g, ' ')}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 capitalize">
              {delivery.type}
            </span>
          </div>

          <div>
            <div className="text-xs text-muted uppercase tracking-wide mb-1">ID</div>
            <div className="font-mono text-xs break-all">{delivery.id}</div>
          </div>

          <div>
            <div className="text-xs text-muted uppercase tracking-wide mb-1">Requester</div>
            <div className="font-mono text-xs">{delivery.requester_id}</div>
          </div>

          <div>
            <div className="text-xs text-muted uppercase tracking-wide mb-1">Driver</div>
            <div className="font-mono text-xs">{delivery.driver_id ?? <span className="text-muted">Unassigned</span>}</div>
          </div>

          <div>
            <div className="text-xs text-muted uppercase tracking-wide mb-1">Pickup</div>
            <div className="text-xs">{delivery.pickup_address ?? '—'}</div>
          </div>

          <div>
            <div className="text-xs text-muted uppercase tracking-wide mb-1">Dropoff</div>
            <div className="text-xs">{delivery.dropoff_address ?? '—'}</div>
          </div>

          <div>
            <div className="text-xs text-muted uppercase tracking-wide mb-1">Fare</div>
            <div className="text-sm font-medium">{fmtUsd(delivery.fare_cents)}</div>
          </div>

          <div>
            <div className="text-xs text-muted uppercase tracking-wide mb-1">Created</div>
            <div className="text-xs">{new Date(delivery.created_at).toLocaleString()}</div>
          </div>

          {delivery.tracking_points_count != null && (
            <div>
              <div className="text-xs text-muted uppercase tracking-wide mb-1">Tracking points</div>
              <div className="text-xs">{delivery.tracking_points_count}</div>
            </div>
          )}

          {delivery.proof_of_delivery && (
            <div>
              <div className="text-xs text-muted uppercase tracking-wide mb-1">Proof of delivery</div>
              <img src={delivery.proof_of_delivery} alt="Proof of delivery" className="w-full rounded border border-border" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DeliveryPage(): JSX.Element {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Delivery | null>(null);
  const regionCode = useRegionScope((s) => s.regionCode);
  const debounced = useDebounced(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-deliveries', status, debounced, regionCode, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (status) params.set('status', status);
      if (debounced) params.set('q', debounced);
      if (regionCode) params.set('region', regionCode);
      return api<ListResponse>(`/v1/admin/deliveries?${params.toString()}`);
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? items.length;

  const sorted = useMemo(() => [...items], [items]);

  return (
    <>
      <div className="flex items-start justify-between mb-3">
        <PageHeader title="Delivery" subtitle="Monitor and manage all deliveries." />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by ID or requester…"
          className="min-w-[200px] max-w-xs px-3 py-1.5 bg-white text-ink border border-border rounded text-sm"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-1.5 text-xs bg-white text-ink border border-border rounded"
        >
          {STATUSES.map((s) => (
            <option key={s || 'all'} value={s}>{s ? s.replace(/_/g, ' ') : 'all statuses'}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted self-center">{total} deliver{total !== 1 ? 'ies' : 'y'}</span>
      </div>

      {/* Status pills */}
      <div className="flex gap-1 flex-wrap mb-3">
        {STATUSES.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => { setStatus(s); setPage(1); }}
            className={
              'px-3 py-1 text-xs rounded-full border transition ' +
              (status === s ? 'bg-accent text-white border-accent' : 'bg-white text-muted border-border hover:bg-surface')
            }
          >
            {s ? s.replace(/_/g, ' ') : 'all'}
          </button>
        ))}
      </div>

      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-xs select-none">
            <tr>
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Requester</th>
              <th className="text-left px-3 py-2">Driver</th>
              <th className="text-left px-3 py-2">Pickup</th>
              <th className="text-left px-3 py-2">Dropoff</th>
              <th className="text-right px-3 py-2">Fare</th>
              <th className="text-left px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-border">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <div className="h-3 bg-surface animate-pulse rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : sorted.length === 0
              ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted">No deliveries match.</td>
                </tr>
              )
              : sorted.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => setSelected(d)}
                    className="cursor-pointer border-t border-border hover:bg-surface"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-muted">{d.id.slice(0, 8)}</td>
                    <td className="px-3 py-2 text-xs capitalize">{d.type}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full ${deliveryStatusColor(d.status)}`}>
                        {d.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted">{d.requester_id.slice(0, 8)}</td>
                    <td className="px-3 py-2 text-xs">
                      {d.driver_id ? (
                        <span className="font-mono text-muted">{d.driver_id.slice(0, 8)}</span>
                      ) : (
                        <span className="text-muted italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs truncate max-w-[160px]">
                      {(d.pickup_address ?? '—').split(',')[0]}
                    </td>
                    <td className="px-3 py-2 text-xs truncate max-w-[160px]">
                      {(d.dropoff_address ?? '—').split(',')[0]}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">{fmtUsd(d.fare_cents)}</td>
                    <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                      {new Date(d.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

      {selected && (
        <DeliveryDetailPanel delivery={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
