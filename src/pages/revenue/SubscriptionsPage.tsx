import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { api } from '../../api/client.js';
import { useRegionScope } from '../../stores/region-scope.store.js';
import { PageHeader } from '../../components/PageHeader.js';

interface LedgerEntry {
  id: string;
  user_id: string;
  entry_type: string;
  direction: 'credit' | 'debit';
  amount_cents: number;
  service_type: string;
  reference_id: string | null;
  created_at: string;
}

interface LedgerPage {
  items?: LedgerEntry[];
  data?: LedgerEntry[];
  total?: number;
}

interface RevenueSummary {
  total_cents?: number;
  by_service?: Array<{ service_type: string; revenue_cents: number; currency?: string }>;
  by_day?: Array<{ date: string; revenue_cents: number }>;
}

function fmtUsd(c: number) { return `$${(c / 100).toFixed(2)}`; }
function iso30DaysAgo() { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); }
function iso6MonthsAgo() { const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10); }
function isoToday() { return new Date().toISOString().slice(0, 10); }

const STATIC_PLANS = [
  { name: 'Basic',  price: 9.99,  driver_fee_pct: 12, rider_discount_pct: 0,  features: ['Priority matching', 'Lower fees (12%)'] },
  { name: 'Pro',    price: 24.99, driver_fee_pct: 8,  rider_discount_pct: 5,  features: ['Priority matching', 'Lowest fees (8%)', 'Free cancellations', 'Dedicated support'] },
  { name: 'Elite',  price: 49.99, driver_fee_pct: 0,  rider_discount_pct: 10, features: ['VIP matching', 'Zero fees', 'Free cancellations', 'Priority support', 'Luxury vehicles'] },
];

export function SubscriptionsPage(): JSX.Element {
  const regionCode = useRegionScope((s) => s.regionCode);
  const revAmp = regionCode ? `&region=${regionCode}` : '';

  const { data: rev30d, isLoading: revLoading } = useQuery({
    queryKey: ['sub-rev-30d', regionCode],
    queryFn: () => api<RevenueSummary>(`/v1/analytics/revenue?from=${iso30DaysAgo()}&to=${isoToday()}${revAmp}`),
    staleTime: 5 * 60_000,
  });

  const { data: rev6m } = useQuery({
    queryKey: ['sub-rev-6m', regionCode],
    queryFn: () => api<RevenueSummary>(`/v1/analytics/revenue?from=${iso6MonthsAgo()}&to=${isoToday()}${revAmp}`),
    staleTime: 10 * 60_000,
  });

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['sub-ledger', regionCode],
    queryFn: () => api<LedgerPage | LedgerEntry[]>(
      `/v1/admin/wallet/ledger?service_type=subscription&limit=50&sort=desc`,
    ),
    staleTime: 2 * 60_000,
  });

  const entries: LedgerEntry[] = Array.isArray(ledgerData)
    ? ledgerData
    : ((ledgerData as LedgerPage)?.items ?? (ledgerData as LedgerPage)?.data ?? []);

  const subRevenue = (rev30d?.by_service ?? []).find((s) => s.service_type === 'subscription');
  const totalSubRev30d = subRevenue?.revenue_cents ?? 0;
  const totalAllRev30d = rev30d?.total_cents ?? 0;

  const monthlyData = (() => {
    const byMonth: Record<string, number> = {};
    (rev6m?.by_day ?? []).forEach(({ date, revenue_cents }) => {
      const m = date.slice(0, 7);
      byMonth[m] = (byMonth[m] ?? 0) + revenue_cents;
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, cents]) => ({ month: m.slice(5), revenue: cents }));
  })();

  const txCredits = entries.filter((e) => e.direction === 'credit');
  const txTotal = txCredits.reduce((s, e) => s + e.amount_cents, 0);

  return (
    <>
      <PageHeader
        title="Subscription Revenue"
        subtitle="Subscription ledger transactions and revenue metrics."
      />

      <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-4 mb-6 text-sm">
        <strong>Note:</strong> Subscription plan definitions are static configuration. A subscription management backend (create/edit/activate plans, enrol subscribers) is not yet implemented. Revenue and transaction data below are from the live wallet ledger.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Sub revenue 30d"      value={revLoading ? '…' : fmtUsd(totalSubRev30d)} sub="from wallet ledger" />
        <KpiCard label="Platform revenue 30d" value={revLoading ? '…' : fmtUsd(totalAllRev30d)} sub="all service types" />
        <KpiCard label="Sub transactions"     value={ledgerLoading ? '…' : String(entries.length)} sub="last 50 records" />
        <KpiCard label="Credited total"       value={ledgerLoading ? '…' : fmtUsd(txTotal)} sub="from loaded transactions" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-border rounded-lg p-5">
          <div className="text-sm font-semibold mb-1">All-service revenue — last 6 months</div>
          <div className="text-xs text-muted mb-4">USD · rides + marketplace</div>
          {monthlyData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-xs text-muted">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 100_000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [`$${(v / 100).toLocaleString()}`, 'Revenue']} />
                <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white border border-border rounded-lg p-5">
          <div className="text-sm font-semibold mb-1">Recent subscription transactions</div>
          <div className="text-xs text-muted mb-3">Live from wallet ledger · service_type = subscription</div>
          {ledgerLoading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => <div key={i} className="h-8 bg-surface animate-pulse rounded" />)}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-xs text-muted">No subscription transactions found</div>
          ) : (
            <div className="overflow-auto max-h-60 space-y-0.5">
              {entries.slice(0, 25).map((e) => (
                <div key={e.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40">
                  <div className="text-muted w-24 shrink-0">{new Date(e.created_at).toLocaleDateString()}</div>
                  <div className="text-ink capitalize flex-1 px-2">{e.entry_type.replace(/_/g, ' ')}</div>
                  <div className={`font-medium tabular-nums ${e.direction === 'credit' ? 'text-success' : 'text-danger'}`}>
                    {e.direction === 'credit' ? '+' : '−'}{fmtUsd(e.amount_cents)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-2 text-sm font-semibold">Subscription plan tiers</div>
      <div className="text-xs text-muted mb-4">Static configuration — displayed for reference only. Implement a subscriptions service to make these editable.</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STATIC_PLANS.map((plan) => (
          <div key={plan.name} className="bg-white border border-border rounded-lg p-5">
            <div className="text-base font-semibold">{plan.name}</div>
            <div className="text-2xl font-bold mt-1">
              ${plan.price.toFixed(2)}<span className="text-sm font-normal text-muted">/mo</span>
            </div>
            <ul className="text-xs text-muted space-y-1 mt-3 mb-4">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-1.5">
                  <span className="text-green-600">✓</span> {f}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 text-xs">
              <div className="bg-surface rounded px-2 py-1">
                <span className="text-muted">Driver fee:</span> <span className="font-medium">{plan.driver_fee_pct}%</span>
              </div>
              {plan.rider_discount_pct > 0 && (
                <div className="bg-surface rounded px-2 py-1">
                  <span className="text-muted">Rider discount:</span> <span className="font-medium">{plan.rider_discount_pct}%</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className="text-2xl font-bold text-ink">{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
