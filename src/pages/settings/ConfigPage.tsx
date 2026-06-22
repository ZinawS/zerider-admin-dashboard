import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { PageHeader } from '../../components/PageHeader.js';
import { QueryError } from '../../components/QueryError.js';

type ConfigTab = 'pricing' | 'commission' | 'incentives';

interface PricingRule {
  id: string;
  city_code: string;
  vehicle_category: string;
  base_fare_cents: number;
  per_km_cents: number;
  per_minute_cents: number;
  surge_multiplier: number | null;
  minimum_fare_cents?: number;
}

interface DriverRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  commission_rate_bps: number;
}

function fmtBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

// ─── Pricing Config Tab ────────────────────────────────────────────────────────

function PricingConfigTab() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['config-pricing-rules'],
    queryFn: () => api<{ items: PricingRule[] }>('/v1/admin/pricing/rules'),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PricingRule>>({});

  const updateRule = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<PricingRule> }) =>
      api(`/v1/admin/pricing/rules/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-pricing-rules'] });
      setEditingId(null);
    },
  });

  if (isLoading) return <div className="text-muted py-6">Loading pricing rules…</div>;
  if (isError) return <QueryError onRetry={() => refetch()} />;

  const items = data?.items ?? [];
  if (!items.length) return <div className="text-muted py-6">No pricing rules configured.</div>;

  const startEdit = (r: PricingRule) => {
    setEditingId(r.id);
    setEditForm({
      base_fare_cents: r.base_fare_cents,
      per_km_cents: r.per_km_cents,
      per_minute_cents: r.per_minute_cents,
      surge_multiplier: r.surge_multiplier ?? 1,
    });
  };

  return (
    <div className="bg-white border border-border rounded overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface text-muted text-xs uppercase">
          <tr>
            <th className="text-left px-3 py-2">Region</th>
            <th className="text-left px-3 py-2">Category</th>
            <th className="text-right px-3 py-2">Base fare (¢)</th>
            <th className="text-right px-3 py-2">Per km (¢)</th>
            <th className="text-right px-3 py-2">Per min (¢)</th>
            <th className="text-right px-3 py-2">Surge</th>
            <th className="text-left px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) =>
            editingId === r.id ? (
              <tr key={r.id} className="border-t border-border bg-surface/40">
                <td className="px-3 py-2 text-muted text-xs">{r.city_code}</td>
                <td className="px-3 py-2 text-xs capitalize">{r.vehicle_category}</td>
                {(['base_fare_cents', 'per_km_cents', 'per_minute_cents', 'surge_multiplier'] as const).map((field) => (
                  <td key={field} className="px-3 py-2">
                    <input
                      type="number"
                      step={field === 'surge_multiplier' ? '0.1' : '1'}
                      value={editForm[field] ?? 0}
                      onChange={(e) => setEditForm((f) => ({ ...f, [field]: Number(e.target.value) }))}
                      className="w-24 px-2 py-1 border border-border rounded text-xs text-right bg-white"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button
                      onClick={() => updateRule.mutate({ id: r.id, body: editForm })}
                      disabled={updateRule.isPending}
                      className="px-2 py-1 text-xs bg-accent text-white rounded disabled:opacity-50"
                    >
                      {updateRule.isPending ? '…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2 py-1 text-xs border border-border rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={r.id} className="border-t border-border hover:bg-surface/50">
                <td className="px-3 py-2 text-xs text-muted">{r.city_code}</td>
                <td className="px-3 py-2 text-xs capitalize">{r.vehicle_category}</td>
                <td className="px-3 py-2 text-right text-xs">{r.base_fare_cents}</td>
                <td className="px-3 py-2 text-right text-xs">{r.per_km_cents}</td>
                <td className="px-3 py-2 text-right text-xs">{r.per_minute_cents}</td>
                <td className="px-3 py-2 text-right text-xs">{r.surge_multiplier ?? 1}x</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => startEdit(r)}
                    className="px-2 py-1 text-xs bg-accent text-white rounded"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Commission Tab ────────────────────────────────────────────────────────────

function CommissionConfigTab() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['config-drivers-commission'],
    queryFn: () => api<{ items: DriverRow[] }>('/v1/admin/drivers?limit=200'),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBps, setEditBps] = useState('');

  const updateDriver = useMutation({
    mutationFn: ({ id, commission_rate_bps }: { id: string; commission_rate_bps: number }) =>
      api(`/v1/admin/drivers/${id}`, { method: 'PATCH', body: { commission_rate_bps } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-drivers-commission'] });
      setEditingId(null);
    },
  });

  if (isLoading) return <div className="text-muted py-6">Loading drivers…</div>;
  if (isError) return <QueryError onRetry={() => refetch()} />;

  const items = data?.items ?? [];
  if (!items.length) return <div className="text-muted py-6">No drivers found.</div>;

  const startEdit = (d: DriverRow) => {
    setEditingId(d.id);
    setEditBps(String(d.commission_rate_bps));
  };

  const save = (id: string) => {
    const bps = parseInt(editBps, 10);
    if (isNaN(bps) || bps < 0 || bps > 10000) return;
    updateDriver.mutate({ id, commission_rate_bps: bps });
  };

  return (
    <div className="bg-white border border-border rounded overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface text-muted text-xs uppercase">
          <tr>
            <th className="text-left px-3 py-2">Driver</th>
            <th className="text-left px-3 py-2">Email</th>
            <th className="text-right px-3 py-2">Commission Rate</th>
            <th className="text-left px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((d) =>
            editingId === d.id ? (
              <tr key={d.id} className="border-t border-border bg-surface/40">
                <td className="px-3 py-2 text-ink font-medium">
                  {d.first_name} {d.last_name}
                </td>
                <td className="px-3 py-2 text-xs text-muted">{d.email ?? '—'}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      value={editBps}
                      onChange={(e) => setEditBps(e.target.value)}
                      className="w-24 px-2 py-1 border border-border rounded text-xs text-right bg-white"
                      placeholder="bps"
                    />
                    <span className="text-xs text-muted">bps ({editBps ? fmtBps(Number(editBps)) : '—'})</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button
                      onClick={() => save(d.id)}
                      disabled={updateDriver.isPending}
                      className="px-2 py-1 text-xs bg-accent text-white rounded disabled:opacity-50"
                    >
                      {updateDriver.isPending ? '…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2 py-1 text-xs border border-border rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={d.id} className="border-t border-border hover:bg-surface/50">
                <td className="px-3 py-2 text-ink font-medium">
                  {d.first_name} {d.last_name}
                </td>
                <td className="px-3 py-2 text-xs text-muted">{d.email ?? '—'}</td>
                <td className="px-3 py-2 text-right">
                  <span className="text-ink font-medium">
                    {fmtBps(d.commission_rate_bps)}
                  </span>
                  <span className="text-muted text-xs ml-1">({d.commission_rate_bps} bps)</span>
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => startEdit(d)}
                    className="px-2 py-1 text-xs bg-accent text-white rounded"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Incentives Tab ────────────────────────────────────────────────────────────

interface Challenge {
  id: string;
  title: string;
  description: string | null;
  type: string;
  target_value: number;
  reward_type: string;
  reward_amount: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
}

function IncentivesTab() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['config-incentive-challenges'],
    queryFn: () => api<{ items: Challenge[] }>('/v1/admin/gamification/challenges'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api(`/v1/admin/gamification/challenges/${id}`, { method: 'PATCH', body: { is_active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-incentive-challenges'] }),
  });

  if (isLoading) return <div className="text-muted py-6">Loading incentive programs…</div>;
  if (isError) return <QueryError onRetry={() => refetch()} />;

  const items = data?.items ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-muted">Driver incentive programs and challenges. Full management available in <Link to="/gamification" className="text-accent underline">Gamification</Link>.</div>
      </div>
      {items.length === 0 ? (
        <div className="bg-surface border border-border rounded p-6 text-center text-muted text-sm">
          No incentive programs configured. Create challenges in the{' '}
          <Link to="/gamification" className="text-accent underline">Gamification</Link> page.
        </div>
      ) : (
        <div className="bg-white border border-border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2">Title</th>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-right px-3 py-2">Target</th>
                <th className="text-left px-3 py-2">Reward</th>
                <th className="text-left px-3 py-2">Period</th>
                <th className="text-center px-3 py-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-surface/50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink">{c.title}</div>
                    {c.description && <div className="text-xs text-muted truncate max-w-[240px]">{c.description}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs capitalize text-muted">{c.type.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-2 text-right text-xs">{c.target_value}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="capitalize">{c.reward_type.replace(/_/g, ' ')}</span>
                    <span className="ml-1 font-medium text-success">
                      {c.reward_type === 'cash' ? `$${(c.reward_amount / 100).toFixed(2)}` : `×${c.reward_amount}`}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {c.starts_at ? new Date(c.starts_at).toLocaleDateString() : '—'}
                    {' → '}
                    {c.ends_at ? new Date(c.ends_at).toLocaleDateString() : 'ongoing'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => toggleActive.mutate({ id: c.id, is_active: !c.is_active })}
                      disabled={toggleActive.isPending}
                      className={`w-10 h-5 rounded-full transition-colors relative disabled:opacity-50 ${c.is_active ? 'bg-success' : 'bg-border'}`}
                      title={c.is_active ? 'Active — click to disable' : 'Inactive — click to enable'}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${c.is_active ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── ConfigPage ───────────────────────────────────────────────────────────────

export function ConfigPage(): JSX.Element {
  const [tab, setTab] = useState<ConfigTab>('pricing');

  const tabs: { key: ConfigTab; label: string }[] = [
    { key: 'pricing', label: 'Pricing Config' },
    { key: 'commission', label: 'Commission' },
    { key: 'incentives', label: 'Incentives' },
  ];

  return (
    <div>
      <PageHeader title="Configuration" subtitle="Manage platform pricing rules, driver commission rates, and incentives." />

      <div className="flex gap-1 border-b border-border mb-4 mt-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              'px-4 py-2 text-sm font-medium border-b-2 transition ' +
              (tab === t.key
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-ink')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pricing' && <PricingConfigTab />}
      {tab === 'commission' && <CommissionConfigTab />}
      {tab === 'incentives' && <IncentivesTab />}
    </div>
  );
}
