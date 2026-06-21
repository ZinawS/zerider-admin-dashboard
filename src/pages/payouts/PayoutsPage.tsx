import React, { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useRegionScope } from '../../stores/region-scope.store';
import { PageHeader } from '../../components/PageHeader';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { Pagination } from '../../components/Pagination';
import { useToast } from '../../components/Toast';
import { useSort } from '../../hooks/useSort';
import { exportToCsv } from '../../lib/export';
import { QueryError } from '../../components/QueryError.js';

interface Payout {
  id: string;
  driver_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  provider_key: string | null;
  provider_ref: string | null;
  created_at: string;
}
interface Balance { driverId: string; balanceCents: number; currency: string }
interface Driver { id: string; first_name: string; last_name: string; email: string; phone_number: string }

const PAGE_SIZE = 20;
const STATUS_OPTIONS = ['pending', 'paid', 'failed', 'all'];

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

const PROVIDER_LABELS: Record<string, string> = {
  stripe: 'Stripe',
  chapa: 'Chapa',
  bank_transfer: 'Bank Transfer',
  direct_deposit: 'Direct Deposit',
  manual: 'Manual',
  mobile_money: 'Mobile Money',
  paypal: 'PayPal',
};

function providerLabel(key: string | null | undefined): string {
  if (!key) return 'Manual';
  return PROVIDER_LABELS[key.toLowerCase()] ?? key;
}

function sortVal(p: Payout, key: string) {
  switch (key) {
    case 'date': return p.created_at;
    case 'amount': return p.amount_cents;
    case 'status': return p.status;
    default: return '';
  }
}

export function PayoutsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const regionCode = useRegionScope((s) => s.regionCode);

  const [statusFilter, setStatusFilter] = useState('pending');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  // Create payout modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [newAmountStr, setNewAmountStr] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const queryStatus = statusFilter === 'all' ? '' : statusFilter;
  const { data: payoutsData, isLoading, isError, refetch } = useQuery({
    queryKey: ['payouts', queryStatus, regionCode],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (queryStatus) qs.set('status', queryStatus);
      if (regionCode) qs.set('region', regionCode);
      const q = qs.toString();
      return api<{ items: Payout[] }>(`/v1/admin/payments/payouts${q ? `?${q}` : ''}`);
    },
  });

  const { data: allDriversData } = useQuery({
    queryKey: ['drivers-all-for-payouts'],
    queryFn: () => api<{ items: Driver[] }>('/v1/admin/drivers?limit=500'),
  });
  const driverNameMap = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>();
    (allDriversData?.items ?? []).forEach((d) => m.set(d.id, `${d.first_name} ${d.last_name}`.trim()));
    return m;
  }, [allDriversData]);

  const { data: driversData, isFetching: isSearching } = useQuery({
    queryKey: ['driversSearch', debouncedSearch],
    queryFn: () => api<{ items: Driver[] }>(`/v1/admin/drivers?limit=10${debouncedSearch ? `&search=${debouncedSearch}` : ''}`),
    enabled: isModalOpen,
  });

  const { data: balanceData, isFetching: isCheckingBalance } = useQuery({
    queryKey: ['driverBalance', selectedDriver?.id],
    queryFn: () => api<Balance>(`/v1/admin/payments/drivers/${selectedDriver!.id}/balance`),
    enabled: !!selectedDriver,
    retry: false,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api(`/v1/admin/payments/payouts/${id}/approve`, { method: 'POST', body: {} }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payouts'] }); toast('Payout approved and queued for transfer.', 'success'); },
    onError: (e: any) => toast(`Error approving payout: ${e.message}`, 'error'),
  });

  const createMutation = useMutation({
    mutationFn: (body: { driverId: string; amount: number; reason: string }) =>
      api('/v1/admin/payments/payouts/manual', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payouts'] });
      closeModal();
      toast('Payout created successfully.', 'success');
    },
    onError: (e: any) => toast(`Error creating payout: ${e.message}`, 'error'),
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedDriver(null);
    setSearchTerm('');
    setNewAmountStr('');
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDriver) { toast('Please select a driver first.', 'error'); return; }
    const amountCents = Math.round(parseFloat(newAmountStr) * 100);
    if (isNaN(amountCents) || amountCents <= 0) { toast('Enter a valid amount greater than 0.', 'error'); return; }
    createMutation.mutate({ driverId: selectedDriver.id, amount: amountCents, reason: 'Manual Admin Payout' });
  };

  const allItems = payoutsData?.items ?? [];

  const dateFiltered = useMemo(() => {
    if (!dateFrom && !dateTo) return allItems;
    return allItems.filter((p) => {
      const d = p.created_at.slice(0, 10);
      return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
    });
  }, [allItems, dateFrom, dateTo]);

  const { sort, toggle, sorted } = useSort(dateFiltered, sortVal, { key: 'date', dir: 'desc' });
  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isError) return <QueryError onRetry={() => refetch()} />;

  const displayedDrivers = (driversData?.items ?? []).filter((d) =>
    `${d.first_name} ${d.last_name} ${d.email} ${d.phone_number}`.toLowerCase().includes(debouncedSearch.toLowerCase()),
  );

  const handleExport = () => {
    exportToCsv(`payouts-${new Date().toISOString().slice(0, 10)}`, sorted, [
      { header: 'Date', getValue: (p) => p.created_at.slice(0, 10) },
      { header: 'Payee Name', getValue: (p) => driverNameMap.get(p.driver_id) ?? '' },
      { header: 'Driver ID', getValue: (p) => p.driver_id },
      { header: 'Amount', getValue: (p) => (p.amount_cents / 100).toFixed(2) },
      { header: 'Currency', getValue: (p) => p.currency },
      { header: 'Status', getValue: (p) => p.status },
      { header: 'Payment Method', getValue: (p) => providerLabel(p.provider_key) },
      { header: 'Reference', getValue: (p) => p.provider_ref ?? '' },
    ]);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Payouts" subtitle="Review and process driver withdrawals." />

      <div className="flex flex-wrap items-center gap-3">
        {/* Status tabs */}
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((s) => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`capitalize px-3 py-1.5 rounded-full text-sm font-medium transition ${statusFilter === s ? 'bg-ink text-white' : 'text-muted hover:bg-surface border border-border'}`}>
              {s}
            </button>
          ))}
        </div>

        <DateRangeFilter from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); setPage(1); }} />

        <div className="ml-auto flex gap-2">
          <button onClick={handleExport}
            className="px-3 py-1.5 text-xs border border-border rounded hover:bg-surface">
            ↓ Export CSV
          </button>
          <button onClick={() => setIsModalOpen(true)}
            className="bg-ink text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-ink/90">
            + Create Payout
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface border-b border-border">
            <tr>
              {[
                { key: 'date', label: 'Date' },
                { key: '', label: 'Payee' },
                { key: 'amount', label: 'Amount' },
                { key: 'status', label: 'Status' },
                { key: '', label: 'Payment Method' },
                { key: '', label: 'Reference' },
                { key: '', label: '' },
              ].map(({ key, label }, i) => (
                <th key={i}
                  onClick={() => key && toggle(key)}
                  className={`px-4 py-2 text-left text-xs font-medium text-muted ${key ? 'cursor-pointer hover:text-ink select-none' : ''}`}>
                  <span className="inline-flex items-center gap-1">
                    {label}
                    {key && <span className="opacity-50">{sort.key === key ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-surface animate-pulse rounded w-3/4" /></td>
                    ))}
                  </tr>
                ))
              : pageItems.length === 0
              ? <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">No {statusFilter} payouts found.</td></tr>
              : pageItems.map((p) => (
                  <tr key={p.id} className="hover:bg-surface/50 transition-colors">
                    <td className="px-4 py-3 text-sm">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">{driverNameMap.get(p.driver_id) || <span className="text-muted">—</span>}</div>
                      <div className="font-mono text-xs text-muted">{p.driver_id.slice(0, 8)}…</div>
                    </td>
                    <td className="px-4 py-3 font-semibold">{(p.amount_cents / 100).toFixed(2)} {p.currency}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[p.status] ?? 'bg-surface text-muted'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{providerLabel(p.provider_key)}</td>
                    <td className="px-4 py-3">
                      {p.provider_ref
                        ? <span className="text-xs text-muted font-mono break-all max-w-[160px] block">{p.provider_ref}</span>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.status === 'pending' && (
                        <button
                          onClick={() => approveMutation.mutate(p.id)}
                          disabled={approveMutation.isPending}
                          className="bg-accent text-white px-3 py-1 rounded text-xs font-medium hover:bg-accent/90 disabled:opacity-50">
                          {approveMutation.isPending ? 'Processing…' : 'Approve'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>{sorted.length} payout{sorted.length !== 1 ? 's' : ''}</span>
        <Pagination page={page} pageSize={PAGE_SIZE} total={sorted.length} onChange={setPage} />
      </div>

      {/* Create Payout Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden border border-border">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-surface/50">
              <h2 className="text-lg font-semibold text-ink">Create Payout</h2>
              <button onClick={closeModal} className="text-muted hover:text-ink">✕</button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-5">
              <div className="relative">
                <label className="block text-sm font-medium text-ink mb-1.5">Select Driver</label>
                {!selectedDriver ? (
                  <div className="relative">
                    <input type="text"
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ink outline-none"
                      placeholder="Search by name, email, or phone…"
                      value={searchTerm}
                      onChange={(e) => { setSearchTerm(e.target.value); setIsDropdownOpen(true); }}
                      onFocus={() => setIsDropdownOpen(true)}
                    />
                    {isDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-white rounded-lg shadow-lg border border-border max-h-56 overflow-y-auto">
                        {isSearching
                          ? <div className="p-3 text-center text-sm text-muted">Searching…</div>
                          : displayedDrivers.length === 0
                          ? <div className="p-3 text-center text-sm text-muted">No drivers found.</div>
                          : displayedDrivers.map((d, i) => (
                              <div key={`${d.id}-${i}`}
                                className="p-3 hover:bg-surface cursor-pointer flex justify-between items-center border-b border-border last:border-0"
                                onClick={() => { setSelectedDriver(d); setIsDropdownOpen(false); setSearchTerm(''); }}>
                                <div>
                                  <div className="font-medium text-sm">{d.first_name} {d.last_name}</div>
                                  <div className="text-xs text-muted">{d.email} · {d.phone_number}</div>
                                </div>
                                <span className="text-xs text-accent font-medium">Select</span>
                              </div>
                            ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-surface border border-border rounded-lg p-3 flex justify-between items-center">
                    <div>
                      <div className="font-semibold">{selectedDriver.first_name} {selectedDriver.last_name}</div>
                      <div className="text-xs text-muted font-mono mt-0.5">{selectedDriver.id}</div>
                    </div>
                    <button type="button" onClick={() => setSelectedDriver(null)} className="text-xs text-muted hover:text-ink underline">
                      Change
                    </button>
                  </div>
                )}
              </div>

              {selectedDriver && (
                <div>
                  {isCheckingBalance
                    ? <div className="p-3 bg-surface rounded-lg text-center text-sm text-muted animate-pulse">Checking balance…</div>
                    : balanceData
                    ? <div className="p-3 bg-green-50 border border-green-100 rounded-lg flex justify-between items-center">
                        <span className="text-sm font-medium text-green-800">Available balance:</span>
                        <span className="text-xl font-bold text-green-900">
                          {(balanceData.balanceCents / 100).toFixed(2)} {balanceData.currency}
                        </span>
                      </div>
                    : <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">Could not load balance.</div>}
                </div>
              )}

              <div className={selectedDriver ? '' : 'opacity-50 pointer-events-none'}>
                <label className="block text-sm font-medium text-ink mb-1.5">Amount ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
                  <input type="number" step="0.01" required
                    className="w-full pl-7 border border-border rounded-lg py-2 text-sm focus:ring-2 focus:ring-ink outline-none"
                    value={newAmountStr} onChange={(e) => setNewAmountStr(e.target.value)}
                    placeholder="0.00"
                  />
                  {balanceData && (
                    <button type="button"
                      onClick={() => setNewAmountStr((balanceData.balanceCents / 100).toFixed(2))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-surface border border-border rounded px-2 py-0.5 hover:bg-border">
                      MAX
                    </button>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-border">
                <button type="button" onClick={closeModal}
                  className="px-4 py-2 text-sm text-muted hover:bg-surface rounded-lg">Cancel</button>
                <button type="submit"
                  disabled={createMutation.isPending || !selectedDriver || !balanceData}
                  className="px-5 py-2 bg-ink text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-ink/90">
                  {createMutation.isPending ? 'Processing…' : 'Queue Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
