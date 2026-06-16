import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { PageHeader } from '../../components/PageHeader';
import { useAdminRole } from '../../hooks/usePermission';
import { useAuthStore } from '../../stores/auth.store.js';
import { exportToCsv } from '../../lib/export.js';

type AdminRole = 'super_admin' | 'regional_admin' | 'ops_manager' | 'support_agent';

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  admin_role: AdminRole;
  assigned_region: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  regional_admin: 'Regional Admin',
  ops_manager: 'Operations Manager',
  support_agent: 'Support Agent',
};

const ROLE_COLOR: Record<AdminRole, string> = {
  super_admin: 'bg-purple-100 text-purple-800',
  regional_admin: 'bg-blue-100 text-blue-800',
  ops_manager: 'bg-green-100 text-green-800',
  support_agent: 'bg-gray-100 text-gray-700',
};

const ROLE_DESCRIPTION: Record<AdminRole, string> = {
  super_admin: 'Full access — manage all admins, pricing, regions, users.',
  regional_admin: 'Same as Super Admin but restricted to their assigned region.',
  ops_manager: 'Manage rides, approve/reject drivers, view reports. No pricing or region config.',
  support_agent: 'View users and rides, can suspend accounts. Read-only otherwise.',
};

const BLANK = { email: '', password: '', full_name: '', admin_role: 'support_agent' as AdminRole, assigned_region: '' };

export function AdminUsersPage(): JSX.Element {
  const myRole = useAdminRole();
  const myId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [form, setForm] = useState(BLANK);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api<{ items: AdminUser[] }>('/v1/admin/admin-users'),
    enabled: myRole === 'super_admin',
  });

  const { data: regionsData } = useQuery({
    queryKey: ['regions-list'],
    queryFn: () => api<{ items: Array<{ code: string; name: string }> } | Array<{ code: string; name: string }>>('/v1/admin/regions'),
    staleTime: 5 * 60_000,
  });
  const regions: Array<{ code: string; name: string }> = Array.isArray(regionsData) ? regionsData : (regionsData?.items ?? []);

  const { data: auditData } = useQuery({
    queryKey: ['admin-permission-audit'],
    queryFn: () => api<{ items: any[] }>('/v1/admin/admin-users/audit'),
    enabled: myRole === 'super_admin',
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof BLANK) => api('/v1/admin/admin-users', { method: 'POST', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setCreating(false); setForm(BLANK); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) => api(`/v1/admin/admin-users/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setEditTarget(null); },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api(`/v1/admin/admin-users/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const admins = data?.items ?? [];

  const exportAdmins = (list: AdminUser[]) => exportToCsv(`admin-team-${new Date().toISOString().slice(0, 10)}`, list, [
    { header: 'Name', getValue: (a) => a.full_name ?? '' },
    { header: 'Email', getValue: (a) => a.email },
    { header: 'Role', getValue: (a) => ROLE_LABEL[a.admin_role] },
    { header: 'Region', getValue: (a) => a.assigned_region
      ? (regions.find(r => r.code === a.assigned_region)?.name
          ? `${regions.find(r => r.code === a.assigned_region)!.name} (${a.assigned_region})`
          : a.assigned_region)
      : 'All regions' },
    { header: 'Status', getValue: (a) => a.is_active ? 'Active' : 'Inactive' },
    { header: 'Last login', getValue: (a) => a.last_login_at ? new Date(a.last_login_at).toLocaleString() : 'Never' },
  ]);

  // Non-super-admins see a read-only team directory
  if (myRole !== 'super_admin') {
    return (
      <>
        <div className="mb-6 flex items-start justify-between">
          <PageHeader title="Admin team" subtitle="Your fellow team members and their roles." />
          <button onClick={() => exportAdmins(admins.filter(a => a.is_active))}
            className="px-3 py-2 text-xs border border-border rounded hover:bg-surface">↓ Export CSV</button>
        </div>
        <div className="bg-white border border-border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-left px-4 py-2">Email</th>
                <th className="text-left px-4 py-2">Role</th>
                <th className="text-left px-4 py-2">Region</th>
                <th className="text-left px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">Loading…</td></tr>
                : admins.filter(a => a.is_active).map((a) => {
                    const regionLabel = a.assigned_region
                      ? (regions.find(r => r.code === a.assigned_region)?.name
                          ? `${regions.find(r => r.code === a.assigned_region)!.name} (${a.assigned_region})`
                          : a.assigned_region)
                      : 'All regions';
                    return (
                      <tr key={a.id} className="border-t border-border">
                        <td className="px-4 py-3 font-medium">{a.full_name ?? '—'}</td>
                        <td className="px-4 py-3 text-muted">{a.email}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${ROLE_COLOR[a.admin_role]}`}>
                            {ROLE_LABEL[a.admin_role]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">{regionLabel}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded font-medium bg-green-100 text-green-800">Active</span>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted mt-3">Contact a Super Admin to add, edit, or remove team members.</p>
      </>
    );
  }

  return (
    <>
      <div className="flex items-start justify-between mb-6">
        <PageHeader title="Admin Users" subtitle="Manage who can access this console and what they can do." />
        <div className="flex gap-2">
          <button onClick={() => exportAdmins(admins)}
            className="px-3 py-2 text-xs border border-border rounded hover:bg-surface">↓ Export CSV</button>
          <button onClick={() => { setCreating(true); setForm(BLANK); }} className="px-4 py-2 bg-accent text-white text-sm rounded">
            + Add admin
          </button>
        </div>
      </div>

      {/* Role reference */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {(Object.entries(ROLE_LABEL) as [AdminRole, string][]).map(([role, label]) => (
          <div key={role} className="bg-white border border-border rounded-lg p-3">
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${ROLE_COLOR[role]}`}>{label}</span>
            <p className="text-xs text-muted mt-2">{ROLE_DESCRIPTION[role]}</p>
          </div>
        ))}
      </div>

      {/* Admin users table */}
      <div className="bg-white border border-border rounded overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2">Name / Email</th>
              <th className="text-left px-4 py-2">Role</th>
              <th className="text-left px-4 py-2">Region</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Last login</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">Loading…</td></tr>
              : admins.length === 0
              ? <tr><td colSpan={6} className="px-4 py-6 text-center text-muted italic">No admin users yet.</td></tr>
              : admins.map((a) => (
                  <tr key={a.id} className={`border-t border-border ${!a.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{a.full_name ?? '—'}</div>
                      <div className="text-xs text-muted">{a.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${ROLE_COLOR[a.admin_role]}`}>
                        {ROLE_LABEL[a.admin_role]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {a.assigned_region
                        ? (regions.find(r => r.code === a.assigned_region)?.name
                            ? `${regions.find(r => r.code === a.assigned_region)!.name} (${a.assigned_region})`
                            : a.assigned_region)
                        : 'All regions'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${a.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {a.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {a.last_login_at ? new Date(a.last_login_at).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setEditTarget(a); setForm({ email: a.email, password: '', full_name: a.full_name ?? '', admin_role: a.admin_role, assigned_region: a.assigned_region ?? '' }); }}
                          className="px-2 py-1 text-xs border border-border rounded hover:bg-surface">
                          Edit
                        </button>
                        {a.id !== myId && a.is_active && (
                          <button onClick={() => deactivateMutation.mutate(a.id)}
                            disabled={deactivateMutation.isPending}
                            className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50">
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Permission audit log */}
      {auditData?.items?.length ? (
        <>
          <h3 className="font-semibold mb-3">Permission change audit log</h3>
          <div className="bg-white border border-border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface text-muted text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">When</th>
                  <th className="text-left px-4 py-2">Action</th>
                  <th className="text-left px-4 py-2">Admin</th>
                  <th className="text-left px-4 py-2">Actor</th>
                  <th className="text-left px-4 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {auditData.items.map((a: any) => (
                  <tr key={a.id} className="border-t border-border text-xs">
                    <td className="px-4 py-2 text-muted whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2"><span className="font-mono bg-surface px-1 py-0.5 rounded">{a.action}</span></td>
                    <td className="px-4 py-2 text-muted">{a.admin_email ?? a.admin_id?.slice(0, 8)}</td>
                    <td className="px-4 py-2 text-muted">{a.actor_email ?? a.actor_id?.slice(0, 8) ?? '—'}</td>
                    <td className="px-4 py-2 text-muted font-mono">{a.new_value ? JSON.stringify(a.new_value).slice(0, 80) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {/* Create / Edit modal */}
      {(creating || editTarget) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{creating ? 'Add admin user' : `Edit ${editTarget?.email}`}</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-muted mb-1">Full name</label>
                <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded text-sm" placeholder="Jane Smith" />
              </div>
              {creating && (
                <>
                  <div>
                    <label className="block text-xs text-muted mb-1">Email *</label>
                    <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                      type="email" required className="w-full px-3 py-2 border border-border rounded text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">Password *</label>
                    <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                      type="password" required className="w-full px-3 py-2 border border-border rounded text-sm" />
                  </div>
                </>
              )}
              {editTarget && (
                <div>
                  <label className="block text-xs text-muted mb-1">New password (leave blank to keep)</label>
                  <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                    type="password" className="w-full px-3 py-2 border border-border rounded text-sm" />
                </div>
              )}
              <div>
                <label className="block text-xs text-muted mb-1">Role *</label>
                <select value={form.admin_role} onChange={(e) => setForm({ ...form, admin_role: e.target.value as AdminRole })}
                  className="w-full px-3 py-2 border border-border rounded text-sm">
                  {(Object.entries(ROLE_LABEL) as [AdminRole, string][]).map(([r, l]) => (
                    <option key={r} value={r}>{l}</option>
                  ))}
                </select>
                <p className="text-xs text-muted mt-1">{ROLE_DESCRIPTION[form.admin_role]}</p>
              </div>
              {(form.admin_role === 'regional_admin') && (
                <div>
                  <label className="block text-xs text-muted mb-1">Assigned region *</label>
                  <select
                    value={form.assigned_region}
                    onChange={(e) => setForm({ ...form, assigned_region: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded text-sm"
                  >
                    <option value="">— select region —</option>
                    {regions.map((r) => (
                      <option key={r.code} value={r.code}>{r.name} ({r.code})</option>
                    ))}
                  </select>
                  {regions.length === 0 && (
                    <p className="text-xs text-muted mt-1">No regions found. Add regions in the Regions page first.</p>
                  )}
                </div>
              )}
            </div>

            {(createMutation.error || updateMutation.error) && (
              <p className="text-xs text-danger mt-3">{String((createMutation.error ?? updateMutation.error as any)?.message ?? 'Error')}</p>
            )}

            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => { setCreating(false); setEditTarget(null); }}
                className="px-4 py-2 text-sm border border-border rounded hover:bg-surface">Cancel</button>
              <button
                disabled={createMutation.isPending || updateMutation.isPending}
                onClick={() => {
                  if (creating) {
                    createMutation.mutate(form);
                  } else if (editTarget) {
                    const patch: any = { admin_role: form.admin_role, full_name: form.full_name || null, assigned_region: form.assigned_region || null };
                    if (form.password) patch.password = form.password;
                    updateMutation.mutate({ id: editTarget.id, patch });
                  }
                }}
                className="px-4 py-2 text-sm bg-accent text-white rounded disabled:opacity-50">
                {createMutation.isPending || updateMutation.isPending ? 'Saving…' : creating ? 'Create' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
