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
  category: string;
  type: 'standard' | 'featured' | 'sponsored' | 'premium';
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  user_id: string;
  price_cents: number | null;
  created_at: string;
}

interface Report {
  id: string;
  listing_title: string;
  reporter_id: string;
  reason: string;
  created_at: string;
  resolved: boolean;
}

interface ListingsResponse { items: Listing[]; total: number; }
interface ReportsResponse  { items: Report[];  total: number; }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LISTING_STATUSES = ['', 'pending', 'approved', 'rejected', 'expired'] as const;
const LISTING_TYPES    = ['', 'standard', 'featured', 'sponsored', 'premium'] as const;

const PAGE_SIZE = 25;

function listingStatusColor(s: string): string {
  switch (s) {
    case 'pending':  return 'bg-yellow-100 text-yellow-800';
    case 'approved': return 'bg-green-100 text-green-800';
    case 'rejected': return 'bg-red-100 text-red-800';
    case 'expired':  return 'bg-gray-100 text-gray-600';
    default:         return 'bg-gray-100 text-gray-600';
  }
}

function listingTypeColor(t: string): string {
  switch (t) {
    case 'featured':  return 'bg-blue-100 text-blue-800';
    case 'sponsored': return 'bg-purple-100 text-purple-800';
    case 'premium':   return 'bg-amber-100 text-amber-800';
    default:          return 'bg-gray-100 text-gray-600';
  }
}

function fmtUsd(cents: number | null | undefined) {
  return `$${(Number(cents ?? 0) / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Rejection modal
// ---------------------------------------------------------------------------

function RejectModal({ listingId, onClose }: { listingId: string; onClose: () => void }): JSX.Element {
  const [reason, setReason] = useState('');
  const qc = useQueryClient();

  const reject = useMutation({
    mutationFn: () =>
      api<void>(`/v1/admin/marketplace/listings/${listingId}/reject`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-marketplace-listings'] });
      onClose();
    },
    onError: (e: any) => alert('Rejection failed: ' + (e?.message ?? 'unknown error')),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded shadow-lg p-5 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-semibold mb-1">Reject listing</div>
        <div className="text-xs text-muted mb-4">Provide a reason that will be sent to the listing owner.</div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="Reason for rejection…"
          className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm resize-none mb-4"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border border-border rounded">
            Cancel
          </button>
          <button
            onClick={() => reject.mutate()}
            disabled={!reason.trim() || reject.isPending}
            className="px-3 py-1.5 text-sm bg-danger text-white rounded disabled:opacity-50"
          >
            {reject.isPending ? 'Rejecting…' : 'Confirm reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Listings tab
// ---------------------------------------------------------------------------

function ListingsTab(): JSX.Element {
  const [status, setStatus] = useState('');
  const [type,   setType]   = useState('');
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const debounced = useDebounced(search, 300);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-marketplace-listings', status, type, debounced, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (status) params.set('status', status);
      if (type)   params.set('type', type);
      if (debounced) params.set('q', debounced);
      return api<ListingsResponse>(`/v1/admin/listings?${params.toString()}`);
    },
  });

  const approve = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/v1/admin/marketplace/listings/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-marketplace-listings'] }),
    onError: (e: any) => alert('Approval failed: ' + (e?.message ?? 'unknown error')),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? items.length;

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search listings…"
          className="min-w-[200px] max-w-xs px-3 py-1.5 bg-white text-ink border border-border rounded text-sm"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-1.5 text-xs bg-white text-ink border border-border rounded"
        >
          {LISTING_STATUSES.map((s) => (
            <option key={s || 'all'} value={s}>{s || 'all statuses'}</option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="px-3 py-1.5 text-xs bg-white text-ink border border-border rounded"
        >
          {LISTING_TYPES.map((t) => (
            <option key={t || 'all'} value={t}>{t || 'all types'}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted self-center">
          {total} listing{total !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-xs select-none">
            <tr>
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-left px-3 py-2">Title</th>
              <th className="text-left px-3 py-2">Category</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">User</th>
              <th className="text-right px-3 py-2">Price</th>
              <th className="text-left px-3 py-2">Created</th>
              <th className="text-left px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-border">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <div className="h-3 bg-surface animate-pulse rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : items.length === 0
              ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted">No listings match.</td>
                </tr>
              )
              : items.map((l) => (
                  <tr key={l.id} className="border-t border-border hover:bg-surface">
                    <td className="px-3 py-2 font-mono text-xs text-muted">{l.id.slice(0, 8)}</td>
                    <td className="px-3 py-2 text-xs max-w-[180px] truncate">{l.title}</td>
                    <td className="px-3 py-2 text-xs capitalize">{l.category}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${listingTypeColor(l.type)}`}>
                        {l.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${listingStatusColor(l.status)}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted">{l.user_id.slice(0, 8)}</td>
                    <td className="px-3 py-2 text-right text-xs">{fmtUsd(l.price_cents)}</td>
                    <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex gap-1">
                        {l.status !== 'approved' && (
                          <button
                            onClick={() => approve.mutate(l.id)}
                            disabled={approve.isPending}
                            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                        {l.status !== 'rejected' && (
                          <button
                            onClick={() => setRejectId(l.id)}
                            className="px-2 py-1 text-xs bg-danger text-white rounded hover:opacity-80"
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

      {rejectId && <RejectModal listingId={rejectId} onClose={() => setRejectId(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Reports tab
// ---------------------------------------------------------------------------

function ReportsTab(): JSX.Element {
  const [page, setPage] = useState(1);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-marketplace-reports', page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      return api<ReportsResponse>(`/v1/admin/reports?${params.toString()}`);
    },
  });

  const resolve = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/v1/admin/marketplace/reports/${id}/resolve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-marketplace-reports'] }),
    onError: (e: any) => alert('Failed to resolve: ' + (e?.message ?? 'unknown error')),
  });

  const items = data?.items ?? [];
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
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-border">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <div className="h-3 bg-surface animate-pulse rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : items.length === 0
              ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted">No reports found.</td>
                </tr>
              )
              : items.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-t border-border ${r.resolved ? 'opacity-50' : 'hover:bg-surface'}`}
                  >
                    <td className="px-3 py-2 text-xs max-w-[160px] truncate">{r.listing_title}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted">{r.reporter_id.slice(0, 8)}</td>
                    <td className="px-3 py-2 text-xs max-w-[200px] truncate">{r.reason}</td>
                    <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.resolved ? (
                        <span className="text-muted italic">Resolved</span>
                      ) : (
                        <button
                          onClick={() => resolve.mutate(r.id)}
                          disabled={resolve.isPending}
                          className="px-2 py-1 text-xs border border-border rounded hover:bg-surface disabled:opacity-50"
                        >
                          Mark resolved
                        </button>
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
// Main page
// ---------------------------------------------------------------------------

type Tab = 'listings' | 'reports';

export function MarketplacePage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('listings');

  return (
    <>
      <PageHeader title="Marketplace" subtitle="Moderate listings and review reports." />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border mb-4">
        {(['listings', 'reports'] as const).map((tab) => (
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

      {activeTab === 'listings' ? <ListingsTab /> : <ReportsTab />}
    </>
  );
}
