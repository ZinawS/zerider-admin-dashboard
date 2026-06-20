import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useRegionScope } from '../../stores/region-scope.store.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Table, type Column } from '../../components/Table.js';
import { Pagination } from '../../components/Pagination.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useSort } from '../../hooks/useSort.js';
import { exportToCsv } from '../../lib/export.js';
import { useToast } from '../../components/Toast.js';

// ---------- Types ----------

interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  status: string;
  total_trips: number;
  rating_avg: string | null;
  rating_count: number;
  total_earnings_cents: string | null;
  commission_rate_bps: number;
  approved_at: string | null;
  created_at: string;
}

type StatusFilter = '' | 'pending' | 'approved' | 'rejected' | 'suspended';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  suspended: 'bg-orange-100 text-orange-800',
};

interface DriverDetails {
  driver: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone_number?: string;
    phone?: string;
    commission_rate_bps: number;
    total_trips: number;
    rating_avg: string | null;
    rating_count: number;
    total_earnings_cents: string | null;
    wallet_balance_cents: string | null;
    total_tips_cents?: string | null;
    documents?: any[];
  };
  vehicles?: Vehicle[];
  documents?: Document[];
}

interface Vehicle {
  id: string;
  license_plate: string;
  year: number;
  make: string;
  model: string;
  category: string;
  is_active: boolean;
}

interface Document {
  id: string;
  document_type: string;
  title: string | null;
  status: string;
  storage_url: string | null;
  file_url?: string | null;
  rejection_reason: string | null;
  admin_note: string | null;
  expires_on: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';

// Build a URL for serving document files. If storage_url is an external URL
// (e.g. from ngrok), return it directly; otherwise route through the admin proxy.
function docFileUrl(doc: { id: string; storage_url?: string | null; file_url?: string | null }, download = false): string {
  const storageUrl = doc.storage_url || doc.file_url || '';
  if (/^https?:\/\//.test(storageUrl)) return storageUrl;
  const base = `${API_URL}/v1/admin/users/documents/${doc.id}/file`;
  return download ? `${base}?download=true` : base;
}


interface DriverFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  commission_rate_percent: string;
  total_trips: string;
  rating_avg: string;
  rating_count: string;
  total_earnings_dollars: string;
  wallet_balance_dollars: string;
}

// ---------- Editable Field ----------

interface EditableFieldProps {
  label: string;
  value?: string | number;
  isEditing?: boolean;
  onChange?: (value: string) => void;
  displayValue: React.ReactNode;
  type?: string;
  step?: string;
}

function EditableField({
  label,
  value = '',
  isEditing = false,
  onChange,
  displayValue,
  type = 'text',
  step,
}: EditableFieldProps) {
  return (
    <div>
      <p className="text-muted text-xs mb-1">{label}</p>
      {isEditing ? (
        <input
          type={type}
          step={step}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className="w-full border border-border rounded px-2 py-1 text-sm text-ink"
        />
      ) : (
        <p className="font-medium text-sm">{displayValue}</p>
      )}
    </div>
  );
}

const PAGE_SIZE = 20;

function driverSortVal(d: Driver, key: string) {
  switch (key) {
    case 'name': return [d.first_name, d.last_name].filter(Boolean).join(' ').toLowerCase();
    case 'status': return d.status;
    case 'trips': return d.total_trips ?? 0;
    case 'rating': return Number(d.rating_avg ?? 0);
    case 'earnings': return Number(d.total_earnings_cents ?? 0);
    default: return '';
  }
}

// ---------- Page ----------

export function DriversPage(): JSX.Element {
  const qc = useQueryClient();
  const { toast } = useToast();
  const regionCode = useRegionScope((s) => s.regionCode);
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<StatusFilter>('');
  const [search, setSearch] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  useEffect(() => {
    const selectId = searchParams.get('select');
    if (selectId) {
      setSelectedDriverId(selectId);
      setSearchParams({}, { replace: true });
    }
  }, []);
  const [page, setPage] = useState(1);
  const [suspendTarget, setSuspendTarget] = useState<{ id: string; name: string; action: 'suspend' | 'reject' } | null>(null);
  const [suspendReason, setSuspendReason] = useState('');

  // Document review state
  const [docReviewTarget, setDocReviewTarget] = useState<{ doc: Document; action: 'approve' | 'reject' } | null>(null);
  const [docReviewNote, setDocReviewNote] = useState('');
  const [docViewer, setDocViewer] = useState<{ url: string; type: string } | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<DriverFormData>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    commission_rate_percent: '',
    total_trips: '',
    rating_avg: '',
    rating_count: '',
    total_earnings_dollars: '',
    wallet_balance_dollars: '',
  });

  const debounced = useDebounced(search);

  const { data, isLoading } = useQuery({
    queryKey: ['drivers', status, debounced, regionCode],
    queryFn: () => {
      const qs = new URLSearchParams({ role: 'driver', limit: '100' });
      if (status) qs.set('status', status);
      if (debounced) qs.set('search', debounced);
      if (regionCode) qs.set('region', regionCode);
      return api<{ items: Driver[] }>(`/v1/admin/drivers?${qs.toString()}`);
    },
  });

  const { data: driverDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['driverDetails', selectedDriverId],
    queryFn: () => api<DriverDetails>(`/v1/admin/drivers/${selectedDriverId}`),
    enabled: !!selectedDriverId,
  });

  const { data: driverDeliveriesData } = useQuery({
    queryKey: ['driverDeliveries', selectedDriverId],
    queryFn: () =>
      api<{ items: any[]; total: number; has_more: boolean }>(
        `/v1/deliveries/admin/all?q=${selectedDriverId}&limit=500`,
      ),
    enabled: !!selectedDriverId,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['drivers'] });
    if (selectedDriverId) qc.invalidateQueries({ queryKey: ['driverDetails', selectedDriverId] });
  };

  const updateProfile = useMutation({
    mutationFn: (body: any) =>
      api(`/v1/admin/drivers/${selectedDriverId}`, { method: 'PATCH', body }),
    onSuccess: () => {
      setIsEditing(false);
      refresh();
    },
  });

  // ── Vehicle Active Toggle Mutation ──
  const toggleVehicleActive = useMutation({
    mutationFn: (vehicleId: string) =>
      api(`/v1/admin/drivers/${selectedDriverId}/vehicles/${vehicleId}/toggle-active`, {
        method: 'PATCH',
      }),
    onMutate: async (vehicleId) => {
      await qc.cancelQueries({ queryKey: ['driverDetails', selectedDriverId] });
      const previous = qc.getQueryData<DriverDetails>(['driverDetails', selectedDriverId]);
      qc.setQueryData<DriverDetails>(['driverDetails', selectedDriverId], (old) => {
        if (!old) return old;
        return {
          ...old,
          vehicles: old.vehicles?.map((v) =>
            v.id === vehicleId ? { ...v, is_active: !v.is_active } : v,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vehicleId, context) => {
      if (context?.previous) {
        qc.setQueryData(['driverDetails', selectedDriverId], context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['driverDetails', selectedDriverId] });
    },
  });

  const handleEditClick = () => {
    if (!driverDetails?.driver) return;
    const d = driverDetails?.driver;
    setFormData({
      first_name: d.first_name,
      last_name: d.last_name,
      email: d.email || '',
      phone: d.phone_number || d.phone || '',
      commission_rate_percent: String((d.commission_rate_bps || 0) / 100),
      total_trips: String(d.total_trips || 0),
      rating_avg: String(d.rating_avg || ''),
      rating_count: String(d.rating_count || 0),
      total_earnings_dollars: ((Number(d.total_earnings_cents) || 0) / 100).toFixed(2),
      wallet_balance_dollars: ((Number(d.wallet_balance_cents) || 0) / 100).toFixed(2),
    });
    setIsEditing(true);
  };

  const handleSaveClick = () => {
    updateProfile.mutate({
      first_name: formData.first_name,
      last_name: formData.last_name,
      email: formData.email || null,
      commission_rate_bps: Math.round(Number(formData.commission_rate_percent) * 100),
      total_trips: Number(formData.total_trips),
      rating_avg: Number(formData.rating_avg),
      rating_count: Number(formData.rating_count),
      total_earnings_cents: Math.round(Number(formData.total_earnings_dollars) * 100),
      wallet_balance_cents: Math.round(Number(formData.wallet_balance_dollars) * 100),
      phone: formData.phone,
    });
  };

  const approve = useMutation({
    mutationFn: (id: string) =>
      api(`/v1/admin/drivers/${id}/approve`, { method: 'POST', body: {} }),
    onSuccess: () => { refresh(); toast('Driver approved.', 'success'); },
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/v1/admin/drivers/${id}/reject`, { method: 'POST', body: { reason } }),
    onSuccess: () => { refresh(); toast('Driver rejected.', 'info'); },
  });
  const suspend = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/v1/admin/users/${id}/suspend`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      refresh();
      setSuspendTarget(null);
      setSuspendReason('');
      toast('Driver suspended.', 'info');
    },
  });
  const unsuspend = useMutation({
    mutationFn: (id: string) =>
      api(`/v1/admin/users/${id}/unsuspend`, { method: 'POST', body: {} }),
    onSuccess: () => { refresh(); toast('Driver unsuspended.', 'success'); },
  });

  const updateDocStatus = useMutation({
    mutationFn: ({ docId, status, reason, adminNote }: { docId: string; status: string; reason?: string; adminNote?: string }) =>
      api(`/v1/admin/users/documents/${docId}/status`, {
        method: 'PATCH',
        body: { status, reason, adminNote },
      }),
    onSuccess: (_data, vars) => {
      if (selectedDriverId) qc.invalidateQueries({ queryKey: ['driverDetails', selectedDriverId] });
      setDocReviewTarget(null);
      setDocReviewNote('');
      toast(`Document ${vars.status}.`, vars.status === 'approved' ? 'success' : 'info');
    },
    onError: () => toast('Failed to update document status.', 'error'),
  });

  const allDrivers = data?.items ?? [];
  const { sort, toggle, sorted } = useSort(allDrivers, driverSortVal);
  const pageItems = useMemo(() => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [sorted, page]);

  const handleExport = () => {
    exportToCsv(`drivers-${new Date().toISOString().slice(0, 10)}`, sorted, [
      { header: 'Name', getValue: (d) => [d.first_name, d.last_name].filter(Boolean).join(' ') },
      { header: 'Email', getValue: (d) => d.email ?? '' },
      { header: 'Status', getValue: (d) => d.status },
      { header: 'Trips', getValue: (d) => d.total_trips ?? 0 },
      { header: 'Rating', getValue: (d) => d.rating_avg ?? '' },
      { header: 'Earnings', getValue: (d) => ((Number(d.total_earnings_cents) || 0) / 100).toFixed(2) },
    ]);
  };

  const columns: Column<Driver>[] = [
    {
      key: 'name', header: 'Driver', sortable: true,
      render: (d) => (
        <div>
          <div className="font-medium">{[d.first_name, d.last_name].filter(Boolean).join(' ') || '—'}</div>
          <div className="text-xs text-muted">{d.email ?? ''}</div>
        </div>
      ),
    },
    {
      key: 'status', header: 'Status', sortable: true,
      render: (d) => (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[d.status] || 'bg-gray-100 text-gray-700'}`}>
          {d.status}
        </span>
      ),
    },
    { key: 'trips', header: 'Trips', sortable: true, render: (d) => d.total_trips ?? 0 },
    {
      key: 'rating', header: 'Rating', sortable: true,
      render: (d) => d.rating_count > 0 && d.rating_avg
        ? `★ ${Number(d.rating_avg).toFixed(2)} (${d.rating_count})`
        : <span className="text-muted">—</span>,
    },
    {
      key: 'earnings', header: 'Earnings', sortable: true,
      render: (d) => `$${((Number(d.total_earnings_cents) || 0) / 100).toFixed(2)}`,
    },
    {
      key: 'actions', header: 'Actions',
      render: (d) => (
        <div className="flex gap-2">
          <button onClick={() => { setSelectedDriverId(d.id); setIsEditing(false); }}
            className="px-2 py-1 text-xs bg-ink text-white rounded">View</button>
          {(d.status === 'pending' || d.status === 'rejected') && (
            <button onClick={() => approve.mutate(d.id)}
              className="px-2 py-1 text-xs bg-success text-white rounded">Approve</button>
          )}
          {d.status === 'pending' && (
            <button onClick={() => setSuspendTarget({ id: d.id, name: [d.first_name, d.last_name].join(' '), action: 'reject' })}
              className="px-2 py-1 text-xs bg-red-500 text-white rounded">Reject</button>
          )}
          {d.status === 'approved' && (
            <button onClick={() => setSuspendTarget({ id: d.id, name: [d.first_name, d.last_name].join(' '), action: 'suspend' })}
              className="px-2 py-1 text-xs bg-orange-500 text-white rounded">Suspend</button>
          )}
          {d.status === 'suspended' && (
            <button onClick={() => unsuspend.mutate(d.id)}
              className="px-2 py-1 text-xs bg-success text-white rounded">Unsuspend</button>
          )}
        </div>
      ),
    },
  ];


  return (
    <>
      <PageHeader title="Drivers" subtitle="Verification queue and active driver pool." />

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap gap-2 items-center">
        {(['', 'pending', 'approved', 'rejected', 'suspended'] as const).map((s) => (
          <button key={s || 'all'} onClick={() => { setStatus(s); setPage(1); }}
            className={`px-3 py-1 rounded border text-sm ${status === s ? 'bg-ink text-white border-ink' : 'border-border bg-white text-ink'}`}>
            {s || 'All'}
          </button>
        ))}
        <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name or email…"
          className="ml-auto px-3 py-1.5 border border-border rounded text-sm bg-white text-ink min-w-[220px]" />
        <button onClick={handleExport}
          className="px-3 py-1.5 text-xs border border-border rounded hover:bg-surface">
          ↓ Export CSV
        </button>
      </div>

      <div className="text-xs text-muted mb-2">{sorted.length} driver{sorted.length !== 1 ? 's' : ''}</div>

      <Table
        rows={pageItems}
        columns={columns}
        rowKey={(d) => d.id}
        emptyMessage={isLoading ? 'Loading…' : 'No drivers match the filter.'}
        isLoading={isLoading}
        sortKey={sort.key}
        sortDir={sort.dir}
        onSort={(k) => { toggle(k); setPage(1); }}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={sorted.length} onChange={setPage} />

      {/* Suspend / Reject reason dialog */}
      {suspendTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md border border-border p-6 space-y-4">
            <h3 className="font-semibold text-ink">
              {suspendTarget.action === 'suspend' ? 'Suspend' : 'Reject'} driver — {suspendTarget.name}
            </h3>
            <input
              autoFocus
              type="text"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Enter reason (required)"
              className="w-full border border-border rounded px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setSuspendTarget(null); setSuspendReason(''); }}
                className="px-4 py-2 text-sm border border-border rounded hover:bg-surface">Cancel</button>
              <button
                disabled={!suspendReason.trim()}
                onClick={() => {
                  if (!suspendReason.trim()) return;
                  if (suspendTarget.action === 'suspend') {
                    suspend.mutate({ id: suspendTarget.id, reason: suspendReason });
                  } else {
                    reject.mutate({ id: suspendTarget.id, reason: suspendReason });
                  }
                }}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded disabled:opacity-50 hover:bg-red-700">
                Confirm {suspendTarget.action === 'suspend' ? 'Suspend' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedDriverId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold">Driver Information</h2>
              <div className="flex gap-3 items-center">
                {!isEditing ? (
                  <button
                    onClick={handleEditClick}
                    className="px-3 py-1 bg-accent text-white text-sm rounded"
                  >
                    Edit Mode
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1 border border-border text-ink text-sm rounded"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveClick}
                      className="px-3 py-1 bg-success text-white text-sm rounded"
                    >
                      Save Changes
                    </button>
                  </>
                )}
                <button
                  onClick={() => setSelectedDriverId(null)}
                  className="text-gray-500 hover:text-black font-bold px-2"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 text-sm text-ink">
              {detailsLoading || !driverDetails ? (
                <div className="flex justify-center p-10">
                  <p>Loading details...</p>
                </div>
              ) : (
                <div className="space-y-8">
                  <section>
                    <h3 className="font-semibold text-lg border-b pb-2 mb-4">Profile & Stats</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <EditableField
                        label="First Name"
                        value={formData.first_name}
                        isEditing={isEditing}
                        onChange={(v) => setFormData({ ...formData, first_name: v })}
                        displayValue={driverDetails.driver.first_name}
                      />
                      <EditableField
                        label="Last Name"
                        value={formData.last_name}
                        isEditing={isEditing}
                        onChange={(v) => setFormData({ ...formData, last_name: v })}
                        displayValue={driverDetails.driver.last_name}
                      />
                      <EditableField
                        label="Phone"
                        value={formData.phone}
                        isEditing={isEditing}
                        onChange={(v) => setFormData({ ...formData, phone: v })}
                        displayValue={
                          driverDetails.driver.phone_number || driverDetails.driver.phone || '—'
                        }
                      />
                      <EditableField
                        label="Email"
                        value={formData.email}
                        isEditing={isEditing}
                        onChange={(v) => setFormData({ ...formData, email: v })}
                        displayValue={driverDetails.driver.email || '—'}
                      />
                      <EditableField
                        label="Commission (%)"
                        value={formData.commission_rate_percent}
                        isEditing={isEditing}
                        onChange={(v) => setFormData({ ...formData, commission_rate_percent: v })}
                        displayValue={`${(driverDetails.driver.commission_rate_bps || 0) / 100}%`}
                        type="number"
                      />
                      <EditableField
                        label="Total Trips"
                        value={formData.total_trips}
                        isEditing={isEditing}
                        onChange={(v) => setFormData({ ...formData, total_trips: v })}
                        displayValue={driverDetails.driver.total_trips || 0}
                        type="number"
                      />
                      <EditableField
                        label="Rating Avg (0-5)"
                        value={formData.rating_avg}
                        isEditing={isEditing}
                        onChange={(v) => setFormData({ ...formData, rating_avg: v })}
                        displayValue={
                          driverDetails.driver.rating_avg
                            ? `★ ${Number(driverDetails.driver.rating_avg).toFixed(2)}`
                            : '—'
                        }
                        type="number"
                      />
                      <EditableField
                        label="Rating Count"
                        value={formData.rating_count}
                        isEditing={isEditing}
                        onChange={(v) => setFormData({ ...formData, rating_count: v })}
                        displayValue={driverDetails.driver.rating_count || 0}
                        type="number"
                      />
                      <EditableField
                        label="Wallet Balance ($)"
                        value={formData.wallet_balance_dollars}
                        isEditing={isEditing}
                        onChange={(v) => setFormData({ ...formData, wallet_balance_dollars: v })}
                        displayValue={`$${((Number(driverDetails.driver.wallet_balance_cents) || 0) / 100).toFixed(2)}`}
                        type="number"
                        step="0.01"
                      />
                      <EditableField
                        label="Total Tips ($)"
                        displayValue={`$${((Number(driverDetails.driver.total_tips_cents) || 0) / 100).toFixed(2)}`}
                      />
                      <EditableField
                        label="Total Earnings ($)"
                        value={formData.total_earnings_dollars}
                        isEditing={isEditing}
                        onChange={(v) => setFormData({ ...formData, total_earnings_dollars: v })}
                        displayValue={`$${((Number(driverDetails.driver.total_earnings_cents) || 0) / 100).toFixed(2)}`}
                        type="number"
                        step="0.01"
                      />
                    </div>
                  </section>

                  <section>
                    <h3 className="font-semibold text-lg border-b pb-2 mb-4">Vehicles</h3>
                    {driverDetails.vehicles?.length ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Array.from(
                          new Map(driverDetails.vehicles.map((v) => [v.license_plate, v])).values(),
                        ).map((v) => (
                          <div
                            key={v.id}
                            className="border border-border p-4 rounded bg-gray-50 flex justify-between items-start"
                          >
                            <div>
                              <p className="font-medium text-base">
                                {v.year} {v.make} {v.model}
                              </p>
                              <p className="text-muted mt-1">
                                Plate:{' '}
                                <span className="text-ink font-mono bg-gray-200 px-1 rounded">
                                  {v.license_plate}
                                </span>
                              </p>
                            </div>
                            <div className="flex flex-col gap-1 items-end">
                              <span className="px-2 py-1 bg-accent text-white rounded text-xs uppercase">
                                {v.category}
                              </span>
                              {/* ── Unified toggle button with mutation ── */}
                              <button
                                onClick={() => toggleVehicleActive.mutate(v.id)}
                                disabled={toggleVehicleActive.isPending}
                                className={`px-2 py-1 rounded text-xs font-medium cursor-pointer ${
                                  v.is_active
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                } ${toggleVehicleActive.isPending ? 'opacity-50' : ''}`}
                              >
                                {v.is_active ? 'Active' : 'Inactive'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted italic">No vehicles registered.</p>
                    )}
                  </section>

                  {(() => {
                    const deliveries = driverDeliveriesData?.items ?? [];
                    const asDriver = deliveries.filter((d: any) => d.driver_id === selectedDriverId);
                    const completed = asDriver.filter((d: any) => d.status === 'delivered');
                    const cancelled = asDriver.filter((d: any) => d.status === 'cancelled' || d.status === 'failed');
                    const revenue = completed.reduce((sum: number, d: any) => sum + Number(d.total_cents ?? d.fare_cents ?? 0), 0);
                    if (asDriver.length === 0) return null;
                    return (
                      <section>
                        <h3 className="font-semibold text-lg border-b pb-2 mb-4">Delivery Stats</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div><p className="text-muted text-xs mb-1">Deliveries Assigned</p><p className="font-medium text-sm">{asDriver.length}</p></div>
                          <div><p className="text-muted text-xs mb-1">Deliveries Completed</p><p className="font-medium text-sm text-green-700">{completed.length}</p></div>
                          <div><p className="text-muted text-xs mb-1">Deliveries Cancelled</p><p className="font-medium text-sm text-red-600">{cancelled.length}</p></div>
                          <div><p className="text-muted text-xs mb-1">Delivery Revenue</p><p className="font-medium text-sm">${(revenue / 100).toFixed(2)}</p></div>
                          <div><p className="text-muted text-xs mb-1">Completion Rate</p><p className="font-medium text-sm">{asDriver.length > 0 ? `${((completed.length / asDriver.length) * 100).toFixed(0)}%` : '—'}</p></div>
                        </div>
                      </section>
                    );
                  })()}

                  <section>
                    <h3 className="font-semibold text-lg border-b pb-2 mb-4">Documents</h3>
                    {(driverDetails?.driver?.documents?.length ?? 0) > 0 ? (
                      <div className="grid grid-cols-1 gap-3">
                        {driverDetails.driver.documents?.map((doc: Document) => {
                          const hasFile = !!(doc.storage_url || doc.file_url);
                          const storageUrl = doc.storage_url || doc.file_url || '';
                          const isImage = hasFile && /\.(jpe?g|png|webp|gif|bmp)$/i.test(storageUrl);
                          const isPdf = hasFile && /\.pdf$/i.test(storageUrl);
                          const category = doc.document_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                          return (
                            <div key={doc.id} className="border border-border rounded-lg bg-white shadow-sm overflow-hidden">
                              <div className="flex items-start gap-4 p-4">
                                {/* Doc type icon */}
                                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-lg">
                                  {isPdf ? '📄' : isImage ? '🖼️' : '📋'}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      {doc.title && (
                                        <p className="font-semibold text-sm text-ink truncate">{doc.title}</p>
                                      )}
                                      <p className={`text-xs text-muted ${doc.title ? '' : 'font-semibold text-sm text-ink'}`}>{category}</p>
                                    </div>
                                    <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded font-medium ${
                                      doc.status === 'approved' ? 'bg-green-100 text-green-800' :
                                      doc.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                      'bg-yellow-100 text-yellow-800'
                                    }`}>
                                      {doc.status}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted">
                                    <span>Uploaded {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}</span>
                                    {doc.expires_on && (
                                      <span className={new Date(doc.expires_on) < new Date() ? 'text-red-600 font-medium' : ''}>
                                        {new Date(doc.expires_on) < new Date() ? '⚠ Expired' : 'Expires'} {new Date(doc.expires_on).toLocaleDateString()}
                                      </span>
                                    )}
                                    {doc.reviewed_at && (
                                      <span>Reviewed {new Date(doc.reviewed_at).toLocaleDateString()}</span>
                                    )}
                                  </div>
                                  {doc.rejection_reason && (
                                    <p className="mt-1.5 text-xs text-red-700 bg-red-50 px-2 py-1 rounded">
                                      <span className="font-medium">Rejection reason:</span> {doc.rejection_reason}
                                    </p>
                                  )}
                                  {doc.admin_note && (
                                    <p className="mt-1.5 text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded">
                                      <span className="font-medium">Admin note:</span> {doc.admin_note}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="border-t border-border px-4 py-2.5 bg-gray-50 flex gap-2 flex-wrap">
                                {hasFile && (
                                  <button
                                    onClick={() => setDocViewer({ url: docFileUrl(doc), type: isPdf ? 'pdf' : 'image' })}
                                    className="px-3 py-1 text-xs bg-white border border-border rounded hover:bg-gray-100 text-ink"
                                  >
                                    View
                                  </button>
                                )}
                                {hasFile && (
                                  <button
                                    onClick={async () => {
                                      if (/^https?:\/\//.test(storageUrl)) { window.open(storageUrl, '_blank'); return; }
                                      try {
                                        const { accessToken } = (await import('../../stores/auth.store.js')).useAuthStore.getState();
                                        const res = await fetch(docFileUrl(doc, true), {
                                          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
                                        });
                                        if (!res.ok) throw new Error('Download failed');
                                        const blob = await res.blob();
                                        const a = document.createElement('a');
                                        a.href = URL.createObjectURL(blob);
                                        a.download = doc.title || doc.document_type;
                                        a.click();
                                        URL.revokeObjectURL(a.href);
                                      } catch { /* silent */ }
                                    }}
                                    className="px-3 py-1 text-xs bg-white border border-border rounded hover:bg-gray-100 text-ink"
                                  >
                                    Download
                                  </button>
                                )}
                                {doc.status !== 'approved' && (
                                  <button
                                    onClick={() => { setDocReviewTarget({ doc, action: 'approve' }); setDocReviewNote(''); }}
                                    className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                  >
                                    Approve
                                  </button>
                                )}
                                {doc.status !== 'rejected' && (
                                  <button
                                    onClick={() => { setDocReviewTarget({ doc, action: 'reject' }); setDocReviewNote(''); }}
                                    className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                                  >
                                    Reject
                                  </button>
                                )}
                                {doc.status === 'approved' && (
                                  <button
                                    onClick={() => { setDocReviewTarget({ doc, action: 'reject' }); setDocReviewNote(''); }}
                                    className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                  >
                                    Revoke
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 mt-2">No documents uploaded.</p>
                    )}
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Document review modal */}
      {docReviewTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md border border-border p-6 space-y-4">
            <h3 className="font-semibold text-ink text-base">
              {docReviewTarget.action === 'approve' ? 'Approve' : 'Reject'} document —{' '}
              {docReviewTarget.doc.title || docReviewTarget.doc.document_type.replace(/_/g, ' ')}
            </h3>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                {docReviewTarget.action === 'reject' ? 'Rejection reason (shown to driver)' : 'Note for driver (optional)'}
              </label>
              <textarea
                autoFocus
                rows={3}
                value={docReviewNote}
                onChange={(e) => setDocReviewNote(e.target.value)}
                placeholder={docReviewTarget.action === 'reject' ? 'e.g. Document is expired, blurry or unreadable…' : 'e.g. Approved — expires in 1 year…'}
                className="w-full border border-border rounded px-3 py-2 text-sm resize-none"
              />
            </div>
            {docReviewTarget.action === 'reject' && !docReviewNote.trim() && (
              <p className="text-xs text-red-600">A rejection reason is required so the driver knows what to fix.</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setDocReviewTarget(null); setDocReviewNote(''); }}
                className="px-4 py-2 text-sm border border-border rounded hover:bg-surface"
              >
                Cancel
              </button>
              <button
                disabled={docReviewTarget.action === 'reject' && !docReviewNote.trim() || updateDocStatus.isPending}
                onClick={() => {
                  const isApprove = docReviewTarget.action === 'approve';
                  updateDocStatus.mutate({
                    docId: docReviewTarget.doc.id,
                    status: isApprove ? 'approved' : 'rejected',
                    reason: !isApprove ? docReviewNote.trim() || undefined : undefined,
                    adminNote: isApprove ? docReviewNote.trim() || undefined : undefined,
                  });
                }}
                className={`px-4 py-2 text-sm rounded text-white disabled:opacity-50 ${
                  docReviewTarget.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {updateDocStatus.isPending ? 'Saving…' : docReviewTarget.action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document viewer modal */}
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
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (/^https?:\/\//.test(docViewer.url) && !docViewer.url.startsWith(API_URL)) {
                      window.open(docViewer.url, '_blank'); return;
                    }
                    try {
                      const { accessToken } = (await import('../../stores/auth.store.js')).useAuthStore.getState();
                      const res = await fetch(docViewer.url + (docViewer.url.includes('?') ? '&' : '?') + 'download=true', {
                        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
                      });
                      if (!res.ok) return;
                      const blob = await res.blob();
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = 'document';
                      a.click();
                      URL.revokeObjectURL(a.href);
                    } catch { /* silent */ }
                  }}
                  className="px-3 py-1 text-xs bg-ink text-white rounded hover:bg-gray-800"
                >
                  Download
                </button>
                <button onClick={() => setDocViewer(null)} className="text-gray-500 hover:text-black px-2 font-bold">✕</button>
              </div>
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
 *  Detects unsupported formats (e.g. HEIC) via onError and the content-type header. */
function DocViewerContent({ url }: { url: string; type: string }) {
  const isExternal = /^https?:\/\//.test(url) && !url.startsWith(API_URL);
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
  const [mimeType, setMimeType] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isExternal) return;
    let active = true;
    setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setMimeType('');
    setError(null);

    (async () => {
      try {
        const mod = await import('../../stores/auth.store.js');
        const { accessToken } = (mod as any).useAuthStore.getState();
        const res = await fetch(url, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });
        if (!active) return;
        if (!res.ok) { setError(`HTTP ${res.status} — ${res.statusText || 'request failed'}`); return; }
        const ct = res.headers.get('content-type') ?? '';
        const mime = ct.split(';')[0].trim() || 'application/octet-stream';
        const buf = await res.arrayBuffer();
        if (!active) return;
        setMimeType(mime);
        const blob = new Blob([buf], { type: mime });
        setBlobUrl(URL.createObjectURL(blob));
      } catch (e: any) {
        if (active) setError(e?.message ?? 'Network error');
      }
    })();

    return () => { active = false; };
  }, [url, isExternal]);

  const unsupported = (hint?: string) => (
    <div className="flex flex-col items-center justify-center p-8 min-h-[300px] gap-2 bg-gray-50">
      <p className="text-sm font-medium text-gray-700">Preview not available</p>
      <p className="text-xs text-muted text-center max-w-xs">{hint ?? UNSUPPORTED_MSG}</p>
    </div>
  );

  // External URL — render directly without auth fetch
  if (isExternal) {
    if (error) return unsupported();
    if (/\.pdf$/i.test(url)) return (
      <iframe src={url} title="PDF Document"
        style={{ display: 'block', width: '100%', height: 'calc(80vh - 48px)', border: 'none' }} />
    );
    return (
      <div className="flex items-center justify-center bg-gray-100 p-4" style={{ minHeight: 300 }}>
        <img src={url} alt="Document"
          onError={() => setError('cannot load')}
          style={{ maxWidth: '100%', maxHeight: 'calc(80vh - 80px)', objectFit: 'contain' }} />
      </div>
    );
  }

  if (error) return (
    <div className="flex flex-col items-center justify-center p-8 min-h-[300px] gap-2">
      <p className="text-sm font-medium text-red-600">Could not load document</p>
      <p className="text-xs text-muted">{error}</p>
    </div>
  );

  if (!blobUrl) return (
    <div className="flex items-center justify-center p-8 min-h-[300px]">
      <p className="text-sm text-muted">Loading document…</p>
    </div>
  );

  // HEIC or other browser-unsupported formats — caught by magic-byte detection in backend
  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    return unsupported('This is a HEIF/HEIC image (typically from an iPhone). Download it to view, or open it in Safari.');
  }

  if (mimeType === 'application/pdf') return (
    <iframe src={blobUrl} title="PDF Document"
      style={{ display: 'block', width: '100%', height: 'calc(80vh - 48px)', border: 'none' }} />
  );

  return (
    <div className="flex items-center justify-center bg-gray-100 p-4" style={{ minHeight: 300 }}>
      <img
        src={blobUrl}
        alt="Document"
        onError={() => setError(UNSUPPORTED_MSG)}
        style={{ maxWidth: '100%', maxHeight: 'calc(80vh - 80px)', objectFit: 'contain' }}
      />
    </div>
  );
}
