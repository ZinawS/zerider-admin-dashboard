import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Table, type Column } from '../../components/Table';
import { useDebounced } from '../../hooks/useDebounced';
import { exportToCsv } from '../../lib/export';

interface Region {
  code: string;
  name: string;
  country_code: string;
  currency_code: string;
  currency_symbol: string;
  distance_unit: 'km' | 'mile';
  language: string;
  timezone: string;
  is_active: boolean;
}
interface ListResponse { items: Region[]; next_cursor: string | null; has_more: boolean }

const EMPTY_FORM: any = {
  code: '', name: '', country_code: '', currency_code: '', currency_symbol: '',
  distance_unit: 'km', language: 'en', timezone: 'UTC', is_active: true,
  boundary_wkt: 'POLYGON((-85.95 38.05, -85.40 38.05, -85.40 38.40, -85.95 38.40, -85.95 38.05))',
};

export function RegionsPage(): JSX.Element {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const debouncedSearch = useDebounced(search);

  const { data, isLoading } = useQuery({
    queryKey: ['regions'],
    queryFn: () => api<ListResponse>('/v1/admin/regions'),
  });

  const allRegions = data?.items ?? [];
  const filteredRegions = useMemo(() => {
    return allRegions.filter((r) => {
      const q = debouncedSearch.toLowerCase();
      const matchSearch = !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || r.country_code.toLowerCase().includes(q);
      return matchSearch && (!activeOnly || r.is_active);
    });
  }, [allRegions, debouncedSearch, activeOnly]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);

  const create = useMutation({
    mutationFn: (body: any) => api('/v1/admin/regions', { method: 'POST', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['regions'] }); setShowForm(false); setForm(EMPTY_FORM); },
  });
  const update = useMutation({
    mutationFn: ({ code, body }: { code: string; body: any }) =>
      api(`/v1/admin/regions/${code}`, { method: 'PATCH', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['regions'] }); setShowForm(false); setEditing(null); setForm(EMPTY_FORM); },
  });

  const startEdit = (r: Region) => { setEditing(r.code); setForm({ ...r }); setShowForm(true); };
  const toggleActive = (r: Region) => update.mutate({ code: r.code, body: { is_active: !r.is_active } });
  const submit = () => {
    if (editing) {
      const { code: _code, boundary_wkt, ...patch } = form;
      const body = boundary_wkt && !boundary_wkt.includes('POLYGON((-85.95') ? { ...patch, boundary_wkt } : patch;
      update.mutate({ code: editing, body });
    } else {
      create.mutate(form);
    }
  };

  const columns: Column<Region>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: 'name', header: 'Name', render: (r) => r.name },
    { key: 'country', header: 'Country', render: (r) => r.country_code },
    { key: 'currency', header: 'Currency', render: (r) => `${r.currency_symbol} ${r.currency_code}` },
    { key: 'unit', header: 'Unit', render: (r) => r.distance_unit },
    { key: 'lang', header: 'Lang', render: (r) => r.language },
    { key: 'active', header: 'Active', render: (r) => r.is_active ? '✓' : '—' },
    {
      key: 'actions', header: 'Actions',
      render: (r) => (
        <div className="flex gap-2">
          <button onClick={() => startEdit(r)} className="px-2 py-1 text-xs bg-accent text-white rounded">Edit</button>
          <button onClick={() => toggleActive(r)} className="px-2 py-1 text-xs border border-border rounded">
            {r.is_active ? 'Disable' : 'Enable'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Regions" subtitle="Geographic markets. Each region has its own pricing and currency." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, code, or country…"
          className="flex-1 min-w-[200px] max-w-xs px-3 py-1.5 border border-border rounded text-sm bg-white text-ink" />
        <label className="flex items-center gap-1.5 text-sm text-muted cursor-pointer select-none">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
          Active only
        </label>
        <span className="text-sm text-muted">{filteredRegions.length} region{filteredRegions.length !== 1 ? 's' : ''}</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => exportToCsv(`regions-${new Date().toISOString().slice(0, 10)}`, filteredRegions, [
              { header: 'Code', getValue: (r) => r.code },
              { header: 'Name', getValue: (r) => r.name },
              { header: 'Country', getValue: (r) => r.country_code },
              { header: 'Currency', getValue: (r) => r.currency_code },
              { header: 'Currency Symbol', getValue: (r) => r.currency_symbol },
              { header: 'Distance Unit', getValue: (r) => r.distance_unit },
              { header: 'Language', getValue: (r) => r.language },
              { header: 'Timezone', getValue: (r) => r.timezone },
              { header: 'Active', getValue: (r) => r.is_active ? 'Yes' : 'No' },
            ])}
            className="px-3 py-2 text-xs border border-border rounded hover:bg-surface"
          >↓ Export CSV</button>
          <button onClick={() => { setShowForm(true); setEditing(null); setForm(EMPTY_FORM); }} className="px-3 py-2 bg-accent text-white rounded text-sm">+ New region</button>
        </div>
      </div>
      {showForm && (
        <div className="bg-white border border-border rounded-lg p-4 mb-4 text-ink">
          <h3 className="text-md font-medium mb-3">{editing ? `Edit ${editing}` : 'New region'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code (3-5 chars)"><input value={form.code ?? ''} disabled={!!editing} onChange={(e) => setForm({...form, code: e.target.value})} className="w-full px-3 py-2 border border-border rounded text-sm bg-white text-ink disabled:opacity-50" /></Field>
            <Field label="Name"><input value={form.name ?? ''} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border border-border rounded text-sm bg-white text-ink" /></Field>
            <Field label="Country (ISO 3166-1)"><input value={form.country_code ?? ''} onChange={(e) => setForm({...form, country_code: e.target.value})} className="w-full px-3 py-2 border border-border rounded text-sm bg-white text-ink" /></Field>
            <Field label="Currency (ISO 4217)"><input value={form.currency_code ?? ''} onChange={(e) => setForm({...form, currency_code: e.target.value})} className="w-full px-3 py-2 border border-border rounded text-sm bg-white text-ink" /></Field>
            <Field label="Currency symbol"><input value={form.currency_symbol ?? ''} onChange={(e) => setForm({...form, currency_symbol: e.target.value})} className="w-full px-3 py-2 border border-border rounded text-sm bg-white text-ink" /></Field>
            <Field label="Distance unit">
              <select value={form.distance_unit ?? 'km'} onChange={(e) => setForm({...form, distance_unit: e.target.value})} className="w-full px-3 py-2 border border-border rounded text-sm bg-white text-ink">
                <option value="km">km</option><option value="mile">mile</option>
              </select>
            </Field>
            <Field label="Language"><input value={form.language ?? 'en'} onChange={(e) => setForm({...form, language: e.target.value})} className="w-full px-3 py-2 border border-border rounded text-sm bg-white text-ink" /></Field>
            <Field label="Timezone"><input value={form.timezone ?? 'UTC'} onChange={(e) => setForm({...form, timezone: e.target.value})} className="w-full px-3 py-2 border border-border rounded text-sm bg-white text-ink" /></Field>
            <div className="col-span-2">
              <label className="block text-xs text-muted mb-1">Boundary (WKT POLYGON, lng lat pairs)</label>
              <textarea value={form.boundary_wkt ?? ''} onChange={(e) => setForm({...form, boundary_wkt: e.target.value})} rows={3} className="w-full px-3 py-2 border border-border rounded font-mono text-xs bg-white text-ink" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={submit} className="px-4 py-2 bg-accent text-white rounded text-sm">{editing ? 'Save changes' : 'Create region'}</button>
            <button onClick={() => { setShowForm(false); setEditing(null); setForm(EMPTY_FORM); }} className="px-4 py-2 border border-border rounded text-sm">Cancel</button>
          </div>
        </div>
      )}
      <Table rows={filteredRegions} columns={columns} rowKey={(r) => r.code} emptyMessage={isLoading ? 'Loading…' : 'No regions match.'} isLoading={isLoading} />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-muted mb-1">{label}</label>{children}</div>;
}
