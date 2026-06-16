import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Table, type Column } from '../../components/Table';
import { Pagination } from '../../components/Pagination';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { useDebounced } from '../../hooks/useDebounced';
import { useSort } from '../../hooks/useSort';
import { exportToCsv } from '../../lib/export';

interface RiderRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_number?: string | null;
  total_trips?: number;
  status?: string;
  created_at: string;
}
interface ListResponse { items: RiderRow[]; next_cursor: string | null; has_more: boolean }

const PAGE_SIZE = 20;
const STATUS_OPTIONS = ['', 'active', 'suspended', 'deleted'];

function statusColor(status?: string): string {
  switch (status) {
    case 'active': return 'bg-success/10 text-success';
    case 'suspended': case 'deleted': return 'bg-danger/10 text-danger';
    default: return 'bg-surface text-muted';
  }
}

function sortVal(u: RiderRow, key: string) {
  switch (key) {
    case 'name': return [u.first_name, u.last_name].filter(Boolean).join(' ').toLowerCase();
    case 'email': return u.email ?? '';
    case 'trips': return u.total_trips ?? 0;
    case 'joined': return u.created_at;
    default: return '';
  }
}

export function UsersPage(): JSX.Element {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-riders', debounced, status],
    queryFn: () => {
      const params = new URLSearchParams({ role: 'rider', limit: '200' });
      if (debounced) params.set('search', debounced);
      if (status) params.set('status', status);
      return api<ListResponse>(`/v1/admin/users?${params.toString()}`);
    },
  });

  const allItems = data?.items ?? [];

  const dateFiltered = useMemo(() => {
    if (!dateFrom && !dateTo) return allItems;
    return allItems.filter((u) => {
      const d = u.created_at.slice(0, 10);
      return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
    });
  }, [allItems, dateFrom, dateTo]);

  const { sort, toggle, sorted } = useSort(dateFiltered, sortVal);

  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleExport = () => {
    exportToCsv(`riders-${new Date().toISOString().slice(0, 10)}`, sorted, [
      { header: 'Name', getValue: (u) => [u.first_name, u.last_name].filter(Boolean).join(' ') },
      { header: 'Phone', getValue: (u) => u.phone_number ?? '' },
      { header: 'Email', getValue: (u) => u.email ?? '' },
      { header: 'Trips', getValue: (u) => u.total_trips ?? '' },
      { header: 'Status', getValue: (u) => u.status ?? '' },
      { header: 'Joined', getValue: (u) => u.created_at.slice(0, 10) },
    ]);
  };

  const columns: Column<RiderRow>[] = [
    {
      key: 'name', header: 'Name', sortable: true,
      render: (u) => (
        <span className="font-medium text-ink">
          {[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}
        </span>
      ),
    },
    { key: 'phone', header: 'Phone', render: (u) => <span className="text-muted text-xs">{u.phone_number ?? '—'}</span> },
    { key: 'email', header: 'Email', sortable: true, render: (u) => <span className="text-muted">{u.email ?? '—'}</span> },
    {
      key: 'trips', header: 'Trips', sortable: true,
      render: (u) => <span className="text-ink">{u.total_trips ?? 0}</span>,
    },
    {
      key: 'status', header: 'Status',
      render: (u) => u.status
        ? <span className={'px-2 py-0.5 rounded-full text-xs ' + statusColor(u.status)}>{u.status}</span>
        : <span className="text-muted text-xs">—</span>,
    },
    {
      key: 'joined', header: 'Joined', sortable: true,
      render: (u) => <span className="text-muted text-xs">{new Date(u.created_at).toLocaleDateString()}</span>,
    },
  ];

  return (
    <>
      <PageHeader title="Riders" subtitle="All registered riders." />

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name, email, or phone…"
          className="flex-1 min-w-[200px] max-w-xs px-3 py-1.5 bg-white text-ink border border-border rounded text-sm"
        />
        <DateRangeFilter
          from={dateFrom} to={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t); setPage(1); }}
          label="Joined"
        />
        <button
          onClick={handleExport}
          className="ml-auto px-3 py-1.5 text-xs border border-border rounded hover:bg-surface flex items-center gap-1"
        >
          ↓ Export CSV
        </button>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-1 mb-4">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => { setStatus(s); setPage(1); }}
            className={'px-3 py-1 text-xs rounded-full border transition ' +
              (status === s ? 'bg-accent text-white border-accent' : 'bg-white text-muted border-border hover:bg-surface')}
          >
            {s || 'All'}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted self-center">
          {sorted.length} rider{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      <Table
        rows={pageItems}
        columns={columns}
        rowKey={(u) => u.id}
        emptyMessage={isLoading ? 'Loading…' : 'No riders found.'}
        isLoading={isLoading}
        sortKey={sort.key}
        sortDir={sort.dir}
        onSort={(k) => { toggle(k); setPage(1); }}
        onRowClick={(u) => navigate(`/users/${u.id}`)}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={sorted.length} onChange={setPage} />
    </>
  );
}
