import React, { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
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
function fmtEtb(cents: number) {
  return `ETB ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNum(n: number) { return new Intl.NumberFormat('en-US').format(n); }
function fmtPct(r: number) { return `${(r * 100).toFixed(1)}%`; }

// ─── types ───────────────────────────────────────────────────────────────────

interface MerchantData {
  total_orders: number;
  delivered: number;
  cancelled: number;
  refunded: number;
  active: number;
  completion_rate: number;
  gmv_cents: number;
  commission_cents: number;
  avg_order_value_cents: number;
  active_merchants: number;
  unique_customers: number;
  by_status: Array<{ status: string; count: number }>;
  by_day: Array<{ date: string; total: number; delivered: number; gmv_cents: number; commission_cents: number }>;
  top_merchants: Array<{
    merchant_id: string; business_name: string; region_code: string | null;
    order_count: number; gmv_cents: number; commission_cents: number;
  }>;
  settlements: {
    total: number; paid: number; pending: number; failed: number;
    total_payout_cents: number; total_commission_cents: number;
  };
  catalog: { total_products: number; available_products: number; merchants_with_products: number };
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

const STATUS_COLORS: Record<string, string> = {
  delivered: '#10b981',
  confirmed: '#6366f1',
  preparing: '#f59e0b',
  ready_for_pickup: '#0ea5e9',
  assigned_to_driver: '#8b5cf6',
  picked_up: '#3b82f6',
  pending: '#94a3b8',
  cancelled: '#ef4444',
  refunded: '#f97316',
};

const SETTLEMENT_COLORS = ['#10b981', '#94a3b8', '#ef4444'];

// ─── main ────────────────────────────────────────────────────────────────────

export function MerchantPage(): JSX.Element {
  const [from, setFrom] = useState(iso30DaysAgo());
  const [to, setTo] = useState(isoToday());
  const regionCode = useRegionScope((s) => s.regionCode);
  const qs = `?from=${from}&to=${to}${regionCode ? `&region=${regionCode}` : ''}`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics-merchant', from, to, regionCode],
    queryFn: () => api<MerchantData>(`/v1/admin/analytics/merchant${qs}`),
    staleTime: 2 * 60_000,
    retry: 1,
  });

  if (isError) return <QueryError onRetry={() => refetch()} />;

  const byDay = (data?.by_day ?? []).map((r) => ({
    date: r.date.slice(5),
    total: r.total,
    delivered: r.delivered,
    gmv: r.gmv_cents / 100,
    commission: r.commission_cents / 100,
  }));

  const byStatus = data?.by_status ?? [];
  const topMerchants = data?.top_merchants ?? [];
  const set = data?.settlements;
  const settlementPie = set
    ? [
        { name: 'Paid', value: set.paid },
        { name: 'Pending', value: set.pending },
        { name: 'Failed', value: set.failed },
      ].filter((s) => s.value > 0)
    : [];

  return (
    <div>
      <PageHeader title="Merchant Analytics" subtitle="B2B marketplace orders, GMV, settlements, and catalog health" />

      <div className="mb-6">
        <DateRangeFilter
          from={from} to={to}
          onChange={(f, t) => { setFrom(f || iso30DaysAgo()); setTo(t || isoToday()); }}
        />
      </div>

      {/* ── Overview KPIs ── */}
      <SectionTitle>Overview</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total orders" value={fmtNum(data?.total_orders ?? 0)} loading={isLoading} />
        <KpiCard label="Delivered" value={fmtNum(data?.delivered ?? 0)} loading={isLoading}
          sub={data ? fmtPct(data.completion_rate) + ' completion' : undefined} />
        <KpiCard label="GMV (ETB)" value={fmtEtb(data?.gmv_cents ?? 0)} loading={isLoading} sub="gross merchandise value" />
        <KpiCard label="Platform commission" value={fmtEtb(data?.commission_cents ?? 0)} loading={isLoading} />
        <KpiCard label="Avg order value" value={fmtEtb(data?.avg_order_value_cents ?? 0)} loading={isLoading} />
        <KpiCard label="Active merchants" value={fmtNum(data?.active_merchants ?? 0)} loading={isLoading} />
        <KpiCard label="Unique customers" value={fmtNum(data?.unique_customers ?? 0)} loading={isLoading} />
        <KpiCard label="Cancelled / refunded" value={fmtNum((data?.cancelled ?? 0) + (data?.refunded ?? 0))} loading={isLoading} />
      </div>

      {/* ── Daily order volume + delivered ── */}
      {byDay.length > 0 && (
        <>
          <SectionTitle>Orders Over Time</SectionTitle>
          <div className="bg-surface border border-border rounded-xl p-5">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="total" stroke="#94a3b8" strokeWidth={2} dot={false} name="Total" />
                <Line type="monotone" dataKey="delivered" stroke="#10b981" strokeWidth={2} dot={false} name="Delivered" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ── GMV & Commission trend ── */}
      {byDay.length > 0 && (
        <>
          <SectionTitle>GMV &amp; Commission Trend (ETB)</SectionTitle>
          <div className="bg-surface border border-border rounded-xl p-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}`} />
                <Tooltip formatter={(v: number) => [fmtEtb(v * 100), '']} />
                <Legend />
                <Bar dataKey="gmv" fill="#6366f1" name="GMV" radius={[3, 3, 0, 0]} stackId="a" />
                <Bar dataKey="commission" fill="#10b981" name="Commission" radius={[3, 3, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ── Status breakdown + settlements ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">

        {byStatus.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="text-sm font-semibold mb-3">Orders by Status</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byStatus} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="status" type="category" tick={{ fontSize: 11 }} width={110} />
                <Tooltip />
                <Bar dataKey="count" name="Orders" radius={[0, 3, 3, 0]}>
                  {byStatus.map((s) => (
                    <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {settlementPie.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="text-sm font-semibold mb-1">Settlement Status</div>
            <div className="text-xs text-muted mb-3">
              {fmtNum(set?.total ?? 0)} total · {fmtEtb(set?.total_payout_cents ?? 0)} paid out
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={settlementPie} dataKey="value" nameKey="name"
                  innerRadius={45} outerRadius={70} paddingAngle={3}>
                  {settlementPie.map((_, i) => (
                    <Cell key={i} fill={SETTLEMENT_COLORS[i % SETTLEMENT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-center">
              <div>
                <div className="font-bold text-emerald-600">{fmtNum(set?.paid ?? 0)}</div>
                <div className="text-muted">Paid</div>
              </div>
              <div>
                <div className="font-bold text-slate-500">{fmtNum(set?.pending ?? 0)}</div>
                <div className="text-muted">Pending</div>
              </div>
              <div>
                <div className="font-bold text-red-500">{fmtNum(set?.failed ?? 0)}</div>
                <div className="text-muted">Failed</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Catalog health ── */}
      {data?.catalog && (
        <>
          <SectionTitle>Catalog Health</SectionTitle>
          <div className="grid grid-cols-3 gap-4">
            <KpiCard label="Total products" value={fmtNum(data.catalog.total_products)} />
            <KpiCard label="Available products" value={fmtNum(data.catalog.available_products)}
              sub={data.catalog.total_products
                ? fmtPct(data.catalog.available_products / data.catalog.total_products) + ' of total'
                : undefined} />
            <KpiCard label="Merchants with products" value={fmtNum(data.catalog.merchants_with_products)} />
          </div>
        </>
      )}

      {/* ── Top merchants table ── */}
      {topMerchants.length > 0 && (
        <>
          <SectionTitle>Top Merchants by GMV</SectionTitle>
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted">Merchant</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Orders</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">GMV (ETB)</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Commission (ETB)</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted">Region</th>
                </tr>
              </thead>
              <tbody>
                {topMerchants.map((m, i) => (
                  <tr key={m.merchant_id} className={i % 2 === 0 ? '' : 'bg-bg/40'}>
                    <td className="px-4 py-3 font-medium">{m.business_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNum(m.order_count)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtEtb(m.gmv_cents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtEtb(m.commission_cents)}</td>
                    <td className="px-4 py-3 text-right text-muted">{m.region_code ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!isLoading && !data?.total_orders && (
        <div className="text-center text-muted py-20">
          <div className="text-4xl mb-3">🏪</div>
          <div className="text-sm">No merchant orders in the selected range.</div>
        </div>
      )}
    </div>
  );
}
