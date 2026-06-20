import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useRegionScope } from '../stores/region-scope.store';

interface ActionItem {
  id: string;
  label: string;
  count: number;
  urgency: 'critical' | 'high' | 'normal';
  link: string;
  linkLabel: string;
  icon: string;
}

function useActionItems() {
  const regionCode = useRegionScope((s) => s.regionCode);
  const r = regionCode ? `?region=${regionCode}` : '';
  const amp = regionCode ? `&region=${regionCode}` : '';

  const opts = { refetchInterval: 45_000, staleTime: 30_000 };

  const { data: riderTickets } = useQuery({
    queryKey: ['gab-rider-tickets', regionCode],
    queryFn: () => api<{ total?: number; tickets: any[] }>(`/v1/admin/rider-support/tickets?status=open&limit=1${amp}`),
    ...opts,
  });
  const { data: driverTickets } = useQuery({
    queryKey: ['gab-driver-tickets', regionCode],
    queryFn: () => api<{ total?: number; tickets: any[] }>(`/v1/admin/driver-support/tickets?status=open&limit=1${amp}`),
    ...opts,
  });
  const { data: pendingListings } = useQuery({
    queryKey: ['gab-pending-listings', regionCode],
    queryFn: () => api<{ total?: number; data?: any[] }>(`/v1/admin/listings?status=pending&limit=1${amp}`),
    ...opts,
  });
  const { data: infoListings } = useQuery({
    queryKey: ['gab-info-listings', regionCode],
    queryFn: () => api<{ total?: number }>(`/v1/admin/listings?status=information_required&limit=1${amp}`),
    ...opts,
  });
  const { data: listingReports } = useQuery({
    queryKey: ['gab-listing-reports', regionCode],
    queryFn: () => api<{ total?: number } | any[]>(`/v1/admin/listings/reports${r}`),
    ...opts,
  });
  const { data: pendingDrivers } = useQuery({
    queryKey: ['gab-pending-drivers', regionCode],
    queryFn: () => api<{ items?: any[]; total?: number }>(`/v1/admin/drivers?status=pending&limit=1${amp}`),
    ...opts,
  });
  const { data: pendingVerifications } = useQuery({
    queryKey: ['gab-pending-verifications', regionCode],
    queryFn: () => api<{ items?: any[]; total?: number }>(`/v1/admin/verification/documents?status=pending&limit=1${amp}`),
    ...opts,
  });
  const { data: pendingPayouts } = useQuery({
    queryKey: ['gab-pending-payouts', regionCode],
    queryFn: () => api<{ items?: any[]; total?: number }>(`/v1/admin/payouts?status=pending&limit=1${amp}`),
    ...opts,
  });

  const riderOpen = Number(riderTickets?.total ?? riderTickets?.tickets?.length ?? 0);
  const driverOpen = Number(driverTickets?.total ?? driverTickets?.tickets?.length ?? 0);
  const listingsPending = Number((pendingListings as any)?.total ?? (pendingListings as any)?.data?.length ?? 0);
  const listingsInfo = Number((infoListings as any)?.total ?? 0);
  const reports = Array.isArray(listingReports)
    ? listingReports.length
    : Number((listingReports as any)?.total ?? 0);
  const driversPending = Number((pendingDrivers as any)?.total ?? (pendingDrivers as any)?.items?.length ?? 0);
  const verificationsPending = Number((pendingVerifications as any)?.total ?? (pendingVerifications as any)?.items?.length ?? 0);
  const payoutsPending = Number((pendingPayouts as any)?.total ?? (pendingPayouts as any)?.items?.length ?? 0);

  const items: ActionItem[] = [
    { id: 'rider-support',    label: 'Open rider support tickets',  count: riderOpen,            urgency: 'critical', link: '/support?tab=rider',   linkLabel: 'View tickets',    icon: '🎫' },
    { id: 'driver-support',   label: 'Open driver support tickets', count: driverOpen,           urgency: 'critical', link: '/support?tab=driver',  linkLabel: 'View tickets',    icon: '🎫' },
    { id: 'driver-approval',  label: 'Drivers awaiting approval',   count: driversPending,       urgency: 'high',     link: '/drivers?status=pending', linkLabel: 'Review drivers', icon: '🚗' },
    { id: 'verifications',    label: 'Documents pending review',    count: verificationsPending, urgency: 'high',     link: '/drivers',             linkLabel: 'Review docs',     icon: '📄' },
    { id: 'listing-approve',  label: 'Listings awaiting approval',  count: listingsPending,      urgency: 'normal',   link: '/marketplace',         linkLabel: 'Review listings', icon: '🏷️' },
    { id: 'listing-info',     label: 'Listings need more info',     count: listingsInfo,         urgency: 'normal',   link: '/marketplace',         linkLabel: 'Review',          icon: '📋' },
    { id: 'listing-reports',  label: 'Flagged listing reports',     count: reports,              urgency: 'high',     link: '/marketplace?tab=reports', linkLabel: 'Moderate',   icon: '🚩' },
    { id: 'payouts',          label: 'Payout requests pending',     count: payoutsPending,       urgency: 'normal',   link: '/payouts',             linkLabel: 'View payouts',    icon: '💰' },
  ].filter((a) => a.count > 0);

  const total = items.reduce((s, a) => s + a.count, 0);
  const hasCritical = items.some((a) => a.urgency === 'critical' && a.count > 0);
  const hasHigh = items.some((a) => a.urgency === 'high' && a.count > 0);

  return { items, total, hasCritical, hasHigh };
}

export function GlobalActionBar(): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const { items, total, hasCritical, hasHigh } = useActionItems();

  if (total === 0) return null;

  const urgencyColor = hasCritical
    ? 'bg-red-50 border-red-200'
    : hasHigh
      ? 'bg-orange-50 border-orange-200'
      : 'bg-yellow-50 border-yellow-200';

  const badgeColor = hasCritical
    ? 'bg-red-600 text-white'
    : hasHigh
      ? 'bg-orange-500 text-white'
      : 'bg-yellow-500 text-white';

  const textColor = hasCritical ? 'text-red-800' : hasHigh ? 'text-orange-800' : 'text-yellow-800';

  return (
    <div className={`border-b ${urgencyColor} select-none`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`w-full flex items-center gap-2 px-8 py-2 text-left text-xs ${textColor} hover:opacity-90`}
      >
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${badgeColor}`}>
          {total > 99 ? '99+' : total}
        </span>
        <span className="font-semibold">
          {hasCritical ? '⚠️' : '🔔'} {total} action{total !== 1 ? 's' : ''} need{total === 1 ? 's' : ''} your attention
        </span>
        <span className="ml-auto">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-8 pb-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between bg-white rounded border border-border/60 px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm shrink-0">{item.icon}</span>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-ink truncate">{item.label}</div>
                  <div className={`text-xs font-bold ${
                    item.urgency === 'critical' ? 'text-red-600' :
                    item.urgency === 'high' ? 'text-orange-600' : 'text-yellow-600'
                  }`}>
                    {item.count} pending
                  </div>
                </div>
              </div>
              <button
                onClick={() => navigate(item.link)}
                className="ml-2 shrink-0 text-xs px-2 py-1 bg-accent text-white rounded hover:bg-accent/90"
              >
                {item.linkLabel}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function useGlobalActionCount(): number {
  const regionCode = useRegionScope((s) => s.regionCode);
  const amp = regionCode ? `&region=${regionCode}` : '';
  const opts = { refetchInterval: 60_000, staleTime: 45_000 };

  const { data: riderData } = useQuery({ queryKey: ['gab-rider-tickets', regionCode], queryFn: () => api<{ total?: number; tickets: any[] }>(`/v1/admin/rider-support/tickets?status=open&limit=1${amp}`), ...opts });
  const { data: driverData } = useQuery({ queryKey: ['gab-driver-tickets', regionCode], queryFn: () => api<{ total?: number; tickets: any[] }>(`/v1/admin/driver-support/tickets?status=open&limit=1${amp}`), ...opts });
  return (
    Number(riderData?.total ?? riderData?.tickets?.length ?? 0) +
    Number(driverData?.total ?? driverData?.tickets?.length ?? 0)
  );
}
