import { useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useRegionScope } from '../../stores/region-scope.store.js';
import { PageHeader } from '../../components/PageHeader.js';
import { useToast } from '../../components/Toast.js';

interface PricingRule {
  id: string;
  vehicle_category: string;
  service_fee_pct: number | string;
  minimum_fare_cents: number;
  cancellation_fee_cents: number;
  base_fare_cents?: number;
  per_km_cents?: number;
  per_minute_cents?: number;
  surge_multiplier_cap?: number;
}

interface RevenueService { service_type: string; revenue_cents: number; currency?: string; }
interface RevenueSummary {
  total_cents: number;
  commission_cents?: number;
  payout_cents?: number;
  by_service?: RevenueService[];
  by_day?: Array<{ date: string; revenue_cents: number }>;
}

const COLORS = ['#6366f1', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#3b82f6', '#f97316', '#14b8a6'];

function fmtCents(c: number) { return `$${(c / 100).toFixed(2)}`; }

function iso30DaysAgo() {
  const d = new Date(); d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function isoToday() { return new Date().toISOString().slice(0, 10); }
function iso6MonthsAgo() {
  const d = new Date(); d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}

export function CommissionPage(): JSX.Element {
  const { toast } = useToast();
  const qc = useQueryClient();
  const regionCode = useRegionScope((s) => s.regionCode);
  const r = regionCode ? `?region=${regionCode}` : '';
  const amp = regionCode ? `&region=${regionCode}` : '';

  // ── Pricing rules (actual DB data) ────────────────────────────────────────
  const { data: pricingData, isLoading: rulesLoading } = useQuery({
    queryKey: ['commission-pricing', regionCode],
    queryFn: () => {
      const url = regionCode ? `/v1/admin/pricing?region=${regionCode}` : '/v1/admin/pricing';
      return api<{ items: PricingRule[] } | PricingRule[]>(url).then(
        (r) => (Array.isArray(r) ? r : (r.items ?? [])),
      );
    },
  });
  const rules: PricingRule[] = Array.isArray(pricingData) ? pricingData : (pricingData ?? []);

  // ── Local editable rates, initialised from API ─────────────────────────────
  const [rateEdits, setRateEdits] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (rules.length > 0) {
      const init: Record<string, string> = {};
      rules.forEach((r) => { init[r.id] = String(Number(r.service_fee_pct).toFixed(2)); });
      setRateEdits(init);
      setDirty(false);
    }
  }, [rules.map((r) => r.id).join(',')]);

  // ── Revenue analytics ──────────────────────────────────────────────────────
  const { data: revenue30d } = useQuery({
    queryKey: ['commission-revenue-30d', regionCode],
    queryFn: () => api<RevenueSummary>(`/v1/admin/analytics/revenue?from=${iso30DaysAgo()}&to=${isoToday()}${amp ? amp.replace('?', '&') : ''}`),
    staleTime: 5 * 60_000,
  });

  const { data: revenue6m } = useQuery({
    queryKey: ['commission-revenue-6m', regionCode],
    queryFn: () => api<RevenueSummary>(`/v1/admin/analytics/revenue?from=${iso6MonthsAgo()}&to=${isoToday()}${amp ? amp.replace('?', '&') : ''}`),
    staleTime: 10 * 60_000,
  });

  // ── Save mutation ──────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const changed = rules.filter((rule) => {
        const edited = parseFloat(rateEdits[rule.id] ?? '');
        return !Number.isNaN(edited) && edited !== Number(rule.service_fee_pct);
      });
      await Promise.all(
        changed.map((rule) =>
          api(`/v1/admin/pricing/${rule.id}`, {
            method: 'PATCH',
            body: { service_fee_pct: parseFloat(rateEdits[rule.id]) },
          }),
        ),
      );
      return changed.length;
    },
    onSuccess: (count) => {
      toast(`${count} rule${count !== 1 ? 's' : ''} updated successfully.`, 'success');
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['commission-pricing'] });
    },
    onError: () => toast('Failed to save. Please try again.', 'error'),
  });

  const handleRateChange = (ruleId: string, value: string) => {
    setRateEdits((prev) => ({ ...prev, [ruleId]: value }));
    setDirty(true);
  };

  // ── Revenue breakdown (real data) ─────────────────────────────────────────
  const byService = (revenue30d?.by_service ?? [])
    .filter((s) => s.revenue_cents > 0)
    .map((s, i) => ({ name: s.service_type.replace(/_/g, ' '), value: s.revenue_cents, color: COLORS[i % COLORS.length] }));

  // ── Monthly trend (aggregate by_day into months) ──────────────────────────
  const monthlyTrend = (() => {
    const byMonth: Record<string, number> = {};
    (revenue6m?.by_day ?? []).forEach(({ date, revenue_cents }) => {
      const m = date.slice(0, 7);
      byMonth[m] = (byMonth[m] ?? 0) + revenue_cents;
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, cents]) => ({ month: m.slice(5), revenue: cents }));
  })();

  const firstRule = rules[0];
  const baseCommission = firstRule ? Number(firstRule.service_fee_pct) : null;
  const minFare = firstRule?.minimum_fare_cents ?? null;
  const cancellationFee = firstRule?.cancellation_fee_cents ?? null;
  const surgeCap = firstRule?.surge_multiplier_cap ?? null;

  return (
    <>
      <PageHeader
        title="Commission & Fees"
        subtitle="Platform commission rates and per-category fee configuration."
      />

      {/* Current rates summary */}
      {rulesLoading ? (
        <div className="bg-white border border-border rounded-lg p-5 mb-6 animate-pulse h-24" />
      ) : rules.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4 mb-6 text-sm">
          No pricing rules configured for {regionCode ? `region ${regionCode}` : 'any region'}.
          Create rules on the <a href="/pricing" className="underline">Pricing page</a>.
        </div>
      ) : (
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <div className="text-sm font-semibold mb-4">Current rates — global defaults (first rule)</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted mb-1">Base commission</div>
              <div className="text-xl font-bold">{baseCommission != null ? `${baseCommission.toFixed(1)}%` : '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted mb-1">Surge multiplier cap</div>
              <div className="text-xl font-bold">{surgeCap != null ? `${surgeCap}x` : '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted mb-1">Minimum fare</div>
              <div className="text-xl font-bold">{minFare != null ? fmtCents(minFare) : '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted mb-1">Cancellation fee</div>
              <div className="text-xl font-bold">{cancellationFee != null ? fmtCents(cancellationFee) : '—'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Per-category rate editor */}
      {rules.length > 0 && (
        <div className="bg-white border border-border rounded-lg overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div className="text-sm font-semibold">Per-category commission rates</div>
            <div className="flex items-center gap-2">
              {dirty && <span className="text-xs text-orange-600">Unsaved changes</span>}
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !dirty}
                className="px-4 py-1.5 bg-accent text-white rounded text-sm disabled:opacity-40"
              >
                {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted text-xs">
              <tr>
                <th className="text-left px-4 py-2">Vehicle category</th>
                <th className="text-left px-4 py-2">Commission rate (%)</th>
                <th className="text-left px-4 py-2">Min fare</th>
                <th className="text-left px-4 py-2">Cancel fee</th>
                <th className="text-left px-4 py-2">Base fare</th>
                <th className="text-left px-4 py-2">Per km</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const editedVal = rateEdits[rule.id] ?? String(Number(rule.service_fee_pct).toFixed(2));
                const original = Number(rule.service_fee_pct).toFixed(2);
                const changed = editedVal !== original;
                return (
                  <tr key={rule.id} className={`border-t border-border ${changed ? 'bg-yellow-50' : 'hover:bg-surface'}`}>
                    <td className="px-4 py-2 text-xs capitalize font-medium">{rule.vehicle_category}</td>
                    <td className="px-4 py-2 text-xs">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        value={editedVal}
                        onChange={(e) => handleRateChange(rule.id, e.target.value)}
                        className="w-24 px-2 py-1 bg-white text-ink border border-border rounded text-xs"
                      />
                    </td>
                    <td className="px-4 py-2 text-xs text-muted">{rule.minimum_fare_cents != null ? fmtCents(rule.minimum_fare_cents) : '—'}</td>
                    <td className="px-4 py-2 text-xs text-muted">{rule.cancellation_fee_cents != null ? fmtCents(rule.cancellation_fee_cents) : '—'}</td>
                    <td className="px-4 py-2 text-xs text-muted">{rule.base_fare_cents != null ? fmtCents(rule.base_fare_cents) : '—'}</td>
                    <td className="px-4 py-2 text-xs text-muted">{rule.per_km_cents != null ? fmtCents(rule.per_km_cents) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Revenue breakdown pie — real data */}
        <div className="bg-white border border-border rounded-lg p-5">
          <div className="text-sm font-semibold mb-1">Revenue by service — last 30 days</div>
          <div className="text-xs text-muted mb-4">From analytics service · ride revenue in USD</div>
          {byService.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-xs text-muted">No revenue data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={byService}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {byService.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`$${(v / 100).toFixed(2)}`, 'Revenue']} />
                <Legend iconType="circle" iconSize={10} formatter={(v) => <span className="text-xs">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Monthly revenue trend — real data */}
        <div className="bg-white border border-border rounded-lg p-5">
          <div className="text-sm font-semibold mb-1">Ride revenue trend — last 6 months</div>
          <div className="text-xs text-muted mb-4">USD · completed rides only</div>
          {monthlyTrend.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-xs text-muted">No trend data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthlyTrend} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 100_000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [`$${(v / 100).toLocaleString()}`, 'Revenue']} />
                <Line type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} dot={{ r: 4, fill: '#6366f1' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 30-day commission summary */}
      {revenue30d && (
        <div className="mt-4 bg-white border border-border rounded-lg p-5">
          <div className="text-sm font-semibold mb-3">Revenue split — last 30 days (USD · rides)</div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Gross revenue', val: revenue30d.total_cents },
              { label: 'Driver payouts', val: revenue30d.payout_cents ?? 0 },
              { label: 'Net commission', val: revenue30d.commission_cents ?? 0 },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-xs text-muted mb-1">{s.label}</div>
                <div className="text-xl font-bold">{fmtCents(s.val)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
