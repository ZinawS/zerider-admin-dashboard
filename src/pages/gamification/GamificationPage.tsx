import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useRegionScope } from '../../stores/region-scope.store.js';
import { PageHeader } from '../../components/PageHeader.js';

type ChallengeType = 'trips_completed' | 'earnings_cents' | 'avg_rating';

interface Challenge {
  id: string;
  title: string;
  description: string;
  icon: string;
  challenge_type: ChallengeType;
  target_value: number;
  bonus_cents: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

interface LeaderboardEntry {
  driver_id: string;
  first_name: string | null;
  last_name: string | null;
  total_trips: number;
  total_earnings_cents: number;
}

const TYPE_LABEL: Record<ChallengeType, string> = {
  trips_completed: 'Trips completed',
  earnings_cents: 'Earnings (cents)',
  avg_rating: 'Average rating',
};

const EMPTY_FORM = {
  title: '',
  description: '',
  icon: '🏆',
  challenge_type: 'trips_completed' as ChallengeType,
  target_value: 10,
  bonus_cents: 500,
  starts_at: new Date().toISOString().slice(0, 16),
  ends_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
  is_active: true,
};

type Tab = 'challenges' | 'leaderboard';

export function GamificationPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('challenges');
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const qc = useQueryClient();
  const regionCode = useRegionScope((s) => s.regionCode);
  const rqs = regionCode ? `?region=${regionCode}` : '';

  const { data: challenges = [], isLoading: cLoading, isError: cError } = useQuery<Challenge[]>({
    queryKey: ['driver-challenges', regionCode],
    queryFn: () =>
      api<{ items: Challenge[] } | Challenge[]>(`/v1/admin/gamification/challenges${rqs}`).then((r) =>
        Array.isArray(r) ? r : (r.items ?? []),
      ),
    enabled: tab === 'challenges',
    retry: false,
  });

  const { data: leaderboard = [], isLoading: lLoading, isError: lError } = useQuery<LeaderboardEntry[]>({
    queryKey: ['driver-leaderboard', regionCode],
    queryFn: () => api(`/v1/admin/gamification/leaderboard${rqs}`),
    enabled: tab === 'leaderboard',
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (data: typeof EMPTY_FORM & { id?: string }) => {
      const payload = {
        ...data,
        starts_at: new Date(data.starts_at).toISOString(),
        ends_at: new Date(data.ends_at).toISOString(),
      };
      if (data.id) {
        return api(`/v1/admin/gamification/challenges/${data.id}`, { method: 'PATCH', body: payload });
      }
      return api('/v1/admin/gamification/challenges', { method: 'POST', body: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-challenges'] });
      setEditingId(null);
      setForm(EMPTY_FORM);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/v1/admin/gamification/challenges/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver-challenges'] }),
  });

  const openNew = () => { setForm(EMPTY_FORM); setEditingId('new'); };
  const openEdit = (c: Challenge) => {
    setForm({
      title: c.title, description: c.description, icon: c.icon,
      challenge_type: c.challenge_type, target_value: c.target_value,
      bonus_cents: c.bonus_cents,
      starts_at: new Date(c.starts_at).toISOString().slice(0, 16),
      ends_at: new Date(c.ends_at).toISOString().slice(0, 16),
      is_active: c.is_active,
    });
    setEditingId(c.id);
  };

  const handleSave = () => {
    saveMutation.mutate(editingId === 'new' ? form : { ...form, id: editingId! });
  };

  return (
    <div>
      <PageHeader
        title="Gamification"
        subtitle="Manage driver challenges and view leaderboard."
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-border/20 p-1 rounded-lg w-fit">
        {(['challenges', 'leaderboard'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm rounded-md capitalize transition-colors ${
              tab === t ? 'bg-ink text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {t === 'challenges' ? 'Driver challenges' : 'Leaderboard'}
          </button>
        ))}
      </div>

      {tab === 'challenges' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={openNew}
              className="px-4 py-2 text-sm bg-ink text-white rounded-lg hover:opacity-80"
            >
              + New challenge
            </button>
          </div>

          {cLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : cError ? (
            <div className="text-center py-12 text-muted text-sm">
              Could not load challenges. Check that the admin service is running.
            </div>
          ) : challenges.length === 0 ? (
            <div className="text-center py-12 text-muted text-sm">
              No challenges yet. Create one to motivate your drivers.
            </div>
          ) : (
            <div className="space-y-3">
              {challenges.map((c) => (
                <div key={c.id} className="bg-surface border border-border rounded-xl p-4 flex items-start gap-4">
                  <span className="text-3xl leading-none mt-0.5">{c.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{c.title}</span>
                      {!c.is_active && (
                        <span className="text-xs bg-border text-muted px-1.5 py-0.5 rounded">Inactive</span>
                      )}
                      {new Date(c.ends_at) < new Date() && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Ended</span>
                      )}
                    </div>
                    <p className="text-sm text-muted mt-0.5">{c.description}</p>
                    <div className="flex gap-4 mt-2 text-xs text-muted">
                      <span>{TYPE_LABEL[c.challenge_type]}: <b className="text-ink">{c.challenge_type === 'earnings_cents' ? `$${(c.target_value / 100).toFixed(2)}` : c.target_value}</b></span>
                      <span>Bonus: <b className="text-ink">${(c.bonus_cents / 100).toFixed(2)}</b></span>
                      <span>Ends: <b className="text-ink">{new Date(c.ends_at).toLocaleDateString()}</b></span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => openEdit(c)} className="text-xs text-accent hover:underline">Edit</button>
                    <button
                      onClick={() => { if (confirm('Delete this challenge?')) deleteMutation.mutate(c.id); }}
                      className="text-xs text-danger hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'leaderboard' && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="font-semibold text-ink">Top drivers by total trips</h2>
          </div>
          {lLoading ? (
            <div className="px-6 py-8 text-center text-sm text-muted">Loading…</div>
          ) : lError ? (
            <div className="px-6 py-8 text-center text-sm text-muted">Could not load leaderboard. Check that the admin service is running.</div>
          ) : leaderboard.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted">No data yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-border/10 text-muted">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">#</th>
                  <th className="px-6 py-3 text-left font-medium">Driver</th>
                  <th className="px-6 py-3 text-right font-medium">Total trips</th>
                  <th className="px-6 py-3 text-right font-medium">Lifetime earnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leaderboard.map((entry, i) => {
                  const name = [entry.first_name, entry.last_name].filter(Boolean).join(' ') || '(unnamed)';
                  return (
                  <tr key={entry.driver_id} className={i < 3 ? 'bg-amber-50/30' : ''}>
                    <td className="px-6 py-3 font-semibold text-muted">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </td>
                    <td className="px-6 py-3">
                      <div className="font-medium text-ink text-sm">{name}</div>
                      <div className="font-mono text-xs text-muted">{entry.driver_id.slice(0, 8)}…</div>
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-ink">{entry.total_trips.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right text-ink">${(Number(entry.total_earnings_cents) / 100).toFixed(2)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Challenge Form Modal */}
      {editingId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h2 className="text-lg font-semibold text-ink">
              {editingId === 'new' ? 'New challenge' : 'Edit challenge'}
            </h2>

            {([
              { label: 'Title', key: 'title', type: 'text', placeholder: 'Complete 10 weekend trips' },
              { label: 'Description', key: 'description', type: 'text', placeholder: 'Finish 10 trips this weekend and earn a bonus' },
              { label: 'Icon', key: 'icon', type: 'text', placeholder: '🏆' },
            ] as const).map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-ink mb-1">{label}</label>
                <input
                  type={type}
                  value={(form as any)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium text-ink mb-1">Challenge type</label>
              <select
                value={form.challenge_type}
                onChange={(e) => setForm((f) => ({ ...f, challenge_type: e.target.value as ChallengeType }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                {Object.entries(TYPE_LABEL).map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">
                  Target {form.challenge_type === 'earnings_cents' ? '(cents)' : ''}
                </label>
                <input
                  type="number"
                  value={form.target_value}
                  onChange={(e) => setForm((f) => ({ ...f, target_value: Number(e.target.value) }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Bonus (cents)</label>
                <input
                  type="number"
                  value={form.bonus_cents}
                  onChange={(e) => setForm((f) => ({ ...f, bonus_cents: Number(e.target.value) }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Starts at</label>
                <input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Ends at</label>
                <input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm text-ink">Active</span>
            </label>

            {saveMutation.isError && (
              <p className="text-sm text-danger">Failed to save. Please try again.</p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}
                className="flex-1 border border-border rounded-lg py-2 text-sm hover:bg-border/20"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex-1 bg-ink text-white rounded-lg py-2 text-sm hover:opacity-80 disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
