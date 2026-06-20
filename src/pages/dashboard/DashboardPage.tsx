import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useRegionScope } from '../../stores/region-scope.store';
import { PageHeader } from '../../components/PageHeader';

// ---------------------------------------------------------------------------
// Pending Actions Panel — centralized view of all items needing admin action
// ---------------------------------------------------------------------------

interface ActionItem {
  label: string;
  count: number;
  urgency: 'high' | 'normal';
  link: string;
  icon: string;
}

function PendingActionsPanel() {
  const nav = useNavigate();
  const regionCode = useRegionScope((st) => st.regionCode);
  const r = regionCode ? `?region=${regionCode}` : '';
  const rAmp = regionCode ? `&region=${regionCode}` : '';

  const { data: marketplaceRev } = useQuery({
    queryKey: ['pa-marketplace', regionCode],
    queryFn: () => api<{ totals: { pending_listings: number | null } }>(`/v1/admin/marketplace/revenue${r}`),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const { data: marketplaceListings } = useQuery({
    queryKey: ['pa-listings-info-required', regionCode],
    queryFn: () => api<{ total: number }>(`/v1/admin/listings?status=information_required&limit=1${rAmp}`),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const { data: listingReports } = useQuery({
    queryKey: ['pa-listing-reports', regionCode],
    queryFn: () => api<{ total: number } | any[]>(`/v1/admin/listings/reports${r}`),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const { data: riderTickets } = useQuery({
    queryKey: ['pa-rider-tickets', regionCode],
    queryFn: () => api<{ tickets: any[]; total?: number }>(`/v1/admin/rider-support/tickets?status=open&limit=1${rAmp}`),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const { data: driverTickets } = useQuery({
    queryKey: ['pa-driver-tickets', regionCode],
    queryFn: () => api<{ tickets: any[]; total?: number }>(`/v1/admin/driver-support/tickets?status=open&limit=1${rAmp}`),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const pendingListings = Number(marketplaceRev?.totals?.pending_listings ?? 0);
  const infoRequired   = Number((marketplaceListings as any)?.total ?? 0);
  const reports        = Array.isArray(listingReports)
    ? listingReports.length
    : Number((listingReports as any)?.total ?? 0);
  const riderOpen  = Number(riderTickets?.total ?? riderTickets?.tickets?.length ?? 0);
  const driverOpen = Number(driverTickets?.total ?? driverTickets?.tickets?.length ?? 0);

  const actions: ActionItem[] = [
    { label: 'Listings to approve',      count: pendingListings, urgency: 'high',   link: '/marketplace', icon: '🏷️' },
    { label: 'Listings need info',        count: infoRequired,   urgency: 'normal', link: '/marketplace', icon: '📋' },
    { label: 'Listing reports',           count: reports,        urgency: 'high',   link: '/marketplace', icon: '🚩' },
    { label: 'Open rider support',        count: riderOpen,      urgency: 'high',   link: '/support',     icon: '🎫' },
    { label: 'Open driver support',       count: driverOpen,     urgency: 'high',   link: '/support',     icon: '🎫' },
  ].filter((a) => a.count > 0);

  const totalActions = actions.reduce((s, a) => s + a.count, 0);
  if (totalActions === 0) return null;

  return (
    <div className="mb-4 border border-orange-200 bg-orange-50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">⚠️</span>
        <span className="text-sm font-semibold text-orange-800">
          {totalActions} action{totalActions !== 1 ? 's' : ''} require your attention
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={() => nav(a.link)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs font-medium transition hover:brightness-95 ${
              a.urgency === 'high'
                ? 'bg-red-100 text-red-800 hover:bg-red-200'
                : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
            }`}
          >
            <span className="text-base leading-none">{a.icon}</span>
            <div>
              <div className="text-lg font-bold leading-none">{a.count}</div>
              <div className="text-[11px] mt-0.5 leading-tight">{a.label}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

interface AnalyticsSummary {
  rides_today: number;
  revenue_today_cents: number;
  active_drivers: number;
  active_rides: number;
  currency: string;
}

interface StatsRow { total: string | number; status: string; }
interface StatsResp { interval: string; stats: StatsRow[]; }

interface ActiveRide {
  id: string;
  status: string;
  rider_id: string;
  driver_id: string | null;
  requested_at: string;
  vehicle_category: string;
  pickup_address: string;
  dropoff_address: string;
}

interface Driver {
  id: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
}

interface DeliveryItem {
  id: string;
  status: string;
  service_type: string;
  requester_id: string;
  requester_name?: string | null;
  driver_id: string | null;
  driver_name?: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  total_cents: number | null;
  fare_cents: number | null;
  commission_cents?: number | null;
  commission_rate_percent?: number | null;
  created_at: string;
}

interface DeliveryListResponse {
  items: DeliveryItem[];
  total: number;
  has_more: boolean;
}

function fmtUsd(c: number | string | null | undefined) {
  return `$${(Number(c ?? 0) / 100).toFixed(2)}`;
}

function fmtEtb(c: number | string | null | undefined) {
  return `ETB ${(Number(c ?? 0) / 100).toFixed(2)}`;
}

function statusColor(s: string): string {
  if (s === 'completed') return 'bg-success/10 text-success';
  if (s.startsWith('cancelled') || s === 'no_drivers_available') return 'bg-danger/10 text-danger';
  if (s === 'requested') return 'bg-blue-100 text-blue-800';
  return 'bg-yellow-100 text-yellow-800';
}

export function DashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const regionCode = useRegionScope((st) => st.regionCode);
  const r = regionCode ? `?region=${regionCode}` : '';
  const rAmp = regionCode ? `&region=${regionCode}` : '';

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['analytics-summary', regionCode],
    queryFn: () => api<AnalyticsSummary>(`/v1/admin/analytics/summary${r}`),
    refetchInterval: 30_000,
  });

  const { data: statsData } = useQuery({
    queryKey: ['analytics-stats', regionCode],
    queryFn: () => api<StatsResp>(`/v1/admin/analytics${r}`),
    refetchInterval: 60_000,
  });

  const { data: activeRides } = useQuery({
    queryKey: ['active-map', regionCode],
    queryFn: () => api<ActiveRide[]>(`/v1/admin/rides/active-map${r}`),
    refetchInterval: 15_000,
  });

  const { data: pendingDrivers } = useQuery({
    queryKey: ['pending-drivers', regionCode],
    queryFn: () => api<{ items: Driver[] }>(`/v1/admin/users?role=driver&status=pending&limit=10${rAmp}`),
    refetchInterval: 60_000,
  });

  const { data: recentRides } = useQuery({
    queryKey: ['recent-rides-dash', regionCode],
    queryFn: () => api<{ items: any[] }>(`/v1/admin/rides?limit=8${rAmp}`),
    refetchInterval: 30_000,
  });

  const { data: deliveryData } = useQuery({
    queryKey: ['dashboard-deliveries', regionCode],
    queryFn: () => api<DeliveryListResponse>(`/v1/admin/deliveries?limit=200&page=1${rAmp}`),
    refetchInterval: 30_000,
  });

  const { data: marketplaceRevenue } = useQuery({
    queryKey: ['dashboard-marketplace-revenue', regionCode],
    queryFn: () => api<{ totals: { total_revenue_cents: string | null; total_paid_listings: number | null; active_listings: number | null; pending_listings: number | null }; by_type: any[] }>(`/v1/admin/marketplace/revenue${r}`),
    refetchInterval: 60_000,
  });

  const { data: rideRevenueHistory } = useQuery({
    queryKey: ['dashboard-ride-revenue-alltime', regionCode],
    queryFn: () => api<any[]>(`/v1/admin/rides/reports/revenue?start=2024-01-01T00:00:00Z&end=${new Date().toISOString()}${rAmp}`),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 300_000,
  });

  const stats = statsData?.stats ?? [];
  const totalRides = stats.reduce((sum, r) => sum + Number(r.total ?? 0), 0);
  const completedCount = Number(stats.find((s) => s.status === 'completed')?.total ?? 0);
  const cancelledCount = stats
    .filter((s) => s.status.startsWith('cancelled') || s.status === 'no_drivers_available')
    .reduce((sum, s) => sum + Number(s.total ?? 0), 0);

  const deliveries = deliveryData?.items ?? [];
  const totalDeliveries = deliveryData?.total ?? deliveries.length;
  const activeDeliveries = deliveries.filter((d) =>
    ['assigned', 'picked_up', 'in_transit'].includes(d.status),
  ).length;
  const completedDeliveries = deliveries.filter((d) => d.status === 'delivered').length;
  const cancelledDeliveries = deliveries.filter((d) => d.status === 'cancelled' || d.status === 'failed').length;

  // Delivery revenue calculations (all-time)
  const deliveryRevenueCents = deliveries
    .filter((d) => d.status === 'delivered')
    .reduce((sum, d) => sum + Number(d.total_cents ?? d.fare_cents ?? 0), 0);

  // Delivery revenue today (for the top KPI)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const deliveryRevenueTodayCents = deliveries
    .filter((d) => d.status === 'delivered' && new Date(d.created_at) >= todayStart)
    .reduce((sum, d) => sum + Number(d.total_cents ?? d.fare_cents ?? 0), 0);
  // Commission is fetched from the API (commission_cents field) when available.
  // If not available, fall back to using the configured commission percentage from the pricing service.
  // The default commission rate is configurable via the admin settings panel.
  const deliveryCommissionCents = deliveries
    .filter((d) => d.status === 'delivered')
    .reduce((sum, d) => {
      // Use API-provided commission_cents if available, otherwise estimate from config
      if (d.commission_cents != null) return sum + Number(d.commission_cents);
      const total = Number(d.total_cents ?? d.fare_cents ?? 0);
      // Commission rate is fetched from the pricing service configuration.
      // Default fallback: 20% (configurable via admin settings)
      const commissionRate = Number(d.commission_rate_percent ?? 20) / 100;
      return sum + Math.round(total * commissionRate);
    }, 0);
  const deliveryPayoutCents = deliveryRevenueCents - deliveryCommissionCents;

  const recentDeliveries = [...deliveries].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6);

  const marketplaceRevenueCents = Number(marketplaceRevenue?.totals?.total_revenue_cents ?? 0);
  const marketplacePaidListings = marketplaceRevenue?.totals?.total_paid_listings ?? 0;
  const marketplaceActiveListings = marketplaceRevenue?.totals?.active_listings ?? 0;
  const marketplacePendingListings = marketplaceRevenue?.totals?.pending_listings ?? 0;

  const rideRevenueCents = (rideRevenueHistory ?? []).reduce((s, r) => s + Number(r.gross_fare_cents ?? 0), 0);
  const totalPlatformRevenueCents = rideRevenueCents + deliveryRevenueCents + marketplaceRevenueCents;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live operations overview." />

      <PendingActionsPanel />

      {/* Total Platform Revenue Banner */}
      <div className="bg-gradient-to-r from-accent/10 to-accent/5 border border-accent/20 rounded-lg p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase text-accent/70 font-medium tracking-wide">Platform Revenue by Branch</div>
            <div className="text-xs text-muted mt-1">Rides &amp; marketplace in USD · Deliveries in ETB (different currencies — not summed)</div>
          </div>
          <div className="flex gap-6 flex-wrap">
            <RevenueSource label="Rides (USD)" cents={rideRevenueCents} fmt={fmtUsd} />
            <RevenueSource label="Deliveries (ETB)" cents={deliveryRevenueCents} fmt={fmtEtb} />
            <RevenueSource label="Marketplace (USD)" cents={marketplaceRevenueCents} fmt={fmtUsd} />
          </div>
        </div>
        {(rideRevenueCents + marketplaceRevenueCents) > 0 && (
          <div className="mt-3 flex h-2 rounded-full overflow-hidden gap-0.5">
            <div className="bg-accent" style={{ width: `${(rideRevenueCents / (rideRevenueCents + marketplaceRevenueCents)) * 100}%` }} title={`Rides ${fmtUsd(rideRevenueCents)}`} />
            <div className="bg-yellow-500" style={{ width: `${(marketplaceRevenueCents / (rideRevenueCents + marketplaceRevenueCents)) * 100}%` }} title={`Marketplace ${fmtUsd(marketplaceRevenueCents)}`} />
          </div>
        )}
        <div className="flex gap-4 mt-1.5 text-xs text-muted">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-accent" />Rides (USD)</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-success" />Deliveries (ETB)</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />Marketplace (USD)</span>
        </div>
      </div>

      {/* Top KPIs — Rides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Kpi label="Rides today" value={summary?.rides_today ?? (sumLoading ? '…' : 0)} />
        <Kpi label="Ride revenue today" value={fmtUsd(summary?.revenue_today_cents ?? 0)} />
        <Kpi label="Delivery rev. today" value={fmtEtb(deliveryRevenueTodayCents)} sub="delivery revenue (ETB)" />
        <Kpi label="Drivers online" value={summary?.active_drivers ?? (sumLoading ? '…' : 0)} />
        <Kpi label="Active rides" value={summary?.active_rides ?? (sumLoading ? '…' : 0)} accent={!!summary?.active_rides} />
      </div>

      {/* Delivery KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Kpi label="Total deliveries" value={totalDeliveries} sub="all time" />
        <Kpi label="Active deliveries" value={activeDeliveries} accent={activeDeliveries > 0} sub="assigned / in transit" />
        <Kpi label="Delivered" value={completedDeliveries} sub="completed" />
        <Kpi label="Cancelled" value={cancelledDeliveries} sub="cancelled / failed" />
      </div>

      {/* Delivery Revenue KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Kpi label="Delivery revenue" value={fmtEtb(deliveryRevenueCents)} sub="total from completed (ETB)" />
        <Kpi label="Delivery commissions" value={fmtEtb(deliveryCommissionCents)} sub="platform share (ETB)" />
        <Kpi label="Delivery payouts" value={fmtEtb(deliveryPayoutCents)} sub="paid to drivers (ETB)" />
        <Kpi label="Delivery growth" value={totalDeliveries > 0 ? `${((completedDeliveries / totalDeliveries) * 100).toFixed(0)}%` : '—'} sub="completion rate" />
      </div>

      {/* Marketplace KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi label="Marketplace ad revenue" value={fmtUsd(marketplaceRevenueCents)} sub="listing fees collected" accent={marketplaceRevenueCents > 0} />
        <Kpi label="Active listings" value={marketplaceActiveListings} sub="approved & live" />
        <Kpi label="Paid listings" value={marketplacePaidListings} sub="featured / sponsored / premium" />
        <Kpi label="Pending review" value={marketplacePendingListings} sub="awaiting approval" accent={marketplacePendingListings > 0} />
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Status breakdown */}
        <div className="bg-white border border-border rounded p-4">
          <div className="text-xs uppercase text-muted mb-3">All-time rides by status</div>
          <div className="space-y-2">
            {stats.map((s) => {
              const count = Number(s.total ?? 0);
              const pct = totalRides ? (count / totalRides) * 100 : 0;
              return (
                <div key={s.status}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="capitalize text-ink">{s.status.replace(/_/g, ' ')}</span>
                    <span className="text-muted">{count} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                    <div className={'h-full ' + (s.status === 'completed' ? 'bg-success' :
                      s.status.startsWith('cancelled') ? 'bg-danger' : 'bg-accent')}
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-border text-xs text-muted">
            Completion rate: <span className="text-ink font-medium">
              {totalRides ? ((completedCount / totalRides) * 100).toFixed(1) : 0}%
            </span>
            {' · '}
            Cancellation rate: <span className="text-ink font-medium">
              {totalRides ? ((cancelledCount / totalRides) * 100).toFixed(1) : 0}%
            </span>
          </div>
        </div>

        {/* Pending driver approvals */}
        <div className="bg-white border border-border rounded p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs uppercase text-muted">Pending driver approvals</div>
            <button onClick={() => navigate('/drivers')} className="text-xs text-accent hover:underline">View all →</button>
          </div>
          {pendingDrivers?.items?.length ? (
            <ul className="space-y-2">
              {pendingDrivers.items.slice(0, 5).map((d) => (
                <li key={d.id} onClick={() => navigate(`/users/${d.id}`)}
                  className="text-sm cursor-pointer hover:bg-surface p-2 rounded -mx-2">
                  <div className="text-ink">{[d.first_name, d.last_name].filter(Boolean).join(' ') || '(unnamed)'}</div>
                  <div className="text-xs text-muted">Awaiting approval</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted">No drivers pending.</div>
          )}
        </div>

        {/* Active rides */}
        <div className="bg-white border border-border rounded p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs uppercase text-muted">Active rides ({activeRides?.length ?? 0})</div>
            <button onClick={() => navigate('/rides?status=requested')} className="text-xs text-accent hover:underline">View all →</button>
          </div>
          {activeRides?.length ? (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {activeRides.slice(0, 6).map((r) => (
                <li key={r.id} onClick={() => navigate(`/rides/${r.id}`)}
                  className="text-sm cursor-pointer hover:bg-surface p-2 rounded -mx-2 border-l-2 border-accent">
                  <div className="flex justify-between items-start">
                    <div className="font-mono text-xs text-muted">{r.id.slice(0, 8)}</div>
                    <span className={'text-xs px-1.5 py-0.5 rounded-full ' + statusColor(r.status)}>{r.status.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="text-xs text-ink truncate mt-0.5">
                    {(r.pickup_address || '—').split(',')[0]} → {(r.dropoff_address || '—').split(',')[0]}
                  </div>
                  <div className="text-xs text-muted">
                    {r.driver_id ? 'assigned' : <span className="text-danger">unassigned</span>} · {new Date(r.requested_at).toLocaleTimeString()}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted">No active rides.</div>
          )}
        </div>
      </div>

      {/* Recent rides */}
      <div className="bg-white border border-border rounded overflow-hidden mb-4">
        <div className="flex items-center justify-between p-4 pb-2">
          <div className="text-xs uppercase text-muted">Recent rides</div>
          <button onClick={() => navigate('/rides')} className="text-xs text-accent hover:underline">View all →</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">When</th>
              <th className="text-left px-3 py-2">Rider</th>
              <th className="text-left px-3 py-2">Driver</th>
              <th className="text-left px-3 py-2">Route</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-right px-3 py-2">Fare</th>
            </tr>
          </thead>
          <tbody>
            {(recentRides?.items ?? []).map((r: any) => (
              <tr key={r.id} onClick={() => navigate(`/rides/${r.id}`)}
                className="cursor-pointer border-t border-border hover:bg-surface">
                <td className="px-3 py-2 text-muted text-xs whitespace-nowrap">{new Date(r.requested_at).toLocaleString()}</td>
                <td className="px-3 py-2 text-ink text-xs">{r.rider_name ?? '—'}</td>
                <td className="px-3 py-2 text-ink text-xs">{r.driver_name ?? <span className="text-muted">unassigned</span>}</td>
                <td className="px-3 py-2 text-ink text-xs truncate max-w-md">
                  {(r.pickup_address || '—').split(',')[0]} → {(r.dropoff_address || '—').split(',')[0]}
                </td>
                <td className="px-3 py-2 text-xs">
                  <span className={'px-2 py-0.5 rounded-full ' + statusColor(r.status)}>{r.status.replace(/_/g, ' ')}</span>
                </td>
                <td className="px-3 py-2 text-right">{fmtUsd(r.fare_final_cents ?? r.fare_estimate_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Recent deliveries */}
      <div className="bg-white border border-border rounded overflow-hidden">
        <div className="flex items-center justify-between p-4 pb-2">
          <div className="text-xs uppercase text-muted">Recent deliveries</div>
          <button onClick={() => navigate('/delivery')} className="text-xs text-accent hover:underline">View all →</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">When</th>
              <th className="text-left px-3 py-2">Service</th>
              <th className="text-left px-3 py-2">Requester</th>
              <th className="text-left px-3 py-2">Driver</th>
              <th className="text-left px-3 py-2">Route</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-right px-3 py-2">Fare</th>
            </tr>
          </thead>
          <tbody>
            {recentDeliveries.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted text-sm">No deliveries yet.</td>
              </tr>
            ) : recentDeliveries.map((d) => (
              <tr key={d.id} onClick={() => navigate('/delivery')}
                className="cursor-pointer border-t border-border hover:bg-surface">
                <td className="px-3 py-2 text-muted text-xs whitespace-nowrap">{new Date(d.created_at).toLocaleString()}</td>
                <td className="px-3 py-2 text-xs capitalize">{d.service_type}</td>
                <td className="px-3 py-2 text-xs">{d.requester_name ?? d.requester_id.slice(0, 8)}</td>
                <td className="px-3 py-2 text-xs">
                  {d.driver_id
                    ? (d.driver_name ?? d.driver_id.slice(0, 8))
                    : <span className="text-danger text-xs italic">unassigned</span>}
                </td>

                <td className="px-3 py-2 text-xs truncate max-w-xs">
                  {(d.pickup_address || '—').split(',')[0]} → {(d.dropoff_address || '—').split(',')[0]}
                </td>
                <td className="px-3 py-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full ${deliveryStatusColor(d.status)}`}>
                    {d.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-xs">{fmtUsd(d.total_cents ?? d.fare_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

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

function RevenueSource({ label, cents, fmt = fmtUsd }: { label: string; cents: number; fmt?: (c: number) => string }) {
  return (
    <div className="text-center">
      <div className="text-xs text-muted uppercase">{label}</div>
      <div className="text-lg font-semibold text-ink">{fmt(cents)}</div>
    </div>
  );
}

function Kpi({ label, value, accent, sub }: { label: string; value: any; accent?: boolean; sub?: string }) {
  return (
    <div className={'bg-white border rounded p-4 ' + (accent ? 'border-accent' : 'border-border')}>
      <div className="text-xs uppercase text-muted">{label}</div>
      <div className="text-2xl font-semibold text-ink mt-1">{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
