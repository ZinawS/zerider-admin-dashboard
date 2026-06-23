import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { PageHeader } from '../../components/PageHeader.js';
import { useToast } from '../../components/Toast.js';
import { Pagination } from '../../components/Pagination.js';

// ─── types ───────────────────────────────────────────────────────────────────

interface NotificationLog {
  id: string;
  channel: 'push' | 'sms' | 'email' | 'whatsapp';
  recipient_role: string;
  recipient_id: string | null;
  title: string | null;
  body: string;
  status: 'sent' | 'failed' | 'pending';
  created_at: string;
  sent_at: string | null;
  error: string | null;
}

type Channel = 'push' | 'sms' | 'email' | 'whatsapp';
type AudienceType = 'all_riders' | 'all_drivers' | 'specific_user' | 'region';

// ─── helpers ─────────────────────────────────────────────────────────────────

function channelBadge(ch: string) {
  const cls: Record<string, string> = {
    push: 'bg-blue-100 text-blue-800',
    sms: 'bg-green-100 text-green-800',
    email: 'bg-purple-100 text-purple-800',
    whatsapp: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${cls[ch] ?? 'bg-surface text-muted'}`}>
      {ch}
    </span>
  );
}

function statusBadge(s: string) {
  const cls =
    s === 'sent' ? 'bg-success/10 text-success'
    : s === 'failed' ? 'bg-danger/10 text-danger'
    : 'bg-yellow-100 text-yellow-800';
  return <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${cls}`}>{s}</span>;
}

// ─── Broadcast form ───────────────────────────────────────────────────────────

function BroadcastForm() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [channel, setChannel] = useState<Channel>('push');
  const [audience, setAudience] = useState<AudienceType>('all_riders');
  const [userId, setUserId] = useState('');
  const [region, setRegion] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: regions } = useQuery({
    queryKey: ['regions-list'],
    queryFn: () => api<{ items: Array<{ code: string; name: string }> } | Array<{ code: string; name: string }>>('/v1/admin/regions'),
    staleTime: 5 * 60_000,
  });
  const regionList: Array<{ code: string; name: string }> = Array.isArray(regions) ? regions : (regions?.items ?? []);

  const send = useMutation({
    mutationFn: () => {
      const payload: any = { channel, body };
      if (channel === 'push' && title) payload.title = title;
      if (audience === 'specific_user') {
        payload.recipient_id = userId;
        payload.recipient_role = 'user';
      } else if (audience === 'all_riders') {
        payload.recipient_role = 'rider';
        payload.broadcast = true;
      } else if (audience === 'all_drivers') {
        payload.recipient_role = 'driver';
        payload.broadcast = true;
      } else if (audience === 'region') {
        payload.recipient_role = 'all';
        payload.broadcast = true;
        payload.region_code = region;
      }
      return api('/v1/admin/notifications/broadcast', { method: 'POST', body: payload });
    },
    onSuccess: () => {
      toast('Notification sent successfully.', 'success');
      qc.invalidateQueries({ queryKey: ['notification-log'] });
      setTitle('');
      setBody('');
      setUserId('');
      setConfirmOpen(false);
    },
    onError: (e: any) => {
      toast('Failed to send: ' + (e?.message ?? 'unknown error'), 'error');
      setConfirmOpen(false);
    },
  });

  const canSend = body.trim() && (audience !== 'specific_user' || userId.trim()) && (audience !== 'region' || region);

  return (
    <div className="bg-white border border-border rounded-xl p-6 space-y-4">
      <div className="text-sm font-semibold">Send notification</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-muted mb-1">Channel</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
            className="w-full px-3 py-2 text-sm border border-border rounded bg-white"
          >
            <option value="push">Push notification</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Audience</label>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as AudienceType)}
            className="w-full px-3 py-2 text-sm border border-border rounded bg-white"
          >
            <option value="all_riders">All riders</option>
            <option value="all_drivers">All drivers</option>
            <option value="region">All users in region</option>
            <option value="specific_user">Specific user (by ID)</option>
          </select>
        </div>
      </div>

      {audience === 'specific_user' && (
        <div>
          <label className="block text-xs text-muted mb-1">User ID *</label>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full px-3 py-2 text-sm border border-border rounded"
          />
        </div>
      )}

      {audience === 'region' && (
        <div>
          <label className="block text-xs text-muted mb-1">Region *</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded bg-white"
          >
            <option value="">Select region…</option>
            {regionList.map((r) => (
              <option key={r.code} value={r.code}>{r.name} ({r.code})</option>
            ))}
          </select>
        </div>
      )}

      {channel === 'push' && (
        <div>
          <label className="block text-xs text-muted mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional notification title"
            className="w-full px-3 py-2 text-sm border border-border rounded"
          />
        </div>
      )}

      <div>
        <label className="block text-xs text-muted mb-1">Message *</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Notification message…"
          className="w-full px-3 py-2 text-sm border border-border rounded resize-none"
        />
        <div className="text-xs text-muted text-right mt-0.5">{body.length} chars</div>
      </div>

      {confirmOpen ? (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
          <div className="text-sm text-orange-800">
            <strong>Confirm broadcast</strong> — this will send a {channel} to{' '}
            {audience === 'specific_user' ? `user ${userId.slice(0, 8)}…` : audience.replace('_', ' ')}.
            {audience !== 'specific_user' && (
              <span className="text-orange-700 font-medium"> This is a mass notification.</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => send.mutate()}
              disabled={send.isPending}
              className="px-4 py-2 text-sm bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
            >
              {send.isPending ? 'Sending…' : 'Yes, send now'}
            </button>
            <button onClick={() => setConfirmOpen(false)} className="px-4 py-2 text-sm border border-border rounded">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!canSend}
          className="px-5 py-2 text-sm bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-40"
        >
          Send notification
        </button>
      )}
    </div>
  );
}

// ─── Log table ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

function NotificationLog() {
  const [page, setPage] = useState(1);
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['notification-log', page, channelFilter, statusFilter],
    queryFn: () => {
      const qs = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
        ...(channelFilter && { channel: channelFilter }),
        ...(statusFilter && { status: statusFilter }),
      });
      return api<{ items: NotificationLog[]; total: number }>(`/v1/admin/notifications?${qs}`);
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <div className="text-sm font-semibold">Delivery log</div>
        <select
          value={channelFilter}
          onChange={(e) => { setChannelFilter(e.target.value); setPage(1); }}
          className="text-xs px-2 py-1.5 border border-border rounded bg-white ml-auto"
        >
          <option value="">All channels</option>
          <option value="push">Push</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="text-xs px-2 py-1.5 border border-border rounded bg-white"
        >
          <option value="">All statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
        <span className="text-xs text-muted">{total.toLocaleString()} entries</span>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2.5">When</th>
              <th className="text-left px-4 py-2.5">Channel</th>
              <th className="text-left px-4 py-2.5">Audience</th>
              <th className="text-left px-4 py-2.5">Title / Body</th>
              <th className="text-left px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted text-sm">Loading…</td>
              </tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted text-sm">No notifications found.</td>
              </tr>
            )}
            {items.map((n) => (
              <tr key={n.id} className="border-t border-border hover:bg-surface/50">
                <td className="px-4 py-2.5 text-xs text-muted whitespace-nowrap">
                  {new Date(n.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2.5">{channelBadge(n.channel)}</td>
                <td className="px-4 py-2.5 text-xs text-muted capitalize">
                  {n.recipient_id ? (
                    <span className="font-mono">{n.recipient_id.slice(0, 8)}…</span>
                  ) : (
                    n.recipient_role?.replace('_', ' ') || 'all'
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {n.title && <div className="text-xs font-medium text-ink">{n.title}</div>}
                  <div className="text-xs text-muted truncate max-w-xs">{n.body}</div>
                  {n.error && <div className="text-xs text-danger mt-0.5">{n.error}</div>}
                </td>
                <td className="px-4 py-2.5">{statusBadge(n.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-4">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function NotificationsPage(): JSX.Element {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Notifications"
        subtitle="Broadcast push, SMS, email, or WhatsApp notifications to riders and drivers."
      />
      <BroadcastForm />
      <NotificationLog />
    </div>
  );
}
