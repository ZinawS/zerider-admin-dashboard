import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { useToast } from '../../components/Toast';

// ─── types ───────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  booking_type: 'ride' | 'delivery';
  booking_id: string;
  participant_ids: string[];
  status: 'active' | 'archived';
  archive_reason: string | null;
  archived_at: string | null;
  purge_at: string | null;
  created_at: string;
  updated_at: string | null;
}

interface Message {
  id: string;
  session_id: string;
  sender_id: string;
  sender_role: string;
  content: string;
  message_type: string;
  is_deleted: boolean;
  deleted_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmt(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function shortId(id: string) {
  return id.slice(0, 8) + '…';
}

// ─── archive reason modal ─────────────────────────────────────────────────────

const ARCHIVE_REASONS = [
  { value: 'admin_action', label: 'Admin action' },
  { value: 'policy_violation', label: 'Policy violation' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'spam', label: 'Spam' },
  { value: 'booking_completed', label: 'Booking completed' },
];

interface ArchiveModalProps {
  session: Session;
  onDone: () => void;
  onCancel: () => void;
}

function ArchiveModal({ session, onDone, onCancel }: ArchiveModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reason, setReason] = useState('admin_action');

  const mutation = useMutation({
    mutationFn: () =>
      api(`/v1/admin/chat/admin/sessions/${session.id}/archive`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      toast('Session archived.', 'success');
      qc.invalidateQueries({ queryKey: ['admin-chat-sessions'] });
      onDone();
    },
    onError: (e: any) => toast('Failed: ' + (e?.message ?? 'error'), 'error'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <div className="font-semibold text-sm">Archive session</div>
        <div className="text-xs text-muted">Session {shortId(session.id)} · {session.booking_type}</div>
        <div>
          <label className="block text-xs text-muted mb-1">Reason</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full border border-border rounded px-3 py-2 text-sm"
          >
            {ARCHIVE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex-1 px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-60"
          >
            {mutation.isPending ? 'Archiving…' : 'Archive session'}
          </button>
          <button onClick={onCancel} className="px-3 py-2 border border-border rounded text-sm hover:bg-bg">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── message thread ───────────────────────────────────────────────────────────

function MessageThread({ session }: { session: Session }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ['admin-chat-messages', session.id],
    queryFn: () => api<Message[]>(`/v1/admin/chat/sessions/${session.id}/messages?limit=100`),
    staleTime: 15_000,
    refetchInterval: session.status === 'active' ? 15_000 : false,
  });

  const deleteMessage = useMutation({
    mutationFn: (msgId: string) =>
      api(`/v1/admin/chat/admin/messages/${msgId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('Message deleted.', 'success');
      qc.invalidateQueries({ queryKey: ['admin-chat-messages', session.id] });
    },
    onError: (e: any) => toast('Failed: ' + (e?.message ?? 'error'), 'error'),
  });

  if (isLoading) return <div className="text-center text-muted py-12 text-sm">Loading messages…</div>;
  if (!messages.length) return <div className="text-center text-muted py-12 text-sm">No messages yet.</div>;

  return (
    <div className="space-y-2">
      {messages.map((m) => (
        <div key={m.id} className={`flex gap-3 ${m.is_deleted ? 'opacity-50' : ''}`}>
          <div className="shrink-0 pt-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${m.sender_role === 'driver' ? 'bg-blue-500' : m.sender_role === 'rider' ? 'bg-emerald-500' : 'bg-purple-500'}`}>
              {m.sender_role[0].toUpperCase()}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-xs font-medium capitalize">{m.sender_role}</span>
              <span className="text-[10px] text-muted" title={fmt(m.created_at)}>{timeAgo(m.created_at)}</span>
              {m.read_at && <span className="text-[10px] text-muted">✓✓</span>}
            </div>
            {m.is_deleted ? (
              <div className="text-xs text-muted italic">Message deleted {fmt(m.deleted_at)}</div>
            ) : (
              <div className="text-sm bg-surface border border-border rounded-lg px-3 py-2 inline-block max-w-sm">
                {m.content}
              </div>
            )}
          </div>
          {!m.is_deleted && (
            <button
              onClick={() => deleteMessage.mutate(m.id)}
              disabled={deleteMessage.isPending}
              className="shrink-0 self-start mt-1 text-[10px] px-1.5 py-0.5 border border-red-200 text-red-400 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100"
              title="Delete message"
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export function ChatModerationPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selected, setSelected] = useState<Session | null>(null);
  const [archiving, setArchiving] = useState<Session | null>(null);

  const { data, isLoading } = useQuery<{ items: Session[]; total: number }>({
    queryKey: ['admin-chat-sessions', page, statusFilter, typeFilter],
    queryFn: () => {
      const qs = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
        ...(statusFilter && { status: statusFilter }),
        ...(typeFilter && { booking_type: typeFilter }),
      });
      return api<{ items: Session[]; total: number }>(`/v1/admin/chat/admin/sessions?${qs}`);
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const sessions = data?.items ?? [];
  const total    = data?.total ?? 0;

  function statusBadge(s: Session) {
    if (s.status === 'active') {
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Active</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Archived</span>;
  }

  function typeBadge(t: string) {
    return t === 'ride'
      ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Ride</span>
      : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Delivery</span>;
  }

  return (
    <div>
      <PageHeader title="Chat Moderation" subtitle="Review active sessions, view message history, archive or delete messages" />

      {/* ── Filters ── */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="text-sm px-3 py-1.5 border border-border rounded bg-surface"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="text-sm px-3 py-1.5 border border-border rounded bg-surface"
        >
          <option value="">All types</option>
          <option value="ride">Ride</option>
          <option value="delivery">Delivery</option>
        </select>
        <div className="ml-auto text-sm text-muted self-center">
          {total.toLocaleString()} session{total !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="flex gap-6">
        {/* ── Session list ── */}
        <div className="w-72 shrink-0 space-y-1.5">
          {isLoading && (
            <div className="text-sm text-muted text-center py-12">Loading…</div>
          )}
          {!isLoading && sessions.length === 0 && (
            <div className="text-sm text-muted text-center py-12">No sessions found.</div>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className={`w-full text-left px-3 py-3 rounded-lg border transition-colors ${
                selected?.id === s.id
                  ? 'border-ink bg-ink text-white'
                  : 'border-border bg-surface hover:bg-bg'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                {typeBadge(s.booking_type)}
                {statusBadge(s)}
              </div>
              <div className={`text-xs font-mono truncate mt-1 ${selected?.id === s.id ? 'text-white/80' : 'text-muted'}`}>
                {s.booking_id}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className={`text-[10px] ${selected?.id === s.id ? 'text-white/60' : 'text-muted'}`}>
                  {s.participant_ids.length} participants
                </span>
                <span className={`text-[10px] ${selected?.id === s.id ? 'text-white/60' : 'text-muted'}`}>
                  {timeAgo(s.created_at)}
                </span>
              </div>
            </button>
          ))}

          {total > PAGE_SIZE && (
            <div className="pt-2">
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
            </div>
          )}
        </div>

        {/* ── Thread panel ── */}
        <div className="flex-1 min-w-0">
          {!selected ? (
            <div className="h-64 flex items-center justify-center text-muted text-sm">
              Select a session to view messages
            </div>
          ) : (
            <div>
              {/* Session header */}
              <div className="bg-surface border border-border rounded-xl p-4 mb-4 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {typeBadge(selected.booking_type)}
                    {statusBadge(selected)}
                    {selected.archive_reason && (
                      <span className="text-xs text-muted">reason: {selected.archive_reason}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted font-mono">{selected.id}</div>
                  <div className="text-xs text-muted">Booking: <span className="font-mono">{selected.booking_id}</span></div>
                  <div className="text-xs text-muted">
                    Participants: {selected.participant_ids.map((id) => (
                      <span key={id} className="font-mono mr-2">{shortId(id)}</span>
                    ))}
                  </div>
                  <div className="text-xs text-muted">Created: {fmt(selected.created_at)}</div>
                  {selected.archived_at && (
                    <div className="text-xs text-muted">Archived: {fmt(selected.archived_at)}</div>
                  )}
                  {selected.purge_at && (
                    <div className="text-xs text-amber-600">Purge at: {fmt(selected.purge_at)}</div>
                  )}
                </div>
                {selected.status === 'active' && (
                  <button
                    onClick={() => setArchiving(selected)}
                    className="shrink-0 px-3 py-1.5 border border-red-200 text-red-600 rounded text-xs hover:bg-red-50"
                  >
                    Archive session
                  </button>
                )}
              </div>

              {/* Messages */}
              <div className="bg-surface border border-border rounded-xl p-4 group">
                <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Messages</div>
                <MessageThread session={selected} />
              </div>
            </div>
          )}
        </div>
      </div>

      {archiving && (
        <ArchiveModal
          session={archiving}
          onDone={() => { setArchiving(null); setSelected(null); }}
          onCancel={() => setArchiving(null)}
        />
      )}
    </div>
  );
}
