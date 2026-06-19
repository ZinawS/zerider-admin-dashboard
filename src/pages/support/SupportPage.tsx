import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { PageHeader } from '../../components/PageHeader.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TicketStatus   = 'open' | 'in_progress' | 'resolved' | 'closed';
type TicketCategory = 'refund' | 'dispute' | 'safety' | 'general' | 'other';
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
type Source         = 'rider' | 'driver';

interface SupportTicket {
  id: string;
  user_id: string;
  category: TicketCategory;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  resolution: string | null;
  ride_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: 'user' | 'admin';
  message: string;
  read_at: string | null;
  created_at: string;
}

interface TicketDetail extends SupportTicket {
  messages: SupportMessage[];
}

interface TicketsResponse {
  tickets: SupportTicket[];
  source: Source;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

function statusColor(s: TicketStatus): string {
  switch (s) {
    case 'open':        return 'bg-yellow-100 text-yellow-800';
    case 'in_progress': return 'bg-blue-100 text-blue-800';
    case 'resolved':    return 'bg-green-100 text-green-800';
    case 'closed':      return 'bg-gray-100 text-gray-500';
    default:            return 'bg-gray-100 text-gray-600';
  }
}

function statusLabel(s: TicketStatus): string {
  switch (s) {
    case 'in_progress': return 'In Progress';
    default:            return s.charAt(0).toUpperCase() + s.slice(1);
  }
}

function priorityColor(p: TicketPriority): string {
  switch (p) {
    case 'urgent': return 'bg-red-100 text-red-800';
    case 'high':   return 'bg-orange-100 text-orange-800';
    case 'normal': return 'bg-gray-100 text-gray-600';
    case 'low':    return 'bg-gray-50 text-gray-400';
    default:       return 'bg-gray-100 text-gray-600';
  }
}

function short(id: string): string {
  return id.slice(0, 8);
}

// ---------------------------------------------------------------------------
// KPI row
// ---------------------------------------------------------------------------

interface KpiRowProps {
  riderTickets: SupportTicket[] | undefined;
  driverTickets: SupportTicket[] | undefined;
  riderLoading: boolean;
  driverLoading: boolean;
}

function KpiRow({ riderTickets, driverTickets, riderLoading, driverLoading }: KpiRowProps) {
  const openRider  = (riderTickets  ?? []).filter((t) => t.status === 'open').length;
  const openDriver = (driverTickets ?? []).filter((t) => t.status === 'open').length;

  return (
    <div className="flex flex-wrap gap-3 mb-5">
      <div className="bg-white border border-border rounded px-4 py-3 min-w-[160px]">
        <div className="text-xs text-muted mb-1">Open rider tickets</div>
        <div className={`text-2xl font-semibold ${openRider > 0 ? 'text-yellow-700' : 'text-ink'}`}>
          {riderLoading ? '…' : openRider}
        </div>
      </div>
      <div className="bg-white border border-border rounded px-4 py-3 min-w-[160px]">
        <div className="text-xs text-muted mb-1">Open driver tickets</div>
        <div className={`text-2xl font-semibold ${openDriver > 0 ? 'text-yellow-700' : 'text-ink'}`}>
          {driverLoading ? '…' : openDriver}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

interface DetailPanelProps {
  ticketId: string;
  source: Source;
  onClose: () => void;
  onUpdated: () => void;
}

function DetailPanel({ ticketId, source, onClose, onUpdated }: DetailPanelProps) {
  const [replyText,       setReplyText]       = useState('');
  const [newStatus,       setNewStatus]       = useState<TicketStatus | ''>('');
  const [resolution,      setResolution]      = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const detailKey = ['support-ticket-detail', source, ticketId];

  const { data, isLoading } = useQuery({
    queryKey: detailKey,
    queryFn: () => api<TicketDetail>(`/v1/admin/${source}-support/tickets/${ticketId}`),
  });

  // Scroll to bottom of messages when they load/update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.messages]);

  const replyMutation = useMutation({
    mutationFn: () =>
      api<SupportMessage>(`/v1/admin/${source}-support/tickets/${ticketId}/reply`, {
        method: 'POST',
        body: { message: replyText },
      }),
    onSuccess: () => {
      setReplyText('');
      qc.invalidateQueries({ queryKey: detailKey });
      onUpdated();
    },
    onError: (e: any) => alert('Reply failed: ' + (e?.message ?? 'unknown')),
  });

  const statusMutation = useMutation({
    mutationFn: () =>
      api<SupportTicket>(`/v1/admin/${source}-support/tickets/${ticketId}/status`, {
        method: 'PATCH',
        body: {
          status: newStatus,
          ...(resolution.trim() ? { resolution: resolution.trim() } : {}),
        },
      }),
    onSuccess: () => {
      setNewStatus('');
      setResolution('');
      qc.invalidateQueries({ queryKey: detailKey });
      qc.invalidateQueries({ queryKey: ['support-tickets', source] });
      onUpdated();
    },
    onError: (e: any) => alert('Status update failed: ' + (e?.message ?? 'unknown')),
  });

  const ticket = data;
  const requiresResolution = newStatus === 'resolved' || newStatus === 'closed';

  return (
    <div
      className="fixed inset-y-0 right-0 w-full max-w-lg bg-white border-l border-border shadow-xl z-40 flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold text-ink truncate max-w-xs">
          {ticket ? ticket.subject : 'Loading…'}
        </h2>
        <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none px-1">&times;</button>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-muted text-sm">Loading…</div>
      )}

      {ticket && (
        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Ticket info */}
          <div className="px-4 py-4 border-b border-border space-y-3 shrink-0">
            <div className="flex gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor(ticket.status)}`}>
                {statusLabel(ticket.status)}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${priorityColor(ticket.priority)}`}>
                {ticket.priority}
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 capitalize">
                {ticket.category}
              </span>
            </div>

            <div className="text-sm text-ink leading-relaxed">{ticket.description}</div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <span className="text-muted block">User ID</span>
                <span className="font-mono">{short(ticket.user_id)}</span>
              </div>
              {ticket.ride_id && (
                <div>
                  <span className="text-muted block">Ride ID</span>
                  <span className="font-mono">{short(ticket.ride_id)}</span>
                </div>
              )}
              <div>
                <span className="text-muted block">Created</span>
                <span>{new Date(ticket.created_at).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted block">Updated</span>
                <span>{new Date(ticket.updated_at).toLocaleString()}</span>
              </div>
            </div>

            {ticket.resolution && (
              <div className="bg-green-50 border border-green-200 rounded p-3">
                <div className="text-xs text-green-700 font-medium mb-1">Resolution</div>
                <div className="text-xs">{ticket.resolution}</div>
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="px-4 py-3 flex-1 space-y-3 min-h-0">
            <div className="text-xs font-medium text-muted uppercase tracking-wide">
              Conversation ({ticket.messages.length})
            </div>
            {ticket.messages.length === 0 && (
              <p className="text-xs text-muted italic">No messages yet.</p>
            )}
            {ticket.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender_role === 'admin' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    msg.sender_role === 'admin'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <div className="mb-1">{msg.message}</div>
                  <div className={`text-[10px] ${msg.sender_role === 'admin' ? 'text-blue-200' : 'text-gray-400'}`}>
                    {new Date(msg.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply box */}
          <div className="px-4 py-3 border-t border-border space-y-2 shrink-0">
            <div className="text-xs font-medium text-muted uppercase tracking-wide">Reply</div>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={3}
              placeholder="Type your reply…"
              className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm resize-none"
            />
            <div className="flex justify-end">
              <button
                onClick={() => replyMutation.mutate()}
                disabled={!replyText.trim() || replyMutation.isPending}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700"
              >
                {replyMutation.isPending ? 'Sending…' : 'Send Reply'}
              </button>
            </div>
          </div>

          {/* Status update */}
          <div className="px-4 py-3 border-t border-border space-y-2 shrink-0 bg-surface/50">
            <div className="text-xs font-medium text-muted uppercase tracking-wide">Update Status</div>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as TicketStatus | '')}
              className="w-full px-3 py-1.5 text-sm bg-white text-ink border border-border rounded"
            >
              <option value="">Select new status…</option>
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>

            {requiresResolution && (
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                rows={2}
                placeholder="Resolution notes (optional)"
                className="w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm resize-none"
              />
            )}

            <div className="flex justify-end">
              <button
                onClick={() => statusMutation.mutate()}
                disabled={!newStatus || statusMutation.isPending}
                className="px-4 py-1.5 text-sm bg-accent text-white rounded disabled:opacity-50"
              >
                {statusMutation.isPending ? 'Updating…' : 'Update Status'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tickets table tab
// ---------------------------------------------------------------------------

interface TicketsTabProps {
  source: Source;
}

function TicketsTab({ source }: TicketsTabProps) {
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('');
  const [search,       setSearch]       = useState('');
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const qc = useQueryClient();

  const queryKey = ['support-tickets', source, statusFilter];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams({ limit: '100', offset: '0' });
      if (statusFilter) params.set('status', statusFilter);
      return api<TicketsResponse>(`/v1/admin/${source}-support/tickets?${params.toString()}`);
    },
  });

  const tickets = data?.tickets ?? [];

  // Client-side filter by subject search
  const filtered = search.trim()
    ? tickets.filter((t) => t.subject.toLowerCase().includes(search.trim().toLowerCase()))
    : tickets;

  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by subject…"
          className="min-w-[200px] max-w-xs px-3 py-1.5 bg-white text-ink border border-border rounded text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TicketStatus | '')}
          className="px-3 py-1.5 text-xs bg-white text-ink border border-border rounded"
        >
          <option value="">All statuses</option>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted">
          {filtered.length} ticket{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-border rounded overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-surface text-muted text-xs select-none">
            <tr>
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-left px-3 py-2">Subject</th>
              <th className="text-left px-3 py-2">Category</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Priority</th>
              <th className="text-left px-3 py-2">User ID</th>
              <th className="text-left px-3 py-2">Created</th>
              <th className="text-left px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-border">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <div className="h-3 bg-surface animate-pulse rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : filtered.length === 0
              ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted">
                    No tickets found.
                  </td>
                </tr>
              )
              : filtered.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="border-t border-border hover:bg-surface cursor-pointer"
                    onClick={() => setSelectedId(ticket.id)}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-muted">
                      {short(ticket.id)}
                    </td>
                    <td className="px-3 py-2 text-xs max-w-[200px]">
                      <div className="truncate font-medium">{ticket.subject}</div>
                    </td>
                    <td className="px-3 py-2 text-xs capitalize text-muted">
                      {ticket.category}
                    </td>
                    <td className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor(ticket.status)}`}>
                        {statusLabel(ticket.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                      <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${priorityColor(ticket.priority)}`}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted">
                      {short(ticket.user_id)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedId(ticket.id)}
                        className="px-2 py-1 text-[11px] border border-border rounded hover:bg-surface"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <DetailPanel
          ticketId={selectedId}
          source={source}
          onClose={() => setSelectedId(null)}
          onUpdated={() => qc.invalidateQueries({ queryKey })}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type Tab = 'riders' | 'drivers';

export function SupportPage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('riders');

  // Fetch both so KPI row has data
  const { data: riderData, isLoading: riderLoading } = useQuery({
    queryKey: ['support-tickets', 'rider', ''],
    queryFn: () =>
      api<TicketsResponse>('/v1/admin/rider-support/tickets?limit=100&offset=0'),
    staleTime: 30_000,
  });
  const { data: driverData, isLoading: driverLoading } = useQuery({
    queryKey: ['support-tickets', 'driver', ''],
    queryFn: () =>
      api<TicketsResponse>('/v1/admin/driver-support/tickets?limit=100&offset=0'),
    staleTime: 30_000,
  });

  return (
    <>
      <PageHeader
        title="Support Tickets"
        subtitle="Manage rider and driver support requests, reply to messages, and update ticket status."
      />

      <KpiRow
        riderTickets={riderData?.tickets}
        driverTickets={driverData?.tickets}
        riderLoading={riderLoading}
        driverLoading={driverLoading}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-4">
        {(['riders', 'drivers'] as const).map((tab) => (
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

      {activeTab === 'riders'  && <TicketsTab source="rider" />}
      {activeTab === 'drivers' && <TicketsTab source="driver" />}
    </>
  );
}
