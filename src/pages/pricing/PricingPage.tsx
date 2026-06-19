import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useRegionScope } from '../../stores/region-scope.store';
import { PageHeader } from '../../components/PageHeader';
import { Table, type Column } from '../../components/Table';
import { useDebounced } from '../../hooks/useDebounced';
import { useSort } from '../../hooks/useSort';
import { exportToCsv } from '../../lib/export';

interface Promotion {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  max_uses: number | null;
  uses_count: number;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
  created_at: string;
}
const EMPTY_PROMO = { code: '', discountType: 'percentage' as const, discountValue: 10, maxUses: '', validFrom: '', validTo: '' };

interface PricingRule {
  id: string;
  city_code: string;
  vehicle_category: string;
  base_fare_cents: number;
  per_km_cents: number;
  per_minute_cents: number;
  minimum_fare_cents: number;
  cancellation_fee_cents: number;
  service_fee_pct: number | string;
  booking_fee_cents: number;
  region_name?: string;
  currency_code?: string;
  currency_symbol?: string;
}
interface SurgeZone {
  id: string;
  city_code: string;
  name: string;
  multiplier: number;
  demand: number;
  supply: number;
  is_active: boolean;
}
interface Region { code: string; name: string; currency_symbol: string }

function money(cents: number, symbol = '$'): string {
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

const EMPTY_RULE = {
  city: '', vehicleType: 'economy', baseFare: 0, perKm: 0, perMinute: 0, minimumFare: 0, cancellationFee: 0, serviceFeePct: 20, bookingFee: 150,
};

export function PricingPage(): JSX.Element {
  const qc = useQueryClient();
  const regionCode = useRegionScope((s) => s.regionCode);
  const promoFormRef = useRef<HTMLDivElement>(null);
  const rules = useQuery({ queryKey: ['pricing','rules'], queryFn: () => api<{ items: PricingRule[] }>('/v1/admin/pricing/rules') });
  const zones = useQuery({ queryKey: ['surge','zones'], queryFn: () => api<{ items: SurgeZone[] }>('/v1/admin/surge/zones') });
  const regions = useQuery({ queryKey: ['regions'], queryFn: () => api<{ items: Region[] }>('/v1/admin/regions') });
  const promos = useQuery({ queryKey: ['promotions'], queryFn: () => api<{ items: Promotion[] }>('/v1/admin/pricing/promotions') });

  const [showPromoForm, setShowPromoForm] = useState(false);
  const [promoForm, setPromoForm] = useState(EMPTY_PROMO);

  const createPromoMutation = useMutation({
    mutationFn: (data: typeof EMPTY_PROMO) => api('/v1/admin/pricing/promotions', {
      method: 'POST',
      body: {
        code: data.code.toUpperCase().trim(),
        discountType: data.discountType,
        discountValue: Number(data.discountValue),
        maxUses: data.maxUses ? Number(data.maxUses) : undefined,
        validFrom: data.validFrom || undefined,
        validTo: data.validTo || undefined,
      },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['promotions'] }); setShowPromoForm(false); setPromoForm(EMPTY_PROMO); },
  });

  const deletePromoMutation = useMutation({
    mutationFn: (id: string) => api(`/v1/admin/pricing/promotions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
  });

  const promoCols: Column<Promotion>[] = [
    { key: 'code', header: 'Code', render: (p) => <span className="font-mono font-bold text-accent">{p.code}</span> },
    {
      key: 'discount', header: 'Discount',
      render: (p) => p.discount_type === 'percentage'
        ? <span>{p.discount_value}%</span>
        : <span>${(p.discount_value / 100).toFixed(2)} off</span>,
    },
    {
      key: 'usage', header: 'Usage',
      render: (p) => <span>{p.uses_count}{p.max_uses != null ? ` / ${p.max_uses}` : ' / ∞'}</span>,
    },
    {
      key: 'validity', header: 'Validity',
      render: (p) => {
        const from = p.valid_from ? new Date(p.valid_from).toLocaleDateString() : '—';
        const to = p.valid_to ? new Date(p.valid_to).toLocaleDateString() : '∞';
        return <span className="text-muted text-xs">{from} → {to}</span>;
      },
    },
    {
      key: 'status', header: 'Status',
      render: (p) => {
        const now = new Date();
        const expired = p.valid_to && new Date(p.valid_to) < now;
        const exhausted = p.max_uses != null && p.uses_count >= p.max_uses;
        const label = !p.is_active ? 'Deactivated' : expired ? 'Expired' : exhausted ? 'Exhausted' : 'Active';
        const cls = label === 'Active' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger';
        return <span className={`px-2 py-0.5 rounded-full text-xs ${cls}`}>{label}</span>;
      },
    },
    {
      key: 'actions', header: '',
      render: (p) => (
        <button
          onClick={() => { if (confirm(`Deactivate code ${p.code}?`)) deletePromoMutation.mutate(p.id); }}
          className="text-xs text-danger hover:underline disabled:opacity-40"
          disabled={deletePromoMutation.isPending}
        >
          Deactivate
        </button>
      ),
    },
  ];

  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [ruleForm, setRuleForm] = useState<any>(EMPTY_RULE);

  const [ruleSearch, setRuleSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const debouncedRuleSearch = useDebounced(ruleSearch);

  const ruleGetVal = (r: PricingRule, key: string): any => {
    if (key === 'region') return r.region_name ?? r.city_code;
    if (key === 'cat') return r.vehicle_category;
    if (key === 'base') return r.base_fare_cents;
    if (key === 'km') return r.per_km_cents;
    if (key === 'min') return r.per_minute_cents;
    if (key === 'minimum') return r.minimum_fare_cents;
    if (key === 'commission') return Number(r.service_fee_pct);
    return '';
  };
  const zoneGetVal = (z: SurgeZone, key: string): any => {
    if (key === 'region') return z.city_code;
    if (key === 'name') return z.name;
    if (key === 'demand') return z.demand;
    if (key === 'supply') return z.supply;
    if (key === 'mult') return z.multiplier;
    return '';
  };

  const allRules = (rules.data?.items ?? []).filter(
    (r) => !regionCode || r.city_code === regionCode,
  );
  const allZones = (zones.data?.items ?? []).filter(
    (z) => !regionCode || z.city_code === regionCode,
  );

  const { sort: ruleSort, toggle: toggleRuleSort, sorted: sortedRules } = useSort(allRules, ruleGetVal, { key: 'region', dir: 'asc' });
  const { sort: zoneSort, toggle: toggleZoneSort, sorted: sortedZones } = useSort(allZones, zoneGetVal, { key: 'mult', dir: 'desc' });

  const filteredRules = useMemo(() => {
    const q = debouncedRuleSearch.toLowerCase();
    return sortedRules.filter((r) => {
      const matchQ = !q || r.city_code.toLowerCase().includes(q) || (r.region_name ?? '').toLowerCase().includes(q);
      const matchCat = !categoryFilter || r.vehicle_category === categoryFilter;
      return matchQ && matchCat;
    });
  }, [sortedRules, debouncedRuleSearch, categoryFilter]);

  const createRule = useMutation({
    mutationFn: (body: any) => api('/v1/admin/pricing/rules', { method: 'POST', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pricing','rules'] }); setShowRuleForm(false); setRuleForm(EMPTY_RULE); },
  });
  const updateRule = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api(`/v1/admin/pricing/rules/${id}`, { method: 'PATCH', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pricing','rules'] }); setShowRuleForm(false); setEditingRule(null); setRuleForm(EMPTY_RULE); },
  });
  const deleteRule = useMutation({
    mutationFn: (id: string) => api(`/v1/admin/pricing/rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pricing','rules'] }),
  });

  const setSurge = useMutation({
    mutationFn: ({ zone, multiplier }: { zone: string; multiplier: number }) =>
      api('/v1/admin/surge/set', { method: 'POST', body: { zone, multiplier } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surge','zones'] }),
  });
  const disableSurge = useMutation({
    mutationFn: (zone: string) => api('/v1/admin/surge/disable', { method: 'POST', body: { zone } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surge','zones'] }),
  });

  const startEdit = (r: PricingRule) => {
    setEditingRule(r);
    setRuleForm({
      city: r.city_code, vehicleType: r.vehicle_category,
      baseFare: r.base_fare_cents, perKm: r.per_km_cents,
      perMinute: r.per_minute_cents, minimumFare: r.minimum_fare_cents, cancellationFee: r.cancellation_fee_cents,
      serviceFeePct: Number(r.service_fee_pct), bookingFee: r.booking_fee_cents,
    });
    setShowRuleForm(true);
  };

  const submitRule = () => {
    if (editingRule) {
      updateRule.mutate({
        id: editingRule.id,
        body: {
          base_fare_cents: Number(ruleForm.baseFare),
          per_km_cents: Number(ruleForm.perKm),
          per_minute_cents: Number(ruleForm.perMinute),
          minimum_fare_cents: Number(ruleForm.minimumFare),
          cancellation_fee_cents: Number(ruleForm.cancellationFee),
          service_fee_pct: Number(ruleForm.serviceFeePct),
          booking_fee_cents: Number(ruleForm.bookingFee),
        },
      });
    } else {
      createRule.mutate(ruleForm);
    }
  };

  const ruleCols: Column<PricingRule>[] = [
    { key: 'region', header: 'Region', sortable: true, render: (r) => `${r.region_name ?? r.city_code} (${r.city_code})` },
    { key: 'cat', header: 'Category', sortable: true, render: (r) => r.vehicle_category },
    { key: 'base', header: 'Base', sortable: true, render: (r) => money(r.base_fare_cents, r.currency_symbol) },
    { key: 'km', header: 'Per km', sortable: true, render: (r) => money(r.per_km_cents, r.currency_symbol) },
    { key: 'min', header: 'Per min', sortable: true, render: (r) => money(r.per_minute_cents, r.currency_symbol) },
    { key: 'minimum', header: 'Min fare', sortable: true, render: (r) => money(r.minimum_fare_cents, r.currency_symbol) },
    { key: 'cancel', header: 'Cancel fee', render: (r) => money(r.cancellation_fee_cents, r.currency_symbol) },
    { key: 'commission', header: 'Commission %', sortable: true, render: (r) => `${Number(r.service_fee_pct).toFixed(1)}%` },
    { key: 'booking', header: 'Booking fee', render: (r) => money(r.booking_fee_cents, r.currency_symbol) },
    {
      key: 'actions', header: 'Actions',
      render: (r) => (
        <div className="flex gap-2">
          <button onClick={() => startEdit(r)} className="px-2 py-1 text-xs bg-accent text-white rounded">Edit</button>
          <button
            onClick={() => { if (confirm(`Delete ${r.city_code} ${r.vehicle_category} rule?`)) deleteRule.mutate(r.id); }}
            className="px-2 py-1 text-xs bg-danger text-white rounded"
          >Delete</button>
        </div>
      ),
    },
  ];

  const [surgeMultiplier, setSurgeMultiplier] = useState('');
  const [surgeTarget, setSurgeTarget] = useState<SurgeZone | null>(null);

  const zoneCols: Column<SurgeZone>[] = [
    { key: 'region', header: 'Region', sortable: true, render: (z) => z.city_code },
    { key: 'name', header: 'Zone', sortable: true, render: (z) => z.name },
    { key: 'demand', header: 'Demand', sortable: true, render: (z) => z.demand },
    { key: 'supply', header: 'Supply', sortable: true, render: (z) => z.supply },
    {
      key: 'mult', header: 'Multiplier', sortable: true,
      render: (z) => (
        <span className={z.multiplier > 1 ? 'font-medium text-danger' : ''}>{z.multiplier.toFixed(2)}x</span>
      ),
    },
    {
      key: 'actions', header: 'Actions',
      render: (z) => (
        <div className="flex gap-2">
          <button
            onClick={() => { setSurgeTarget(z); setSurgeMultiplier(z.multiplier.toFixed(2)); }}
            className="px-2 py-1 text-xs bg-accent text-white rounded"
          >Set</button>
          {z.multiplier > 1 && (
            <button onClick={() => disableSurge.mutate(z.id)} className="px-2 py-1 text-xs border border-border rounded">Reset</button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Pricing" subtitle="Per-region fare rules and live surge multipliers." />

      {surgeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl p-6 w-80 text-ink">
            <h3 className="font-medium mb-2">Set surge — {surgeTarget.name}</h3>
            <p className="text-sm text-muted mb-3">Current: {surgeTarget.multiplier.toFixed(2)}x. Enter a value between 1.0 and 3.0.</p>
            <input
              type="number" step="0.1" min="1" max="3"
              value={surgeMultiplier}
              onChange={(e) => setSurgeMultiplier(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSurgeTarget(null)} className="px-3 py-2 border border-border rounded text-sm">Cancel</button>
              <button
                onClick={() => {
                  const n = Number(surgeMultiplier);
                  if (Number.isFinite(n) && n >= 1 && n <= 3) {
                    setSurge.mutate({ zone: surgeTarget.id, multiplier: n });
                    setSurgeTarget(null);
                  }
                }}
                className="px-3 py-2 bg-accent text-white rounded text-sm"
              >Apply</button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-medium mr-2">Pricing rules</h2>
        <input
          value={ruleSearch}
          onChange={(e) => setRuleSearch(e.target.value)}
          placeholder="Search region…"
          className="px-3 py-1.5 border border-border rounded text-sm bg-white text-ink w-40"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-1.5 border border-border rounded text-sm bg-white text-ink"
        >
          <option value="">All categories</option>
          <option value="economy">Economy</option>
          <option value="comfort">Comfort</option>
          <option value="premium">Premium</option>
          <option value="xl">XL</option>
        </select>
        {(ruleSearch || categoryFilter) && (
          <button onClick={() => { setRuleSearch(''); setCategoryFilter(''); }} className="text-xs text-accent hover:underline">Clear</button>
        )}
        <span className="text-sm text-muted">{filteredRules.length} rule{filteredRules.length !== 1 ? 's' : ''}</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => exportToCsv(`pricing-rules-${new Date().toISOString().slice(0, 10)}`, filteredRules, [
              { header: 'Region', getValue: (r) => `${r.region_name ?? r.city_code} (${r.city_code})` },
              { header: 'Category', getValue: (r) => r.vehicle_category },
              { header: 'Base Fare', getValue: (r) => (r.base_fare_cents / 100).toFixed(2) },
              { header: 'Per Km', getValue: (r) => (r.per_km_cents / 100).toFixed(2) },
              { header: 'Per Min', getValue: (r) => (r.per_minute_cents / 100).toFixed(2) },
              { header: 'Min Fare', getValue: (r) => (r.minimum_fare_cents / 100).toFixed(2) },
              { header: 'Cancel Fee', getValue: (r) => (r.cancellation_fee_cents / 100).toFixed(2) },
              { header: 'Commission %', getValue: (r) => Number(r.service_fee_pct).toFixed(1) },
              { header: 'Booking Fee', getValue: (r) => (r.booking_fee_cents / 100).toFixed(2) },
              { header: 'Currency', getValue: (r) => r.currency_code ?? '' },
            ])}
            className="px-3 py-2 text-xs border border-border rounded hover:bg-surface"
          >↓ Export CSV</button>
          <button
            onClick={() => { setShowRuleForm(true); setEditingRule(null); setRuleForm(EMPTY_RULE); }}
            className="px-3 py-2 bg-accent text-white rounded text-sm"
          >+ New rule</button>
        </div>
      </div>

      {showRuleForm && (
        <div className="bg-white border border-border rounded-lg p-4 mb-4 text-ink">
          <h3 className="text-md font-medium mb-3">{editingRule ? `Edit ${editingRule.city_code} / ${editingRule.vehicle_category}` : 'New pricing rule'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Region">
              <select value={ruleForm.city} onChange={(e) => setRuleForm({...ruleForm, city: e.target.value})} disabled={!!editingRule} className="w-full px-3 py-2 border border-border rounded text-sm bg-white text-ink disabled:opacity-50">
                <option value="">Select region</option>
                {(regions.data?.items ?? []).map(r => <option key={r.code} value={r.code}>{r.name} ({r.code})</option>)}
              </select>
            </Field>
            <Field label="Vehicle category">
              <select value={ruleForm.vehicleType} onChange={(e) => setRuleForm({...ruleForm, vehicleType: e.target.value})} disabled={!!editingRule} className="w-full px-3 py-2 border border-border rounded text-sm bg-white text-ink disabled:opacity-50">
                <option value="economy">economy</option>
                <option value="comfort">comfort</option>
                <option value="premium">premium</option>
                <option value="xl">xl</option>
              </select>
            </Field>
            <Field label="Base fare (cents)"><NumberInput v={ruleForm.baseFare} on={(v) => setRuleForm({...ruleForm, baseFare: v})} /></Field>
            <Field label="Per km (cents)"><NumberInput v={ruleForm.perKm} on={(v) => setRuleForm({...ruleForm, perKm: v})} /></Field>
            <Field label="Per minute (cents)"><NumberInput v={ruleForm.perMinute} on={(v) => setRuleForm({...ruleForm, perMinute: v})} /></Field>
            <Field label="Minimum fare (cents)"><NumberInput v={ruleForm.minimumFare} on={(v) => setRuleForm({...ruleForm, minimumFare: v})} /></Field>
            <Field label="Cancellation fee (cents)"><NumberInput v={ruleForm.cancellationFee} on={(v) => setRuleForm({...ruleForm, cancellationFee: v})} /></Field>
            <Field label="Commission % (platform share)"><NumberInput v={ruleForm.serviceFeePct} on={(v) => setRuleForm({...ruleForm, serviceFeePct: v})} /></Field>
            <Field label="Booking fee (cents)"><NumberInput v={ruleForm.bookingFee} on={(v) => setRuleForm({...ruleForm, bookingFee: v})} /></Field>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={submitRule} className="px-4 py-2 bg-accent text-white rounded text-sm">{editingRule ? 'Save changes' : 'Create rule'}</button>
            <button onClick={() => { setShowRuleForm(false); setEditingRule(null); setRuleForm(EMPTY_RULE); }} className="px-4 py-2 border border-border rounded text-sm">Cancel</button>
          </div>
        </div>
      )}

      <Table
        rows={filteredRules}
        columns={ruleCols}
        rowKey={(r) => r.id}
        emptyMessage={rules.isLoading ? 'Loading…' : 'No pricing rules.'}
        isLoading={rules.isLoading}
        sortKey={ruleSort.key}
        sortDir={ruleSort.dir}
        onSort={toggleRuleSort}
      />

      <div className="flex items-center gap-3 mt-8 mb-3">
        <h2 className="text-lg font-medium">Surge zones</h2>
        <button
          onClick={() => exportToCsv(`surge-zones-${new Date().toISOString().slice(0, 10)}`, sortedZones, [
            { header: 'Region', getValue: (z) => z.city_code },
            { header: 'Zone', getValue: (z) => z.name },
            { header: 'Demand', getValue: (z) => z.demand },
            { header: 'Supply', getValue: (z) => z.supply },
            { header: 'Multiplier', getValue: (z) => z.multiplier.toFixed(2) },
            { header: 'Active', getValue: (z) => z.is_active ? 'Yes' : 'No' },
          ])}
          className="ml-auto px-3 py-1.5 text-xs border border-border rounded hover:bg-surface"
        >↓ Export CSV</button>
      </div>
      <Table
        rows={sortedZones}
        columns={zoneCols}
        rowKey={(z) => z.id}
        emptyMessage={zones.isLoading ? 'Loading…' : 'No surge zones.'}
        isLoading={zones.isLoading}
        sortKey={zoneSort.key}
        sortDir={zoneSort.dir}
        onSort={toggleZoneSort}
      />

      {/* ── Promo Codes ── */}
      <div className="flex items-center gap-3 mt-8 mb-3">
        <h2 className="text-lg font-medium">Promo codes</h2>
        <button
          onClick={() => setShowPromoForm((v) => !v)}
          className="px-3 py-1.5 text-xs bg-accent text-white rounded hover:bg-accent/90 ml-auto"
        >
          + Create code
        </button>
      </div>

      {showPromoForm && (
        <div ref={promoFormRef} className="border border-border rounded-xl p-5 mb-4 bg-surface grid grid-cols-2 gap-4">
          <Field label="Code (auto-uppercased)">
            <input
              value={promoForm.code}
              onChange={(e) => setPromoForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="SUMMER20"
              className="w-full px-3 py-2 border border-border rounded text-sm bg-white text-ink"
            />
          </Field>
          <Field label="Discount type">
            <select
              value={promoForm.discountType}
              onChange={(e) => setPromoForm((f) => ({ ...f, discountType: e.target.value as 'percentage' | 'fixed' }))}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-white text-ink"
            >
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed amount (¢)</option>
            </select>
          </Field>
          <Field label={promoForm.discountType === 'percentage' ? 'Discount %' : 'Discount (cents)'}>
            <NumberInput v={promoForm.discountValue} on={(n) => setPromoForm((f) => ({ ...f, discountValue: n }))} />
          </Field>
          <Field label="Max uses (blank = unlimited)">
            <input
              type="number"
              value={promoForm.maxUses}
              onChange={(e) => setPromoForm((f) => ({ ...f, maxUses: e.target.value }))}
              placeholder="100"
              className="w-full px-3 py-2 border border-border rounded text-sm bg-white text-ink"
            />
          </Field>
          <Field label="Valid from (optional)">
            <input
              type="datetime-local"
              value={promoForm.validFrom}
              onChange={(e) => setPromoForm((f) => ({ ...f, validFrom: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-white text-ink"
            />
          </Field>
          <Field label="Valid until (optional)">
            <input
              type="datetime-local"
              value={promoForm.validTo}
              onChange={(e) => setPromoForm((f) => ({ ...f, validTo: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-white text-ink"
            />
          </Field>
          <div className="col-span-2 flex gap-2 mt-1">
            <button
              onClick={() => createPromoMutation.mutate(promoForm)}
              disabled={!promoForm.code.trim() || createPromoMutation.isPending}
              className="px-4 py-2 bg-accent text-white rounded text-sm disabled:opacity-50"
            >
              {createPromoMutation.isPending ? 'Creating…' : 'Create promo code'}
            </button>
            <button onClick={() => { setShowPromoForm(false); setPromoForm(EMPTY_PROMO); }} className="px-4 py-2 border border-border rounded text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      <Table
        rows={promos.data?.items ?? []}
        columns={promoCols}
        rowKey={(p) => p.id}
        emptyMessage={promos.isLoading ? 'Loading…' : 'No promo codes yet.'}
        isLoading={promos.isLoading}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-muted mb-1">{label}</label>{children}</div>;
}
function NumberInput({ v, on }: { v: number; on: (n: number) => void }) {
  return <input type="number" value={v} onChange={(e) => on(Number(e.target.value))} className="w-full px-3 py-2 border border-border rounded text-sm bg-white text-ink" />;
}
