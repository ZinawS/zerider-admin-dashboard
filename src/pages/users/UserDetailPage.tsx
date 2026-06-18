import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

// import.meta.env may not be typed in some TS configs; cast to any to avoid errors
const API_URL =
  ((import.meta as any).env?.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';

function docFileUrl(doc: { id: string; storage_url?: string | null; file_url?: string | null }, download = false): string {
  const storageUrl = doc.storage_url || doc.file_url || '';
  if (/^https?:\/\//.test(storageUrl)) return storageUrl;
  const base = `${API_URL}/v1/admin/users/documents/${doc.id}/file`;
  return download ? `${base}?download=true` : base;
}

interface UserDetail {
  id: string;
  roles: string[];
  rider: any;
  driver: any;
  vehicles: any[];
  documents: any[];
}
interface TripRow {
  id: string;
  status: string;
  fare_final_cents: number | null;
  fare_estimate_cents: number | null;
  tip_amount_cents: number;
  pickup_address: string;
  dropoff_address: string;
  created_at: string;
  role: 'rider' | 'driver';
}
type Tab = 'overview' | 'trips' | 'payments' | 'vehicles' | 'documents';

function fmtUsd(cents: number | null | undefined) {
  return `$${(Number(cents ?? 0) / 100).toFixed(2)}`;
}

export function UserDetailPage(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) => setSearchParams({ tab: t });
  const [editing, setEditing] = useState(false);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['admin-user', id],
    queryFn: () => api<UserDetail>(`/v1/admin/users/${id}`),
    enabled: !!id,
  });

  const { data: tripsData } = useQuery({
    queryKey: ['admin-user-trips', id],
    queryFn: () =>
      api<{ items: TripRow[]; total: number }>(`/v1/admin/users/${id}/trips?limit=500`),
    enabled: !!id,
  });

  const { data: deliveriesData } = useQuery({
    queryKey: ['admin-user-deliveries', id],
    queryFn: () =>
      api<{ items: any[]; total: number; has_more: boolean }>(
        `/v1/deliveries/admin/all?q=${id}&limit=500`,
      ),
    enabled: !!id,
  });

  const suspendMutation = useMutation({
    mutationFn: () =>
      api(`/v1/admin/users/${id}/suspend`, { method: 'POST', body: { reason: 'admin action' } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-user', id] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
  const unsuspendMutation = useMutation({
    mutationFn: () => api(`/v1/admin/users/${id}/unsuspend`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-user', id] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const stats = useMemo(() => {
    const trips = tripsData?.items ?? [];
    const asRider = trips.filter((t) => t.role === 'rider');
    const asDriver = trips.filter((t) => t.role === 'driver');
    const completedRider = asRider.filter((t) => t.status === 'completed');
    const cancelledRider = asRider.filter((t) => t.status.startsWith('cancelled'));
    const completedDriver = asDriver.filter((t) => t.status === 'completed');
    const sumCents = (arr: TripRow[], key: 'fare_final_cents' | 'tip_amount_cents') =>
      arr.reduce((sum, t) => sum + Number(t[key] ?? 0), 0);
    return {
      riderCompleted: completedRider.length,
      riderCancelled: cancelledRider.length,
      riderTotalSpent: sumCents(completedRider, 'fare_final_cents'),
      riderTipsGiven: sumCents(completedRider, 'tip_amount_cents'),
      driverCompleted: completedDriver.length,
      driverCancelled: asDriver.filter((t) => t.status.startsWith('cancelled')).length,
    };
  }, [tripsData]);

  const deliveryStats = useMemo(() => {
    const items = deliveriesData?.items ?? [];
    const asRequester = items.filter((d) => d.requester_id === id);
    const asDriver = items.filter((d) => d.driver_id === id);
    const requesterCompleted = asRequester.filter((d) => d.status === 'delivered');
    const driverCompleted = asDriver.filter((d) => d.status === 'delivered');
    return {
      requesterTotal: asRequester.length,
      requesterCompleted: requesterCompleted.length,
      requesterCancelled: asRequester.filter((d) => d.status === 'cancelled' || d.status === 'failed').length,
      requesterSpentCents: requesterCompleted.reduce((sum: number, d: any) => sum + Number(d.total_cents ?? d.fare_cents ?? 0), 0),
      driverTotal: asDriver.length,
      driverCompleted: driverCompleted.length,
      driverRevenueCents: driverCompleted.reduce((sum: number, d: any) => sum + Number(d.total_cents ?? d.fare_cents ?? 0), 0),
    };
  }, [deliveriesData, id]);

  if (isLoading) return <div className="text-muted">Loading…</div>;
  if (!detail) return <div className="text-danger">User not found.</div>;

  const primary = detail.driver ?? detail.rider;
  const name = [primary?.first_name, primary?.last_name].filter(Boolean).join(' ') || '(unnamed)';
  const isSuspended =
    detail.driver?.status === 'suspended' ||
    detail.driver?.auth_status === 'suspended' ||
    detail.rider?.status === 'suspended';
  const tabs: Tab[] = detail.driver
    ? ['overview', 'trips', 'payments', 'vehicles', 'documents']
    : ['overview', 'trips', 'payments'];

  return (
    <div>
      <button onClick={() => navigate(-1)} className="text-sm text-muted hover:text-ink mb-3">
        ← Back
      </button>
      <div className="bg-white border border-border rounded p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-2xl font-semibold text-ink">{name}</div>
            <div className="text-sm text-muted mt-1 space-x-3">
              <span>{primary?.phone_number ?? '—'}</span>
              <span>·</span>
              <span>{primary?.email ?? '—'}</span>
            </div>
            <div className="mt-2 flex gap-1.5 flex-wrap">
              {detail.roles.map((r) => (
                <span
                  key={r}
                  className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full capitalize"
                >
                  {r}
                </span>
              ))}
              {detail.driver?.status && (
                <span
                  className={
                    'text-xs px-2 py-0.5 rounded-full capitalize ' +
                    (detail.driver.status === 'approved'
                      ? 'bg-success/10 text-success'
                      : detail.driver.status === 'suspended'
                        ? 'bg-danger/10 text-danger'
                        : 'bg-yellow-100 text-yellow-800')
                  }
                >
                  {detail.driver.status}
                </span>
              )}
              {detail.rider?.status && !detail.driver && (
                <span
                  className={
                    'text-xs px-2 py-0.5 rounded-full capitalize ' +
                    (detail.rider.status === 'active'
                      ? 'bg-success/10 text-success'
                      : 'bg-danger/10 text-danger')
                  }
                >
                  {detail.rider.status}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 text-sm border border-border rounded hover:bg-surface"
            >
              Edit
            </button>
            {isSuspended ? (
              <button
                onClick={() => unsuspendMutation.mutate()}
                disabled={unsuspendMutation.isPending}
                className="px-3 py-1.5 text-sm bg-success text-white rounded disabled:opacity-50"
              >
                Unsuspend
              </button>
            ) : (
              <button
                onClick={() => {
                  if (confirm(`Suspend ${name}?`)) suspendMutation.mutate();
                }}
                disabled={suspendMutation.isPending}
                className="px-3 py-1.5 text-sm bg-danger text-white rounded disabled:opacity-50"
              >
                Suspend
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-1 border-b border-border mb-4">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              'px-4 py-2 capitalize text-sm font-medium border-b-2 transition ' +
              (tab === t
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-ink')
            }
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'overview' && <OverviewTab detail={detail} stats={stats} deliveryStats={deliveryStats} />}
      {tab === 'trips' && <TripsTab userId={id} />}
      {tab === 'payments' && <PaymentsTab userId={id} />}
      {tab === 'vehicles' && detail.driver && <VehiclesTab vehicles={detail.vehicles} />}
      {tab === 'documents' && detail.driver && (
        <DocumentsTab documents={detail.documents} userId={id} />
      )}
      {editing && (
        <EditProfileModal
          detail={detail}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            qc.invalidateQueries({ queryKey: ['admin-user', id] });
            qc.invalidateQueries({ queryKey: ['admin-users'] });
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: any; sub?: string }) {
  return (
    <div className="bg-white border border-border rounded p-4">
      <div className="text-xs uppercase text-muted">{label}</div>
      <div className="text-xl font-semibold text-ink mt-1">{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function OverviewTab({ detail, stats, deliveryStats }: { detail: UserDetail; stats: any; deliveryStats: any }) {
  const d = detail.driver;
  const r = detail.rider;
  return (
    <div className="space-y-6">
      {d && (
        <div>
          <div className="text-xs uppercase text-muted mb-2">Driver — Ride Sharing</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Trips Completed" value={d.total_trips ?? stats.driverCompleted} />
            <StatCard label="Trips Cancelled" value={stats.driverCancelled} />
            <StatCard label="Lifetime Earnings" value={fmtUsd(d.total_earnings_cents)} />
            <StatCard label="Tips Received" value={fmtUsd(d.total_tips_cents)} />
            <StatCard
              label="Rating"
              value={d.rating_count > 0 ? `★ ${Number(d.rating_avg).toFixed(2)}` : '—'}
              sub={d.rating_count > 0 ? `${d.rating_count} ratings` : undefined}
            />
            <StatCard label="Wallet" value={fmtUsd(d.wallet_balance_cents)} />
            <StatCard label="Joined" value={new Date(d.created_at).toLocaleDateString()} />
          </div>
          {(deliveryStats.driverTotal > 0) && (
            <div className="mt-4">
              <div className="text-xs uppercase text-muted mb-2">Driver — Deliveries</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Deliveries Assigned" value={deliveryStats.driverTotal} />
                <StatCard label="Deliveries Completed" value={deliveryStats.driverCompleted} />
                <StatCard label="Delivery Revenue" value={fmtUsd(deliveryStats.driverRevenueCents)} />
                <StatCard
                  label="Delivery Completion"
                  value={deliveryStats.driverTotal ? `${((deliveryStats.driverCompleted / deliveryStats.driverTotal) * 100).toFixed(0)}%` : '—'}
                />
              </div>
            </div>
          )}
        </div>
      )}
      {r && (
        <div>
          <div className="text-xs uppercase text-muted mb-2">Rider — Ride Sharing</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Trips Completed" value={stats.riderCompleted} />
            <StatCard label="Trips Cancelled" value={stats.riderCancelled} />
            <StatCard label="Total Spent" value={fmtUsd(stats.riderTotalSpent)} />
            <StatCard label="Tips Given" value={fmtUsd(stats.riderTipsGiven)} />
            <StatCard label="Wallet" value={fmtUsd(r.wallet_balance_cents)} />
            <StatCard label="Joined" value={new Date(r.created_at).toLocaleDateString()} />
          </div>
          {(deliveryStats.requesterTotal > 0) && (
            <div className="mt-4">
              <div className="text-xs uppercase text-muted mb-2">Rider — Deliveries</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Deliveries Requested" value={deliveryStats.requesterTotal} />
                <StatCard label="Deliveries Completed" value={deliveryStats.requesterCompleted} />
                <StatCard label="Deliveries Cancelled" value={deliveryStats.requesterCancelled} />
                <StatCard label="Delivery Spend" value={fmtUsd(deliveryStats.requesterSpentCents)} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TripsTab({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-user-trips-tab', userId],
    queryFn: () =>
      api<{ items: TripRow[]; total: number }>(`/v1/admin/users/${userId}/trips?limit=50`),
  });
  if (isLoading) return <div className="text-muted">Loading trips…</div>;
  const items = data?.items ?? [];
  if (!items.length) return <div className="text-muted">No trips yet.</div>;
  return (
    <div className="bg-white border border-border rounded overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface text-muted text-xs uppercase">
          <tr>
            <th className="text-left px-3 py-2">Date</th>
            <th className="text-left px-3 py-2">Pickup → Dropoff</th>
            <th className="text-left px-3 py-2">As</th>
            <th className="text-left px-3 py-2">Status</th>
            <th className="text-right px-3 py-2">Fare</th>
            <th className="text-right px-3 py-2">Tip</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr
              key={t.id}
              onClick={() => navigate(`/rides/${t.id}`)}
              className="border-t border-border hover:bg-surface cursor-pointer"
            >
              <td className="px-3 py-2 text-muted text-xs">
                {new Date(t.created_at).toLocaleString()}
              </td>
              <td className="px-3 py-2 text-ink text-xs truncate max-w-md">
                {(t.pickup_address || '—').split(',')[0]} →{' '}
                {(t.dropoff_address || '—').split(',')[0]}
              </td>
              <td className="px-3 py-2 capitalize text-xs">{t.role}</td>
              <td className="px-3 py-2 text-xs">
                <span
                  className={
                    'px-2 py-0.5 rounded-full ' +
                    (t.status === 'completed'
                      ? 'bg-success/10 text-success'
                      : t.status.startsWith('cancelled')
                        ? 'bg-danger/10 text-danger'
                        : 'bg-yellow-100 text-yellow-800')
                  }
                >
                  {t.status}
                </span>
              </td>
              <td className="px-3 py-2 text-right">
                {fmtUsd(t.fare_final_cents ?? t.fare_estimate_cents)}
              </td>
              <td className="px-3 py-2 text-right text-muted">{fmtUsd(t.tip_amount_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentsTab({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-user-payments', userId],
    queryFn: () =>
      api<{ items: any[]; total: number }>(`/v1/admin/payments?userId=${userId}&limit=50`),
  });
  if (isLoading) return <div className="text-muted">Loading payments…</div>;
  const items = data?.items ?? [];
  if (!items.length) return <div className="text-muted">No payment activity yet.</div>;
  return (
    <div className="bg-white border border-border rounded overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface text-muted text-xs uppercase">
          <tr>
            <th className="text-left px-3 py-2">Date</th>
            <th className="text-left px-3 py-2">Type</th>
            <th className="text-right px-3 py-2">Amount</th>
            <th className="text-left px-3 py-2">Reference</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id} className="border-t border-border">
              <td className="px-3 py-2 text-muted text-xs">
                {new Date(t.created_at).toLocaleString()}
              </td>
              <td className="px-3 py-2 capitalize">
                <span
                  className={
                    'px-2 py-0.5 rounded-full text-xs ' +
                    (t.type === 'deposit' || t.type === 'refund'
                      ? 'bg-success/10 text-success'
                      : 'bg-yellow-100 text-yellow-800')
                  }
                >
                  {t.type}
                </span>
              </td>
              <td className="px-3 py-2 text-right text-ink">{fmtUsd(t.amount_cents)}</td>
              <td className="px-3 py-2 text-muted text-xs">{t.reference_id ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VehiclesTab({ vehicles }: { vehicles: any[] }) {
  if (!vehicles?.length) return <div className="text-muted">No vehicles registered.</div>;
  return (
    <div className="space-y-2">
      {vehicles.map((v) => (
        <div
          key={v.id}
          className="bg-white border border-border rounded p-3 flex items-center justify-between"
        >
          <div>
            <div className="text-ink font-medium">
              {v.year} {v.make} {v.model}
            </div>
            <div className="text-xs text-muted">
              {v.color ?? ''} {v.plate ? `· ${v.plate}` : ''} {v.category ? `· ${v.category}` : ''}
            </div>
          </div>
          <span
            className={
              'text-xs px-2 py-0.5 rounded-full ' +
              (v.is_active ? 'bg-success/10 text-success' : 'bg-surface text-muted')
            }
          >
            {v.is_active ? 'active' : 'inactive'}
          </span>
        </div>
      ))}
    </div>
  );
}

function DocumentsTab({ documents, userId }: { documents: any[]; userId: string }) {
  const qc = useQueryClient();
  const [docViewer, setDocViewer] = useState<{ url: string; type: string } | null>(null);
  const updateStatus = useMutation({
    mutationFn: ({ docId, status }: { docId: string; status: string }) =>
      api(`/v1/admin/users/documents/${docId}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-user', userId] }),
  });
  if (!documents?.length) return <div className="text-muted">No documents uploaded.</div>;
  return (
    <>
      <div className="space-y-2">
        {documents.map((d) => {
          const storageUrl = d.storage_url || d.file_url || '';
          const isPdf = /\.pdf$/i.test(storageUrl);
          return (
            <div
              key={d.id}
              className="bg-white border border-border rounded p-3 flex items-center justify-between"
            >
              <div>
                <div className="text-ink font-medium capitalize">
                  {d.document_type?.replace(/_/g, ' ')}
                </div>
                <div className="text-xs text-muted">Status: {d.status}</div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() =>
                    setDocViewer({ url: docFileUrl(d), type: isPdf ? 'pdf' : 'image' })
                  }
                  className="px-2 py-1 text-xs bg-white border border-border rounded hover:bg-gray-100 text-ink"
                >
                  View
                </button>
                <button
                  onClick={async () => {
                    if (/^https?:\/\//.test(storageUrl)) { window.open(storageUrl, '_blank'); return; }
                    try {
                      const { useAuthStore } = await import('../../stores/auth.store.js');
                      const { accessToken } = useAuthStore.getState();
                      const res = await fetch(docFileUrl(d, true), {
                        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
                      });
                      if (!res.ok) throw new Error('Download failed');
                      const blob = await res.blob();
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = d.document_type || 'document';
                      a.click();
                      URL.revokeObjectURL(a.href);
                    } catch {
                      /* silent */
                    }
                  }}
                  className="px-2 py-1 text-xs bg-white border border-border rounded hover:bg-gray-100 text-ink"
                >
                  Download
                </button>
                <button
                  disabled={updateStatus.isPending}
                  onClick={() => updateStatus.mutate({ docId: d.id, status: 'approved' })}
                  className="px-2 py-1 text-xs bg-success text-white rounded disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  disabled={updateStatus.isPending}
                  onClick={() => updateStatus.mutate({ docId: d.id, status: 'rejected' })}
                  className="px-2 py-1 text-xs bg-danger text-white rounded disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {docViewer && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4"
          onClick={() => setDocViewer(null)}
        >
          <div
            className="relative bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-4 py-2 border-b border-border bg-gray-50">
              <span className="text-sm font-medium text-ink">Document Preview</span>
              <button
                onClick={() => setDocViewer(null)}
                className="text-gray-500 hover:text-black px-2 font-bold"
              >
                ✕
              </button>
            </div>
            <DocViewerContent url={docViewer.url} type={docViewer.type} />
          </div>
        </div>
      )}
    </>
  );
}

const UNSUPPORTED_MSG = 'This file format cannot be previewed in your browser. Download it to view.';

/** Fetches a document file with auth headers and renders it inline.
 *  External URLs (e.g. ngrok) are rendered directly without a fetch.
 *  HEIC/unsupported formats show a helpful fallback instead of a broken image. */
function DocViewerContent({ url, type }: { url: string; type: string }) {
  const isExternal = /^https?:\/\//.test(url) && !url.startsWith(API_URL);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isExternal) return;
    let active = true;
    setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setMimeType('');
    setError(null);
    (async () => {
      try {
        const { useAuthStore } = await import('../../stores/auth.store.js');
        const { accessToken } = useAuthStore.getState();
        const res = await fetch(url, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });
        if (!active) return;
        if (!res.ok) { setError(`HTTP ${res.status}`); return; }
        const ct = res.headers.get('content-type') ?? '';
        const mime = ct.split(';')[0].trim() || 'application/octet-stream';
        const buf = await res.arrayBuffer();
        if (!active) return;
        setMimeType(mime);
        setBlobUrl(URL.createObjectURL(new Blob([buf], { type: mime })));
      } catch {
        if (active) setError('Network error');
      }
    })();
    return () => { active = false; };
  }, [url, isExternal]);

  const unsupported = (hint?: string) => (
    <div className="flex flex-col items-center justify-center bg-gray-100 p-8 min-h-[300px] gap-2">
      <p className="text-sm font-medium text-gray-700">Preview not available</p>
      <p className="text-xs text-muted text-center max-w-xs">{hint ?? UNSUPPORTED_MSG}</p>
    </div>
  );

  // External URL — render directly
  if (isExternal) {
    if (error) return unsupported();
    if (type === 'pdf') return (
      <iframe src={url} title="Document" className="w-full"
        style={{ height: 'calc(80vh - 48px)', border: 'none' }} />
    );
    return (
      <div className="overflow-auto max-h-[80vh] flex items-center justify-center bg-gray-100 p-4">
        <img src={url} alt="Document" className="max-w-full max-h-full object-contain rounded"
          onError={() => setError('cannot load')}
          style={{ maxHeight: 'calc(80vh - 48px)' }} />
      </div>
    );
  }

  if (error) return (
    <div className="flex items-center justify-center bg-gray-100 p-8 min-h-[300px]">
      <p className="text-sm text-muted">{error === 'Network error' ? 'Document could not be loaded.' : error}</p>
    </div>
  );

  if (!blobUrl) return (
    <div className="flex items-center justify-center bg-gray-100 p-8 min-h-[300px]">
      <p className="text-sm text-muted">Loading document...</p>
    </div>
  );

  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    return unsupported('This is a HEIF/HEIC image (typically from an iPhone). Download it to view, or open it in Safari.');
  }

  if (mimeType === 'application/pdf' || type === 'pdf') return (
    <div className="overflow-auto max-h-[80vh]">
      <iframe src={blobUrl} title="Document" className="w-full"
        style={{ height: 'calc(80vh - 48px)', border: 'none' }} />
    </div>
  );

  return (
    <div className="overflow-auto max-h-[80vh] flex items-center justify-center bg-gray-100 p-4">
      <img src={blobUrl} alt="Document" className="max-w-full max-h-full object-contain rounded"
        onError={() => setError(UNSUPPORTED_MSG)}
        style={{ maxHeight: 'calc(80vh - 48px)' }} />
    </div>
  );
}

function EditProfileModal({
  detail,
  onClose,
  onSaved,
}: {
  detail: UserDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const primary = detail.driver ?? detail.rider;
  const [firstName, setFirstName] = useState(primary?.first_name ?? '');
  const [lastName, setLastName] = useState(primary?.last_name ?? '');
  const [email, setEmail] = useState(primary?.email ?? '');
  const [phone, setPhone] = useState(primary?.phone_number ?? '');

  const save = useMutation({
    mutationFn: () =>
      api(`/v1/admin/users/${detail.id}`, {
        method: 'PATCH',
        body: { first_name: firstName, last_name: lastName, email, phone_number: phone },
      }),
    onSuccess: onSaved,
  });

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded shadow-lg p-5 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-lg font-semibold mb-4">Edit profile</div>
        <div className="space-y-3">
          <Field label="First name" value={firstName} onChange={setFirstName} />
          <Field label="Last name" value={lastName} onChange={setLastName} />
          <Field label="Email" value={email} onChange={setEmail} />
          <Field label="Phone" value={phone} onChange={setPhone} />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border border-border rounded">
            Cancel
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="px-3 py-1.5 text-sm bg-accent text-white rounded disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-white text-ink border border-border rounded"
      />
    </div>
  );
}
