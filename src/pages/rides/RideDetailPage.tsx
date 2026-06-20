import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';

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

// ── Shared modal shell ───────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-base font-semibold">{title}</div>
          <button onClick={onClose} className="text-muted hover:text-ink text-lg leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-xs text-muted mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 bg-white text-ink border border-border rounded text-sm';
const btnPrimary = 'px-4 py-2 text-sm bg-accent text-white rounded disabled:opacity-40';
const btnDanger = 'px-4 py-2 text-sm bg-danger text-white rounded disabled:opacity-40';
const btnCancel = 'px-4 py-2 text-sm border border-border rounded text-ink';

// ── Action modals ────────────────────────────────────────────────────────────

function CancelModal({ rideId, onClose, onDone }: { rideId: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: () => api(`/v1/admin/rides/${rideId}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: () => { toast('Ride cancelled.', 'success'); onDone(); onClose(); },
    onError: (e: any) => toast('Cancel failed: ' + (e?.message ?? 'unknown'), 'error'),
  });
  return (
    <Modal title="Force cancel ride" onClose={onClose}>
      <Field label="Cancellation reason *">
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="e.g. Driver no-show confirmed" autoFocus />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className={btnCancel}>Back</button>
        <button onClick={() => mut.mutate()} disabled={!reason.trim() || mut.isPending} className={btnDanger}>
          {mut.isPending ? 'Cancelling…' : 'Force cancel'}
        </button>
      </div>
    </Modal>
  );
}

function ReassignModal({ rideId, onClose, onDone }: { rideId: string; onClose: () => void; onDone: () => void }) {
  const [driverId, setDriverId] = useState('');
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: () => api(`/v1/admin/rides/${rideId}/reassign`, { method: 'POST', body: { driverId } }),
    onSuccess: () => { toast('Driver reassigned.', 'success'); onDone(); onClose(); },
    onError: (e: any) => toast('Reassign failed: ' + (e?.message ?? 'unknown'), 'error'),
  });
  return (
    <Modal title="Reassign driver" onClose={onClose}>
      <Field label="New driver UUID *">
        <input type="text" value={driverId} onChange={(e) => setDriverId(e.target.value)} className={inputCls} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoFocus />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className={btnCancel}>Back</button>
        <button onClick={() => mut.mutate()} disabled={!driverId.trim() || mut.isPending} className={btnPrimary}>
          {mut.isPending ? 'Reassigning…' : 'Reassign'}
        </button>
      </div>
    </Modal>
  );
}

function AdjustFareModal({ rideId, currentFare, onClose, onDone }: { rideId: string; currentFare: number | null; onClose: () => void; onDone: () => void }) {
  const [dollars, setDollars] = useState('');
  const [reason, setReason] = useState('');
  const { toast } = useToast();
  const amount = Math.round(parseFloat(dollars) * 100);
  const valid = !Number.isNaN(amount) && dollars.trim() !== '' && reason.trim() !== '';
  const mut = useMutation({
    mutationFn: () => api(`/v1/admin/rides/${rideId}/adjust-fare`, { method: 'POST', body: { amount, reason } }),
    onSuccess: () => { toast('Fare adjusted.', 'success'); onDone(); onClose(); },
    onError: (e: any) => toast('Adjustment failed: ' + (e?.message ?? 'unknown'), 'error'),
  });
  return (
    <Modal title="Adjust fare" onClose={onClose}>
      {currentFare != null && <p className="text-xs text-muted mb-3">Current fare: <strong>{fmtUsd(currentFare)}</strong></p>}
      <Field label="Adjustment in USD (negative to decrease) *">
        <input type="number" step="0.01" value={dollars} onChange={(e) => setDollars(e.target.value)} className={inputCls} placeholder="-5.00" autoFocus />
      </Field>
      <Field label="Reason *">
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="e.g. Driver took longer route" />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className={btnCancel}>Back</button>
        <button onClick={() => mut.mutate()} disabled={!valid || mut.isPending} className={btnPrimary}>
          {mut.isPending ? 'Saving…' : 'Apply adjustment'}
        </button>
      </div>
    </Modal>
  );
}

function EndRideModal({ rideId, onClose, onDone }: { rideId: string; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: () => api(`/v1/admin/rides/${rideId}/end`, { method: 'POST' }),
    onSuccess: () => { toast('Ride marked as completed.', 'success'); onDone(); onClose(); },
    onError: (e: any) => toast('Failed: ' + (e?.message ?? 'unknown'), 'error'),
  });
  return (
    <Modal title="End ride" onClose={onClose}>
      <p className="text-sm text-ink mb-4">Are you sure you want to force-complete this ride? The driver will be paid out at the current fare estimate.</p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className={btnCancel}>Back</button>
        <button onClick={() => mut.mutate()} disabled={mut.isPending} className="px-4 py-2 text-sm bg-success text-white rounded disabled:opacity-40">
          {mut.isPending ? 'Ending…' : 'Confirm end ride'}
        </button>
      </div>
    </Modal>
  );
}

function RefundModal({ rideId, fareTotal, onClose, onDone }: { rideId: string; fareTotal: number | null; onClose: () => void; onDone: () => void }) {
  const [fullRefund, setFullRefund] = useState(true);
  const [dollars, setDollars] = useState('');
  const [reason, setReason] = useState('');
  const { toast } = useToast();
  const amount = fullRefund ? undefined : Math.round(parseFloat(dollars) * 100);
  const validAmount = fullRefund || (!Number.isNaN(amount!) && dollars.trim() !== '');
  const valid = validAmount && reason.trim() !== '';
  const mut = useMutation({
    mutationFn: () => api(`/v1/admin/payments/${rideId}/refund`, { method: 'POST', body: { amount, reason } }),
    onSuccess: () => { toast('Refund processed.', 'success'); onDone(); onClose(); },
    onError: (e: any) => toast('Refund failed: ' + (e?.message ?? 'unknown error'), 'error'),
  });
  return (
    <Modal title="Issue refund" onClose={onClose}>
      {fareTotal != null && <p className="text-xs text-muted mb-3">Paid fare: <strong>{fmtUsd(fareTotal)}</strong></p>}
      <Field label="Refund type">
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={fullRefund} onChange={() => setFullRefund(true)} /> Full refund
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={!fullRefund} onChange={() => setFullRefund(false)} /> Partial amount
          </label>
        </div>
      </Field>
      {!fullRefund && (
        <Field label="Refund amount (USD) *">
          <input type="number" step="0.01" min="0.01" value={dollars} onChange={(e) => setDollars(e.target.value)} className={inputCls} placeholder="5.00" autoFocus />
        </Field>
      )}
      <Field label="Reason *">
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="e.g. Rider complained about route" />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className={btnCancel}>Back</button>
        <button onClick={() => mut.mutate()} disabled={!valid || mut.isPending} className={btnDanger}>
          {mut.isPending ? 'Processing…' : 'Issue refund'}
        </button>
      </div>
    </Modal>
  );
}

function SetStatusModal({ rideId, currentStatus, onClose, onDone }: { rideId: string; currentStatus: string; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: () => api(`/v1/admin/rides/${rideId}/set-status`, { method: 'POST', body: { status, reason: reason || undefined } }),
    onSuccess: () => { toast(`Status set to ${status}.`, 'success'); onDone(); onClose(); },
    onError: (e: any) => toast('Failed: ' + (e?.message ?? 'unknown'), 'error'),
  });
  return (
    <Modal title="Override ride status" onClose={onClose}>
      <p className="text-xs text-muted mb-3">Current: <strong>{currentStatus.replace(/_/g, ' ')}</strong></p>
      <Field label="New status *">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          <option value="">Select status…</option>
          {SET_STATUSES.filter((s) => s !== currentStatus).map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </Field>
      <Field label="Reason (optional)">
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="e.g. Data correction" />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className={btnCancel}>Back</button>
        <button onClick={() => mut.mutate()} disabled={!status || mut.isPending} className={btnPrimary}>
          {mut.isPending ? 'Saving…' : 'Set status'}
        </button>
      </div>
    </Modal>
  );
}

// ── Action bar ───────────────────────────────────────────────────────────────

type ActiveModal = 'cancel' | 'reassign' | 'adjustFare' | 'endRide' | 'refund' | 'setStatus' | null;

function ActionBar({ rideId, currentStatus, currentFare, isActive, onDone }: {
  rideId: string;
  currentStatus: string;
  currentFare: number | null;
  isActive: boolean;
  onDone: () => void;
}) {
  const [modal, setModal] = useState<ActiveModal>(null);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button disabled={!isActive} onClick={() => setModal('cancel')}
          className="px-3 py-1.5 text-sm bg-danger text-white rounded disabled:opacity-30">Force cancel</button>
        <button disabled={!isActive} onClick={() => setModal('reassign')}
          className="px-3 py-1.5 text-sm bg-accent text-white rounded disabled:opacity-30">Reassign driver</button>
        <button onClick={() => setModal('adjustFare')}
          className="px-3 py-1.5 text-sm bg-white border border-border text-ink rounded">Adjust fare</button>
        <button disabled={!isActive} onClick={() => setModal('endRide')}
          className="px-3 py-1.5 text-sm bg-success text-white rounded disabled:opacity-30">End ride</button>
        <button onClick={() => setModal('refund')}
          className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded">Refund</button>
        <button onClick={() => setModal('setStatus')}
          className="px-3 py-1.5 text-sm bg-white border border-border text-ink rounded">Set status…</button>
      </div>

      {modal === 'cancel'     && <CancelModal      rideId={rideId} onClose={() => setModal(null)} onDone={onDone} />}
      {modal === 'reassign'   && <ReassignModal    rideId={rideId} onClose={() => setModal(null)} onDone={onDone} />}
      {modal === 'adjustFare' && <AdjustFareModal  rideId={rideId} currentFare={currentFare} onClose={() => setModal(null)} onDone={onDone} />}
      {modal === 'endRide'    && <EndRideModal     rideId={rideId} onClose={() => setModal(null)} onDone={onDone} />}
      {modal === 'refund'     && <RefundModal      rideId={rideId} fareTotal={currentFare} onClose={() => setModal(null)} onDone={onDone} />}
      {modal === 'setStatus'  && <SetStatusModal   rideId={rideId} currentStatus={currentStatus} onClose={() => setModal(null)} onDone={onDone} />}
    </>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

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

  if (isLoading) return <div className="text-muted">Loading…</div>;
  if (!ride) return <div className="text-danger">Ride not found.</div>;

  const isActive = ['requested', 'accepted', 'arrived', 'in_progress'].includes(ride.status);
  const riderName = rider ? ([rider.rider?.first_name || rider.driver?.first_name, rider.rider?.last_name || rider.driver?.last_name].filter(Boolean).join(' ') || '(unnamed)') : '—';
  const driverName = driver ? ([driver.driver?.first_name, driver.driver?.last_name].filter(Boolean).join(' ') || '(unnamed)') : '—';
  const currentFare = ride.fare_final_cents != null ? Number(ride.fare_final_cents) : ride.fare_estimate_cents != null ? Number(ride.fare_estimate_cents) : null;

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
          rideId={id}
          currentStatus={ride.status}
          currentFare={currentFare}
          isActive={isActive}
          onDone={invalidate}
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
