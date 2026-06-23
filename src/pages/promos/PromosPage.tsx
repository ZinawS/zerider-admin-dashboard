import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { PageHeader } from '../../components/PageHeader.js';
import { useToast } from '../../components/Toast.js';
import { Pagination } from '../../components/Pagination.js';
import { QueryError } from '../../components/QueryError.js';

// ─── types ───────────────────────────────────────────────────────────────────

interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed_cents';
  discount_value: number;
  max_discount_cents: number | null;
  min_fare_cents: number | null;
  applies_to: string;
  max_uses: number | null;
  uses_per_user: number | null;
  total_uses: number;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDiscount(p: PromoCode): string {
  if (p.discount_type === 'percentage') return `${p.discount_value}% off`;
  return `$${(p.discount_value / 100).toFixed(2)} off`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function expirySoon(iso: string | null): boolean {
  if (!iso) return false;
  const diff = new Date(iso).getTime() - Date.now();
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
}

// ─── Create promo modal ───────────────────────────────────────────────────────

interface CreatePromoModalProps { onClose: () => void; }

function CreatePromoModal({ onClose }: CreatePromoModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed_cents'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [maxDiscountCents, setMaxDiscountCents] = useState('');
  const [minFareCents, setMinFareCents] = useState('');
  const [appliesTo, setAppliesTo] = useState('ride_sharing');
  const [maxUses, setMaxUses] = useState('');
  const [usesPerUser, setUsesPerUser] = useState('1');
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    setCode(Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''));
  };

  const create = useMutation({
    mutationFn: () => {
      const body: any = {
        code: code.trim().toUpperCase(),
        discount_type: discountType,
        discount_value: discountType === 'percentage'
          ? parseFloat(discountValue)
          : Math.round(parseFloat(discountValue) * 100),
        applies_to: appliesTo,
      };
      if (description) body.description = description;
      if (maxDiscountCents) body.max_discount_cents = Math.round(parseFloat(maxDiscountCents) * 100);
      if (minFareCents) body.min_fare_cents = Math.round(parseFloat(minFareCents) * 100);
      if (maxUses) body.max_uses = parseInt(maxUses, 10);
      if (usesPerUser) body.uses_per_user = parseInt(usesPerUser, 10);
      if (startsAt) body.starts_at = new Date(startsAt).toISOString();
      if (expiresAt) body.expires_at = new Date(expiresAt).toISOString();
      return api('/v1/admin/pricing/promotions', { method: 'POST', body });
    },
    onSuccess: () => {
      toast('Promo code created.', 'success');
      qc.invalidateQueries({ queryKey: ['admin-promos'] });
      onClose();
    },
    onError: (e: any) => toast('Failed: ' + (e?.message ?? 'error'), 'error'),
  });

  const inp = 'w-full px-3 py-2 text-sm border border-border rounded bg-white';
  const lbl = 'block text-xs text-muted mb-1';
  const valid = code.trim() && discountValue && !isNaN(parseFloat(discountValue));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 overflow-y-auto p-6" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl my-8 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-base font-semibold">Create promo code</div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={lbl}>Code *</label>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="SUMMER25"
                className={inp + ' flex-1 font-mono uppercase'}
              />
              <button
                onClick={generateCode}
                className="px-3 py-2 text-xs border border-border rounded hover:bg-surface"
              >
                Generate
              </button>
            </div>
          </div>

          <div className="col-span-2">
            <label className={lbl}>Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inp} placeholder="Summer promo — 25% off rides" />
          </div>

          <div>
            <label className={lbl}>Discount type *</label>
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value as any)} className={inp}>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed_cents">Fixed amount ($)</option>
            </select>
          </div>

          <div>
            <label className={lbl}>
              {discountType === 'percentage' ? 'Percentage (0–100) *' : 'Amount (USD) *'}
            </label>
            <input
              type="number" min="0" step={discountType === 'percentage' ? '1' : '0.01'}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              className={inp}
              placeholder={discountType === 'percentage' ? '25' : '5.00'}
            />
          </div>

          {discountType === 'percentage' && (
            <div>
              <label className={lbl}>Max discount (USD cap)</label>
              <input type="number" min="0" step="0.01" value={maxDiscountCents} onChange={(e) => setMaxDiscountCents(e.target.value)} className={inp} placeholder="15.00" />
            </div>
          )}

          <div>
            <label className={lbl}>Min fare (USD)</label>
            <input type="number" min="0" step="0.01" value={minFareCents} onChange={(e) => setMinFareCents(e.target.value)} className={inp} placeholder="5.00" />
          </div>

          <div>
            <label className={lbl}>Applies to</label>
            <select value={appliesTo} onChange={(e) => setAppliesTo(e.target.value)} className={inp}>
              <option value="ride_sharing">Ride sharing</option>
              <option value="food_delivery">Food delivery</option>
              <option value="grocery_delivery">Grocery delivery</option>
              <option value="package_delivery">Package delivery</option>
              <option value="all">All services</option>
            </select>
          </div>

          <div>
            <label className={lbl}>Max total uses</label>
            <input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={inp} placeholder="Unlimited" />
          </div>

          <div>
            <label className={lbl}>Uses per user</label>
            <input type="number" min="1" value={usesPerUser} onChange={(e) => setUsesPerUser(e.target.value)} className={inp} placeholder="1" />
          </div>

          <div>
            <label className={lbl}>Starts at</label>
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inp} />
          </div>

          <div>
            <label className={lbl}>Expires at</label>
            <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inp} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded">Cancel</button>
          <button
            onClick={() => create.mutate()}
            disabled={!valid || create.isPending}
            className="px-4 py-2 text-sm bg-accent text-white rounded disabled:opacity-40"
          >
            {create.isPending ? 'Creating…' : 'Create promo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Promo table ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

function PromoTable() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-promos', page, statusFilter, search],
    queryFn: () => {
      const qs = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
        ...(statusFilter === 'active' && { is_active: 'true' }),
        ...(statusFilter === 'inactive' && { is_active: 'false' }),
        ...(search && { code: search.toUpperCase() }),
      });
      return api<{ items: PromoCode[]; total: number }>(`/v1/admin/pricing/promotions?${qs}`);
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api(`/v1/admin/pricing/promotions/${id}`, { method: 'PATCH', body: { is_active } }),
    onSuccess: (_, { is_active }) => {
      toast(is_active ? 'Promo activated.' : 'Promo deactivated.', 'success');
      qc.invalidateQueries({ queryKey: ['admin-promos'] });
    },
    onError: (e: any) => toast('Failed: ' + (e?.message ?? 'error'), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/v1/admin/pricing/promotions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('Promo deleted.', 'success');
      qc.invalidateQueries({ queryKey: ['admin-promos'] });
    },
    onError: (e: any) => toast('Failed: ' + (e?.message ?? 'error'), 'error'),
  });

  if (isError) return <QueryError onRetry={() => refetch()} />;

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by code…"
          className="px-3 py-1.5 text-sm border border-border rounded bg-white w-44"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="text-sm px-3 py-1.5 border border-border rounded bg-white"
        >
          <option value="">All promos</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
        <span className="ml-auto text-xs text-muted self-center">{total.toLocaleString()} promo{total !== 1 ? 's' : ''}</span>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2.5">Code</th>
              <th className="text-left px-4 py-2.5">Discount</th>
              <th className="text-left px-4 py-2.5">Applies to</th>
              <th className="text-right px-4 py-2.5">Uses</th>
              <th className="text-left px-4 py-2.5">Validity</th>
              <th className="text-center px-4 py-2.5">Active</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted text-sm">Loading…</td></tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted text-sm">No promo codes found.</td></tr>
            )}
            {items.map((p) => {
              const nearExpiry = expirySoon(p.expires_at);
              const expired = p.expires_at ? new Date(p.expires_at) < new Date() : false;
              return (
                <tr key={p.id} className="border-t border-border hover:bg-surface/50">
                  <td className="px-4 py-2.5">
                    <div className="font-mono font-semibold text-ink">{p.code}</div>
                    {p.description && <div className="text-xs text-muted truncate max-w-[180px]">{p.description}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-ink font-medium">
                    {fmtDiscount(p)}
                    {p.max_discount_cents && (
                      <div className="text-xs text-muted">cap ${(p.max_discount_cents / 100).toFixed(2)}</div>
                    )}
                    {p.min_fare_cents && (
                      <div className="text-xs text-muted">min fare ${(p.min_fare_cents / 100).toFixed(2)}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted capitalize">{p.applies_to.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2.5 text-right text-xs">
                    <span className="font-medium text-ink">{p.total_uses.toLocaleString()}</span>
                    {p.max_uses && <span className="text-muted"> / {p.max_uses.toLocaleString()}</span>}
                    {p.uses_per_user && <div className="text-muted">{p.uses_per_user}×/user</div>}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <div className={expired ? 'text-danger' : nearExpiry ? 'text-orange-600' : 'text-muted'}>
                      {p.starts_at ? `from ${fmtDate(p.starts_at)}` : 'any time'}
                      {' → '}
                      {p.expires_at
                        ? <span>{fmtDate(p.expires_at)}{expired ? ' (expired)' : nearExpiry ? ' (expiring soon)' : ''}</span>
                        : 'no expiry'}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onClick={() => toggle.mutate({ id: p.id, is_active: !p.is_active })}
                      disabled={toggle.isPending}
                      className={`w-10 h-5 rounded-full transition-colors relative disabled:opacity-50 ${p.is_active ? 'bg-success' : 'bg-border'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${p.is_active ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete promo code ${p.code}?`)) remove.mutate(p.id);
                      }}
                      disabled={remove.isPending}
                      className="text-xs px-2 py-1 border border-red-200 text-red-500 rounded hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-4">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function PromosPage(): JSX.Element {
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Promo Codes"
          subtitle="Create and manage discount codes for riders across all service types."
        />
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 text-sm bg-accent text-white rounded hover:bg-accent/90 shrink-0"
        >
          + Create promo
        </button>
      </div>
      <PromoTable />
      {creating && <CreatePromoModal onClose={() => setCreating(false)} />}
    </div>
  );
}
