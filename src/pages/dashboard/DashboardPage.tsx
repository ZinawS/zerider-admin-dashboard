import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useRegionScope } from '../../stores/region-scope.store';
import { PageHeader } from '../../components/PageHeader';

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

function fmtUsd(c: number | string | null | undefined) {
  return `$${(Number(c ?? 0) / 100).toFixed(2)}`;
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
    queryKey: ['pending-drivers'],
    queryFn: () => api<{ items: Driver[] }>('/v1/admin/users?role=driver&status=pending&limit=10'),
    refetchInterval: 60_000,
  });

  const { data: recentRides } = useQuery({
    queryKey: ['recent-rides-dash', regionCode],
    queryFn: () => api<{ items: any[] }>(`/v1/admin/rides?limit=8${rAmp}`),
    refetchInterval: 30_000,
  });

  const stats = statsData?.stats ?? [];
  const totalRides = stats.reduce((sum, r) => sum + Number(r.total ?? 0), 0);
  const completedCount = Number(stats.find((s) => s.status === 'completed')?.total ?? 0);
  const cancelledCount = stats
    .filter((s) => s.status.startsWith('cancelled') || s.status === 'no_drivers_available')
    .reduce((sum, s) => sum + Number(s.total ?? 0), 0);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live operations overview." />

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi label="Rides today" value={summary?.rides_today ?? (sumLoading ? '…' : 0)} />
        <Kpi label="Revenue today" value={summary ? fmtUsd(summary.revenue_today_cents) : (sumLoading ? '…' : '$0.00')} />
        <Kpi label="Drivers online" value={summary?.active_drivers ?? (sumLoading ? '…' : 0)} />
        <Kpi label="Active rides" value={summary?.active_rides ?? (sumLoading ? '…' : 0)} accent={!!summary?.active_rides} />
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

      {/* Recent activity */}
      <div className="bg-white border border-border rounded overflow-hidden">
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
    </>
  );
}

function Kpi({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div className={'bg-white border rounded p-4 ' + (accent ? 'border-accent' : 'border-border')}>
      <div className="text-xs uppercase text-muted">{label}</div>
      <div className="text-2xl font-semibold text-ink mt-1">{value}</div>
    </div>
  );
}
