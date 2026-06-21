import { Fragment, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useRegionScope } from '../../stores/region-scope.store';
import { PageHeader } from '../../components/PageHeader';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { Pagination } from '../../components/Pagination';
import { exportToCsv } from '../../lib/export';
import { QueryError } from '../../components/QueryError.js';

interface AuditEntry {
  id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: any;
  created_at: string;
}

interface EventType { event_type: string; count: number; }

function actionColor(action: string): string {
  if (action.includes('cancel') || action.includes('fail') || action.includes('rejected')) return 'bg-danger/10 text-danger';
  if (action.includes('completed') || action.includes('ended') || action.includes('succeeded') || action.includes('approved') || action.includes('accepted')) return 'bg-success/10 text-success';
  if (action.includes('feedback') || action.includes('rated')) return 'bg-purple-100 text-purple-800';
  if (action.includes('offered') || action.includes('arrived')) return 'bg-blue-100 text-blue-800';
  if (action.includes('started')) return 'bg-yellow-100 text-yellow-800';
  return 'bg-surface text-muted';
}

const AUDIT_PAGE_SIZE = 50;

export function AuditPage(): JSX.Element {
  const navigate = useNavigate();
  const [eventType, setEventType] = useState('');
  const [actorId, setActorId] = useState('');
  const [rideId, setRideId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const regionCode = useRegionScope((st) => st.regionCode);

  const { data: eventTypes } = useQuery({
    queryKey: ['audit-event-types'],
    queryFn: () => api<{ items: EventType[] }>('/v1/admin/audit/event-types'),
  });

  const { data: adminUsersData } = useQuery({
    queryKey: ['admin-users-for-audit'],
    queryFn: () => api<{ items: Array<{ id: string; full_name: string | null; email: string }> }>('/v1/admin/admin-users'),
    staleTime: 5 * 60_000,
  });
  const adminNameMap = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>();
    (adminUsersData?.items ?? []).forEach((u) => m.set(u.id, u.full_name ?? u.email));
    return m;
  }, [adminUsersData]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit', eventType, actorId, rideId, regionCode],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '500' });
      if (eventType) params.set('event_type', eventType);
      if (actorId) params.set('actor_id', actorId);
      if (rideId) params.set('ride_id', rideId);
      if (regionCode) params.set('region', regionCode);
      return api<{ items: AuditEntry[] }>(`/v1/admin/audit?${params.toString()}`);
    },
    refetchInterval: 30_000,
  });

  const allItems = data?.items ?? [];

  const items = useMemo(() => {
    if (!dateFrom && !dateTo) return allItems;
    return allItems.filter((e) => {
      const d = e.created_at.slice(0, 10);
      return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
    });
  }, [allItems, dateFrom, dateTo]);

  if (isError) return <QueryError onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every event. Append-only. Auto-refresh every 30s." />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={eventType} onChange={(e) => { setEventType(e.target.value); setPage(1); }}
          className="px-3 py-1.5 bg-white text-ink border border-border rounded text-sm">
          <option value="">All event types</option>
          {(eventTypes?.items ?? []).map((t) => (
            <option key={t.event_type} value={t.event_type}>{t.event_type} ({t.count})</option>
          ))}
        </select>
        <input value={actorId} onChange={(e) => { setActorId(e.target.value); setPage(1); }}
          placeholder="Actor UUID"
          className="px-3 py-1.5 bg-white text-ink border border-border rounded text-sm font-mono w-56" />
        <input value={rideId} onChange={(e) => { setRideId(e.target.value); setPage(1); }}
          placeholder="Ride UUID"
          className="px-3 py-1.5 bg-white text-ink border border-border rounded text-sm font-mono w-56" />
        <DateRangeFilter from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); setPage(1); }} />
        {(eventType || actorId || rideId || dateFrom || dateTo) && (
          <button onClick={() => { setEventType(''); setActorId(''); setRideId(''); setDateFrom(''); setDateTo(''); setPage(1); }}
            className="text-xs text-accent hover:underline">Clear all</button>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={() => exportToCsv(`audit-${new Date().toISOString().slice(0, 10)}`, items, [
            { header: 'Time', getValue: (e) => e.created_at },
            { header: 'Action', getValue: (e) => e.action },
            { header: 'Actor', getValue: (e) => adminNameMap.get(e.actor_id) ?? e.actor_id },
            { header: 'Affected party', getValue: (e) => e.metadata?.driver_name ?? e.metadata?.rider_name ?? e.metadata?.reason ?? '' },
            { header: 'Target', getValue: (e) => e.target_id ?? '' },
            { header: 'Target type', getValue: (e) => e.target_type },
          ])} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-surface">↓ Export CSV</button>
        </div>
      </div>

      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2 w-44">When</th>
              <th className="text-left px-3 py-2">Action</th>
              <th className="text-left px-3 py-2">Actor</th>
              <th className="text-left px-3 py-2">Affected party</th>
              <th className="text-left px-3 py-2">Ride</th>
              <th className="text-left px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">Loading…</td></tr>}
            {!isLoading && items.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">No events.</td></tr>}
            {items.slice((page - 1) * AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE).map((e) => {
              const expanded = expandedId === e.id;
              const hasMeta = e.metadata && Object.keys(e.metadata).length > 0;
              return (
                <Fragment key={e.id}>
                  <tr onClick={() => hasMeta && setExpandedId(expanded ? null : e.id)}
                    className={'border-t border-border ' + (hasMeta ? 'cursor-pointer hover:bg-surface' : '')}>
                    <td className="px-3 py-2 text-muted text-xs whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <span className={'px-2 py-0.5 rounded-full text-xs ' + actionColor(e.action)}>{e.action.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {e.actor_id === 'system' ? (
                        <span className="text-muted italic">system</span>
                      ) : adminNameMap.has(e.actor_id) ? (
                        <div>
                          <div className="font-medium text-ink">{adminNameMap.get(e.actor_id)}</div>
                          <div className="font-mono text-muted text-xs">{e.actor_id.slice(0, 8)}</div>
                        </div>
                      ) : (
                        <span className="font-mono text-accent cursor-pointer hover:underline"
                          onClick={(ev) => { ev.stopPropagation(); navigate(`/users/${e.actor_id}`); }}>
                          {e.actor_id.slice(0, 8)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {e.metadata?.driver_name || e.metadata?.rider_name || e.metadata?.affected_name
                        ? <span className="text-ink">{e.metadata?.driver_name ?? e.metadata?.rider_name ?? e.metadata?.affected_name}</span>
                        : e.metadata?.reason
                        ? <span className="italic">{String(e.metadata.reason).slice(0, 40)}</span>
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {e.target_id ? (
                        <span className="font-mono text-accent hover:underline cursor-pointer"
                          onClick={(ev) => { ev.stopPropagation(); navigate(`/rides/${e.target_id}`); }}>
                          {e.target_id.slice(0, 8)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-muted text-xs">
                      {hasMeta ? (expanded ? '▼ hide' : '▶ view') : '—'}
                    </td>
                  </tr>
                  {expanded && hasMeta && (
                    <tr>
                      <td colSpan={6} className="px-3 py-2 bg-surface border-t border-border">
                        <pre className="text-xs text-ink font-mono whitespace-pre-wrap overflow-x-auto max-h-64">{JSON.stringify(e.metadata, null, 2)}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-muted">{items.length} event{items.length !== 1 ? 's' : ''}</span>
        <Pagination page={page} pageSize={AUDIT_PAGE_SIZE} total={items.length} onChange={setPage} />
      </div>
    </>
  );
}
