import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { exportToCsv } from '../../lib/export';

interface LedgerEntry {
  id: string;
  user_id: string;
  entry_type: string;
  direction: 'credit' | 'debit';
  amount_cents: number;
  service_type: string | null;
  reference_id: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface LedgerResponse {
  items: LedgerEntry[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

interface SummaryRow {
  service_type: string | null;
  direction: string;
  count: number;
  total_cents: number;
}

interface SummaryResponse {
  rows: SummaryRow[];
  totalCredit: number;
  totalDebit: number;
  net: number;
}

// ─── labels / colours ────────────────────────────────────────────────────────

const SERVICE_LABELS: Record<string, string> = {
  ride_sharing:     'Ride Sharing',
  food_delivery:    'Food Delivery',
  grocery_delivery: 'Grocery',
  package_delivery: 'Package',
  courier:          'Courier',
  marketplace:      'Marketplace',
  wallet:           'Wallet',
  subscription:     'Subscription',
  promotion:        'Promotion',
};

const SERVICE_COLORS: Record<string, string> = {
  ride_sharing:     'bg-blue-100 text-blue-700',
  food_delivery:    'bg-orange-100 text-orange-700',
  grocery_delivery: 'bg-green-100 text-green-700',
  package_delivery: 'bg-purple-100 text-purple-700',
  courier:          'bg-yellow-100 text-yellow-800',
  marketplace:      'bg-pink-100 text-pink-700',
  wallet:           'bg-gray-100 text-gray-700',
  subscription:     'bg-cyan-100 text-cyan-700',
  promotion:        'bg-rose-100 text-rose-700',
};

const SERVICE_ICONS: Record<string, string> = {
  ride_sharing:     '🚗',
  food_delivery:    '🍔',
  grocery_delivery: '🛒',
  package_delivery: '📦',
  courier:          '⚡',
  marketplace:      '🏪',
  subscription:     '♻️',
  promotion:        '🎁',
};

function svcLabel(s: string | null) { return s ? (SERVICE_LABELS[s] ?? s) : '—'; }
function svcColor(s: string | null) { return s ? (SERVICE_COLORS[s] ?? 'bg-gray-100 text-gray-600') : 'bg-gray-100 text-gray-400'; }
function svcIcon(s: string | null)  { return s ? (SERVICE_ICONS[s]  ?? '💳') : '💳'; }

function fmtCents(c: number) {
  return '$' + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(num: number, denom: number) {
  if (denom === 0) return '—';
  return (num / denom * 100).toFixed(1) + '%';
}

function entryRole(entryType: string): 'Rider' | 'Driver' | 'System' {
  if (['ride_fare', 'delivery_fare'].includes(entryType)) return 'Rider';
  if (['ride_earnings', 'delivery_earnings', 'tip', 'earning'].includes(entryType)) return 'Driver';
  return 'System';
}

// ─── filter constants ─────────────────────────────────────────────────────────

const SERVICE_TYPES = [
  '', 'ride_sharing', 'food_delivery', 'grocery_delivery',
  'package_delivery', 'courier', 'marketplace', 'subscription', 'promotion',
];
const PAGE_SIZE = 50;

// ─── main component ───────────────────────────────────────────────────────────

export function WalletPage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<'all' | 'debit' | 'credit'>('all');
  const [serviceType, setServiceType] = useState('');
  const [userId, setUserId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const direction = activeTab === 'all' ? '' : activeTab;

  const params = useMemo(() => {
    const p: Record<string, string> = { page: String(page), limit: String(PAGE_SIZE) };
    if (direction)        p.direction    = direction;
    if (serviceType)      p.service_type = serviceType;
    if (userId.trim())    p.userId       = userId.trim();
    if (dateFrom)         p.dateFrom     = dateFrom;
    if (dateTo)           p.dateTo       = dateTo;
    return new URLSearchParams(p).toString();
  }, [direction, serviceType, userId, dateFrom, dateTo, page]);

  const summaryParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo)   p.dateTo   = dateTo;
    return new URLSearchParams(p).toString();
  }, [dateFrom, dateTo]);

  const { data, isLoading } = useQuery<LedgerResponse>({
    queryKey: ['wallet-ledger', params],
    queryFn: () => api(`/v1/admin/wallet/ledger?${params}`),
  });

  const { data: summary } = useQuery<SummaryResponse>({
    queryKey: ['wallet-ledger-summary', summaryParams],
    queryFn: () => api(`/v1/admin/wallet/ledger/summary?${summaryParams}`),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  // Derived platform financials
  const grossBookings    = summary?.totalDebit  ?? 0;
  const totalPayouts     = summary?.totalCredit ?? 0;
  const platformRevenue  = grossBookings - totalPayouts;
  const takeRate         = pct(platformRevenue, grossBookings);

  // Per-service breakdown: {service → {credit, debit, trips}}
  const serviceBreakdown = useMemo(() => {
    if (!summary) return {};
    const map: Record<string, { credit: number; debit: number; trips: number }> = {};
    for (const row of summary.rows) {
      const key = row.service_type ?? 'unknown';
      if (!map[key]) map[key] = { credit: 0, debit: 0, trips: 0 };
      const cents = Number(row.total_cents);
      if (row.direction === 'credit') { map[key].credit += cents; }
      else                            { map[key].debit  += cents; map[key].trips += Number(row.count); }
    }
    return map;
  }, [summary]);

  function handleExport() {
    exportToCsv(`earnings-ledger-${new Date().toISOString().slice(0, 10)}`, items, [
      { header: 'Date',         getValue: (e) => e.created_at.slice(0, 10) },
      { header: 'User ID',      getValue: (e) => e.user_id },
      { header: 'Role',         getValue: (e) => entryRole(e.entry_type) },
      { header: 'Direction',    getValue: (e) => e.direction },
      { header: 'Entry Type',   getValue: (e) => e.entry_type },
      { header: 'Service',      getValue: (e) => e.service_type ?? '' },
      { header: 'Amount ($)',   getValue: (e) => (e.amount_cents / 100).toFixed(2) },
      { header: 'Reference',    getValue: (e) => e.reference_id ?? '' },
    ]);
  }

  return (
    <>
      <div className="flex items-start justify-between mb-5">
        <PageHeader
          title="Earnings Hub"
          subtitle="Unified ledger for rider payments and driver/courier earnings across all services."
        />
        <button
          onClick={handleExport}
          className="px-3 py-1.5 text-xs border border-border rounded hover:bg-surface self-start mt-1"
        >
          ↓ Export CSV
        </button>
      </div>

      {/* Platform-level KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Gross Bookings"
          value={fmtCents(grossBookings)}
          sub="total rider payments"
          color="text-ink"
        />
        <KpiCard
          label="Driver / Courier Payouts"
          value={fmtCents(totalPayouts)}
          sub="earnings credited"
          color="text-blue-700"
        />
        <KpiCard
          label="Platform Revenue"
          value={fmtCents(platformRevenue)}
          sub="after driver payouts"
          color={platformRevenue >= 0 ? 'text-green-700' : 'text-red-600'}
        />
        <KpiCard
          label="Platform Take Rate"
          value={takeRate}
          sub="commission on gross"
          color="text-purple-700"
        />
      </div>

      {/* Per-service breakdown */}
      {Object.keys(serviceBreakdown).length > 0 && (
        <div className="bg-white border border-border rounded overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold">Revenue by Service</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted text-xs">
              <tr>
                <th className="text-left px-4 py-2">Service</th>
                <th className="text-right px-4 py-2">Gross Bookings</th>
                <th className="text-right px-4 py-2">Driver Payouts</th>
                <th className="text-right px-4 py-2">Platform Revenue</th>
                <th className="text-right px-4 py-2">Take Rate</th>
                <th className="text-right px-4 py-2">Trips / Orders</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(serviceBreakdown)
                .sort((a, b) => b[1].debit - a[1].debit)
                .map(([svc, { credit, debit, trips }]) => {
                  const rev  = debit - credit;
                  const rate = pct(rev, debit);
                  return (
                    <tr key={svc} className="border-t border-border hover:bg-surface/40">
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${svcColor(svc)}`}>
                          {svcIcon(svc)} {svcLabel(svc)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm">{fmtCents(debit)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm text-blue-700">{fmtCents(credit)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono text-sm font-semibold ${rev >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {fmtCents(rev)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm text-muted">{rate}</td>
                      <td className="px-4 py-2.5 text-right text-sm text-muted">{trips}</td>
                    </tr>
                  );
                })}
              {/* Totals row */}
              <tr className="border-t-2 border-border bg-surface font-semibold text-sm">
                <td className="px-4 py-2.5 text-muted text-xs uppercase tracking-wide">Total</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmtCents(grossBookings)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-blue-700">{fmtCents(totalPayouts)}</td>
                <td className={`px-4 py-2.5 text-right font-mono ${platformRevenue >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {fmtCents(platformRevenue)}
                </td>
                <td className="px-4 py-2.5 text-right text-muted">{takeRate}</td>
                <td className="px-4 py-2.5 text-right text-muted">
                  {Object.values(serviceBreakdown).reduce((s, r) => s + r.trips, 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Transaction feed */}
      <div className="mb-3">
        <div className="flex items-center gap-3 mb-3">
          {/* Tabs */}
          <div className="flex bg-surface border border-border rounded-lg p-0.5 gap-0.5">
            {([
              { id: 'all',    label: 'All Transactions' },
              { id: 'debit',  label: '↓ Rider Payments'  },
              { id: 'credit', label: '↑ Driver Earnings'  },
            ] as const).map((t) => (
              <button
                key={t.id}
                onClick={() => { setActiveTab(t.id); setPage(1); }}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  activeTab === t.id
                    ? t.id === 'credit' ? 'bg-green-600 text-white'
                    : t.id === 'debit'  ? 'bg-red-500 text-white'
                    : 'bg-ink text-white'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Service filter */}
          <select
            value={serviceType}
            onChange={(e) => { setServiceType(e.target.value); setPage(1); }}
            className="px-2.5 py-1.5 text-xs bg-white border border-border rounded"
          >
            {SERVICE_TYPES.map((s) => (
              <option key={s || 'all'} value={s}>{s ? `${svcIcon(s)} ${svcLabel(s)}` : 'All services'}</option>
            ))}
          </select>

          {/* User ID search */}
          <input
            value={userId}
            onChange={(e) => { setUserId(e.target.value); setPage(1); }}
            placeholder="Filter by User ID…"
            className="min-w-[180px] px-3 py-1.5 bg-white border border-border rounded text-xs"
          />

          <DateRangeFilter
            from={dateFrom}
            to={dateTo}
            onChange={(f, t) => { setDateFrom(f); setDateTo(t); setPage(1); }}
          />

          <span className="ml-auto text-xs text-muted">{total.toLocaleString()} entries</span>
        </div>

        <div className="bg-white border border-border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted text-xs select-none">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">User ID</th>
                <th className="text-left px-3 py-2">Role</th>
                <th className="text-left px-3 py-2">Service</th>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="text-left px-3 py-2">Reference</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-t border-border">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-3 py-2">
                          <div className="h-3 bg-surface animate-pulse rounded w-3/4" />
                        </td>
                      ))}
                    </tr>
                  ))
                : items.length === 0
                ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-muted">
                      No transactions match the selected filters.
                    </td>
                  </tr>
                )
                : items.map((e) => {
                    const role = entryRole(e.entry_type);
                    return (
                      <tr key={e.id} className="border-t border-border hover:bg-surface/40">
                        <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                          {new Date(e.created_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted" title={e.user_id}>
                          {e.user_id.slice(0, 8)}…
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            role === 'Rider'  ? 'bg-sky-100 text-sky-700' :
                            role === 'Driver' ? 'bg-indigo-100 text-indigo-700' :
                                               'bg-gray-100 text-gray-500'
                          }`}>
                            {role}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${svcColor(e.service_type)}`}>
                            {svcIcon(e.service_type)} {svcLabel(e.service_type)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted capitalize">
                          {e.entry_type.replace(/_/g, ' ')}
                        </td>
                        <td className={`px-3 py-2 text-sm text-right font-semibold tabular-nums ${
                          e.direction === 'credit' ? 'text-green-700' : 'text-red-600'
                        }`}>
                          {e.direction === 'credit' ? '+' : '−'}{fmtCents(e.amount_cents)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted">
                          {e.reference_id ? e.reference_id.slice(0, 8) + '…' : '—'}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
    </>
  );
}

function KpiCard({
  label, value, sub, color,
}: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-white border border-border rounded p-4">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-muted mt-0.5">{sub}</div>
    </div>
  );
}
