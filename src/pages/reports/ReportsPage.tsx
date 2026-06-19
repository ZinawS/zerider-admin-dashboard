import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useRegionScope } from '../../stores/region-scope.store';
import { PageHeader } from '../../components/PageHeader';
import { exportToCsv, exportToExcel, printReport, type ExportColumn } from '../../lib/export';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

function ChartCard({ title, children, height = 240 }: { title: string; children: React.ReactNode; height?: number }) {
  return (
    <div className="bg-white border border-border rounded p-4 mb-4">
      <div className="text-xs uppercase text-muted mb-3">{title}</div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>{children as any}</ResponsiveContainer>
      </div>
    </div>
  );
}

type Tab = 'revenue' | 'deliveries' | 'drivers' | 'riders' | 'marketplace' | 'refunds' | 'operations';
type RangePreset = 'today' | '7d' | '30d' | 'mtd' | 'lastmonth' | 'custom';

function fmtUsd(c: number | string | null | undefined) {
  return `$${(Number(c ?? 0) / 100).toFixed(2)}`;
}

function fmtMiles(m: number | string | null | undefined) {
  return `${(Number(m ?? 0) / 1609).toFixed(1)} mi`;
}

function toIso(date: Date) {
  return date.toISOString();
}

function computeRange(preset: RangePreset, customStart: string, customEnd: string): { start: string; end: string } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  if (preset === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (preset === '7d') {
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (preset === '30d') {
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
  } else if (preset === 'mtd') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (preset === 'lastmonth') {
    start.setMonth(start.getMonth() - 1);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    e.setHours(23, 59, 59, 999);
    return { start: toIso(start), end: toIso(e) };
  } else {
    return {
      start: customStart ? `${customStart}T00:00:00Z` : toIso(start),
      end: customEnd ? `${customEnd}T23:59:59Z` : toIso(end),
    };
  }
  return { start: toIso(start), end: toIso(end) };
}

// ── Export dropdown (CSV / Excel / PDF) ──────────────────────────────────────
function ExportMenu<T>({
  rows,
  filename,
  columns,
  title,
  subtitle,
}: {
  rows: T[];
  filename: string;
  columns: ExportColumn<T>[];
  title: string;
  subtitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOut);
    return () => document.removeEventListener('mousedown', onClickOut);
  }, []);

  const disabled = !rows.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-border rounded hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        ↓ Export
        <svg className="w-3 h-3 text-muted" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-white border border-border rounded shadow-lg z-10">
          <button
            onClick={() => { exportToCsv(filename, rows, columns); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-xs hover:bg-surface transition"
          >
            CSV (.csv)
          </button>
          <button
            onClick={() => { exportToExcel(filename.replace(/\.csv$/, ''), rows, columns, title); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-xs hover:bg-surface border-t border-border transition"
          >
            Excel (.xls)
          </button>
          <button
            onClick={() => { printReport(title, rows, columns, subtitle); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-xs hover:bg-surface border-t border-border transition"
          >
            Print / PDF
          </button>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: any; accent?: 'success' | 'danger' | 'accent' }) {
  const color = accent === 'success' ? 'text-success' : accent === 'danger' ? 'text-danger' : accent === 'accent' ? 'text-accent' : 'text-ink';
  return (
    <div className="bg-white border border-border rounded p-4">
      <div className="text-xs uppercase text-muted">{label}</div>
      <div className={'text-xl font-semibold mt-1 ' + color}>{value}</div>
    </div>
  );
}

export function ReportsPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('revenue');
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const range = useMemo(() => computeRange(preset, customStart, customEnd), [preset, customStart, customEnd]);
  const regionCode = useRegionScope((s) => s.regionCode);
  const params = new URLSearchParams({ start: range.start, end: range.end });
  if (regionCode) params.set('region', regionCode);

  return (
    <>
      <PageHeader title="Reports" subtitle="Financial, operational, and tax-ready reports." />

      <div className="flex flex-wrap items-center gap-2 mb-4 bg-white border border-border rounded p-3">
        <div className="flex gap-1">
          {(['today', '7d', '30d', 'mtd', 'lastmonth', 'custom'] as RangePreset[]).map((p) => (
            <button key={p} onClick={() => setPreset(p)}
              className={'px-3 py-1.5 text-xs rounded-full border transition ' +
                (preset === p ? 'bg-accent text-white border-accent' : 'bg-white text-muted border-border hover:bg-surface')}>
              {p === '7d' ? 'Last 7 days' : p === '30d' ? 'Last 30 days' : p === 'mtd' ? 'Month-to-date' : p === 'lastmonth' ? 'Last month' : p === 'today' ? 'Today' : 'Custom'}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
              className="px-2 py-1 text-xs bg-white text-ink border border-border rounded" />
            <span className="text-muted text-xs">to</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2 py-1 text-xs bg-white text-ink border border-border rounded" />
          </div>
        )}
        <div className="ml-auto text-xs text-muted font-mono">
          {range.start.slice(0, 10)} → {range.end.slice(0, 10)}
        </div>
      </div>

      <div className="flex gap-1 border-b border-border mb-4 overflow-x-auto">
        {(['revenue', 'deliveries', 'drivers', 'riders', 'marketplace', 'refunds', 'operations'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={'px-4 py-2 capitalize text-sm font-medium border-b-2 transition whitespace-nowrap ' +
              (tab === t ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink')}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'revenue' && <RevenueReport params={params.toString()} range={range} />}
      {tab === 'deliveries' && <DeliveriesReport range={range} />}
      {tab === 'drivers' && <DriversReport params={params.toString()} range={range} />}
      {tab === 'riders' && <RidersReport params={params.toString()} range={range} />}
      {tab === 'marketplace' && <MarketplaceReport range={range} />}
      {tab === 'refunds' && <RefundsReport params={params.toString()} range={range} />}
      {tab === 'operations' && <OpsReport params={params.toString()} range={range} />}
    </>
  );
}

// ============ DELIVERIES ============
const DELIVERY_STATUS_COLOR: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-800',
  assigned:   'bg-blue-100 text-blue-800',
  picked_up:  'bg-orange-100 text-orange-800',
  in_transit: 'bg-purple-100 text-purple-800',
  delivered:  'bg-green-100 text-green-800',
  failed:     'bg-red-100 text-red-800',
  cancelled:  'bg-gray-100 text-gray-600',
};

const SERVICE_TYPE_LABEL: Record<string, string> = {
  food: 'Food', grocery: 'Grocery', package: 'Package',
  courier: 'Courier', pharmacy: 'Pharmacy', retail: 'Retail',
};

interface DeliveryItem {
  id: string;
  status: string;
  service_type: string;
  total_cents: number | null;
  fare_cents: number | null;
  base_fare_cents: number | null;
  distance_fare_cents: number | null;
  weight_surcharge_cents: number | null;
  fragile_surcharge_cents: number | null;
  created_at: string;
  delivered_at: string | null;
  picked_up_at: string | null;
  cancelled_at: string | null;
  failed_at: string | null;
  requester_id: string;
  driver_id: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  pickup_contact_name: string | null;
  pickup_contact_phone: string | null;
  package_type: string | null;
  package_description: string | null;
  package_weight_kg: number | null;
  is_fragile: boolean | null;
  estimated_distance_km: number | null;
  estimated_duration_minutes: number | null;
  cancellation_reason: string | null;
  currency: string | null;
}

function DeliveriesReport({ range }: { range: { start: string; end: string } }) {
  const { data, isLoading } = useQuery({
    queryKey: ['report-deliveries', range.start, range.end],
    queryFn: () => api<{ items: DeliveryItem[]; total: number; has_more: boolean }>(
      `/v1/deliveries/admin/all?limit=500`,
    ),
  });

  const allItems = data?.items ?? [];

  const rows = useMemo(() => {
    const start = new Date(range.start).getTime();
    const end = new Date(range.end).getTime();
    return allItems.filter((d) => {
      const t = new Date(d.created_at).getTime();
      return t >= start && t <= end;
    });
  }, [allItems, range.start, range.end]);

  const subtitle = `${range.start.slice(0, 10)} to ${range.end.slice(0, 10)}`;

  const totals = useMemo(() => {
    const delivered = rows.filter((r) => r.status === 'delivered');
    const active = rows.filter((r) => ['assigned', 'picked_up', 'in_transit'].includes(r.status));
    const cancelled = rows.filter((r) => r.status === 'cancelled' || r.status === 'failed');
    const revenue = delivered.reduce((sum, r) => sum + Number(r.total_cents ?? r.fare_cents ?? r.base_fare_cents ?? 0), 0);
    return { total: rows.length, delivered: delivered.length, active: active.length, cancelled: cancelled.length, revenue };
  }, [rows]);

  const byServiceType = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    rows.forEach((r) => {
      const key = r.service_type || 'unknown';
      if (!map[key]) map[key] = { count: 0, revenue: 0 };
      map[key].count += 1;
      if (r.status === 'delivered') {
        map[key].revenue += Number(r.total_cents ?? r.fare_cents ?? r.base_fare_cents ?? 0);
      }
    });
    return Object.entries(map).map(([type, v]) => ({ type, ...v })).sort((a, b) => b.count - a.count);
  }, [rows]);

  const byStatus = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((r) => { map[r.status] = (map[r.status] || 0) + 1; });
    return Object.entries(map).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);
  }, [rows]);

  const exportColumns: ExportColumn<DeliveryItem>[] = [
    { header: 'ID', getValue: (r) => r.id },
    { header: 'Status', getValue: (r) => r.status },
    { header: 'Service Type', getValue: (r) => r.service_type },
    { header: 'Requester ID', getValue: (r) => r.requester_id },
    { header: 'Driver / Delivery Person ID', getValue: (r) => r.driver_id ?? '' },
    { header: 'Recipient Name', getValue: (r) => r.recipient_name ?? '' },
    { header: 'Recipient Phone', getValue: (r) => r.recipient_phone ?? '' },
    { header: 'Pickup Contact', getValue: (r) => r.pickup_contact_name ?? '' },
    { header: 'Pickup Contact Phone', getValue: (r) => r.pickup_contact_phone ?? '' },
    { header: 'Package Type', getValue: (r) => r.package_type ?? '' },
    { header: 'Package Description', getValue: (r) => r.package_description ?? '' },
    { header: 'Weight (kg)', getValue: (r) => r.package_weight_kg != null ? String(r.package_weight_kg) : '' },
    { header: 'Fragile', getValue: (r) => r.is_fragile ? 'Yes' : 'No' },
    { header: 'Distance (km)', getValue: (r) => r.estimated_distance_km != null ? String(r.estimated_distance_km) : '' },
    { header: 'Duration (min)', getValue: (r) => r.estimated_duration_minutes != null ? String(r.estimated_duration_minutes) : '' },
    { header: 'Base Fare', getValue: (r) => fmtUsd(r.base_fare_cents) },
    { header: 'Distance Fare', getValue: (r) => fmtUsd(r.distance_fare_cents) },
    { header: 'Weight Surcharge', getValue: (r) => fmtUsd(r.weight_surcharge_cents) },
    { header: 'Fragile Surcharge', getValue: (r) => fmtUsd(r.fragile_surcharge_cents) },
    { header: 'Total Revenue', getValue: (r) => fmtUsd(r.total_cents ?? r.fare_cents) },
    { header: 'Currency', getValue: (r) => r.currency ?? 'USD' },
    { header: 'Pickup Address', getValue: (r) => r.pickup_address ?? '' },
    { header: 'Dropoff Address', getValue: (r) => r.dropoff_address ?? '' },
    { header: 'Created', getValue: (r) => new Date(r.created_at).toLocaleString() },
    { header: 'Picked Up', getValue: (r) => r.picked_up_at ? new Date(r.picked_up_at).toLocaleString() : '' },
    { header: 'Delivered', getValue: (r) => r.delivered_at ? new Date(r.delivered_at).toLocaleString() : '' },
    { header: 'Cancelled / Failed', getValue: (r) => (r.cancelled_at ?? r.failed_at) ? new Date((r.cancelled_at ?? r.failed_at)!).toLocaleString() : '' },
    { header: 'Cancellation Reason', getValue: (r) => r.cancellation_reason ?? '' },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="Total deliveries" value={totals.total} />
        <Kpi label="Delivered" value={totals.delivered} accent="success" />
        <Kpi label="Active" value={totals.active} accent="accent" />
        <Kpi label="Cancelled / failed" value={totals.cancelled} accent="danger" />
        <Kpi label="Delivery revenue" value={fmtUsd(totals.revenue)} accent="success" />
        <Kpi label="Completion rate" value={totals.total ? `${((totals.delivered / totals.total) * 100).toFixed(1)}%` : '—'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {byServiceType.length > 0 && (
          <ChartCard title="Deliveries by service type">
            <BarChart data={byServiceType.map((s) => ({ name: SERVICE_TYPE_LABEL[s.type] ?? s.type, count: s.count, revenue: s.revenue / 100 }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any, name: string) => name === 'revenue' ? `$${Number(v).toFixed(2)}` : v} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="count" name="Deliveries" fill={CHART_COLORS[0]} />
              <Bar dataKey="revenue" name="Revenue ($)" fill={CHART_COLORS[1]} />
            </BarChart>
          </ChartCard>
        )}
        {byStatus.length > 0 && (
          <ChartCard title="Status breakdown" height={240}>
            <PieChart>
              <Pie
                data={byStatus.map((s) => ({ name: s.status.replace(/_/g, ' '), value: s.count }))}
                dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                label={(e: any) => `${e.name}: ${e.value}`}
              >
                {byStatus.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ChartCard>
        )}
      </div>

      <div className="flex justify-end mb-2">
        <ExportMenu rows={rows} filename={`deliveries-${range.start.slice(0,10)}-${range.end.slice(0,10)}`} columns={exportColumns} title="Delivery Report" subtitle={subtitle} />
      </div>

      <div className="bg-white border border-border rounded overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-surface text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Requester</th>
              <th className="text-left px-3 py-2">Delivery Person</th>
              <th className="text-left px-3 py-2">Recipient</th>
              <th className="text-left px-3 py-2">Package</th>
              <th className="text-left px-3 py-2">Route</th>
              <th className="text-right px-3 py-2">Revenue</th>
              <th className="text-left px-3 py-2">Created</th>
              <th className="text-left px-3 py-2">Completed</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={11} className="px-3 py-6 text-center text-muted">Loading…</td></tr>}
            {!isLoading && !rows.length && <tr><td colSpan={11} className="px-3 py-6 text-center text-muted">No deliveries in this period.</td></tr>}
            {rows.slice(0, 100).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs text-muted" title={r.id}>{r.id.slice(0, 8)}</td>
                <td className="px-3 py-2 text-xs capitalize">{SERVICE_TYPE_LABEL[r.service_type] ?? r.service_type}</td>
                <td className="px-3 py-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full ${DELIVERY_STATUS_COLOR[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {r.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs font-mono text-muted" title={r.requester_id}>{r.requester_id.slice(0, 8)}</td>
                <td className="px-3 py-2 text-xs">
                  {r.driver_id
                    ? <span className="font-mono text-muted" title={r.driver_id}>{r.driver_id.slice(0, 8)}</span>
                    : <span className="text-muted italic">Unassigned</span>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.recipient_name && <div className="font-medium text-ink">{r.recipient_name}</div>}
                  {r.recipient_phone && <div className="text-muted">{r.recipient_phone}</div>}
                  {!r.recipient_name && !r.recipient_phone && <span className="text-muted">—</span>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.package_type && <div className="capitalize">{r.package_type}</div>}
                  {r.package_description && <div className="text-muted truncate max-w-[120px]" title={r.package_description}>{r.package_description}</div>}
                  {r.is_fragile && <span className="text-orange-600 text-xs">⚠ Fragile</span>}
                </td>
                <td className="px-3 py-2 text-xs text-ink truncate max-w-[160px]">
                  {(r.pickup_address ?? '—').split(',')[0]} → {(r.dropoff_address ?? '—').split(',')[0]}
                  {r.estimated_distance_km && <div className="text-muted">{r.estimated_distance_km} km · {r.estimated_duration_minutes} min</div>}
                </td>
                <td className="px-3 py-2 text-right text-xs text-success font-medium">
                  {r.status === 'delivered' ? fmtUsd(r.total_cents ?? r.fare_cents) : '—'}
                </td>
                <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                  {r.delivered_at ? new Date(r.delivered_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
            {rows.length > 100 && (
              <tr className="border-t border-border">
                <td colSpan={11} className="px-3 py-2 text-center text-xs text-muted">
                  Showing first 100 of {rows.length} deliveries. Export for full data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ REVENUE ============
function RevenueReport({ params, range }: { params: string; range: { start: string; end: string } }) {
  const { data, isLoading } = useQuery({
    queryKey: ['report-revenue', params],
    queryFn: () => api<any[]>(`/v1/admin/rides/reports/revenue?${params}`),
  });

  // Delivery revenue for same date range
  const { data: deliveryData } = useQuery({
    queryKey: ['report-revenue-deliveries', range.start, range.end],
    queryFn: () => api<{ items: any[]; total: number }>(`/v1/admin/deliveries?limit=500&page=1`),
  });

  // Marketplace revenue (all-time from the marketplace endpoint)
  const { data: mpRevData } = useQuery({
    queryKey: ['report-revenue-marketplace'],
    queryFn: () => api<any>('/v1/admin/marketplace/revenue'),
  });

  const rows = data ?? [];
  const subtitle = `${range.start.slice(0, 10)} to ${range.end.slice(0, 10)}`;
  const totals = useMemo(() => rows.reduce((acc, r) => ({
    completed: acc.completed + Number(r.completed_rides ?? 0),
    cancelled: acc.cancelled + Number(r.cancelled_rides ?? 0),
    gross: acc.gross + Number(r.gross_fare_cents ?? 0),
    serviceFee: acc.serviceFee + Number(r.service_fee_cents ?? 0),
    bookingFee: acc.bookingFee + Number(r.booking_fee_cents ?? 0),
    tips: acc.tips + Number(r.tips_cents ?? 0),
    driverPayout: acc.driverPayout + Number(r.driver_payout_cents ?? 0),
    refunded: acc.refunded + Number(r.refunded_cents ?? 0),
    platformNet: acc.platformNet + Number(r.platform_net_cents ?? 0),
  }), { completed: 0, cancelled: 0, gross: 0, serviceFee: 0, bookingFee: 0, tips: 0, driverPayout: 0, refunded: 0, platformNet: 0 }), [rows]);

  const deliveryRevCents = useMemo(() => {
    const start = new Date(range.start).getTime();
    const end = new Date(range.end).getTime();
    return (deliveryData?.items ?? [])
      .filter((d) => d.status === 'delivered' && new Date(d.created_at).getTime() >= start && new Date(d.created_at).getTime() <= end)
      .reduce((s, d) => s + Number(d.total_cents ?? d.fare_cents ?? 0), 0);
  }, [deliveryData, range]);

  const mpRevCents = Number(mpRevData?.totals?.total_revenue_cents ?? 0);
  const totalPlatformRevCents = totals.gross + deliveryRevCents + mpRevCents;

  const columns: ExportColumn<any>[] = [
    { header: 'Day', getValue: (r) => r.day },
    { header: 'Completed', getValue: (r) => r.completed_rides },
    { header: 'Cancelled', getValue: (r) => r.cancelled_rides },
    { header: 'Gross Fare', getValue: (r) => fmtUsd(r.gross_fare_cents) },
    { header: 'Service Fee', getValue: (r) => fmtUsd(r.service_fee_cents) },
    { header: 'Booking Fee', getValue: (r) => fmtUsd(r.booking_fee_cents) },
    { header: 'Tips', getValue: (r) => fmtUsd(r.tips_cents) },
    { header: 'Driver Payout', getValue: (r) => fmtUsd(r.driver_payout_cents) },
    { header: 'Refunds', getValue: (r) => fmtUsd(r.refunded_cents) },
    { header: 'Platform Net', getValue: (r) => fmtUsd(r.platform_net_cents) },
  ];

  return (
    <div>
      {/* Cross-service revenue summary */}
      <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 mb-4">
        <div className="text-xs uppercase text-accent/70 font-medium tracking-wide mb-3">Total Platform Revenue — All Branches</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Total platform revenue" value={fmtUsd(totalPlatformRevCents)} accent="success" />
          <Kpi label="Ride revenue (gross)" value={fmtUsd(totals.gross)} />
          <Kpi label="Delivery revenue" value={fmtUsd(deliveryRevCents)} accent="accent" />
          <Kpi label="Marketplace fees" value={fmtUsd(mpRevCents)} accent="accent" />
        </div>
      </div>

      <div className="text-xs uppercase text-muted font-medium mb-2 mt-4">Ride Revenue Breakdown</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="Completed rides" value={totals.completed} />
        <Kpi label="Gross fares" value={fmtUsd(totals.gross)} />
        <Kpi label="Driver payouts" value={fmtUsd(totals.driverPayout)} />
        <Kpi label="Platform net" value={fmtUsd(totals.platformNet)} accent="success" />
        <Kpi label="Service fees" value={fmtUsd(totals.serviceFee)} />
        <Kpi label="Booking fees" value={fmtUsd(totals.bookingFee)} />
        <Kpi label="Tips paid" value={fmtUsd(totals.tips)} accent="accent" />
        <Kpi label="Refunds" value={fmtUsd(totals.refunded)} accent="danger" />
      </div>
      {rows.length > 0 && (
        <ChartCard title="Daily revenue trend">
          <LineChart data={[...rows].reverse().map((r) => ({ day: r.day.slice(5), gross: r.gross_fare_cents / 100, net: r.platform_net_cents / 100, driver: r.driver_payout_cents / 100 }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(v: any) => `$${Number(v).toFixed(2)}`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="gross" name="Gross fare" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="driver" name="Driver payout" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="net" name="Platform net" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>
      )}
      <div className="flex justify-end mb-2">
        <ExportMenu rows={rows} filename={`revenue-${range.start.slice(0,10)}-${range.end.slice(0,10)}`} columns={columns} title="Revenue Report" subtitle={subtitle} />
      </div>
      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Day</th>
              <th className="text-right px-3 py-2">Completed</th>
              <th className="text-right px-3 py-2">Cancelled</th>
              <th className="text-right px-3 py-2">Gross</th>
              <th className="text-right px-3 py-2">Service fee</th>
              <th className="text-right px-3 py-2">Booking fee</th>
              <th className="text-right px-3 py-2">Tips</th>
              <th className="text-right px-3 py-2">Driver payout</th>
              <th className="text-right px-3 py-2">Refunds</th>
              <th className="text-right px-3 py-2">Platform net</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={10} className="px-3 py-6 text-center text-muted">Loading…</td></tr>}
            {!isLoading && !rows.length && <tr><td colSpan={10} className="px-3 py-6 text-center text-muted">No data for this range.</td></tr>}
            {rows.map((r) => (
              <tr key={r.day} className="border-t border-border">
                <td className="px-3 py-2 text-ink">{r.day}</td>
                <td className="px-3 py-2 text-right">{r.completed_rides}</td>
                <td className="px-3 py-2 text-right text-muted">{r.cancelled_rides}</td>
                <td className="px-3 py-2 text-right">{fmtUsd(r.gross_fare_cents)}</td>
                <td className="px-3 py-2 text-right">{fmtUsd(r.service_fee_cents)}</td>
                <td className="px-3 py-2 text-right">{fmtUsd(r.booking_fee_cents)}</td>
                <td className="px-3 py-2 text-right text-accent">{fmtUsd(r.tips_cents)}</td>
                <td className="px-3 py-2 text-right">{fmtUsd(r.driver_payout_cents)}</td>
                <td className="px-3 py-2 text-right text-danger">{fmtUsd(r.refunded_cents)}</td>
                <td className="px-3 py-2 text-right text-success font-medium">{fmtUsd(r.platform_net_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ DRIVERS ============
function DriversReport({ params, range }: { params: string; range: { start: string; end: string } }) {
  const { data, isLoading } = useQuery({
    queryKey: ['report-drivers', params],
    queryFn: () => api<any[]>(`/v1/admin/rides/reports/drivers?${params}`),
  });
  const rows = useMemo(() => (data ?? []).filter((r) =>
    r.driver_name && r.driver_name.trim() !== '' && Number(r.completed_rides ?? 0) > 0
  ), [data]);
  const subtitle = `${range.start.slice(0, 10)} to ${range.end.slice(0, 10)}`;
  const totals = useMemo(() => rows.reduce((acc, r) => ({
    activeDrivers: acc.activeDrivers + 1,
    rides: acc.rides + Number(r.completed_rides ?? 0),
    earnings: acc.earnings + Number(r.net_earnings_cents ?? 0),
    tips: acc.tips + Number(r.tips_cents ?? 0),
    gross: acc.gross + Number(r.gross_fare_cents ?? 0),
  }), { activeDrivers: 0, rides: 0, earnings: 0, tips: 0, gross: 0 }), [rows]);

  const columns: ExportColumn<any>[] = [
    { header: 'Driver', getValue: (r) => r.driver_name },
    { header: 'Completed', getValue: (r) => r.completed_rides },
    { header: 'Cancelled', getValue: (r) => r.cancelled_by_driver },
    { header: 'Distance', getValue: (r) => fmtMiles(r.distance_m) },
    { header: 'Gross Fare', getValue: (r) => fmtUsd(r.gross_fare_cents) },
    { header: 'Tips', getValue: (r) => fmtUsd(r.tips_cents) },
    { header: 'Net Earnings', getValue: (r) => fmtUsd(r.net_earnings_cents) },
    { header: 'Avg Rating', getValue: (r) => r.avg_rating != null ? `★ ${r.avg_rating}` : '' },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="Active drivers" value={totals.activeDrivers} />
        <Kpi label="Total rides" value={totals.rides} />
        <Kpi label="Net earnings" value={fmtUsd(totals.earnings)} accent="success" />
        <Kpi label="Tips earned" value={fmtUsd(totals.tips)} accent="accent" />
      </div>
      {rows.length > 0 && (
        <ChartCard title="Top 10 drivers by net earnings">
          <BarChart data={rows.slice(0, 10).map((r) => ({ name: r.driver_name.length > 14 ? r.driver_name.slice(0, 14) + '…' : r.driver_name, earnings: r.net_earnings_cents / 100, tips: r.tips_cents / 100 }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(v: any) => `$${Number(v).toFixed(2)}`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="earnings" name="Net earnings" fill={CHART_COLORS[1]} />
            <Bar dataKey="tips" name="Tips" fill={CHART_COLORS[2]} />
          </BarChart>
        </ChartCard>
      )}
      <div className="flex justify-end mb-2">
        <ExportMenu rows={rows} filename={`drivers-${range.start.slice(0,10)}-${range.end.slice(0,10)}`} columns={columns} title="Driver Performance Report" subtitle={subtitle} />
      </div>
      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Driver</th>
              <th className="text-right px-3 py-2">Completed</th>
              <th className="text-right px-3 py-2">Cancelled</th>
              <th className="text-right px-3 py-2">Distance</th>
              <th className="text-right px-3 py-2">Gross fare</th>
              <th className="text-right px-3 py-2">Tips</th>
              <th className="text-right px-3 py-2">Net earnings</th>
              <th className="text-right px-3 py-2">Avg rating</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted">Loading…</td></tr>}
            {!isLoading && !rows.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted">No drivers active in this range.</td></tr>}
            {rows.map((r) => (
              <tr key={r.driver_id} className="border-t border-border">
                <td className="px-3 py-2 text-ink">{r.driver_name}</td>
                <td className="px-3 py-2 text-right">{r.completed_rides}</td>
                <td className="px-3 py-2 text-right text-muted">{r.cancelled_by_driver}</td>
                <td className="px-3 py-2 text-right">{fmtMiles(r.distance_m)}</td>
                <td className="px-3 py-2 text-right">{fmtUsd(r.gross_fare_cents)}</td>
                <td className="px-3 py-2 text-right text-accent">{fmtUsd(r.tips_cents)}</td>
                <td className="px-3 py-2 text-right text-success font-medium">{fmtUsd(r.net_earnings_cents)}</td>
                <td className="px-3 py-2 text-right">{r.avg_rating != null ? `★ ${r.avg_rating}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ RIDERS ============
function RidersReport({ params, range }: { params: string; range: { start: string; end: string } }) {
  const { data, isLoading } = useQuery({
    queryKey: ['report-riders', params],
    queryFn: () => api<any[]>(`/v1/admin/rides/reports/riders?${params}`),
  });
  const rows = useMemo(() => (data ?? []).filter((r) =>
    r.rider_name && r.rider_name.trim() !== '' && Number(r.total_rides ?? 0) > 0
  ), [data]);
  const subtitle = `${range.start.slice(0, 10)} to ${range.end.slice(0, 10)}`;
  const totals = useMemo(() => rows.reduce((acc, r) => ({
    riders: acc.riders + 1,
    rides: acc.rides + Number(r.completed_rides ?? 0),
    spent: acc.spent + Number(r.total_spent_cents ?? 0),
    tips: acc.tips + Number(r.total_tips_cents ?? 0),
  }), { riders: 0, rides: 0, spent: 0, tips: 0 }), [rows]);

  const columns: ExportColumn<any>[] = [
    { header: 'Rider', getValue: (r) => r.rider_name },
    { header: 'Total Rides', getValue: (r) => r.total_rides },
    { header: 'Completed', getValue: (r) => r.completed_rides },
    { header: 'Cancelled', getValue: (r) => r.cancelled_by_rider },
    { header: 'Total Spent', getValue: (r) => fmtUsd(r.total_spent_cents) },
    { header: 'Tips Given', getValue: (r) => fmtUsd(r.total_tips_cents) },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="Active riders" value={totals.riders} />
        <Kpi label="Completed rides" value={totals.rides} />
        <Kpi label="Total spent" value={fmtUsd(totals.spent)} />
        <Kpi label="Total tipped" value={fmtUsd(totals.tips)} accent="accent" />
      </div>
      {rows.length > 0 && (
        <ChartCard title="Top 10 riders by total spent">
          <BarChart data={rows.slice(0, 10).map((r) => ({ name: r.rider_name.length > 14 ? r.rider_name.slice(0, 14) + '…' : r.rider_name, spent: r.total_spent_cents / 100, tips: r.total_tips_cents / 100 }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(v: any) => `$${Number(v).toFixed(2)}`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="spent" name="Total spent" fill={CHART_COLORS[0]} />
            <Bar dataKey="tips" name="Tips given" fill={CHART_COLORS[2]} />
          </BarChart>
        </ChartCard>
      )}
      <div className="flex justify-end mb-2">
        <ExportMenu rows={rows} filename={`riders-${range.start.slice(0,10)}-${range.end.slice(0,10)}`} columns={columns} title="Rider Activity Report" subtitle={subtitle} />
      </div>
      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Rider</th>
              <th className="text-right px-3 py-2">Total rides</th>
              <th className="text-right px-3 py-2">Completed</th>
              <th className="text-right px-3 py-2">Cancelled</th>
              <th className="text-right px-3 py-2">Total spent</th>
              <th className="text-right px-3 py-2">Tips given</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">Loading…</td></tr>}
            {!isLoading && !rows.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">No riders active in this range.</td></tr>}
            {rows.map((r) => (
              <tr key={r.rider_id} className="border-t border-border">
                <td className="px-3 py-2 text-ink">{r.rider_name}</td>
                <td className="px-3 py-2 text-right">{r.total_rides}</td>
                <td className="px-3 py-2 text-right">{r.completed_rides}</td>
                <td className="px-3 py-2 text-right text-muted">{r.cancelled_by_rider}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtUsd(r.total_spent_cents)}</td>
                <td className="px-3 py-2 text-right text-accent">{fmtUsd(r.total_tips_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ REFUNDS ============
function RefundsReport({ params, range }: { params: string; range: { start: string; end: string } }) {
  const { data, isLoading } = useQuery({
    queryKey: ['report-refunds', params],
    queryFn: () => api<any[]>(`/v1/admin/rides/reports/refunds?${params}`),
  });
  const rows = data ?? [];
  const subtitle = `${range.start.slice(0, 10)} to ${range.end.slice(0, 10)}`;
  const totals = useMemo(() => rows.reduce((acc, r) => ({
    count: acc.count + 1,
    refunded: acc.refunded + Number(r.refunded_cents ?? 0),
    driverClawback: acc.driverClawback + Number(r.driver_clawback_cents ?? 0),
    platformLoss: acc.platformLoss + Number(r.platform_loss_cents ?? 0),
  }), { count: 0, refunded: 0, driverClawback: 0, platformLoss: 0 }), [rows]);

  const columns: ExportColumn<any>[] = [
    { header: 'Date', getValue: (r) => new Date(r.created_at).toLocaleString() },
    { header: 'Ride ID', getValue: (r) => r.ride_id },
    { header: 'Reason', getValue: (r) => r.reason ?? '' },
    { header: 'Refunded', getValue: (r) => fmtUsd(r.refunded_cents) },
    { header: 'Driver Clawback', getValue: (r) => fmtUsd(r.driver_clawback_cents) },
    { header: 'Platform Loss', getValue: (r) => fmtUsd(r.platform_loss_cents) },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="Refund count" value={totals.count} />
        <Kpi label="Total refunded" value={fmtUsd(totals.refunded)} accent="danger" />
        <Kpi label="Driver clawback" value={fmtUsd(totals.driverClawback)} accent="danger" />
        <Kpi label="Platform loss" value={fmtUsd(totals.platformLoss)} accent="danger" />
      </div>
      {rows.length > 0 && (() => {
        const byDay: Record<string, number> = {};
        rows.forEach((r) => {
          const day = (r.created_at as string).slice(0, 10);
          byDay[day] = (byDay[day] || 0) + Number(r.refunded_cents || 0);
        });
        const chartData = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([day, cents]) => ({ day: day.slice(5), refunded: cents / 100 }));
        return (
          <ChartCard title="Daily refund volume">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: any) => `$${Number(v).toFixed(2)}`} />
              <Line type="monotone" dataKey="refunded" name="Refunded" stroke={CHART_COLORS[3]} strokeWidth={2} />
            </LineChart>
          </ChartCard>
        );
      })()}
      <div className="flex justify-end mb-2">
        <ExportMenu rows={rows} filename={`refunds-${range.start.slice(0,10)}-${range.end.slice(0,10)}`} columns={columns} title="Refunds Report" subtitle={subtitle} />
      </div>
      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">When</th>
              <th className="text-left px-3 py-2">Ride</th>
              <th className="text-left px-3 py-2">Reason</th>
              <th className="text-right px-3 py-2">Refunded</th>
              <th className="text-right px-3 py-2">Driver clawback</th>
              <th className="text-right px-3 py-2">Platform loss</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">Loading…</td></tr>}
            {!isLoading && !rows.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">No refunds in this range.</td></tr>}
            {rows.map((r, i) => (
              <tr key={`${r.ride_id}-${i}`} className="border-t border-border">
                <td className="px-3 py-2 text-muted text-xs">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.ride_id.slice(0, 8)}</td>
                <td className="px-3 py-2 text-ink text-xs">{r.reason}</td>
                <td className="px-3 py-2 text-right">{fmtUsd(r.refunded_cents)}</td>
                <td className="px-3 py-2 text-right text-danger">{fmtUsd(r.driver_clawback_cents)}</td>
                <td className="px-3 py-2 text-right text-danger">{fmtUsd(r.platform_loss_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ OPERATIONS ============
function OpsReport({ params, range }: { params: string; range: { start: string; end: string } }) {
  const { data, isLoading } = useQuery({
    queryKey: ['report-ops', params],
    queryFn: () => api<any[]>(`/v1/admin/rides/reports/operations?${params}`),
  });
  const rows = data ?? [];
  const subtitle = `${range.start.slice(0, 10)} to ${range.end.slice(0, 10)}`;
  const total = rows.reduce((sum, r) => sum + Number(r.count ?? 0), 0);
  const completed = Number(rows.find((r) => r.status === 'completed')?.count ?? 0);
  const cancelled = rows.filter((r) => r.status.startsWith('cancelled') || r.status === 'no_drivers_available').reduce((s, r) => s + Number(r.count ?? 0), 0);

  const columns: ExportColumn<any>[] = [
    { header: 'Status', getValue: (r) => r.status.replace(/_/g, ' ') },
    { header: 'Count', getValue: (r) => r.count },
    { header: 'Percentage', getValue: (r) => total ? `${((Number(r.count) / total) * 100).toFixed(1)}%` : '0%' },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="Total rides" value={total} />
        <Kpi label="Completed" value={completed} accent="success" />
        <Kpi label="Cancelled / failed" value={cancelled} accent="danger" />
        <Kpi label="Completion rate" value={total ? `${((completed / total) * 100).toFixed(1)}%` : '—'} />
      </div>
      {rows.length > 0 && (
        <ChartCard title="Status distribution" height={300}>
          <PieChart>
            <Pie data={rows.map((r) => ({ name: r.status.replace(/_/g, ' '), value: Number(r.count) }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(e: any) => `${e.name}: ${e.value}`} labelLine={{ stroke: '#94a3b8' }}>
              {rows.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ChartCard>
      )}
      <div className="flex justify-end mb-2">
        <ExportMenu rows={rows} filename={`operations-${range.start.slice(0,10)}-${range.end.slice(0,10)}`} columns={columns} title="Operations Report" subtitle={subtitle} />
      </div>
      <div className="bg-white border border-border rounded p-4">
        <div className="text-xs uppercase text-muted mb-3">Status distribution</div>
        <div className="space-y-2">
          {isLoading && <div className="text-muted">Loading…</div>}
          {!isLoading && !rows.length && <div className="text-muted">No rides in this range.</div>}
          {rows.map((r: any) => {
            const pct = total ? (Number(r.count) / total) * 100 : 0;
            const color = r.status === 'completed' ? 'bg-success' :
              r.status.startsWith('cancelled') || r.status === 'no_drivers_available' ? 'bg-danger' : 'bg-accent';
            return (
              <div key={r.status}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="capitalize text-ink">{r.status.replace(/_/g, ' ')}</span>
                  <span className="text-muted">{r.count} · {pct.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                  <div className={'h-full ' + color} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============ MARKETPLACE ============
const LISTING_TYPE_LABEL: Record<string, string> = {
  standard: 'Standard', featured: 'Featured', sponsored: 'Sponsored', premium: 'Premium',
};

function MarketplaceReport({ range }: { range: { start: string; end: string } }) {
  const { data: rev, isLoading } = useQuery({
    queryKey: ['report-marketplace-revenue'],
    queryFn: () => api<any>('/v1/admin/marketplace/revenue'),
  });

  const { data: listingsData } = useQuery({
    queryKey: ['report-marketplace-listings'],
    queryFn: () => api<any>('/v1/admin/listings?limit=500'),
  });

  const allListings = listingsData?.data ?? [];
  const subtitle = `${range.start.slice(0, 10)} to ${range.end.slice(0, 10)}`;

  const rows = useMemo(() => {
    const start = new Date(range.start).getTime();
    const end = new Date(range.end).getTime();
    return allListings.filter((l: any) => {
      const t = new Date(l.created_at).getTime();
      return t >= start && t <= end;
    });
  }, [allListings, range.start, range.end]);

  const totals = rev?.totals ?? {};
  const byType = rev?.by_type ?? [];
  const timeline = rev?.timeline ?? [];

  const statusBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((l: any) => { map[l.status] = (map[l.status] || 0) + 1; });
    return Object.entries(map).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);
  }, [rows]);

  const exportCols: ExportColumn<any>[] = [
    { header: 'ID', getValue: (r) => r.id },
    { header: 'Title', getValue: (r) => r.title },
    { header: 'Category', getValue: (r) => r.category ?? '' },
    { header: 'Type', getValue: (r) => r.listing_type },
    { header: 'Status', getValue: (r) => r.status },
    { header: 'Listing Fee', getValue: (r) => fmtUsd(r.listing_fee_cents) },
    { header: 'Fee Paid', getValue: (r) => r.listing_fee_paid ? 'Yes' : 'No' },
    { header: 'Price', getValue: (r) => fmtUsd(r.price_cents) },
    { header: 'Contact Email', getValue: (r) => r.contact_email ?? '' },
    { header: 'Created', getValue: (r) => new Date(r.created_at).toLocaleString() },
    { header: 'Approved', getValue: (r) => r.approved_at ? new Date(r.approved_at).toLocaleString() : '' },
    { header: 'Expires', getValue: (r) => r.expires_at ? new Date(r.expires_at).toLocaleString() : '' },
    { header: 'Rejection Reason', getValue: (r) => r.rejection_reason ?? '' },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="Total listing fee revenue" value={fmtUsd(totals.total_revenue_cents)} accent="success" />
        <Kpi label="Paid listings" value={totals.total_paid_listings ?? 0} />
        <Kpi label="Active listings" value={totals.active_listings ?? 0} accent="accent" />
        <Kpi label="Pending review" value={totals.pending_listings ?? 0} />
        <Kpi label="Listings this period" value={rows.length} />
        <Kpi label="Approved" value={rows.filter((l: any) => l.status === 'approved').length} accent="success" />
        <Kpi label="Rejected" value={rows.filter((l: any) => l.status === 'rejected').length} accent="danger" />
        <Kpi label="Approval rate" value={rows.length ? `${((rows.filter((l: any) => l.status === 'approved').length / rows.length) * 100).toFixed(1)}%` : '—'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {byType.length > 0 && (
          <ChartCard title="Revenue by listing type">
            <BarChart data={byType.map((b: any) => ({ name: LISTING_TYPE_LABEL[b.listing_type] ?? b.listing_type, revenue: Number(b.total_fee_cents) / 100, count: Number(b.paid_count) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: any, name: string) => name === 'revenue' ? `$${Number(v).toFixed(2)}` : v} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="revenue" name="Revenue ($)" fill={CHART_COLORS[2]} />
              <Bar dataKey="count" name="Paid listings" fill={CHART_COLORS[0]} />
            </BarChart>
          </ChartCard>
        )}
        {timeline.length > 0 && (
          <ChartCard title="Daily listing fee revenue">
            <LineChart data={[...timeline].reverse().map((t: any) => ({ day: (t.day as string).slice(5), revenue: Number(t.revenue_cents) / 100 }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: any) => `$${Number(v).toFixed(2)}`} />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} />
            </LineChart>
          </ChartCard>
        )}
      </div>

      {statusBreakdown.length > 0 && (
        <div className="bg-white border border-border rounded p-4 mb-4">
          <div className="text-xs uppercase text-muted mb-3">Status breakdown — this period</div>
          <div className="space-y-2">
            {statusBreakdown.map(({ status, count }) => {
              const pct = rows.length ? (count / rows.length) * 100 : 0;
              const color = status === 'approved' ? 'bg-success' : status === 'rejected' ? 'bg-danger' : status === 'pending' ? 'bg-yellow-400' : 'bg-accent';
              return (
                <div key={status}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="capitalize text-ink">{status}</span>
                    <span className="text-muted">{count} · {pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                    <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end mb-2">
        <ExportMenu rows={rows} filename={`marketplace-${range.start.slice(0,10)}-${range.end.slice(0,10)}`} columns={exportCols} title="Marketplace Listings Report" subtitle={subtitle} />
      </div>

      <div className="bg-white border border-border rounded overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-surface text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Title</th>
              <th className="text-left px-3 py-2">Category</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-right px-3 py-2">Listing Fee</th>
              <th className="text-left px-3 py-2">Fee Paid</th>
              <th className="text-right px-3 py-2">Price</th>
              <th className="text-left px-3 py-2">Contact</th>
              <th className="text-left px-3 py-2">Created</th>
              <th className="text-left px-3 py-2">Approved</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={10} className="px-3 py-6 text-center text-muted">Loading…</td></tr>}
            {!isLoading && !rows.length && <tr><td colSpan={10} className="px-3 py-6 text-center text-muted">No listings in this period.</td></tr>}
            {rows.slice(0, 100).map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 text-xs font-medium text-ink truncate max-w-[180px]" title={r.title}>{r.title}</td>
                <td className="px-3 py-2 text-xs capitalize text-muted">{r.category ?? '—'}</td>
                <td className="px-3 py-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${r.listing_type === 'premium' ? 'bg-purple-100 text-purple-800' : r.listing_type === 'sponsored' ? 'bg-yellow-100 text-yellow-800' : r.listing_type === 'featured' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                    {LISTING_TYPE_LABEL[r.listing_type] ?? r.listing_type}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${r.status === 'approved' ? 'bg-green-100 text-green-800' : r.status === 'rejected' ? 'bg-red-100 text-red-800' : r.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-xs">{fmtUsd(r.listing_fee_cents)}</td>
                <td className="px-3 py-2 text-xs">{r.listing_fee_paid ? <span className="text-success font-medium">✓ Paid</span> : <span className="text-muted">—</span>}</td>
                <td className="px-3 py-2 text-right text-xs">{fmtUsd(r.price_cents)}</td>
                <td className="px-3 py-2 text-xs text-muted truncate max-w-[140px]">{r.contact_email ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">{r.approved_at ? new Date(r.approved_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
            {rows.length > 100 && (
              <tr className="border-t border-border">
                <td colSpan={10} className="px-3 py-2 text-center text-xs text-muted">Showing 100 of {rows.length}. Export for full data.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
