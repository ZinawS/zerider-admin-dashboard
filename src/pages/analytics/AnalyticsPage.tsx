import React, { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { PageHeader } from '../../components/PageHeader.js';
import { DateRangeFilter } from '../../components/DateRangeFilter.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function iso30DaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function fmt$(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function delta(current: number, previous: number): { pct: string; up: boolean } {
  if (!previous) return { pct: '—', up: true };
  const d = ((current - previous) / previous) * 100;
  return { pct: `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`, up: d >= 0 };
}

// ─── types ───────────────────────────────────────────────────────────────────

interface DashboardData {
  total_rides: number;
  total_deliveries: number;
  total_revenue_cents: number;
  active_drivers: number;
  active_riders: number;
  avg_ride_fare_cents: number;
  rides_by_day?: Array<{ date: string; count: number; revenue_cents: number }>;
  deliveries_by_day?: Array<{ date: string; count: number }>;
  top_regions?: Array<{ region: string; rides: number; revenue_cents: number }>;
}

interface RevenueData {
  total_cents: number;
  by_service?: Array<{ service_type: string; revenue_cents: number }>;
  by_day?: Array<{ date: string; revenue_cents: number }>;
  commission_cents?: number;
  payout_cents?: number;
}

interface RidesData {
  total: number;
  completed: number;
  cancelled: number;
  completion_rate?: number;
  avg_duration_s?: number;
  by_vehicle_category?: Array<{ category: string; count: number }>;
}

interface DriversData {
  total: number;
  active: number;
  new_this_period: number;
  approved: number;
  pending_approval: number;
}

// ─── sub-components ──────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, loading }: { label: string; value: string; sub?: string; loading?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="text-xs text-muted uppercase tracking-wide mb-1">{label}</div>
      {loading ? (
        <div className="h-7 w-24 bg-border/40 rounded animate-pulse mt-1" />
      ) : (
        <div className="text-2xl font-bold">{value}</div>
      )}
      {sub && !loading && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-ink mb-3 mt-8 first:mt-0">{children}</h2>;
}

const SERVICE_COLORS: Record<string, string> = {
  ride_sharing: '#6366f1',
  food_delivery: '#f59e0b',
  grocery_delivery: '#10b981',
  package_delivery: '#3b82f6',
  courier: '#8b5cf6',
  marketplace: '#ef4444',
  subscription: '#14b8a6',
  promotion: '#f97316',
};

const VEHICLE_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316'];

// ─── main ────────────────────────────────────────────────────────────────────

export function AnalyticsPage(): JSX.Element {
  const [from, setFrom] = useState(iso30DaysAgo());
  const [to, setTo] = useState(isoToday());

  const qs = `?from=${from}&to=${to}`;

  const { data: dash, isLoading: dashLoading } = useQuery({
    queryKey: ['analytics-dashboard', from, to],
    queryFn: () => api<DashboardData>(`/v1/analytics/dashboard${qs}`),
    staleTime: 2 * 60_000,
    retry: 1,
  });

  const { data: revenue, isLoading: revLoading } = useQuery({
    queryKey: ['analytics-revenue', from, to],
    queryFn: () => api<RevenueData>(`/v1/analytics/revenue${qs}`),
    staleTime: 2 * 60_000,
    retry: 1,
  });

  const { data: rides, isLoading: ridesLoading } = useQuery({
    queryKey: ['analytics-rides', from, to],
    queryFn: () => api<RidesData>(`/v1/analytics/rides${qs}`),
    staleTime: 2 * 60_000,
    retry: 1,
  });

  const { data: drivers, isLoading: driversLoading } = useQuery({
    queryKey: ['analytics-drivers', from, to],
    queryFn: () => api<DriversData>(`/v1/analytics/drivers${qs}`),
    staleTime: 2 * 60_000,
    retry: 1,
  });

  const ridesByDay = dash?.rides_by_day ?? [];
  const delivsByDay = dash?.deliveries_by_day ?? [];
  const combinedByDay = ridesByDay.map((r) => {
    const d = delivsByDay.find((x) => x.date === r.date);
    return { date: r.date.slice(5), rides: r.count, deliveries: d?.count ?? 0, revenue: r.revenue_cents / 100 };
  });

  const revenueByService = revenue?.by_service ?? [];
  const vehicleBreakdown = rides?.by_vehicle_category ?? [];
  const topRegions = dash?.top_regions ?? [];

  const completionRate = rides?.completion_rate != null
    ? `${(rides.completion_rate * 100).toFixed(1)}%`
    : rides?.total && rides?.completed
      ? `${((rides.completed / rides.total) * 100).toFixed(1)}%`
      : '—';

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Platform performance across all services" />

      {/* date filter */}
      <div className="mb-6">
        <DateRangeFilter
          from={from}
          to={to}
          onChange={(f, t) => { setFrom(f || iso30DaysAgo()); setTo(t || isoToday()); }}
        />
      </div>

      {/* KPI grid */}
      <SectionTitle>Overview</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total rides" value={fmtNum(dash?.total_rides ?? 0)} loading={dashLoading} />
        <KpiCard label="Total deliveries" value={fmtNum(dash?.total_deliveries ?? 0)} loading={dashLoading} />
        <KpiCard label="Total revenue" value={fmt$(dash?.total_revenue_cents ?? 0)} loading={dashLoading} />
        <KpiCard label="Avg ride fare" value={fmt$(dash?.avg_ride_fare_cents ?? 0)} loading={dashLoading} />
        <KpiCard label="Active drivers" value={fmtNum(dash?.active_drivers ?? 0)} loading={dashLoading} />
        <KpiCard label="Active riders" value={fmtNum(dash?.active_riders ?? 0)} loading={dashLoading} />
        <KpiCard label="Drivers pending" value={fmtNum(drivers?.pending_approval ?? 0)} loading={driversLoading} />
        <KpiCard
          label="Completion rate"
          value={ridesLoading ? '—' : completionRate}
          loading={ridesLoading}
        />
      </div>

      {/* Rides + deliveries trend */}
      {combinedByDay.length > 0 && (
        <>
          <SectionTitle>Rides &amp; Deliveries Over Time</SectionTitle>
          <div className="bg-surface border border-border rounded-xl p-5">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={combinedByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="rides" stroke="#6366f1" strokeWidth={2} dot={false} name="Rides" />
                <Line type="monotone" dataKey="deliveries" stroke="#10b981" strokeWidth={2} dot={false} name="Deliveries" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Revenue trend */}
      {combinedByDay.length > 0 && (
        <>
          <SectionTitle>Revenue Trend ($)</SectionTitle>
          <div className="bg-surface border border-border rounded-xl p-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={combinedByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, 'Revenue']} />
                <Bar dataKey="revenue" fill="#6366f1" name="Revenue ($)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Two-column section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">

        {/* Revenue by service */}
        {revenueByService.length > 0 && (
          <div className="min-w-0 bg-surface border border-border rounded-xl p-5">
            <div className="text-sm font-semibold mb-3">Revenue by Service</div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={revenueByService}
                  dataKey="revenue_cents"
                  nameKey="service_type"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  label={({ service_type }) => service_type.replace('_', ' ')}
                >
                  {revenueByService.map((entry, i) => (
                    <Cell key={entry.service_type} fill={SERVICE_COLORS[entry.service_type] ?? VEHICLE_COLORS[i % VEHICLE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmt$(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1 mt-2">
              {revenueByService.map((s, i) => (
                <div key={s.service_type} className="flex justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: SERVICE_COLORS[s.service_type] ?? VEHICLE_COLORS[i % VEHICLE_COLORS.length] }} />
                    {s.service_type.replace(/_/g, ' ')}
                  </span>
                  <span className="font-medium">{fmt$(s.revenue_cents)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rides by vehicle category */}
        {vehicleBreakdown.length > 0 && (
          <div className="min-w-0 bg-surface border border-border rounded-xl p-5">
            <div className="text-sm font-semibold mb-3">Rides by Vehicle Category</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={vehicleBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="category" type="category" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="count" name="Rides" radius={[0, 3, 3, 0]}>
                  {vehicleBreakdown.map((_, i) => (
                    <Cell key={i} fill={VEHICLE_COLORS[i % VEHICLE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Ride funnel */}
      {!ridesLoading && rides && (
        <>
          <SectionTitle>Ride Funnel</SectionTitle>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total requested', value: fmtNum(rides.total) },
              { label: 'Completed', value: fmtNum(rides.completed), note: completionRate },
              { label: 'Cancelled', value: fmtNum(rides.cancelled), note: rides.total ? `${((rides.cancelled / rides.total) * 100).toFixed(1)}%` : undefined },
            ].map((s) => (
              <div key={s.label} className="bg-surface border border-border rounded-xl p-5">
                <div className="text-xs text-muted uppercase tracking-wide mb-1">{s.label}</div>
                <div className="text-2xl font-bold">{s.value}</div>
                {s.note && <div className="text-xs text-muted mt-0.5">{s.note} of total</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Driver pipeline */}
      {!driversLoading && drivers && (
        <>
          <SectionTitle>Driver Pipeline</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total drivers', value: fmtNum(drivers.total) },
              { label: 'Approved', value: fmtNum(drivers.approved) },
              { label: 'Active (period)', value: fmtNum(drivers.active) },
              { label: 'New this period', value: fmtNum(drivers.new_this_period) },
            ].map((s) => (
              <div key={s.label} className="bg-surface border border-border rounded-xl p-5">
                <div className="text-xs text-muted uppercase tracking-wide mb-1">{s.label}</div>
                <div className="text-2xl font-bold">{s.value}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Revenue split */}
      {!revLoading && revenue && (revenue.commission_cents != null || revenue.payout_cents != null) && (
        <>
          <SectionTitle>Revenue Split</SectionTitle>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Gross revenue', value: fmt$(revenue.total_cents) },
              { label: 'Driver payouts', value: revenue.payout_cents != null ? fmt$(revenue.payout_cents) : '—' },
              { label: 'Net commission', value: revenue.commission_cents != null ? fmt$(revenue.commission_cents) : '—' },
            ].map((s) => (
              <div key={s.label} className="bg-surface border border-border rounded-xl p-5">
                <div className="text-xs text-muted uppercase tracking-wide mb-1">{s.label}</div>
                <div className="text-2xl font-bold">{s.value}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Top regions */}
      {topRegions.length > 0 && (
        <>
          <SectionTitle>Top Regions</SectionTitle>
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted">Region</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Rides</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topRegions.map((r, i) => (
                  <tr key={r.region} className={i % 2 === 0 ? '' : 'bg-bg/40'}>
                    <td className="px-4 py-3 font-medium">{r.region}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNum(r.rides)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt$(r.revenue_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* empty state if everything is loading / no data yet */}
      {!dashLoading && !dash?.total_rides && !combinedByDay.length && (
        <div className="text-center text-muted py-20">
          <div className="text-4xl mb-3">📊</div>
          <div className="text-sm">No data for the selected range. Adjust the date filter or wait for the analytics service to index more events.</div>
        </div>
      )}
    </div>
  );
}
