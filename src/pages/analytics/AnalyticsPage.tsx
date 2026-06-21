import React, { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { PageHeader } from '../../components/PageHeader.js';
import { DateRangeFilter } from '../../components/DateRangeFilter.js';
import { useRegionScope } from '../../stores/region-scope.store.js';
import { QueryError } from '../../components/QueryError.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function iso30DaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function fmtUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function fmtEtb(cents: number): string {
  return `ETB ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function fmtPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

// ─── types ───────────────────────────────────────────────────────────────────

interface DashboardData {
  total_rides: number;
  total_deliveries: number;
  total_revenue_cents: number;
  delivery_revenue_cents: number;
  active_drivers: number;
  active_riders: number;
  avg_ride_fare_cents: number;
  rides_by_day?: Array<{ date: string; count: number; revenue_cents: number }>;
  deliveries_by_day?: Array<{ date: string; count: number; revenue_cents: number }>;
  top_regions?: Array<{ region: string; rides: number; revenue_cents: number }>;
}

interface RevenueData {
  total_cents: number;
  commission_cents?: number;
  payout_cents?: number;
  delivery_revenue_cents?: number;
  marketplace_revenue_cents?: number;
  by_service?: Array<{ service_type: string; revenue_cents: number; currency?: string }>;
  by_day?: Array<{ date: string; revenue_cents: number }>;
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

interface DeliveryData {
  total: number;
  delivered: number;
  cancelled: number;
  failed: number;
  active: number;
  completion_rate: number;
  revenue_cents: number;
  by_day?: Array<{ date: string; total: number; delivered: number; revenue_cents: number }>;
  by_service_type?: Array<{ service_type: string; total: number; delivered: number; revenue_cents: number }>;
}

interface MarketplaceData {
  total_listings: number;
  approved: number;
  pending: number;
  rejected: number;
  total_revenue_cents: number;
  by_type?: Array<{
    listing_type: string;
    total_listings: number;
    approved: number;
    rejected: number;
    listing_fee_revenue_cents: number;
  }>;
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
  economy: '#6366f1',
  comfort: '#8b5cf6',
  premium: '#a855f7',
  xl: '#7c3aed',
  food_delivery: '#f59e0b',
  grocery_delivery: '#10b981',
  package_delivery: '#3b82f6',
  courier: '#0ea5e9',
  pharmacy: '#14b8a6',
  retail: '#06b6d4',
  marketplace: '#ef4444',
  subscription: '#14b8a6',
  promotion: '#f97316',
};

const FALLBACK_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316'];

// ─── main ────────────────────────────────────────────────────────────────────

export function AnalyticsPage(): JSX.Element {
  const [from, setFrom] = useState(iso30DaysAgo());
  const [to, setTo] = useState(isoToday());
  const regionCode = useRegionScope((s) => s.regionCode);

  const qs = `?from=${from}&to=${to}${regionCode ? `&region=${regionCode}` : ''}`;

  const { data: dash, isLoading: dashLoading, isError: dashError, refetch: dashRefetch } = useQuery({
    queryKey: ['analytics-dashboard', from, to, regionCode],
    queryFn: () => api<DashboardData>(`/v1/analytics/dashboard${qs}`),
    staleTime: 2 * 60_000,
    retry: 1,
  });

  const { data: revenue, isLoading: revLoading } = useQuery({
    queryKey: ['analytics-revenue', from, to, regionCode],
    queryFn: () => api<RevenueData>(`/v1/analytics/revenue${qs}`),
    staleTime: 2 * 60_000,
    retry: 1,
  });

  const { data: rides, isLoading: ridesLoading } = useQuery({
    queryKey: ['analytics-rides', from, to, regionCode],
    queryFn: () => api<RidesData>(`/v1/analytics/rides${qs}`),
    staleTime: 2 * 60_000,
    retry: 1,
  });

  const { data: drivers, isLoading: driversLoading } = useQuery({
    queryKey: ['analytics-drivers', from, to, regionCode],
    queryFn: () => api<DriversData>(`/v1/analytics/drivers${qs}`),
    staleTime: 2 * 60_000,
    retry: 1,
  });

  const { data: deliveries, isLoading: delivLoading } = useQuery({
    queryKey: ['analytics-deliveries', from, to, regionCode],
    queryFn: () => api<DeliveryData>(`/v1/analytics/deliveries${qs}`),
    staleTime: 2 * 60_000,
    retry: 1,
  });

  const { data: marketplace, isLoading: mktLoading } = useQuery({
    queryKey: ['analytics-marketplace', from, to, regionCode],
    queryFn: () => api<MarketplaceData>(`/v1/analytics/marketplace${qs}`),
    staleTime: 2 * 60_000,
    retry: 1,
  });

  if (dashError) return <QueryError onRetry={() => dashRefetch()} />;

  const ridesByDay = dash?.rides_by_day ?? [];
  const delivsByDay = dash?.deliveries_by_day ?? [];

  // Merge rides + deliveries into a single timeline (by date)
  const allDates = Array.from(new Set([...ridesByDay.map((r) => r.date), ...delivsByDay.map((d) => d.date)])).sort();
  const combinedByDay = allDates.map((date) => {
    const r = ridesByDay.find((x) => x.date === date);
    const d = delivsByDay.find((x) => x.date === date);
    return {
      date: date.slice(5),
      rides: r?.count ?? 0,
      deliveries: d?.count ?? 0,
      ride_revenue: (r?.revenue_cents ?? 0) / 100,
      delivery_revenue: (d?.revenue_cents ?? 0) / 100,
    };
  });

  const revenueByService = revenue?.by_service ?? [];
  const vehicleBreakdown = rides?.by_vehicle_category ?? [];
  const topRegions = dash?.top_regions ?? [];

  const rideCompletionRate = rides?.completion_rate != null
    ? fmtPct(rides.completion_rate)
    : rides?.total && rides?.completed
      ? fmtPct(rides.completed / rides.total)
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

      {/* ── Overview KPIs ── */}
      <SectionTitle>Overview</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total rides" value={fmtNum(dash?.total_rides ?? 0)} loading={dashLoading} />
        <KpiCard label="Total deliveries" value={fmtNum(dash?.total_deliveries ?? 0)} loading={dashLoading} />
        <KpiCard label="Ride revenue (USD)" value={fmtUsd(dash?.total_revenue_cents ?? 0)} loading={dashLoading} sub="rides only" />
        <KpiCard label="Delivery revenue (ETB)" value={fmtEtb(dash?.delivery_revenue_cents ?? 0)} loading={dashLoading} sub="deliveries only" />
        <KpiCard label="Active drivers" value={fmtNum(dash?.active_drivers ?? 0)} loading={dashLoading} />
        <KpiCard label="Active riders" value={fmtNum(dash?.active_riders ?? 0)} loading={dashLoading} />
        <KpiCard label="Avg ride fare (USD)" value={fmtUsd(dash?.avg_ride_fare_cents ?? 0)} loading={dashLoading} />
        <KpiCard label="Ride completion" value={ridesLoading ? '—' : rideCompletionRate} loading={ridesLoading} />
      </div>

      {/* ── Rides & Deliveries trend ── */}
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

      {/* ── Ride revenue trend (USD) ── */}
      {combinedByDay.length > 0 && (
        <>
          <SectionTitle>Ride Revenue Trend (USD)</SectionTitle>
          <div className="bg-surface border border-border rounded-xl p-5">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={combinedByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => [fmtUsd(v * 100), 'Revenue']} />
                <Bar dataKey="ride_revenue" fill="#6366f1" name="Ride Revenue (USD)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ── Delivery revenue trend (ETB) ── */}
      {combinedByDay.some((d) => d.delivery_revenue > 0) && (
        <>
          <SectionTitle>Delivery Revenue Trend (ETB)</SectionTitle>
          <div className="bg-surface border border-border rounded-xl p-5">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={combinedByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}`} />
                <Tooltip formatter={(v: number) => [fmtEtb(v * 100), 'Revenue (ETB)']} />
                <Bar dataKey="delivery_revenue" fill="#10b981" name="Delivery Revenue (ETB)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ── Two-column: Revenue by service + Vehicles ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">

        {revenueByService.length > 0 && (
          <div className="min-w-0 bg-surface border border-border rounded-xl p-5">
            <div className="text-sm font-semibold mb-1">Revenue by Service</div>
            <div className="text-xs text-muted mb-3">USD for rides &amp; marketplace · ETB for deliveries</div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={revenueByService}
                  dataKey="revenue_cents"
                  nameKey="service_type"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  label={({ service_type }: any) => service_type.replace(/_/g, ' ')}
                >
                  {revenueByService.map((entry, i) => (
                    <Cell
                      key={entry.service_type}
                      fill={SERVICE_COLORS[entry.service_type] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number, _n: string, p: any) => [
                  p.payload?.currency === 'ETB' ? fmtEtb(v) : fmtUsd(v),
                  p.payload?.service_type,
                ]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1 mt-2">
              {revenueByService.map((s, i) => (
                <div key={s.service_type} className="flex justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: SERVICE_COLORS[s.service_type] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length] }}
                    />
                    {s.service_type.replace(/_/g, ' ')}
                    {s.currency === 'ETB' && <span className="text-muted">(ETB)</span>}
                  </span>
                  <span className="font-medium">
                    {s.currency === 'ETB' ? fmtEtb(s.revenue_cents) : fmtUsd(s.revenue_cents)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

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
                    <Cell key={i} fill={FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Ride funnel ── */}
      {!ridesLoading && rides && (
        <>
          <SectionTitle>Ride Funnel</SectionTitle>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total requested', value: fmtNum(rides.total) },
              { label: 'Completed', value: fmtNum(rides.completed), note: rideCompletionRate },
              { label: 'Cancelled', value: fmtNum(rides.cancelled), note: rides.total ? fmtPct(rides.cancelled / rides.total) : undefined },
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

      {/* ── Delivery funnel ── */}
      {!delivLoading && deliveries && (
        <>
          <SectionTitle>Delivery Funnel</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total created', value: fmtNum(deliveries.total) },
              { label: 'Delivered', value: fmtNum(deliveries.delivered), note: deliveries.total ? fmtPct(deliveries.completion_rate) : undefined },
              { label: 'Active', value: fmtNum(deliveries.active), note: 'in progress' },
              { label: 'Cancelled / failed', value: fmtNum(deliveries.cancelled + deliveries.failed) },
            ].map((s) => (
              <div key={s.label} className="bg-surface border border-border rounded-xl p-5">
                <div className="text-xs text-muted uppercase tracking-wide mb-1">{s.label}</div>
                <div className="text-2xl font-bold">{s.value}</div>
                {s.note && <div className="text-xs text-muted mt-0.5">{s.note}</div>}
              </div>
            ))}
          </div>

          {deliveries.by_service_type && deliveries.by_service_type.length > 0 && (
            <div className="mt-4 bg-surface border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted">Service type</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Total</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Delivered</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Revenue (ETB)</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.by_service_type.map((r, i) => (
                    <tr key={r.service_type} className={i % 2 === 0 ? '' : 'bg-bg/40'}>
                      <td className="px-4 py-3 font-medium capitalize">{r.service_type.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtNum(r.total)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtNum(r.delivered)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtEtb(r.revenue_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Marketplace ── */}
      {!mktLoading && marketplace && (
        <>
          <SectionTitle>Marketplace</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total listings', value: fmtNum(marketplace.total_listings) },
              { label: 'Approved', value: fmtNum(marketplace.approved) },
              { label: 'Pending review', value: fmtNum(marketplace.pending) },
              { label: 'Listing fee revenue (USD)', value: fmtUsd(marketplace.total_revenue_cents) },
            ].map((s) => (
              <div key={s.label} className="bg-surface border border-border rounded-xl p-5">
                <div className="text-xs text-muted uppercase tracking-wide mb-1">{s.label}</div>
                <div className="text-2xl font-bold">{s.value}</div>
              </div>
            ))}
          </div>

          {marketplace.by_type && marketplace.by_type.length > 0 && (
            <div className="mt-4 bg-surface border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted">Listing type</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Total</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Approved</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Rejected</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Fee revenue (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {marketplace.by_type.map((r, i) => (
                    <tr key={r.listing_type} className={i % 2 === 0 ? '' : 'bg-bg/40'}>
                      <td className="px-4 py-3 font-medium capitalize">{r.listing_type}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtNum(r.total_listings)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtNum(r.approved)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtNum(r.rejected)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtUsd(r.listing_fee_revenue_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Driver pipeline ── */}
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

      {/* ── Revenue split (rides) ── */}
      {!revLoading && revenue && (revenue.commission_cents != null || revenue.payout_cents != null) && (
        <>
          <SectionTitle>Ride Revenue Split (USD)</SectionTitle>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Gross ride revenue', value: fmtUsd(revenue.total_cents) },
              { label: 'Driver payouts', value: revenue.payout_cents != null ? fmtUsd(revenue.payout_cents) : '—' },
              { label: 'Net commission', value: revenue.commission_cents != null ? fmtUsd(revenue.commission_cents) : '—' },
            ].map((s) => (
              <div key={s.label} className="bg-surface border border-border rounded-xl p-5">
                <div className="text-xs text-muted uppercase tracking-wide mb-1">{s.label}</div>
                <div className="text-2xl font-bold">{s.value}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Top regions ── */}
      {topRegions.length > 0 && (
        <>
          <SectionTitle>Top Regions (Rides)</SectionTitle>
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted">Region</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Rides</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Revenue (USD)</th>
                </tr>
              </thead>
              <tbody>
                {topRegions.map((r, i) => (
                  <tr key={r.region} className={i % 2 === 0 ? '' : 'bg-bg/40'}>
                    <td className="px-4 py-3 font-medium">{r.region}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNum(r.rides)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtUsd(r.revenue_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!dashLoading && !dash?.total_rides && !dash?.total_deliveries && (
        <div className="text-center text-muted py-20">
          <div className="text-4xl mb-3">📊</div>
          <div className="text-sm">No data for the selected range. Adjust the date filter or wait for the analytics service to index more events.</div>
        </div>
      )}
    </div>
  );
}
