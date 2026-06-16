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

type Tab = 'revenue' | 'drivers' | 'riders' | 'refunds' | 'operations';
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

      <div className="flex gap-1 border-b border-border mb-4">
        {(['revenue', 'drivers', 'riders', 'refunds', 'operations'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={'px-4 py-2 capitalize text-sm font-medium border-b-2 transition ' +
              (tab === t ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink')}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'revenue' && <RevenueReport params={params.toString()} range={range} />}
      {tab === 'drivers' && <DriversReport params={params.toString()} range={range} />}
      {tab === 'riders' && <RidersReport params={params.toString()} range={range} />}
      {tab === 'refunds' && <RefundsReport params={params.toString()} range={range} />}
      {tab === 'operations' && <OpsReport params={params.toString()} range={range} />}
    </>
  );
}

// ============ REVENUE ============
function RevenueReport({ params, range }: { params: string; range: { start: string; end: string } }) {
  const { data, isLoading } = useQuery({
    queryKey: ['report-revenue', params],
    queryFn: () => api<any[]>(`/v1/admin/rides/reports/revenue?${params}`),
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
