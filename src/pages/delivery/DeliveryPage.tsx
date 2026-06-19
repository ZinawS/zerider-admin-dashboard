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
  service_type: string;
  requester_id: string;
  driver_id: string | null;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;

  // Business names (populated by API)
  requester_name?: string | null;
  driver_name?: string | null;
  recipient_name_display?: string | null;
  sender_name?: string | null;
  receiver_name?: string | null;

  // Package Information
  package_type: string | null;
  package_description: string | null;
  package_weight_kg: number | null;
  package_length_cm: number | null;
  package_width_cm: number | null;
  package_height_cm: number | null;
  is_fragile: boolean | null;
  special_handling_instructions: string | null;

  // Recipient Information
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_email: string | null;

  // Contact Information
  pickup_contact_name: string | null;
  pickup_contact_phone: string | null;
  dropoff_contact_name: string | null;
  dropoff_contact_phone: string | null;

  // Instructions & Notes
  instructions: string | null;
  delivery_notes: string | null;

  // Proof of Delivery
  require_signature: boolean | null;
  require_photo_proof: boolean | null;
  proof_of_delivery_url: string | null;
  proof_of_delivery_notes: string | null;

  // Estimated Duration & Distance
  estimated_duration_minutes: number | null;
  estimated_distance_km: number | null;

  // Pricing
  base_fare_cents: number | null;
  distance_fare_cents: number | null;
  weight_surcharge_cents: number | null;
  fragile_surcharge_cents: number | null;
  express_fee_cents: number | null;
  total_cents: number | null;
  fare_cents: number | null;
  currency: string | null;

  // Commission & Earnings breakdown
  commission_cents?: number | null;
  driver_payout_cents?: number | null;
  platform_fee_cents?: number | null;
  booking_fee_cents?: number | null;
  service_fee_cents?: number | null;
  tax_cents?: number | null;
  tip_cents?: number | null;
  bonus_cents?: number | null;

  // Payment status
  payment_status?: string | null;

  // Timestamps
  created_at: string;
  updated_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;

  // Status history
  status_history?: Array<{
    status: string;
    timestamp: string;
    note?: string;
  }> | null;

  // Tracking & Proof
  tracking_points_count?: number;
}

interface ListResponse {
  items: Delivery[];
  total: number;
  has_more: boolean;
}

const DELIVERY_STATUSES = ['', 'pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled'];
const DELIVERY_SERVICE_TYPES = ['', 'food', 'grocery', 'package', 'courier', 'pharmacy', 'retail'];

function useDeliveryConfig() {
  return { statuses: DELIVERY_STATUSES, serviceTypes: DELIVERY_SERVICE_TYPES };
}

function deliveryStatusColor(s: string): string {
  switch (s) {
    case 'pending':    return 'bg-yellow-100 text-yellow-800';
    case 'assigned':   return 'bg-blue-100 text-blue-800';
    case 'picked_up':  return 'bg-orange-100 text-orange-800';
    case 'in_transit': return 'bg-purple-100 text-purple-800';
    case 'delivered':  return 'bg-green-100 text-green-800';
    case 'failed':     return 'bg-red-100 text-red-800';
    case 'cancelled':  return 'bg-gray-100 text-gray-800';
    default:           return 'bg-gray-100 text-gray-600';
  }
}

function fmtCents(c: number | null | undefined, currency = 'ETB') {
  if (c == null) return '—';
  return `${currency} ${(Number(c) / 100).toFixed(2)}`;
}

const PAGE_SIZE = 25;

interface DetailPanelProps {
  delivery: Delivery;
  onClose: () => void;
}

function DetailRow({ label, value }: { label: string; value?: string | null | number | boolean }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex justify-between py-1.5 border-b border-border/50 last:border-b-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xs font-medium text-ink text-right max-w-[60%]">{String(value)}</span>
    </div>
  );
}

function DeliveryDetailPanel({ delivery, onClose }: DetailPanelProps): JSX.Element {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-end z-50" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-white z-10">
          <div className="font-semibold text-sm">Delivery {delivery.id.slice(0, 8)}</div>
          <button onClick={onClose} className="text-muted hover:text-ink text-lg leading-none">&times;</button>
        </div>
        <div className="px-5 py-4 space-y-5 text-sm">

          {/* Status & Type */}
          <div className="flex gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${deliveryStatusColor(delivery.status)}`}>
              {delivery.status.replace(/_/g, ' ')}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 capitalize">
              {delivery.service_type || delivery.type}
            </span>
          </div>

          {/* General Info */}
          <div>
            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">General</div>
            <DetailRow label="ID" value={delivery.id} />
            <DetailRow label="Requester" value={delivery.requester_name ?? delivery.requester_id} />
            <DetailRow label="Driver" value={delivery.driver_name ?? delivery.driver_id ?? 'Unassigned'} />
            <DetailRow label="Service Type" value={delivery.service_type || delivery.type} />
            <DetailRow label="Created" value={new Date(delivery.created_at).toLocaleString()} />
            <DetailRow label="Updated" value={delivery.updated_at ? new Date(delivery.updated_at).toLocaleString() : null} />
            <DetailRow label="Picked Up" value={delivery.picked_up_at ? new Date(delivery.picked_up_at).toLocaleString() : null} />
            <DetailRow label="Delivered" value={delivery.delivered_at ? new Date(delivery.delivered_at).toLocaleString() : null} />
          </div>

          {/* Route */}
          <div>
            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Route</div>
            <DetailRow label="Pickup Address" value={delivery.pickup_address} />
            <DetailRow label="Pickup Coords" value={delivery.pickup_lat != null ? `${delivery.pickup_lat.toFixed(6)}, ${delivery.pickup_lng?.toFixed(6)}` : null} />
            <DetailRow label="Dropoff Address" value={delivery.dropoff_address} />
            <DetailRow label="Dropoff Coords" value={delivery.dropoff_lat != null ? `${delivery.dropoff_lat.toFixed(6)}, ${delivery.dropoff_lng?.toFixed(6)}` : null} />
            <DetailRow label="Est. Distance" value={delivery.estimated_distance_km != null ? `${delivery.estimated_distance_km} km` : null} />
            <DetailRow label="Est. Duration" value={delivery.estimated_duration_minutes != null ? `${delivery.estimated_duration_minutes} min` : null} />
          </div>

          {/* Package Details */}
          {(delivery.package_type || delivery.package_description || delivery.package_weight_kg != null || delivery.is_fragile != null) && (
            <div>
              <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Package Details</div>
              <DetailRow label="Type" value={delivery.package_type} />
              <DetailRow label="Description" value={delivery.package_description} />
              <DetailRow label="Weight" value={delivery.package_weight_kg != null ? `${delivery.package_weight_kg} kg` : null} />
              <DetailRow label="Dimensions" value={
                (delivery.package_length_cm || delivery.package_width_cm || delivery.package_height_cm)
                  ? `${delivery.package_length_cm ?? '?'} × ${delivery.package_width_cm ?? '?'} × ${delivery.package_height_cm ?? '?'} cm`
                  : null
              } />
              <DetailRow label="Fragile" value={delivery.is_fragile ? '⚠️ Yes' : (delivery.is_fragile === false ? 'No' : null)} />
              <DetailRow label="Special Handling" value={delivery.special_handling_instructions} />
            </div>
          )}

          {/* Recipient */}
          {(delivery.recipient_name || delivery.recipient_phone || delivery.recipient_email) && (
            <div>
              <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Recipient</div>
              <DetailRow label="Name" value={delivery.recipient_name} />
              <DetailRow label="Phone" value={delivery.recipient_phone} />
              <DetailRow label="Email" value={delivery.recipient_email} />
            </div>
          )}

          {/* Contact Information */}
          {(delivery.pickup_contact_name || delivery.pickup_contact_phone || delivery.dropoff_contact_name || delivery.dropoff_contact_phone) && (
            <div>
              <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Contact Information</div>
              <DetailRow label="Pickup Contact" value={delivery.pickup_contact_name} />
              <DetailRow label="Pickup Phone" value={delivery.pickup_contact_phone} />
              <DetailRow label="Dropoff Contact" value={delivery.dropoff_contact_name} />
              <DetailRow label="Dropoff Phone" value={delivery.dropoff_contact_phone} />
            </div>
          )}

          {/* Instructions & Notes */}
          {(delivery.instructions || delivery.delivery_notes) && (
            <div>
              <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Instructions & Notes</div>
              <DetailRow label="Instructions" value={delivery.instructions} />
              <DetailRow label="Delivery Notes" value={delivery.delivery_notes} />
            </div>
          )}

          {/* Proof of Delivery */}
          {(delivery.require_signature != null || delivery.require_photo_proof != null || delivery.proof_of_delivery_url) && (
            <div>
              <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Proof of Delivery</div>
              <DetailRow label="Require Signature" value={delivery.require_signature ? 'Yes' : (delivery.require_signature === false ? 'No' : null)} />
              <DetailRow label="Require Photo" value={delivery.require_photo_proof ? 'Yes' : (delivery.require_photo_proof === false ? 'No' : null)} />
              {delivery.proof_of_delivery_url && (
                <div className="mt-2">
                  <img
                    src={delivery.proof_of_delivery_url}
                    alt="Proof of delivery"
                    className="w-full rounded border border-border object-cover max-h-72 cursor-pointer"
                    onClick={() => window.open(delivery.proof_of_delivery_url!, '_blank')}
                    title="Click to open full size"
                  />
                  <a
                    href={delivery.proof_of_delivery_url}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-accent underline"
                  >
                    Download photo
                  </a>
                  {delivery.proof_of_delivery_notes && (
                    <p className="mt-2 text-xs text-muted">{delivery.proof_of_delivery_notes}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Pricing */}
          {(delivery.total_cents != null || delivery.base_fare_cents != null) && (
            <div>
              <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Pricing</div>
              <DetailRow label="Base Fare" value={fmtCents(delivery.base_fare_cents, delivery.currency ?? undefined)} />
              <DetailRow label="Distance Fare" value={fmtCents(delivery.distance_fare_cents, delivery.currency ?? undefined)} />
              <DetailRow label="Weight Surcharge" value={fmtCents(delivery.weight_surcharge_cents, delivery.currency ?? undefined)} />
              <DetailRow label="Fragile Surcharge" value={fmtCents(delivery.fragile_surcharge_cents, delivery.currency ?? undefined)} />
              <DetailRow label="Express Fee" value={fmtCents(delivery.express_fee_cents, delivery.currency ?? undefined)} />
              <div className="flex justify-between py-1.5 mt-1 border-t border-border font-semibold">
                <span className="text-xs text-ink">Total</span>
                <span className="text-xs text-ink">{fmtCents(delivery.total_cents ?? delivery.fare_cents, delivery.currency ?? undefined)}</span>
              </div>
            </div>
          )}

          {/* Tracking */}
          {delivery.tracking_points_count != null && (
            <div>
              <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Tracking</div>
              <DetailRow label="Tracking Points" value={delivery.tracking_points_count} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function useUserNames(ids: string[]) {
  const key = useMemo(() => ids.filter(Boolean).sort().join(','), [ids]);
  return useQuery({
    queryKey: ['delivery-user-names', key],
    queryFn: async () => {
      const unique = [...new Set(ids.filter(Boolean))];
      const names: Record<string, string> = {};
      await Promise.allSettled(
        unique.map(async (id) => {
          const u = await api<any>(`/v1/admin/users/${id}`).catch(() => null);
          if (u && !u.statusCode) {
            const profile = u.rider ?? u.driver ?? u;
            const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ')
              || profile.email || u.email || id.slice(0, 8);
            names[id] = name;
          } else {
            names[id] = id.slice(0, 8);
          }
        }),
      );
      return names;
    },
    enabled: ids.filter(Boolean).length > 0,
    staleTime: 300_000,
  });
}

export function DeliveryPage(): JSX.Element {
  const [status, setStatus] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Delivery | null>(null);
  const regionCode = useRegionScope((s) => s.regionCode);
  const debounced = useDebounced(search, 300);
  const { statuses, serviceTypes } = useDeliveryConfig();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-deliveries', status, serviceType, debounced, regionCode, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (status)      params.set('status', status);
      if (serviceType) params.set('service_type', serviceType);
      if (debounced)   params.set('q', debounced);
      if (regionCode)  params.set('region', regionCode);
      return api<ListResponse>(`/v1/admin/deliveries?${params.toString()}`);
    },
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? items.length;

  const allUserIds = useMemo(
    () => items.flatMap((d) => [d.requester_id, d.driver_id].filter(Boolean) as string[]),
    [items],
  );
  const { data: userNames = {} } = useUserNames(allUserIds);

  function resolvedName(id: string | null | undefined): string | null {
    if (!id) return null;
    return userNames[id] ?? null;
  }

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
          {statuses.map((s) => (
            <option key={s || 'all'} value={s}>{s ? s.replace(/_/g, ' ') : 'all statuses'}</option>
          ))}
        </select>
        <select
          value={serviceType}
          onChange={(e) => { setServiceType(e.target.value); setPage(1); }}
          className="px-3 py-1.5 text-xs bg-white text-ink border border-border rounded"
        >
          {serviceTypes.map((s) => (
            <option key={s || 'all'} value={s}>{s ? s : 'all service types'}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted self-center">{total} deliver{total !== 1 ? 'ies' : 'y'}</span>
      </div>

      {/* Status pills */}
      <div className="flex gap-1 flex-wrap mb-3">
        {statuses.map((s) => (
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
              <th className="text-center px-3 py-2">Proof</th>
              <th className="text-left px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-border">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <div className="h-3 bg-surface animate-pulse rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : items.length === 0
              ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted">No deliveries match.</td>
                </tr>
              )
              : items.map((d) => {
                const requesterDisplay = resolvedName(d.requester_id) ?? d.requester_id.slice(0, 8);
                const driverDisplay = d.driver_id ? (resolvedName(d.driver_id) ?? d.driver_id.slice(0, 8)) : null;
                return (
                  <tr
                    key={d.id}
                    onClick={() => setSelected({ ...d, requester_name: resolvedName(d.requester_id), driver_name: d.driver_id ? resolvedName(d.driver_id) : null })}
                    className="cursor-pointer border-t border-border hover:bg-surface"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-muted" title={d.id}>{d.id.slice(0, 8)}</td>
                    <td className="px-3 py-2 text-xs capitalize">{d.service_type || d.type}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full ${deliveryStatusColor(d.status)}`}>
                        {d.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs" title={d.requester_id}>
                      {resolvedName(d.requester_id)
                        ? <span>{requesterDisplay}</span>
                        : <span className="font-mono text-muted">{requesterDisplay}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs" title={d.driver_id ?? ''}>
                      {driverDisplay
                        ? <span>{driverDisplay}</span>
                        : <span className="text-muted italic">Unassigned</span>}
                    </td>
                    <td className="px-3 py-2 text-xs truncate max-w-[160px]">
                      {(d.pickup_address ?? '—').split(',')[0]}
                    </td>
                    <td className="px-3 py-2 text-xs truncate max-w-[160px]">
                      {(d.dropoff_address ?? '—').split(',')[0]}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">{fmtCents(d.total_cents ?? d.fare_cents, d.currency ?? undefined)}</td>
                    <td className="px-3 py-2 text-center text-xs">
                      {d.proof_of_delivery_url
                        ? <span title="Proof uploaded" className="text-green-600">✓</span>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                      {new Date(d.created_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
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
