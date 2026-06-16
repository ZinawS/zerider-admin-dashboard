import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

interface RideDetail {
  id: string;
  status: string;
  rider_id: string;
  driver_id: string | null;
  vehicle_category: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  fare_estimate_cents: number | string | null;
  fare_final_cents: number | string | null;
  estimated_distance_m: number | null;
  estimated_duration_s: number | null;
  surge_multiplier: number | string | null;
  requested_at: string;
  accepted_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  driver_rating: number | null;
  tip_amount_cents: number | string | null;
  refunds?: Array<{
    refund_total_cents: number;
    driver_clawback_cents: number;
    platform_loss_cents: number;
    original_fare_cents: number;
    service_fee_pct: number;
    booking_fee_cents: number;
    reason: string;
    transaction_id: string;
    created_at: string;
  }>;
}

function fmtUsd(c: any) { return `$${(Number(c ?? 0) / 100).toFixed(2)}`; }
function fmtTime(s: string | null) { return s ? new Date(s).toLocaleString() : '—'; }

const SET_STATUSES = ['requested', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled_by_rider', 'cancelled_by_driver', 'no_drivers_available'];

export function RideDetailPage(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: ride, isLoading } = useQuery({
    queryKey: ['admin-ride', id],
    queryFn: () => api<RideDetail>(`/v1/admin/rides/${id}`),
    enabled: !!id,
  });

  const { data: rider } = useQuery({
    queryKey: ['admin-user', ride?.rider_id],
    queryFn: () => api<any>(`/v1/admin/users/${ride!.rider_id}`),
    enabled: !!ride?.rider_id,
  });

  const { data: driver } = useQuery({
    queryKey: ['admin-user', ride?.driver_id],
    queryFn: () => api<any>(`/v1/admin/users/${ride!.driver_id}`),
    enabled: !!ride?.driver_id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-ride', id] });
    qc.invalidateQueries({ queryKey: ['admin-rides'] });
  };

  const forceCancel = useMutation({
    mutationFn: (reason: string) => api(`/v1/admin/rides/${id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: invalidate,
  });
  const reassign = useMutation({
    mutationFn: (driverId: string) => api(`/v1/admin/rides/${id}/reassign`, { method: 'POST', body: { driverId } }),
    onSuccess: invalidate,
  });
  const adjustFare = useMutation({
    mutationFn: ({ amount, reason }: { amount: number; reason: string }) =>
      api(`/v1/admin/rides/${id}/adjust-fare`, { method: 'POST', body: { amount, reason } }),
    onSuccess: invalidate,
  });
  const endRide = useMutation({
    mutationFn: () => api(`/v1/admin/rides/${id}/end`, { method: 'POST' }),
    onSuccess: invalidate,
  });
  const setStatus = useMutation({
    mutationFn: ({ status, reason }: { status: string; reason?: string }) =>
      api(`/v1/admin/rides/${id}/set-status`, { method: 'POST', body: { status, reason } }),
    onSuccess: invalidate,
  });
  const refund = useMutation({
    mutationFn: ({ amount, reason }: { amount?: number; reason: string }) =>
      api(`/v1/admin/payments/${id}/refund`, { method: 'POST', body: { amount, reason } }),
    onSuccess: () => {
      invalidate();
      alert('Refund processed');
    },
    onError: (e: any) => alert('Refund failed: ' + (e?.message ?? 'unknown error')),
  });

  if (isLoading) return <div className="text-muted">Loading…</div>;
  if (!ride) return <div className="text-danger">Ride not found.</div>;

  const isActive = ['requested', 'accepted', 'arrived', 'in_progress'].includes(ride.status);
  const riderName = rider ? ([rider.rider?.first_name || rider.driver?.first_name, rider.rider?.last_name || rider.driver?.last_name].filter(Boolean).join(' ') || '(unnamed)') : '—';
  const driverName = driver ? ([driver.driver?.first_name, driver.driver?.last_name].filter(Boolean).join(' ') || '(unnamed)') : '—';

  return (
    <div>
      <button onClick={() => navigate(-1)} className="text-sm text-muted hover:text-ink mb-3">← Back</button>

      {/* Header */}
      <div className="bg-white border border-border rounded p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase text-muted">Ride</div>
            <div className="font-mono text-sm text-ink">{ride.id}</div>
            <div className="mt-2 flex gap-1.5 flex-wrap">
              <StatusBadge status={ride.status} />
              <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full capitalize">{ride.vehicle_category}</span>
              {Number(ride.surge_multiplier) > 1 && (
                <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">surge {Number(ride.surge_multiplier).toFixed(2)}×</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Estimate" value={fmtUsd(ride.fare_estimate_cents)} />
        <StatCard label="Final" value={fmtUsd(ride.fare_final_cents)} />
        <StatCard label="Tip" value={fmtUsd(ride.tip_amount_cents)} />
        <StatCard label="Distance" value={ride.estimated_distance_m ? `${(ride.estimated_distance_m / 1609).toFixed(2)} mi` : '—'} />
      </div>

      {/* Route */}
      <div className="bg-white border border-border rounded p-4 mb-4">
        <div className="text-xs uppercase text-muted mb-2">Route</div>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="w-2 h-2 bg-accent rounded-full mt-1.5 shrink-0" />
            <div className="flex-1">
              <div className="text-xs text-muted">Pickup</div>
              <div className="text-sm text-ink">{ride.pickup_address}</div>
              <div className="text-xs text-muted">{ride.pickup_lat?.toFixed(5)}, {ride.pickup_lng?.toFixed(5)}</div>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-2 h-2 bg-danger rounded-full mt-1.5 shrink-0" />
            <div className="flex-1">
              <div className="text-xs text-muted">Dropoff</div>
              <div className="text-sm text-ink">{ride.dropoff_address}</div>
              <div className="text-xs text-muted">{ride.dropoff_lat?.toFixed(5)}, {ride.dropoff_lng?.toFixed(5)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Participants */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <ParticipantCard
          label="Rider"
          name={riderName}
          phone={rider?.rider?.phone_number ?? rider?.driver?.phone_number}
          onClick={() => navigate(`/users/${ride.rider_id}`)}
        />
        <ParticipantCard
          label="Driver"
          name={ride.driver_id ? driverName : 'Unassigned'}
          phone={driver?.driver?.phone_number}
          rating={ride.driver_rating}
          onClick={() => ride.driver_id && navigate(`/users/${ride.driver_id}`)}
        />
      </div>

      {/* Timeline */}
      <div className="bg-white border border-border rounded p-4 mb-4">
        <div className="text-xs uppercase text-muted mb-3">Timeline</div>
        <div className="space-y-2 text-sm">
          <TimelineRow label="Requested" t={ride.requested_at} />
          <TimelineRow label="Accepted" t={ride.accepted_at} />
          <TimelineRow label="Arrived" t={ride.arrived_at} />
          <TimelineRow label="Started" t={ride.started_at} />
          <TimelineRow label="Completed" t={ride.completed_at} />
          <TimelineRow label="Cancelled" t={ride.cancelled_at} extra={ride.cancellation_reason} />
        </div>
      </div>

      {/* Refunds */}
      {ride.refunds && ride.refunds.length > 0 && (
        <div className="bg-white border border-border rounded p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs uppercase text-muted">Refunds ({ride.refunds.length})</div>
            <div className="text-xs text-muted">
              Total refunded: <span className="text-ink font-medium">{fmtUsd(ride.refunds.reduce((s: number, r: any) => s + Number(r.refund_total_cents ?? r.amount_cents ?? 0), 0))}</span>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="text-muted text-xs uppercase">
              <tr>
                <th className="text-left py-1">When</th>
                <th className="text-left py-1">Reason</th>
                <th className="text-right py-1">Rider received</th>
                <th className="text-right py-1">Driver clawback</th>
                <th className="text-right py-1">Platform loss</th>
              </tr>
            </thead>
            <tbody>
              {ride.refunds.map((r: any) => {
                const total = r.refund_total_cents ?? r.amount_cents ?? 0;
                const hasSplit = r.driver_clawback_cents !== undefined && r.platform_loss_cents !== undefined;
                return (
                  <tr key={r.transaction_id} className="border-t border-border">
                    <td className="py-2 text-muted text-xs">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="py-2 text-ink text-xs">{r.reason}</td>
                    <td className="py-2 text-right text-success">+{fmtUsd(total)}</td>
                    <td className="py-2 text-right text-danger">{hasSplit ? `-${fmtUsd(r.driver_clawback_cents)}` : <span className="text-muted">—</span>}</td>
                    <td className="py-2 text-right text-danger">{hasSplit ? `-${fmtUsd(r.platform_loss_cents)}` : <span className="text-muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      <div className="bg-white border border-border rounded p-4 mb-4">
        <div className="text-xs uppercase text-muted mb-3">Admin Actions</div>
        <ActionBar
          isActive={isActive}
          onCancel={(reason) => forceCancel.mutate(reason)}
          onReassign={(driverId) => reassign.mutate(driverId)}
          onAdjustFare={(amount, reason) => adjustFare.mutate({ amount, reason })}
          onEnd={() => endRide.mutate()}
          onSetStatus={(status, reason) => setStatus.mutate({ status, reason })}
          onRefund={(amount, reason) => refund.mutate({ amount, reason })}
          busy={forceCancel.isPending || reassign.isPending || adjustFare.isPending || endRide.isPending || setStatus.isPending || refund.isPending}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-white border border-border rounded p-4">
      <div className="text-xs uppercase text-muted">{label}</div>
      <div className="text-xl font-semibold text-ink mt-1">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'completed' ? 'bg-success/10 text-success'
    : status.startsWith('cancelled') || status === 'no_drivers_available' ? 'bg-danger/10 text-danger'
    : status === 'requested' ? 'bg-blue-100 text-blue-800'
    : 'bg-yellow-100 text-yellow-800';
  return <span className={'text-xs px-2 py-0.5 rounded-full capitalize ' + cls}>{status.replace(/_/g, ' ')}</span>;
}

function ParticipantCard({ label, name, phone, rating, onClick }: { label: string; name: string; phone?: string | null; rating?: number | null; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={'bg-white border border-border rounded p-4 ' + (onClick ? 'cursor-pointer hover:bg-surface' : '')}>
      <div className="text-xs uppercase text-muted">{label}</div>
      <div className="text-lg font-semibold text-ink mt-1">{name}</div>
      {phone && <div className="text-sm text-muted">{phone}</div>}
      {rating != null && <div className="text-sm text-ink mt-1">★ {rating}</div>}
    </div>
  );
}

function TimelineRow({ label, t, extra }: { label: string; t: string | null; extra?: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <div className={'w-2 h-2 rounded-full ' + (t ? 'bg-accent' : 'bg-border')} />
      <div className="text-xs text-muted w-24">{label}</div>
      <div className={'text-xs flex-1 ' + (t ? 'text-ink' : 'text-muted')}>
        {fmtTime(t)} {extra ? <span className="text-danger">· {extra}</span> : null}
      </div>
    </div>
  );
}

function ActionBar({ isActive, onCancel, onReassign, onAdjustFare, onEnd, onSetStatus, onRefund, busy }: {
  isActive: boolean;
  onCancel: (reason: string) => void;
  onReassign: (driverId: string) => void;
  onAdjustFare: (amount: number, reason: string) => void;
  onEnd: () => void;
  onSetStatus: (status: string, reason?: string) => void;
  onRefund: (amount: number | undefined, reason: string) => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button disabled={busy || !isActive}
        onClick={() => {
          const reason = prompt('Cancellation reason:');
          if (reason) onCancel(reason);
        }}
        className="px-3 py-1.5 text-sm bg-danger text-white rounded disabled:opacity-30">Force cancel</button>

      <button disabled={busy || !isActive}
        onClick={() => {
          const driverId = prompt('New driver UUID:');
          if (driverId) onReassign(driverId);
        }}
        className="px-3 py-1.5 text-sm bg-accent text-white rounded disabled:opacity-30">Reassign driver</button>

      <button disabled={busy}
        onClick={() => {
          const dollar = prompt('Fare adjustment in dollars (negative for refund):');
          if (!dollar) return;
          const amount = Math.round(parseFloat(dollar) * 100);
          if (Number.isNaN(amount)) { alert('Invalid amount'); return; }
          const reason = prompt('Reason:') ?? 'admin adjustment';
          onAdjustFare(amount, reason);
        }}
        className="px-3 py-1.5 text-sm bg-white border border-border text-ink rounded">Adjust fare</button>

      <button disabled={busy || !isActive}
        onClick={() => { if (confirm('Mark ride as completed?')) onEnd(); }}
        className="px-3 py-1.5 text-sm bg-success text-white rounded disabled:opacity-30">End ride</button>

      <button disabled={busy}
        onClick={() => {
          const dollar = prompt('Refund amount in dollars (blank = full refund):');
          if (dollar === null) return;
          const amount = dollar.trim() ? Math.round(parseFloat(dollar) * 100) : undefined;
          if (amount !== undefined && (Number.isNaN(amount) || amount <= 0)) { alert('Invalid amount'); return; }
          const reason = prompt('Refund reason:') ?? 'admin refund';
          onRefund(amount, reason);
        }}
        className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded disabled:opacity-30">Refund</button>

      <select disabled={busy}
        onChange={(e) => {
          const status = e.target.value;
          if (!status) return;
          const reason = prompt('Reason for status change (optional):') ?? undefined;
          onSetStatus(status, reason);
          e.target.value = '';
        }}
        className="px-3 py-1.5 text-sm bg-white border border-border text-ink rounded">
        <option value="">Set status…</option>
        {SET_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
      </select>
    </div>
  );
}
