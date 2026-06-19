import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Pagination } from '../../components/Pagination.js';
import { useDebounced } from '../../hooks/useDebounced.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Listing {
  id: string;
  title: string;
  description: string | null;
  category_name: string | null;
  listing_type: 'standard' | 'featured' | 'sponsored' | 'premium';
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'expired' | 'sold';
  user_id: string;
  price_cents: number | null;
  currency: string;
  contact_phone: string | null;
  contact_email: string | null;
  location_address: string | null;
  listing_fee_cents: number;
  listing_fee_paid: boolean;
  admin_notes: string | null;
  rejection_reason: string | null;
  approved_at: string | null;
  expires_at: string | null;
  view_count: number;
  contact_count: number;
  created_at: string;
}

interface Report {
  id: string;
  listing_title: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  created_at: string;
  resolved: boolean;
}

interface RevenueTotals {
  total_paid_listings: number | null;
  total_revenue_cents: string | null;
  active_listings: number | null;
  pending_listings: number | null;
}

interface RevenueByType {
  listing_type: string;
  count: number;
  total_fee_cents: string;
}

interface RevenueTimeline {
  date: string;
  revenue_cents: string;
  count: number;
}

interface RevenueSummary {
  totals: RevenueTotals;
  by_type: RevenueByType[];
  timeline: RevenueTimeline[];
}

interface ListingsResponse { data: Listing[]; total: number; page: number; limit: number; }
interface ReportsResponse  { items?: Report[]; data?: Report[]; total: number; }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LISTING_STATUSES = ['', 'pending', 'approved', 'rejected', 'expired', 'draft', 'sold'] as const;
const LISTING_TYPES    = ['', 'standard', 'featured', 'sponsored', 'premium'] as const;
const PAGE_SIZE = 25;

function fmtUsd(cents: number | string | null | undefined) {
  return `$${(Number(cents ?? 0) / 100).toFixed(2)}`;
}

function listingStatusColor(s: string): string {
  switch (s) {
    case 'pending':  return 'bg-yellow-100 text-yellow-800';
    case 'approved': return 'bg-green-100 text-green-800';
    case 'rejected': return 'bg-red-100 text-red-800';
    case 'expired':  return 'bg-gray-100 text-gray-500';
    case 'sold':     return 'bg-blue-100 text-blue-800';
    default:         return 'bg-gray-100 text-gray-600';
  }
}

function listingTypeColor(t: string): string {
  switch (t) {
    case 'featured':  return 'bg-blue-100 text-blue-800';
    case 'sponsored': return 'bg-purple-100 text-purple-800';
    case 'premium':   return 'bg-amber-100 text-amber-800';
    default:          return 'bg-gray-100 text-gray-500';
  }
}

// ---------------------------------------------------------------------------
// Generic modal wrapper
// ---------------------------------------------------------------------------

function Modal({
  title, onClose, children, wide,
}: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className={`bg-white rounded shadow-lg p-5 w-full ${wide ? 'max-w-lg' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-semibold mb-4">{title}</div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action modals
// ---------------------------------------------------------------------------

function RejectModal({ listingId, onClose }: { listingId: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const qc = useQueryClient();
  const reject = useMutation({
    mutationFn: () =>
      api<void>(`/v1/admin/marketplace/listings/${listingId}/reject`, { method: 'POST', body: { reason } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-marketplace-listings'] }); onClose(); },
    onError: (e: any) => alert('Rejection failed: ' + (e?.message ?? 'unknown')),
  });
  return (
    <Modal title="Reject listing" onClose={onClose}>
      <p className="text-xs text-muted mb-3">Provide a reason — it will be sent to the listing owner.</p>
      <textarea
        value={reason} onChange={(e) => setReason(e.target.value)} rows={4}
        placeholder="Reason for rejection…"
        className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm resize-none mb-4"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 text-sm border border-border rounded">Cancel</button>
        <button
          onClick={() => reject.mutate()} disabled={!reason.trim() || reject.isPending}
          className="px-3 py-1.5 text-sm bg-danger text-white rounded disabled:opacity-50"
        >
          {reject.isPending ? 'Rejecting…' : 'Confirm reject'}
        </button>
      </div>
    </Modal>
  );
}

function MessageModal({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [notes, setNotes]     = useState(listing.admin_notes ?? '');
  const qc = useQueryClient();
  const send = useMutation({
    mutationFn: () =>
      api<void>(`/v1/admin/marketplace/listings/${listing.id}/message`, {
        method: 'POST', body: { message, admin_notes: notes || undefined },
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-marketplace-listings'] }); onClose(); },
    onError: (e: any) => alert('Send failed: ' + (e?.message ?? 'unknown')),
  });
  return (
    <Modal title={`Message owner of "${listing.title.slice(0, 40)}"`} onClose={onClose}>
      <p className="text-xs text-muted mb-1">
        {listing.contact_email
          ? `Will be sent to ${listing.contact_email} and as a push notification.`
          : 'Sent as a push notification (no email on file).'}
      </p>
      <textarea
        value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
        placeholder="Message to listing owner…"
        className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm resize-none mb-3 mt-2"
      />
      <label className="block text-xs text-muted mb-1">Internal admin notes (not sent to user)</label>
      <textarea
        value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
        placeholder="Internal notes…"
        className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm resize-none mb-4"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 text-sm border border-border rounded">Cancel</button>
        <button
          onClick={() => send.mutate()} disabled={!message.trim() || send.isPending}
          className="px-3 py-1.5 text-sm bg-accent text-white rounded disabled:opacity-50"
        >
          {send.isPending ? 'Sending…' : 'Send message'}
        </button>
      </div>
    </Modal>
  );
}

function EditModal({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const [title, setTitle]      = useState(listing.title);
  const [description, setDesc] = useState(listing.description ?? '');
  const [status, setStatus]    = useState(listing.status);
  const [adminNotes, setNotes] = useState(listing.admin_notes ?? '');
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: () =>
      api<void>(`/v1/admin/marketplace/listings/${listing.id}`, {
        method: 'PATCH',
        body: { title, description: description || undefined, status, admin_notes: adminNotes || undefined },
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-marketplace-listings'] }); onClose(); },
    onError: (e: any) => alert('Update failed: ' + (e?.message ?? 'unknown')),
  });
  return (
    <Modal title="Edit listing" onClose={onClose} wide>
      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-xs text-muted mb-1">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-1.5 bg-white text-ink border border-border rounded text-sm" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDesc(e.target.value)} rows={3}
            className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm resize-none" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as Listing['status'])}
            className="w-full px-3 py-1.5 bg-white text-ink border border-border rounded text-sm">
            {LISTING_STATUSES.filter(Boolean).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Admin notes (internal)</label>
          <textarea value={adminNotes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm resize-none" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 text-sm border border-border rounded">Cancel</button>
        <button
          onClick={() => update.mutate()} disabled={!title.trim() || update.isPending}
          className="px-3 py-1.5 text-sm bg-accent text-white rounded disabled:opacity-50"
        >
          {update.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </Modal>
  );
}

function DeleteModal({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => api<void>(`/v1/admin/marketplace/listings/${listing.id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-marketplace-listings'] }); onClose(); },
    onError: (e: any) => alert('Delete failed: ' + (e?.message ?? 'unknown')),
  });
  return (
    <Modal title="Delete listing?" onClose={onClose}>
      <p className="text-sm text-muted mb-4">
        Permanently delete <span className="font-medium text-ink">"{listing.title}"</span>? This cannot be undone.
      </p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 text-sm border border-border rounded">Cancel</button>
        <button
          onClick={() => del.mutate()} disabled={del.isPending}
          className="px-3 py-1.5 text-sm bg-danger text-white rounded disabled:opacity-50"
        >
          {del.isPending ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Listing detail side panel
// ---------------------------------------------------------------------------

function DetailPanel({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white border-l border-border shadow-xl z-40 flex flex-col overflow-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-ink truncate max-w-xs">{listing.title}</h2>
        <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none px-1">&times;</button>
      </div>
      <div className="p-4 space-y-4 text-sm flex-1">
        <div className="flex gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full text-xs ${listingStatusColor(listing.status)}`}>{listing.status}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${listingTypeColor(listing.listing_type)}`}>{listing.listing_type}</span>
          {listing.listing_fee_paid && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">
              Fee paid {fmtUsd(listing.listing_fee_cents)}
            </span>
          )}
        </div>

        {listing.description && (
          <div>
            <div className="text-xs text-muted mb-1">Description</div>
            <p className="text-xs leading-relaxed">{listing.description}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div><span className="text-muted">Price</span><br />{listing.price_cents ? fmtUsd(listing.price_cents) : 'Not set'}</div>
          <div><span className="text-muted">Category</span><br />{listing.category_name ?? '—'}</div>
          <div><span className="text-muted">Views</span><br />{listing.view_count}</div>
          <div><span className="text-muted">Contacts</span><br />{listing.contact_count}</div>
          <div><span className="text-muted">Created</span><br />{new Date(listing.created_at).toLocaleString()}</div>
          {listing.approved_at && <div><span className="text-muted">Approved</span><br />{new Date(listing.approved_at).toLocaleString()}</div>}
          {listing.expires_at && <div><span className="text-muted">Expires</span><br />{new Date(listing.expires_at).toLocaleString()}</div>}
        </div>

        {(listing.contact_phone || listing.contact_email) && (
          <div>
            <div className="text-xs text-muted mb-1">Contact info</div>
            <div className="text-xs space-y-0.5">
              {listing.contact_phone && <div>{listing.contact_phone}</div>}
              {listing.contact_email && <a href={`mailto:${listing.contact_email}`} className="text-accent underline">{listing.contact_email}</a>}
            </div>
          </div>
        )}

        {listing.location_address && (
          <div>
            <div className="text-xs text-muted mb-1">Location</div>
            <div className="text-xs">{listing.location_address}</div>
          </div>
        )}

        {listing.rejection_reason && (
          <div className="bg-danger/5 border border-danger/20 rounded p-3">
            <div className="text-xs text-danger font-medium mb-1">Rejection reason</div>
            <div className="text-xs">{listing.rejection_reason}</div>
          </div>
        )}

        {listing.admin_notes && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
            <div className="text-xs text-yellow-700 font-medium mb-1">Admin notes</div>
            <div className="text-xs">{listing.admin_notes}</div>
          </div>
        )}

        <div>
          <div className="text-xs text-muted mb-1">Owner user ID</div>
          <div className="font-mono text-xs text-muted break-all">{listing.user_id}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Revenue tab
// ---------------------------------------------------------------------------

const TIER_COLORS: Record<string, string> = {
  featured:  'bg-blue-100 text-blue-800',
  sponsored: 'bg-purple-100 text-purple-800',
  premium:   'bg-amber-100 text-amber-800',
  standard:  'bg-gray-100 text-gray-600',
};

function KpiCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="bg-white border border-border rounded p-3">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className={`text-lg font-semibold ${accent ? 'text-accent' : 'text-ink'}`}>{value}</div>
    </div>
  );
}

function RevenueTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['marketplace-revenue'],
    queryFn: () => api<RevenueSummary>('/v1/admin/marketplace/revenue'),
    refetchInterval: 60_000,
  });

  const totals  = data?.totals;
  const byType  = data?.by_type ?? [];
  const timeline = data?.timeline ?? [];
  const totalCents = Number(totals?.total_revenue_cents ?? 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total listing fee revenue" value={isLoading ? '…' : fmtUsd(totalCents)} accent />
        <KpiCard label="Paid listings" value={isLoading ? '…' : String(totals?.total_paid_listings ?? 0)} />
        <KpiCard label="Active listings" value={isLoading ? '…' : String(totals?.active_listings ?? 0)} />
        <KpiCard label="Pending review" value={isLoading ? '…' : String(totals?.pending_listings ?? 0)} />
      </div>

      <div className="bg-white border border-border rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-medium">Revenue by listing type</div>
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-xs">
            <tr>
              <th className="text-left px-4 py-2">Type</th>
              <th className="text-right px-4 py-2">Paid listings</th>
              <th className="text-right px-4 py-2">Fee each</th>
              <th className="text-right px-4 py-2">Total revenue</th>
              <th className="text-right px-4 py-2">% of total</th>
            </tr>
          </thead>
          <tbody>
            {byType.length === 0
              ? <tr><td colSpan={5} className="px-4 py-6 text-center text-muted text-xs">No paid listings yet.</td></tr>
              : byType.map((row) => {
                  const pct = totalCents > 0 ? ((Number(row.total_fee_cents) / totalCents) * 100).toFixed(1) : '0.0';
                  const feeEach = row.count > 0 ? Number(row.total_fee_cents) / row.count : 0;
                  return (
                    <tr key={row.listing_type} className="border-t border-border hover:bg-surface">
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${TIER_COLORS[row.listing_type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {row.listing_type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-xs">{row.count}</td>
                      <td className="px-4 py-2 text-right text-xs">{fmtUsd(feeEach)}</td>
                      <td className="px-4 py-2 text-right text-xs font-medium">{fmtUsd(row.total_fee_cents)}</td>
                      <td className="px-4 py-2 text-right text-xs text-muted">{pct}%</td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {timeline.length > 0 && (
        <div className="bg-white border border-border rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-sm font-medium">Daily revenue (last 30 days)</div>
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted text-xs">
              <tr>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-right px-4 py-2">New paid listings</th>
                <th className="text-right px-4 py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((row) => (
                <tr key={row.date} className="border-t border-border hover:bg-surface">
                  <td className="px-4 py-2 text-xs">{new Date(row.date).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right text-xs">{row.count}</td>
                  <td className="px-4 py-2 text-right text-xs font-medium">{fmtUsd(row.revenue_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Listings tab
// ---------------------------------------------------------------------------

function ListingsTab() {
  const [status,      setStatus]      = useState('');
  const [type,        setType]        = useState('');
  const [search,      setSearch]      = useState('');
  const [page,        setPage]        = useState(1);
  const [selected,    setSelected]    = useState<Listing | null>(null);
  const [rejectId,    setRejectId]    = useState<string | null>(null);
  const [msgListing,  setMsgListing]  = useState<Listing | null>(null);
  const [editListing, setEditListing] = useState<Listing | null>(null);
  const [delListing,  setDelListing]  = useState<Listing | null>(null);

  const debounced = useDebounced(search, 300);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-marketplace-listings', status, type, debounced, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (status)    params.set('status', status);
      if (type)      params.set('type', type);
      if (debounced) params.set('q', debounced);
      return api<ListingsResponse>(`/v1/admin/listings?${params.toString()}`);
    },
  });

  const approve = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/v1/admin/marketplace/listings/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-marketplace-listings'] }),
    onError: (e: any) => alert('Approval failed: ' + (e?.message ?? 'unknown')),
  });

  const items = data?.data ?? [];
  const total = data?.total ?? items.length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search listings…"
          className="min-w-[200px] max-w-xs px-3 py-1.5 bg-white text-ink border border-border rounded text-sm"
        />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-1.5 text-xs bg-white text-ink border border-border rounded">
          {LISTING_STATUSES.map((s) => <option key={s || 'all'} value={s}>{s || 'all statuses'}</option>)}
        </select>
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="px-3 py-1.5 text-xs bg-white text-ink border border-border rounded">
          {LISTING_TYPES.map((t) => <option key={t || 'all'} value={t}>{t || 'all types'}</option>)}
        </select>
        <span className="ml-auto text-xs text-muted">{total} listing{total !== 1 ? 's' : ''}</span>
      </div>

      <div className="bg-white border border-border rounded overflow-x-auto">
        <table className="w-full text-sm min-w-[920px]">
          <thead className="bg-surface text-muted text-xs select-none">
            <tr>
              <th className="text-left px-3 py-2">Title</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Fee</th>
              <th className="text-right px-3 py-2">Price</th>
              <th className="text-left px-3 py-2">Created</th>
              <th className="text-left px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-border">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-3 py-2"><div className="h-3 bg-surface animate-pulse rounded w-3/4" /></td>
                    ))}
                  </tr>
                ))
              : items.length === 0
              ? <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">No listings match.</td></tr>
              : items.map((l) => (
                  <tr
                    key={l.id}
                    className="border-t border-border hover:bg-surface cursor-pointer"
                    onClick={() => setSelected(l)}
                  >
                    <td className="px-3 py-2 text-xs max-w-[220px]">
                      <div className="truncate font-medium">{l.title}</div>
                      {l.category_name && <div className="text-muted text-[11px]">{l.category_name}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                      <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${listingTypeColor(l.listing_type)}`}>
                        {l.listing_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${listingStatusColor(l.status)}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                      {l.listing_fee_cents > 0 ? (
                        <span className={`text-[11px] px-1.5 py-0.5 rounded ${l.listing_fee_paid ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                          {fmtUsd(l.listing_fee_cents)}{l.listing_fee_paid ? ' ✓' : ' unpaid'}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted">free</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-xs" onClick={(e) => e.stopPropagation()}>
                      {l.price_cents ? fmtUsd(l.price_cents) : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {new Date(l.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1 flex-wrap">
                        {l.status === 'pending' && (
                          <button
                            onClick={() => approve.mutate(l.id)} disabled={approve.isPending}
                            className="px-2 py-1 text-[11px] bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >Approve</button>
                        )}
                        {l.status !== 'rejected' && l.status !== 'expired' && (
                          <button
                            onClick={() => setRejectId(l.id)}
                            className="px-2 py-1 text-[11px] bg-danger text-white rounded hover:opacity-80"
                          >Reject</button>
                        )}
                        <button
                          onClick={() => setMsgListing(l)}
                          className="px-2 py-1 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700"
                        >Msg</button>
                        <button
                          onClick={() => setEditListing(l)}
                          className="px-2 py-1 text-[11px] border border-border rounded hover:bg-surface"
                        >Edit</button>
                        <button
                          onClick={() => setDelListing(l)}
                          className="px-2 py-1 text-[11px] text-danger border border-danger/30 rounded hover:bg-danger/5"
                        >Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

      {selected    && <DetailPanel listing={selected} onClose={() => setSelected(null)} />}
      {rejectId    && <RejectModal listingId={rejectId} onClose={() => setRejectId(null)} />}
      {msgListing  && <MessageModal listing={msgListing} onClose={() => setMsgListing(null)} />}
      {editListing && <EditModal listing={editListing} onClose={() => setEditListing(null)} />}
      {delListing  && <DeleteModal listing={delListing} onClose={() => setDelListing(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Reports tab
// ---------------------------------------------------------------------------

function ReportsTab() {
  const [page, setPage] = useState(1);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-marketplace-reports', page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      return api<ReportsResponse>(`/v1/admin/listings/reports?${params.toString()}`);
    },
  });

  const resolve = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/v1/admin/marketplace/reports/${id}/resolve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-marketplace-reports'] }),
    onError: (e: any) => alert('Failed to resolve: ' + (e?.message ?? 'unknown')),
  });

  const items: Report[] = (data?.items ?? data?.data ?? []) as Report[];
  const total = data?.total ?? items.length;

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted">{total} report{total !== 1 ? 's' : ''}</span>
      </div>
      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-xs select-none">
            <tr>
              <th className="text-left px-3 py-2">Listing</th>
              <th className="text-left px-3 py-2">Reporter</th>
              <th className="text-left px-3 py-2">Reason</th>
              <th className="text-left px-3 py-2">Details</th>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-t border-border">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-3 py-2"><div className="h-3 bg-surface animate-pulse rounded w-3/4" /></td>
                    ))}
                  </tr>
                ))
              : items.length === 0
              ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted">No reports found.</td></tr>
              : items.map((r) => (
                  <tr key={r.id} className={`border-t border-border ${r.resolved ? 'opacity-50' : 'hover:bg-surface'}`}>
                    <td className="px-3 py-2 text-xs max-w-[160px] truncate">{r.listing_title}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted">{r.reporter_id.slice(0, 8)}</td>
                    <td className="px-3 py-2 text-xs max-w-[160px] truncate">{r.reason}</td>
                    <td className="px-3 py-2 text-xs max-w-[160px] truncate text-muted">{r.details ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.resolved
                        ? <span className="text-muted italic">Resolved</span>
                        : (
                          <button
                            onClick={() => resolve.mutate(r.id)} disabled={resolve.isPending}
                            className="px-2 py-1 text-xs border border-border rounded hover:bg-surface disabled:opacity-50"
                          >Mark resolved</button>
                        )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Revenue banner (always visible at top)
// ---------------------------------------------------------------------------

function RevenueBanner() {
  const { data } = useQuery({
    queryKey: ['marketplace-revenue'],
    queryFn: () => api<RevenueSummary>('/v1/admin/marketplace/revenue'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const t = data?.totals;
  if (!t) return null;
  return (
    <div className="flex flex-wrap gap-4 mb-4 px-3 py-2 bg-surface border border-border rounded text-xs">
      <span className="text-muted">
        Listing fee revenue: <span className="font-semibold text-ink">{fmtUsd(Number(t.total_revenue_cents ?? 0))}</span>
      </span>
      <span className="text-muted">
        Paid listings: <span className="font-semibold text-ink">{t.total_paid_listings ?? 0}</span>
      </span>
      <span className="text-muted">
        Active: <span className="font-semibold text-ink">{t.active_listings ?? 0}</span>
      </span>
      <span className="text-muted">
        Pending review:{' '}
        <span className={`font-semibold ${(t.pending_listings ?? 0) > 0 ? 'text-yellow-700' : 'text-ink'}`}>
          {t.pending_listings ?? 0}
        </span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type Tab = 'listings' | 'revenue' | 'reports';

export function MarketplacePage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('listings');

  return (
    <>
      <PageHeader title="Marketplace" subtitle="Moderate listings, manage fees, and track ad revenue." />

      <RevenueBanner />

      <div className="flex gap-1 border-b border-border mb-4">
        {(['listings', 'revenue', 'reports'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              activeTab === tab
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'listings' && <ListingsTab />}
      {activeTab === 'revenue'  && <RevenueTab />}
      {activeTab === 'reports'  && <ReportsTab />}
    </>
  );
}
