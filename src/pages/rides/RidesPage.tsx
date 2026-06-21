import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useRegionScope } from '../../stores/region-scope.store.js';
import { useToast } from '../../components/Toast.js';
import { PageHeader } from '../../components/PageHeader.js';
import { DateRangeFilter } from '../../components/DateRangeFilter.js';
import { Pagination } from '../../components/Pagination.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { QueryError } from '../../components/QueryError.js';
import { exportToCsv } from '../../lib/export.js';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RECURRENCE_LABEL: Record<string, string> = {
  daily: 'Every day', weekdays: 'Weekdays (Mon–Fri)',
  weekly: 'Weekly', custom: 'Custom days',
};

function RecurringSchedulesPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['adminRecurringSchedules'],
    queryFn: () => api<any[]>('/v1/admin/rides/recurring-schedules'),
    staleTime: 30_000,
  });

  if (isLoading) return <p className="text-sm text-muted py-4">Loading…</p>;
  if (!data?.length) return <p className="text-sm text-muted py-4 italic">No recurring schedules found.</p>;

  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted border-b border-border text-xs uppercase tracking-wide">
            <th className="py-2 pr-3">Label</th>
            <th className="py-2 pr-3">Pattern</th>
            <th className="py-2 pr-3">Time</th>
            <th className="py-2 pr-3">Route</th>
            <th className="py-2 pr-3">Category</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Next Ride</th>
          </tr>
        </thead>
        <tbody>
          {data.map((s: any) => {
            const days = s.days_of_week?.length
              ? s.days_of_week.sort((a: number, b: number) => a - b).map((d: number) => DAY_LABELS[d]).join(', ')
              : null;
            const pattern = RECURRENCE_LABEL[s.recurrence_type] ?? s.recurrence_type;
            return (
              <tr key={s.id} className="border-b border-border hover:bg-surface">
                <td className="py-2 pr-3 font-medium">{s.label ?? '—'}</td>
                <td className="py-2 pr-3 text-xs">{pattern}{days ? ` (${days})` : ''}</td>
                <td className="py-2 pr-3 font-mono text-xs">{s.time_of_day?.slice(0, 5)}</td>
                <td className="py-2 pr-3 max-w-[200px]">
                  <div className="text-xs truncate text-muted">{s.pickup_address}</div>
                  <div className="text-xs truncate">{s.dropoff_address}</div>
                </td>
                <td className="py-2 pr-3 text-xs capitalize">{s.vehicle_category}</td>
                <td className="py-2 pr-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${s.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {s.is_active ? 'Active' : 'Paused'}
                  </span>
                </td>
                <td className="py-2 pr-3 text-xs text-muted">
                  {s.next_ride_at ? new Date(s.next_ride_at).toLocaleString() : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface Ride {
  id: string;
  status: string;
  rider_id: string;
  driver_id: string | null;
  fare_final_cents: number | string | null;
  fare_estimate_cents: number | string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  vehicle_category: string | null;
  rider_name?: string | null;
  driver_name?: string | null;
  requested_at: string;
  completed_at: string | null;
  scheduled_for: string | null;
}

interface ListResponse { items: Ride[]; next_cursor: string | null; has_more: boolean; }

function statusColor(s: string): string {
  if (s === 'scheduled') return 'bg-purple-100 text-purple-800';
  if (s === 'completed') return 'bg-success/10 text-success';
  if (s.startsWith('cancelled') || s === 'no_drivers_available') return 'bg-danger/10 text-danger';
  if (s === 'requested') return 'bg-blue-100 text-blue-800';
  return 'bg-yellow-100 text-yellow-800';
}

function fmtUsd(c: number | string | null | undefined) {
  return `$${(Number(c ?? 0) / 100).toFixed(2)}`;
}

const VEHICLE_CATEGORIES = ['', 'economy', 'comfort', 'premium', 'xl'] as const;
const STATUSES = ['', 'scheduled', 'requested', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled_by_rider', 'cancelled_by_driver', 'no_drivers_available'];

const PAGE_SIZE = 25;
type SortKey = 'requested_at' | 'fare' | 'status' | 'vehicle_category';

export function RidesPage(): JSX.Element {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'rides' | 'schedules'>('rides');
  const [status, setStatus] = useState('');
  const [vehicleCategory, setVehicleCategory] = useState('');
  const [search, setSearch] = useState('');
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('requested_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [driverFilter, setDriverFilter] = useState('');
  const [riderFilter, setRiderFilter] = useState('');
  const regionCode = useRegionScope((s) => s.regionCode);
  const debounced = useDebounced(search, 300);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-rides', status, debounced, regionCode, vehicleCategory],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '200' });
      if (status) params.set('status', status);
      if (debounced) params.set('q', debounced);
      if (regionCode) params.set('region', regionCode);
      if (vehicleCategory) params.set('vehicle_category', vehicleCategory);
      return api<ListResponse>(`/v1/admin/rides?${params.toString()}`);
    },
  });

  const allItems = data?.items ?? [];

  const filtered = useMemo(() => {
    let items = allItems;
    if (dateFrom || dateTo) {
      items = items.filter((r) => {
        const d = r.requested_at.slice(0, 10);
        return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
      });
    }
    if (driverFilter) {
      const df = driverFilter.toLowerCase();
      items = items.filter((r) => (r.driver_name ?? '').toLowerCase().includes(df));
    }
    if (riderFilter) {
      const rf = riderFilter.toLowerCase();
      items = items.filter((r) => (r.rider_name ?? '').toLowerCase().includes(rf));
    }
    return items;
  }, [allItems, dateFrom, dateTo, driverFilter, riderFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case 'requested_at': av = a.requested_at; bv = b.requested_at; break;
        case 'fare': av = Number(a.fare_final_cents ?? a.fare_estimate_cents ?? 0); bv = Number(b.fare_final_cents ?? b.fare_estimate_cents ?? 0); break;
        case 'status': av = a.status; bv = b.status; break;
        case 'vehicle_category': av = a.vehicle_category ?? ''; bv = b.vehicle_category ?? ''; break;
      }
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const items = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
    setPage(1);
  };

  const sortIndicator = (key: SortKey) =>
    <span className="text-xs opacity-50 ml-1">{sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>;

  const handleExport = () => {
    exportToCsv(`rides-${new Date().toISOString().slice(0, 10)}`, sorted, [
      { header: 'Date', getValue: (r) => r.requested_at.slice(0, 10) },
      { header: 'Rider', getValue: (r) => r.rider_name ?? '' },
      { header: 'Driver', getValue: (r) => r.driver_name ?? '' },
      { header: 'Pickup', getValue: (r) => r.pickup_address ?? '' },
      { header: 'Dropoff', getValue: (r) => r.dropoff_address ?? '' },
      { header: 'Category', getValue: (r) => r.vehicle_category ?? '' },
      { header: 'Status', getValue: (r) => r.status },
      { header: 'Fare', getValue: (r) => ((Number(r.fare_final_cents ?? r.fare_estimate_cents ?? 0)) / 100).toFixed(2) },
      { header: 'ID', getValue: (r) => r.id },
    ]);
  };

  if (isError) return <QueryError onRetry={() => refetch()} />;

  return (
    <>
      <div className="flex items-start justify-between mb-3">
        <PageHeader title="Rides" subtitle="Search, audit, intervene." />
        <div className="flex gap-2">
          {activeTab === 'rides' && (
            <button onClick={handleExport} className="px-3 py-2 text-xs border border-border rounded hover:bg-surface">↓ Export CSV</button>
          )}
          <button onClick={() => setDispatchOpen(true)} className="px-3 py-2 text-sm bg-accent text-white rounded">+ Manual dispatch</button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border mb-4">
        {(['rides', 'schedules'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              activeTab === tab
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {tab === 'rides' ? 'All Rides' : 'Recurring Schedules'}
          </button>
        ))}
      </div>

      {activeTab === 'schedules' ? (
        <div className="bg-white border border-border rounded p-4">
          <p className="text-xs text-muted mb-3">Rider-configured recurring schedules. The sweeper checks every 5 min and auto-creates rides.</p>
          <RecurringSchedulesPanel />
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by ID or address…"
              className="min-w-[180px] max-w-xs px-3 py-1.5 bg-white text-ink border border-border rounded text-sm" />
            <input value={riderFilter} onChange={(e) => { setRiderFilter(e.target.value); setPage(1); }}
              placeholder="Rider name…"
              className="min-w-[140px] max-w-[180px] px-3 py-1.5 bg-white text-ink border border-border rounded text-sm" />
            <input value={driverFilter} onChange={(e) => { setDriverFilter(e.target.value); setPage(1); }}
              placeholder="Driver name…"
              className="min-w-[140px] max-w-[180px] px-3 py-1.5 bg-white text-ink border border-border rounded text-sm" />
            <select value={vehicleCategory} onChange={(e) => { setVehicleCategory(e.target.value); setPage(1); }}
              className="px-3 py-1.5 text-xs bg-white text-ink border border-border rounded">
              {VEHICLE_CATEGORIES.map((v) => (
                <option key={v || 'all'} value={v}>{v || 'all vehicles'}</option>
              ))}
            </select>
            <DateRangeFilter from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); setPage(1); }} />
            {(riderFilter || driverFilter) && (
              <button onClick={() => { setRiderFilter(''); setDriverFilter(''); setPage(1); }}
                className="text-xs text-accent hover:underline">Clear names</button>
            )}
          </div>

          {/* Status pills */}
          <div className="flex gap-1 flex-wrap mb-3">
            {STATUSES.map((s) => (
              <button key={s || 'all'} onClick={() => { setStatus(s); setPage(1); }}
                className={'px-3 py-1 text-xs rounded-full border transition ' +
                  (status === s ? 'bg-accent text-white border-accent' : 'bg-white text-muted border-border hover:bg-surface')}>
                {s ? s.replace(/_/g, ' ') : 'all'}
              </button>
            ))}
            <span className="ml-auto text-xs text-muted self-center">{sorted.length} ride{sorted.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="bg-white border border-border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface text-muted text-xs select-none">
                <tr>
                  <th onClick={() => toggleSort('requested_at')} className="text-left px-3 py-2 cursor-pointer hover:text-ink">
                    When{sortIndicator('requested_at')}
                  </th>
                  <th className="text-left px-3 py-2">Rider</th>
                  <th className="text-left px-3 py-2">Driver</th>
                  <th className="text-left px-3 py-2">Pickup → Dropoff</th>
                  <th onClick={() => toggleSort('vehicle_category')} className="text-left px-3 py-2 cursor-pointer hover:text-ink">
                    Category{sortIndicator('vehicle_category')}
                  </th>
                  <th onClick={() => toggleSort('status')} className="text-left px-3 py-2 cursor-pointer hover:text-ink">
                    Status{sortIndicator('status')}
                  </th>
                  <th onClick={() => toggleSort('fare')} className="text-right px-3 py-2 cursor-pointer hover:text-ink">
                    Fare{sortIndicator('fare')}
                  </th>
                  <th className="text-left px-3 py-2">ID</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-t border-border">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-3 py-2"><div className="h-3 bg-surface animate-pulse rounded w-3/4" /></td>
                        ))}
                      </tr>
                    ))
                  : items.length === 0
                  ? <tr><td colSpan={8} className="px-3 py-8 text-center text-muted">No rides match.</td></tr>
                  : items.map((r) => (
                      <tr key={r.id} onClick={() => navigate(`/rides/${r.id}`)}
                        className="cursor-pointer border-t border-border hover:bg-surface">
                        <td className="px-3 py-2 text-muted text-xs whitespace-nowrap">
                          {r.status === 'scheduled' && r.scheduled_for
                            ? <><span className="text-purple-700 font-medium">Sched: </span>{new Date(r.scheduled_for).toLocaleString()}</>
                            : new Date(r.requested_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-ink text-xs">{r.rider_name ?? '—'}</td>
                        <td className="px-3 py-2 text-ink text-xs">{r.driver_name ?? <span className="text-muted">unassigned</span>}</td>
                        <td className="px-3 py-2 text-ink text-xs truncate max-w-md">
                          {(r.pickup_address || '—').split(',')[0]} → {(r.dropoff_address || '—').split(',')[0]}
                        </td>
                        <td className="px-3 py-2 capitalize text-xs">{r.vehicle_category ?? '—'}</td>
                        <td className="px-3 py-2 text-xs">
                          <span className={'px-2 py-0.5 rounded-full ' + statusColor(r.status)}>{r.status.replace(/_/g, ' ')}</span>
                        </td>
                        <td className="px-3 py-2 text-right">{fmtUsd(r.fare_final_cents ?? r.fare_estimate_cents)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted">{r.id.slice(0, 8)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={sorted.length} onChange={setPage} />
        </>
      )}
      {dispatchOpen && <ManualDispatchModal onClose={() => setDispatchOpen(false)} onCreated={(id) => { setDispatchOpen(false); navigate(`/rides/${id}`); }} />}
    </>
  );
}

interface RiderOpt { id: string; first_name: string | null; last_name: string | null; phone_number: string | null; }
interface DriverOpt { id: string; first_name: string | null; last_name: string | null; phone_number: string | null; status: string; rating_avg?: string | number | null; rating_count?: number; }

interface NominatimResult { place_id: number; display_name: string; lat: string; lon: string; }

function AddressAutocomplete({ label, required, value, onSelect }: {
  label: string;
  required?: boolean;
  value: { address: string; lat: string; lng: string };
  onSelect: (next: { address: string; lat: string; lng: string }) => void;
}) {
  const [query, setQuery] = useState(value.address);
  const [open, setOpen] = useState(false);
  const debouncedQuery = useDebounced(query, 400);

  const { data: suggestions } = useQuery({
    queryKey: ['nominatim', debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.length < 3) return [] as NominatimResult[];
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(debouncedQuery)}`,
        { headers: { 'Accept-Language': 'en' } });
      if (!res.ok) return [] as NominatimResult[];
      return (await res.json()) as NominatimResult[];
    },
    enabled: debouncedQuery.length >= 3,
    staleTime: 60_000,
  });

  return (
    <div className="relative">
      <label className="block text-xs text-muted mb-1">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); onSelect({ address: e.target.value, lat: '', lng: '' }); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="Type at least 3 characters…"
        className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm"
      />
      {value.lat && value.lng && (
        <div className="text-xs text-muted mt-0.5 font-mono">
          📍 {parseFloat(value.lat).toFixed(5)}, {parseFloat(value.lng).toFixed(5)}
        </div>
      )}
      {open && (suggestions?.length ?? 0) > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-border rounded shadow-lg max-h-60 overflow-y-auto">
          {suggestions!.map((s) => (
            <li key={s.place_id}
              onMouseDown={(e) => { e.preventDefault(); setQuery(s.display_name); setOpen(false); onSelect({ address: s.display_name, lat: s.lat, lng: s.lon }); }}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-surface border-b border-border last:border-0">
              {s.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ManualDispatchModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const [riderQuery, setRiderQuery] = useState('');
  const [riderId, setRiderId] = useState('');
  const [pickup, setPickup] = useState({ address: '', lat: '', lng: '' });
  const [dropoff, setDropoff] = useState({ address: '', lat: '', lng: '' });
  const [vehicleType, setVehicleType] = useState('economy');
  const [driverId, setDriverId] = useState('');
  const [fareDollar, setFareDollar] = useState('');
  const [distanceM, setDistanceM] = useState('');
  const [durationS, setDurationS] = useState('');

  const [driverQuery, setDriverQuery] = useState('');
  const { data: riders } = useQuery({
    queryKey: ['admin-users-search', riderQuery],
    queryFn: () => {
      const p = new URLSearchParams({ role: 'rider', limit: '8' });
      if (riderQuery) p.set('search', riderQuery);
      return api<{ items: RiderOpt[] }>(`/v1/admin/users?${p.toString()}`);
    },
  });
  const { data: drivers } = useQuery({
    queryKey: ['admin-drivers-search', driverQuery],
    queryFn: () => {
      const p = new URLSearchParams({ role: 'driver', status: 'approved', limit: '8' });
      if (driverQuery) p.set('search', driverQuery);
      return api<{ items: DriverOpt[] }>(`/v1/admin/users?${p.toString()}`);
    },
  });

  // Auto-fetch fare estimate when both endpoints + vehicle are known
  const { data: estimate } = useQuery({
    queryKey: ['pricing-estimate', pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, vehicleType],
    queryFn: () => api<any>('/v1/admin/estimate', {
      method: 'POST',
      body: {
        pickup: { lat: parseFloat(pickup.lat), lng: parseFloat(pickup.lng) },
        dropoff: { lat: parseFloat(dropoff.lat), lng: parseFloat(dropoff.lng) },
        vehicle_categories: [vehicleType],
      },
    }),
    enabled: !!(pickup.lat && pickup.lng && dropoff.lat && dropoff.lng),
    staleTime: 30_000,
  });

  // Auto-fill fare/distance/duration when estimate arrives, unless admin overrode them
  useEffect(() => {
    if (!estimate?.estimates?.[0]) return;
    const e = estimate.estimates[0];
    if (!fareDollar) setFareDollar((e.fare_cents / 100).toFixed(2));
    if (!distanceM) setDistanceM(String(Math.round(e.distance_m)));
    if (!durationS) setDurationS(String(Math.round(e.duration_s)));
  }, [estimate]);

  const create = useMutation({
    mutationFn: () => {
      const body: any = {
        riderId,
        pickup: { lat: parseFloat(pickup.lat), lng: parseFloat(pickup.lng), address: pickup.address || undefined },
        dropoff: { lat: parseFloat(dropoff.lat), lng: parseFloat(dropoff.lng), address: dropoff.address || undefined },
        vehicleType,
      };
      if (driverId) body.driverId = driverId;
      if (fareDollar) body.fare_estimate_cents = Math.round(parseFloat(fareDollar) * 100);
      if (distanceM) body.estimated_distance_m = parseInt(distanceM, 10);
      if (durationS) body.estimated_duration_s = parseInt(durationS, 10);
      return api<{ id: string }>(`/v1/admin/rides/manual-dispatch`, { method: 'POST', body });
    },
    onSuccess: (r) => onCreated(r.id),
    onError: (e: any) => toast('Dispatch failed: ' + (e?.message ?? 'unknown error'), 'error'),
  });

  const missing: string[] = [];
  if (!riderId) missing.push('rider');
  if (!pickup.lat || !pickup.lng) missing.push('pickup');
  if (!dropoff.lat || !dropoff.lng) missing.push('dropoff');
  const canSubmit = missing.length === 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded shadow-lg p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-semibold mb-1">Manual dispatch</div>
        <div className="text-xs text-muted mb-4">
          Fields marked <span className="text-danger">*</span> are required.
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1">
              Rider <span className="text-danger">*</span>
            </label>
            <input value={riderQuery} onChange={(e) => setRiderQuery(e.target.value)}
              placeholder="Search by name or phone…"
              className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm" />
            <div className="mt-1 max-h-32 overflow-y-auto border border-border rounded bg-surface">
              {(riders?.items ?? []).map((r) => {
                const label = [r.first_name, r.last_name].filter(Boolean).join(' ') || '(unnamed)';
                const selected = riderId === r.id;
                return (
                  <div key={r.id} onClick={() => setRiderId(r.id)}
                    className={'px-3 py-1.5 text-sm cursor-pointer ' + (selected ? 'bg-accent text-white' : 'hover:bg-white')}>
                    {label} <span className={selected ? 'text-white/70' : 'text-muted'}>· {r.phone_number ?? '—'}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <AddressAutocomplete label="Pickup address" required value={pickup} onSelect={setPickup} />
          <AddressAutocomplete label="Dropoff address" required value={dropoff} onSelect={setDropoff} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <label className="block text-xs text-muted mb-1">Vehicle</label>
              <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}
                className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm">
                <option value="economy">economy</option>
                <option value="comfort">comfort</option>
                <option value="premium">premium</option>
                <option value="xl">xl</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Fare ($)</label>
              <input value={fareDollar} onChange={(e) => setFareDollar(e.target.value)}
                placeholder="optional"
                className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Distance (m)</label>
              <input value={distanceM} onChange={(e) => setDistanceM(e.target.value)}
                placeholder="optional"
                className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Duration (s)</label>
              <input value={durationS} onChange={(e) => setDurationS(e.target.value)}
                placeholder="optional"
                className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">
              Driver <span className="text-muted">(optional)</span>
            </label>
            <input value={driverQuery} onChange={(e) => setDriverQuery(e.target.value)}
              placeholder="Search by name or phone…"
              className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm" />
            <div className="mt-1 max-h-32 overflow-y-auto border border-border rounded bg-surface">
              {(drivers?.items ?? []).map((d) => {
                const label = [d.first_name, d.last_name].filter(Boolean).join(' ') || '(unnamed)';
                const selected = driverId === d.id;
                const rating = d.rating_avg && Number(d.rating_count) > 0
                  ? `★ ${Number(d.rating_avg).toFixed(2)}` : 'no rating';
                return (
                  <div key={d.id} onClick={() => setDriverId(d.id)}
                    className={'px-3 py-1.5 text-sm cursor-pointer ' + (selected ? 'bg-accent text-white' : 'hover:bg-white')}>
                    {label}<span className={selected ? 'text-white/70' : 'text-muted'}> · {d.phone_number ?? '—'} · {rating}</span>
                  </div>
                );
              })}
              {(drivers?.items?.length ?? 0) === 0 && (
                <div className="px-3 py-2 text-xs text-muted">No approved drivers match.</div>
              )}
            </div>
            <div className="text-xs text-muted mt-1">
              {driverId ? (
                <>Direct assignment: ride will start as <span className="font-medium text-ink">accepted</span> and notify this driver. <button onClick={() => setDriverId('')} className="text-accent hover:underline">clear</button></>
              ) : (
                <>Open dispatch: ride will be broadcast to nearby available drivers.</>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end items-center gap-2 mt-6">
          {!canSubmit && (
            <div className="text-xs text-danger mr-auto">
              Missing: {missing.join(', ')}
            </div>
          )}
          <button onClick={onClose} className="px-3 py-1.5 text-sm border border-border rounded">Cancel</button>
          <button onClick={() => create.mutate()} disabled={!canSubmit || create.isPending}
            className="px-3 py-1.5 text-sm bg-accent text-white rounded disabled:opacity-50">
            {create.isPending ? 'Creating…' : 'Create ride'}
          </button>
        </div>
      </div>
    </div>
  );
}
