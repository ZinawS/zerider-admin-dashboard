import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { useRegionScope } from '../../stores/region-scope.store';
import { useToast } from '../../components/Toast';
import { QueryError } from '../../components/QueryError';
import { useDebounced } from '../../hooks/useDebounced';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtEtb(cents: number | null | undefined) {
  if (cents == null) return '—';
  return `ETB ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(rate: number | null | undefined) {
  if (rate == null) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

// ─── types ───────────────────────────────────────────────────────────────────

interface Merchant {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string;
  description: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  region_code: string;
  phone: string | null;
  email: string;
  status: string;
  commission_rate: number | null;
  payout_schedule: string | null;
  admin_notes: string | null;
  webhook_url: string | null;
  logo_url: string | null;
  banner_url: string | null;
  stripe_account_id: string | null;
  created_at: string;
  updated_at: string | null;
}

interface Settlement {
  id: string;
  period_start: string;
  period_end: string;
  order_count: number;
  total_order_value_cents: number;
  platform_commission_cents: number;
  merchant_payout_cents: number;
  status: string;
  stripe_transfer_id: string | null;
  initiated_at: string | null;
  completed_at: string | null;
  failed_reason: string | null;
  created_at: string;
}

interface ListResponse { items: Merchant[]; total: number; }

// ─── constants ───────────────────────────────────────────────────────────────

const MERCHANT_STATUSES = ['', 'pending', 'active', 'suspended', 'closed'];
const BUSINESS_TYPES = ['', 'restaurant', 'grocery', 'pharmacy', 'retail', 'electronics', 'fashion', 'other'];
const PAYOUT_SCHEDULES = ['daily', 'weekly', 'monthly'];
const PAGE_SIZE = 25;

function statusBadge(s: string): string {
  switch (s) {
    case 'pending':   return 'bg-amber-100 text-amber-700';
    case 'active':    return 'bg-emerald-100 text-emerald-700';
    case 'suspended': return 'bg-red-100 text-red-700';
    case 'closed':    return 'bg-gray-100 text-gray-500';
    default:          return 'bg-gray-100 text-gray-600';
  }
}

function settlementStatusBadge(s: string): string {
  switch (s) {
    case 'paid':       return 'bg-emerald-100 text-emerald-700';
    case 'processing': return 'bg-blue-100 text-blue-700';
    case 'pending':    return 'bg-amber-100 text-amber-700';
    case 'failed':     return 'bg-red-100 text-red-700';
    default:           return 'bg-gray-100 text-gray-600';
  }
}

// ─── detail panel ────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value?: string | null | number }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xs font-medium text-right max-w-[65%] break-words">{String(value)}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{title}</div>
      {children}
    </div>
  );
}

interface DetailPanelProps {
  merchant: Merchant;
  onClose: () => void;
  onUpdated: () => void;
}

function MerchantDetailPanel({ merchant, onClose, onUpdated }: DetailPanelProps): JSX.Element {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Editable settings state
  const [commissionRate, setCommissionRate] = useState(
    merchant.commission_rate != null ? String((merchant.commission_rate * 100).toFixed(1)) : '',
  );
  const [payoutSchedule, setPayoutSchedule] = useState(merchant.payout_schedule ?? 'monthly');
  const [adminNotes, setAdminNotes] = useState(merchant.admin_notes ?? '');
  const [editingSettings, setEditingSettings] = useState(false);

  // Suspend form state
  const [showSuspendForm, setShowSuspendForm] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  // Settlement trigger state
  const [showSettlementConfirm, setShowSettlementConfirm] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-merchants'] });
    onUpdated();
  };

  const approveMutation = useMutation({
    mutationFn: () => api(`/v1/admin/merchants/${merchant.id}/approve`, { method: 'POST' }),
    onSuccess: () => { toast('Merchant approved.', 'success'); invalidate(); },
    onError: (e: any) => toast('Approve failed: ' + (e?.message ?? 'error'), 'error'),
  });

  const suspendMutation = useMutation({
    mutationFn: () => api(`/v1/admin/merchants/${merchant.id}/suspend`, {
      method: 'POST',
      body: { reason: suspendReason || 'Suspended by admin' },
    }),
    onSuccess: () => { toast('Merchant suspended.', 'success'); setShowSuspendForm(false); setSuspendReason(''); invalidate(); },
    onError: (e: any) => toast('Suspend failed: ' + (e?.message ?? 'error'), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const parsed = parseFloat(commissionRate);
      return api(`/v1/admin/merchants/${merchant.id}`, {
        method: 'PATCH',
        body: {
          commission_rate: !isNaN(parsed) ? parsed / 100 : undefined,
          payout_schedule: payoutSchedule,
          admin_notes: adminNotes || undefined,
        },
      });
    },
    onSuccess: () => { toast('Settings updated.', 'success'); setEditingSettings(false); invalidate(); },
    onError: (e: any) => toast('Update failed: ' + (e?.message ?? 'error'), 'error'),
  });

  const settlementMutation = useMutation({
    mutationFn: () => api('/v1/admin/settlements/run', {
      method: 'POST',
      body: { merchant_id: merchant.id },
    }),
    onSuccess: () => { toast('Settlement triggered.', 'success'); setShowSettlementConfirm(false); },
    onError: (e: any) => toast('Settlement failed: ' + (e?.message ?? 'error'), 'error'),
  });

  const { data: settlements, isLoading: settleLoading } = useQuery({
    queryKey: ['admin-merchant-settlements', merchant.id],
    queryFn: () => api<Settlement[]>(`/v1/admin/merchants/${merchant.id}/settlements?limit=10&offset=0`),
    staleTime: 60_000,
  });

  const busy = approveMutation.isPending || suspendMutation.isPending || updateMutation.isPending || settlementMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-end z-50" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-white z-10">
          <div>
            <div className="font-semibold text-sm">{merchant.business_name}</div>
            <span className={`mt-0.5 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(merchant.status)}`}>
              {merchant.status}
            </span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <div className="px-5 py-4 space-y-5 text-sm">

          {/* Profile */}
          <Section title="Profile">
            <Row label="ID" value={merchant.id} />
            <Row label="Business type" value={merchant.business_type} />
            <Row label="Region" value={merchant.region_code} />
            <Row label="Email" value={merchant.email} />
            <Row label="Phone" value={merchant.phone} />
            <Row label="Address" value={merchant.address} />
            {merchant.lat && merchant.lng && (
              <Row label="Coordinates" value={`${merchant.lat}, ${merchant.lng}`} />
            )}
            <Row label="Description" value={merchant.description} />
            <Row label="Registered" value={fmtDate(merchant.created_at)} />
            <Row label="Last updated" value={fmtDate(merchant.updated_at)} />
            <Row label="Stripe account" value={merchant.stripe_account_id} />
          </Section>

          {/* Settings (read + edit) */}
          <Section title="Settings">
            {!editingSettings ? (
              <>
                <Row label="Commission rate" value={fmtPct(merchant.commission_rate)} />
                <Row label="Payout schedule" value={merchant.payout_schedule ?? '—'} />
                {merchant.admin_notes && (
                  <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                    <span className="font-semibold">Admin notes: </span>{merchant.admin_notes}
                  </div>
                )}
                <button
                  onClick={() => setEditingSettings(true)}
                  className="mt-3 w-full px-3 py-2 border border-border rounded text-xs hover:bg-bg transition-colors"
                >
                  Edit settings
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted mb-1">Commission rate (%)</label>
                  <input
                    type="number"
                    min="0" max="100" step="0.1"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    className="w-full border border-border rounded px-3 py-2 text-sm"
                    placeholder="e.g. 20 for 20%"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Payout schedule</label>
                  <select
                    value={payoutSchedule}
                    onChange={(e) => setPayoutSchedule(e.target.value)}
                    className="w-full border border-border rounded px-3 py-2 text-sm"
                  >
                    {PAYOUT_SCHEDULES.map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Admin notes</label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Internal notes visible only to admins"
                    className="w-full border border-border rounded px-3 py-2 text-sm resize-none"
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateMutation.mutate()}
                    disabled={busy}
                    className="flex-1 px-3 py-2 bg-ink text-white rounded text-xs hover:bg-ink/90 disabled:opacity-60"
                  >
                    {updateMutation.isPending ? 'Saving…' : 'Save changes'}
                  </button>
                  <button
                    onClick={() => setEditingSettings(false)}
                    className="px-3 py-2 border border-border rounded text-xs hover:bg-bg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </Section>

          {/* Actions */}
          <Section title="Actions">
            <div className="space-y-2">
              {/* Approve */}
              {merchant.status === 'pending' && (
                <button
                  onClick={() => approveMutation.mutate()}
                  disabled={busy}
                  className="w-full px-3 py-2 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 disabled:opacity-60"
                >
                  {approveMutation.isPending ? 'Approving…' : 'Approve merchant'}
                </button>
              )}

              {/* Suspend */}
              {merchant.status === 'active' && !showSuspendForm && (
                <button
                  onClick={() => setShowSuspendForm(true)}
                  className="w-full px-3 py-2 border border-red-300 text-red-600 rounded text-xs hover:bg-red-50 transition-colors"
                >
                  Suspend merchant
                </button>
              )}
              {showSuspendForm && (
                <div className="space-y-2">
                  <textarea
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    placeholder="Reason for suspension (required for audit trail)"
                    className="w-full border border-border rounded px-3 py-2 text-xs resize-none"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => suspendMutation.mutate()}
                      disabled={busy || !suspendReason.trim()}
                      className="flex-1 px-3 py-2 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-60"
                    >
                      {suspendMutation.isPending ? 'Suspending…' : 'Confirm suspend'}
                    </button>
                    <button
                      onClick={() => { setShowSuspendForm(false); setSuspendReason(''); }}
                      className="px-3 py-2 border border-border rounded text-xs hover:bg-bg"
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}

              {/* Re-activate suspended merchant */}
              {merchant.status === 'suspended' && (
                <button
                  onClick={() => approveMutation.mutate()}
                  disabled={busy}
                  className="w-full px-3 py-2 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 disabled:opacity-60"
                >
                  {approveMutation.isPending ? 'Reactivating…' : 'Reactivate merchant'}
                </button>
              )}

              {/* Run settlement */}
              {merchant.status === 'active' && (
                <>
                  {!showSettlementConfirm ? (
                    <button
                      onClick={() => setShowSettlementConfirm(true)}
                      className="w-full px-3 py-2 border border-border rounded text-xs hover:bg-bg transition-colors"
                    >
                      Run settlement now
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted">
                        This will calculate delivered orders for the current {merchant.payout_schedule ?? 'monthly'} period and credit the merchant wallet.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => settlementMutation.mutate()}
                          disabled={busy}
                          className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 disabled:opacity-60"
                        >
                          {settlementMutation.isPending ? 'Running…' : 'Confirm settlement'}
                        </button>
                        <button
                          onClick={() => setShowSettlementConfirm(false)}
                          className="px-3 py-2 border border-border rounded text-xs hover:bg-bg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </Section>

          {/* Settlement history */}
          <Section title="Recent Settlements">
            {settleLoading && (
              <div className="text-xs text-muted py-2">Loading…</div>
            )}
            {!settleLoading && (!settlements || settlements.length === 0) && (
              <div className="text-xs text-muted py-2">No settlements yet.</div>
            )}
            {settlements && settlements.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-bg border-b border-border">
                      <th className="text-left px-3 py-2 font-semibold text-muted">Period</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted">Orders</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted">Payout</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map((s, i) => (
                      <tr key={s.id} className={i % 2 ? 'bg-bg/40' : ''}>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {fmtDate(s.period_start)} – {fmtDate(s.period_end)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.order_count}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {fmtEtb(s.merchant_payout_cents)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${settlementStatusBadge(s.status)}`}>
                            {s.status}
                          </span>
                          {s.failed_reason && (
                            <div className="text-[10px] text-red-600 mt-0.5">{s.failed_reason}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export function MerchantManagementPage(): JSX.Element {
  const regionCode = useRegionScope((s) => s.regionCode);
  const { toast } = useToast();

  const [status, setStatus] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);

  const debouncedName = useDebounced(nameSearch, 400);

  const qs = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String((page - 1) * PAGE_SIZE),
    ...(status && { status }),
    ...(businessType && { type: businessType }),
    ...(regionCode && { region: regionCode }),
  }).toString();

  const { data, isLoading, isError, refetch } = useQuery<ListResponse>({
    queryKey: ['admin-merchants', status, businessType, debouncedName, regionCode, page],
    queryFn: () => api<ListResponse>(`/v1/admin/merchants?${qs}`),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const merchants = (data?.items ?? []).filter((m) =>
    !debouncedName || m.business_name.toLowerCase().includes(debouncedName.toLowerCase()),
  );
  const total = data?.total ?? 0;

  function resetPage() { setPage(1); }

  if (isError) return <QueryError onRetry={() => refetch()} />;

  const pendingCount = data?.items.filter((m) => m.status === 'pending').length ?? 0;

  return (
    <div>
      <PageHeader
        title="Merchant Management"
        subtitle="Review, approve, and configure merchant accounts"
      />

      {/* Pending approval banner */}
      {pendingCount > 0 && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <span className="font-semibold">{pendingCount}</span> merchant{pendingCount !== 1 ? 's' : ''} pending approval.
          <button
            onClick={() => { setStatus('pending'); resetPage(); }}
            className="ml-auto text-xs underline hover:no-underline"
          >
            View pending
          </button>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); resetPage(); }}
          className="text-sm px-3 py-2 border border-border rounded bg-surface text-ink"
        >
          <option value="">All statuses</option>
          {MERCHANT_STATUSES.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        <select
          value={businessType}
          onChange={(e) => { setBusinessType(e.target.value); resetPage(); }}
          className="text-sm px-3 py-2 border border-border rounded bg-surface text-ink"
        >
          <option value="">All types</option>
          {BUSINESS_TYPES.filter(Boolean).map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>

        <input
          type="text"
          value={nameSearch}
          onChange={(e) => { setNameSearch(e.target.value); resetPage(); }}
          placeholder="Search by name…"
          className="text-sm px-3 py-2 border border-border rounded bg-surface text-ink w-48"
        />

        {!isLoading && (
          <div className="ml-auto flex items-center text-sm text-muted">
            {total.toLocaleString()} merchant{total !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* ── Quick-filter chips ── */}
      <div className="flex gap-3 mb-5 flex-wrap">
        {[
          { label: 'Pending review', value: 'pending', color: 'bg-amber-100 text-amber-700' },
          { label: 'Active', value: 'active', color: 'bg-emerald-100 text-emerald-700' },
          { label: 'Suspended', value: 'suspended', color: 'bg-red-100 text-red-700' },
          { label: 'Closed', value: 'closed', color: 'bg-gray-100 text-gray-500' },
        ].map((chip) => (
          <button
            key={chip.value}
            onClick={() => { setStatus((p) => p === chip.value ? '' : chip.value); resetPage(); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${chip.color} ${status === chip.value ? 'ring-2 ring-offset-1 ring-current' : ''}`}
          >
            {chip.label}
          </button>
        ))}
        {(status || businessType || nameSearch) && (
          <button
            onClick={() => { setStatus(''); setBusinessType(''); setNameSearch(''); resetPage(); }}
            className="px-3 py-1.5 text-xs text-muted hover:text-ink"
          >
            Clear filters ×
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted">Business</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted">Type</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted">Region</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted">Commission</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted">Payout</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted">Registered</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">Loading…</td></tr>
            )}
            {!isLoading && merchants.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No merchants match the current filters.</td></tr>
            )}
            {merchants.map((m, i) => (
              <tr
                key={m.id}
                onClick={() => setSelectedMerchant((p) => p?.id === m.id ? null : m)}
                className={`cursor-pointer hover:bg-bg/60 transition-colors ${i % 2 ? 'bg-bg/20' : ''} ${selectedMerchant?.id === m.id ? 'bg-indigo-50' : ''}`}
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{m.business_name}</div>
                  <div className="text-xs text-muted">{m.email}</div>
                </td>
                <td className="px-4 py-3 capitalize text-muted text-xs">{m.business_type}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(m.status)}`}>
                    {m.status}
                  </span>
                  {m.admin_notes && (
                    <div className="w-1.5 h-1.5 bg-amber-400 rounded-full inline-block ml-1.5 align-middle" title="Has admin notes" />
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted">{m.region_code}</td>
                <td className="px-4 py-3 text-right tabular-nums text-xs">{fmtPct(m.commission_rate)}</td>
                <td className="px-4 py-3 text-xs text-muted capitalize">{m.payout_schedule ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{fmtDate(m.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {total > PAGE_SIZE && (
        <div className="mt-4 flex justify-center">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </div>
      )}

      {/* ── Detail drawer ── */}
      {selectedMerchant && (
        <MerchantDetailPanel
          merchant={selectedMerchant}
          onClose={() => setSelectedMerchant(null)}
          onUpdated={() => {
            refetch();
            setSelectedMerchant(null);
          }}
        />
      )}
    </div>
  );
}
