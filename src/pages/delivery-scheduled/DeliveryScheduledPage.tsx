import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LineChart, Line, Cell,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { useRegionScope } from '../../stores/region-scope.store';
import { QueryError } from '../../components/QueryError';

// ─── helpers ────────────────────────────────────────────────────────────────

function isoToday() { return new Date().toISOString().slice(0, 10); }
function iso30DaysAgo() {
  const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10);
}
function fmtNum(n: number) { return new Intl.NumberFormat('en-US').format(n); }
function fmtPct(r: number) { return `${(r * 100).toFixed(1)}%`; }

// ─── types ───────────────────────────────────────────────────────────────────

interface ScheduledData {
  total_scheduled: number;
  total_recurring: number;
  total_immediate: number;
  dispatched_on_time: number;
  dispatch_on_time_rate: number;
  avg_dispatch_offset_s: number;
  active_patterns: number;
  by_delivery_type: Array<{ delivery_type: string; total: number; delivered: number; completion_rate: number }>;
  by_frequency: Array<{ frequency: string; patterns: number; active: number }>;
  by_day: Array<{
    date: string;
    immediate: number; scheduled: number; recurring: number;
    delivered_immediate: number; delivered_scheduled: number; delivered_recurring: number;
  }>;
  top_recurring_customers: Array<{
    customer_id: string; pattern_count: number; deliveries_spawned: number;
  }>;
}

// ─── sub-components ──────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, loading }: { label: string; value: string; sub?: string; loading?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="text-xs text-muted uppercase tracking-wide mb-1">{label}</div>
      {loading
        ? <div className="h-7 w-24 bg-border/40 rounded animate-pulse mt-1" />
        : <div className="text-2xl font-bold">{value}</div>}
      {sub && !loading && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-ink mb-3 mt-8 first:mt-0">{children}</h2>;
}

const TYPE_COLORS: Record<string, string> = {
  immediate: '#6366f1',
  scheduled: '#f59e0b',
  recurring: '#10b981',
};

const FREQ_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6'];

// ─── main ────────────────────────────────────────────────────────────────────

export function DeliveryScheduledPage(): JSX.Element {
  const [from, setFrom] = useState(iso30DaysAgo());
  const [to, setTo] = useState(isoToday());
  const regionCode = useRegionScope((s) => s.regionCode);
  const qs = `?from=${from}&to=${to}${regionCode ? `&region=${regionCode}` : ''}`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics-scheduled-delivery', from, to, regionCode],
    queryFn: () => api<ScheduledData>(`/v1/admin/analytics/deliveries/scheduled${qs}`),
    staleTime: 2 * 60_000,
    retry: 1,
  });

  if (isError) return <QueryError onRetry={() => refetch()} />;

  const byDay = (data?.by_day ?? []).map((r) => ({ ...r, date: r.date.slice(5) }));
  const byType = data?.by_delivery_type ?? [];
  const byFrequency = data?.by_frequency ?? [];
  const topCustomers = data?.top_recurring_customers ?? [];

  const onTimeRate = data?.dispatch_on_time_rate ?? 0;
  const onTimeColor = onTimeRate >= 0.95 ? 'text-emerald-600' : onTimeRate >= 0.8 ? 'text-amber-500' : 'text-red-500';

  return (
    <div>
      <PageHeader title="Scheduled &amp; Recurring Deliveries" subtitle="Dispatch performance, type breakdown, and pattern activity" />

      <div className="mb-6">
        <DateRangeFilter
          from={from} to={to}
          onChange={(f, t) => { setFrom(f || iso30DaysAgo()); setTo(t || isoToday()); }}
        />
      </div>

      {/* ── Overview KPIs ── */}
      <SectionTitle>Overview</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Immediate deliveries" value={fmtNum(data?.total_immediate ?? 0)} loading={isLoading} />
        <KpiCard label="Scheduled deliveries" value={fmtNum(data?.total_scheduled ?? 0)} loading={isLoading} sub="future pickup time" />
        <KpiCard label="Recurring deliveries" value={fmtNum(data?.total_recurring ?? 0)} loading={isLoading} sub="spawned from patterns" />
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-xs text-muted uppercase tracking-wide mb-1">On-time dispatch rate</div>
          {isLoading
            ? <div className="h-7 w-24 bg-border/40 rounded animate-pulse mt-1" />
            : <div className={`text-2xl font-bold ${onTimeColor}`}>{fmtPct(onTimeRate)}</div>}
          {!isLoading && data && (
            <div className="text-xs text-muted mt-0.5">{fmtNum(data.dispatched_on_time)} dispatched on time</div>
          )}
        </div>
        <KpiCard label="Active patterns" value={fmtNum(data?.active_patterns ?? 0)} loading={isLoading} sub="recurring patterns running" />
        <KpiCard label="Avg dispatch offset" value={isLoading ? '—' : `${Math.round(data?.avg_dispatch_offset_s ?? 0)}s`}
          loading={isLoading} sub="scheduled vs actual dispatch" />
      </div>

      {/* ── Daily stacked bar chart ── */}
      {byDay.length > 0 && (
        <>
          <SectionTitle>Deliveries by Type Over Time</SectionTitle>
          <div className="bg-surface border border-border rounded-xl p-5">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="immediate" fill={TYPE_COLORS.immediate} name="Immediate" stackId="a" />
                <Bar dataKey="scheduled" fill={TYPE_COLORS.scheduled} name="Scheduled" stackId="a" />
                <Bar dataKey="recurring" fill={TYPE_COLORS.recurring} name="Recurring" stackId="a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ── Delivered by type trend ── */}
      {byDay.some((d) => d.delivered_immediate || d.delivered_scheduled || d.delivered_recurring) && (
        <>
          <SectionTitle>Completed Deliveries by Type</SectionTitle>
          <div className="bg-surface border border-border rounded-xl p-5">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="delivered_immediate" stroke={TYPE_COLORS.immediate} strokeWidth={2} dot={false} name="Immediate" />
                <Line type="monotone" dataKey="delivered_scheduled" stroke={TYPE_COLORS.scheduled} strokeWidth={2} dot={false} name="Scheduled" />
                <Line type="monotone" dataKey="delivered_recurring" stroke={TYPE_COLORS.recurring} strokeWidth={2} dot={false} name="Recurring" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ── Type funnel table + frequency breakdown ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">

        {byType.length > 0 && (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-sm font-semibold">Completion Rate by Type</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted">Type</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Total</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Delivered</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Rate</th>
                </tr>
              </thead>
              <tbody>
                {byType.map((t, i) => (
                  <tr key={t.delivery_type} className={i % 2 === 0 ? '' : 'bg-bg/40'}>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full inline-block"
                          style={{ backgroundColor: TYPE_COLORS[t.delivery_type] ?? '#94a3b8' }} />
                        <span className="font-medium capitalize">{t.delivery_type}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNum(t.total)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNum(t.delivered)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {fmtPct(t.completion_rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {byFrequency.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="text-sm font-semibold mb-3">Recurring Patterns by Frequency</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={byFrequency}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="frequency" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="patterns" name="Total patterns" radius={[3, 3, 0, 0]}>
                  {byFrequency.map((_, i) => (
                    <Cell key={i} fill={FREQ_COLORS[i % FREQ_COLORS.length]} />
                  ))}
                </Bar>
                <Bar dataKey="active" name="Active" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Top recurring customers ── */}
      {topCustomers.length > 0 && (
        <>
          <SectionTitle>Top Recurring Customers</SectionTitle>
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted">Customer ID</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Active Patterns</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Deliveries Spawned</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map((c, i) => (
                  <tr key={c.customer_id} className={i % 2 === 0 ? '' : 'bg-bg/40'}>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{c.customer_id}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNum(c.pattern_count)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNum(c.deliveries_spawned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!isLoading && !data?.total_scheduled && !data?.total_recurring && !data?.total_immediate && (
        <div className="text-center text-muted py-20">
          <div className="text-4xl mb-3">📦</div>
          <div className="text-sm">No scheduled or recurring deliveries in the selected range.</div>
        </div>
      )}
    </div>
  );
}
