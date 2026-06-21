import React, { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { QueryError } from '../../components/QueryError';

// ─── helpers ────────────────────────────────────────────────────────────────

function isoToday() { return new Date().toISOString().slice(0, 10); }
function iso30DaysAgo() {
  const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10);
}
function fmtNum(n: number) { return new Intl.NumberFormat('en-US').format(n); }
function fmtMs(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

// ─── types ───────────────────────────────────────────────────────────────────

interface ChatData {
  total_sessions: number;
  active_sessions: number;
  archived_sessions: number;
  total_messages: number;
  avg_delivery_latency_ms: number;
  avg_read_latency_ms: number;
  avg_messages_per_session: number;
  by_booking_type: Array<{ booking_type: string; session_count: number; message_count: number }>;
  by_message_type: Array<{ message_type: string; count: number }>;
  by_day: Array<{ date: string; sessions: number; messages: number }>;
  archival_reasons: Array<{ reason: string; count: number }>;
  sessions_by_status: Array<{ status: string; count: number }>;
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

const BOOKING_TYPE_COLORS: Record<string, string> = {
  ride: '#6366f1',
  delivery: '#10b981',
  merchant_order: '#f59e0b',
};

const STATUS_COLORS: Record<string, string> = {
  active: '#10b981',
  archived: '#94a3b8',
  pending: '#f59e0b',
};

const MESSAGE_TYPE_COLORS = ['#6366f1', '#0ea5e9', '#94a3b8', '#f59e0b', '#10b981'];
const FALLBACK_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444'];

// ─── main ────────────────────────────────────────────────────────────────────

export function ChatPage(): JSX.Element {
  const [from, setFrom] = useState(iso30DaysAgo());
  const [to, setTo] = useState(isoToday());
  const qs = `?from=${from}&to=${to}`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics-chat', from, to],
    queryFn: () => api<ChatData>(`/v1/admin/analytics/chat${qs}`),
    staleTime: 2 * 60_000,
    retry: 1,
  });

  if (isError) return <QueryError onRetry={() => refetch()} />;

  const byDay = (data?.by_day ?? []).map((r) => ({ ...r, date: r.date.slice(5) }));
  const byBookingType = data?.by_booking_type ?? [];
  const byMsgType = data?.by_message_type ?? [];
  const archivalReasons = data?.archival_reasons ?? [];
  const sessionsByStatus = data?.sessions_by_status ?? [];

  return (
    <div>
      <PageHeader title="Chat Analytics" subtitle="In-app booking chat sessions, message metrics, and moderation overview" />

      <div className="mb-6">
        <DateRangeFilter
          from={from} to={to}
          onChange={(f, t) => { setFrom(f || iso30DaysAgo()); setTo(t || isoToday()); }}
        />
      </div>

      {/* ── Overview KPIs ── */}
      <SectionTitle>Overview</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total sessions" value={fmtNum(data?.total_sessions ?? 0)} loading={isLoading} />
        <KpiCard label="Active sessions" value={fmtNum(data?.active_sessions ?? 0)} loading={isLoading}
          sub={data?.total_sessions ? `${((data.active_sessions / data.total_sessions) * 100).toFixed(1)}% of total` : undefined} />
        <KpiCard label="Total messages" value={fmtNum(data?.total_messages ?? 0)} loading={isLoading} />
        <KpiCard label="Avg msgs / session" value={(data?.avg_messages_per_session ?? 0).toFixed(1)} loading={isLoading} />
        <KpiCard label="Archived sessions" value={fmtNum(data?.archived_sessions ?? 0)} loading={isLoading} />
        <KpiCard label="Avg delivery latency" value={isLoading ? '—' : fmtMs(data?.avg_delivery_latency_ms ?? 0)} loading={isLoading} sub="message → delivered" />
        <KpiCard label="Avg read latency" value={isLoading ? '—' : fmtMs(data?.avg_read_latency_ms ?? 0)} loading={isLoading} sub="delivered → read" />
      </div>

      {/* ── Daily sessions & messages ── */}
      {byDay.length > 0 && (
        <>
          <SectionTitle>Sessions &amp; Messages Over Time</SectionTitle>
          <div className="bg-surface border border-border rounded-xl p-5">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="sessions" stroke="#6366f1" strokeWidth={2} dot={false} name="Sessions" />
                <Line yAxisId="right" type="monotone" dataKey="messages" stroke="#10b981" strokeWidth={2} dot={false} name="Messages" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ── Booking type + Message type side-by-side ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">

        {byBookingType.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="text-sm font-semibold mb-3">Sessions by Booking Type</div>
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={byBookingType} dataKey="session_count" nameKey="booking_type"
                  innerRadius={50} outerRadius={78} paddingAngle={3}>
                  {byBookingType.map((b, i) => (
                    <Cell key={b.booking_type} fill={BOOKING_TYPE_COLORS[b.booking_type] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number, _n: string, p: any) => [fmtNum(v), p.payload?.booking_type]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1 mt-2">
              {byBookingType.map((b, i) => (
                <div key={b.booking_type} className="flex justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: BOOKING_TYPE_COLORS[b.booking_type] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length] }} />
                    {b.booking_type.replace(/_/g, ' ')}
                  </span>
                  <span className="font-medium">{fmtNum(b.session_count)} sessions · {fmtNum(b.message_count)} msgs</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {byMsgType.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="text-sm font-semibold mb-3">Messages by Type</div>
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={byMsgType} dataKey="count" nameKey="message_type"
                  innerRadius={50} outerRadius={78} paddingAngle={3}>
                  {byMsgType.map((m, i) => (
                    <Cell key={m.message_type} fill={MESSAGE_TYPE_COLORS[i % MESSAGE_TYPE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number, _n: string, p: any) => [fmtNum(v), p.payload?.message_type]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Session status + archival reasons ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">

        {sessionsByStatus.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="text-sm font-semibold mb-3">Sessions by Status</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={sessionsByStatus} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="status" type="category" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="count" name="Sessions" radius={[0, 3, 3, 0]}>
                  {sessionsByStatus.map((s) => (
                    <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {archivalReasons.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="text-sm font-semibold mb-3">Archival Reasons</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={archivalReasons} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="reason" type="category" tick={{ fontSize: 11 }} width={120} />
                <Tooltip />
                <Bar dataKey="count" fill="#94a3b8" name="Sessions" radius={[0, 3, 3, 0]}>
                  {archivalReasons.map((_, i) => (
                    <Cell key={i} fill={FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Archival reasons table ── */}
      {archivalReasons.length > 0 && (
        <>
          <SectionTitle>Archival Reason Breakdown</SectionTitle>
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted">Reason</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Sessions</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">% of Archived</th>
                </tr>
              </thead>
              <tbody>
                {archivalReasons.map((r, i) => {
                  const total = archivalReasons.reduce((s, x) => s + x.count, 0);
                  return (
                    <tr key={r.reason} className={i % 2 === 0 ? '' : 'bg-bg/40'}>
                      <td className="px-4 py-3 font-medium capitalize">{r.reason.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtNum(r.count)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">
                        {total ? `${((r.count / total) * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!isLoading && !data?.total_sessions && (
        <div className="text-center text-muted py-20">
          <div className="text-4xl mb-3">💬</div>
          <div className="text-sm">No chat sessions in the selected range.</div>
        </div>
      )}
    </div>
  );
}
