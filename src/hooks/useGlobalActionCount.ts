import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useRegionScope } from '../stores/region-scope.store.js';

export function useGlobalActionCount(): number {
  const regionCode = useRegionScope((s) => s.regionCode);
  const amp = regionCode ? `&region=${regionCode}` : '';
  const opts = { refetchInterval: 60_000, staleTime: 45_000 };

  const { data: riderData } = useQuery({
    queryKey: ['gab-rider-tickets', regionCode],
    queryFn: () => api<{ total?: number; tickets: any[] }>(`/v1/admin/rider-support/tickets?status=open&limit=1${amp}`),
    ...opts,
  });
  const { data: driverData } = useQuery({
    queryKey: ['gab-driver-tickets', regionCode],
    queryFn: () => api<{ total?: number; tickets: any[] }>(`/v1/admin/driver-support/tickets?status=open&limit=1${amp}`),
    ...opts,
  });

  return (
    Number(riderData?.total ?? riderData?.tickets?.length ?? 0) +
    Number(driverData?.total ?? driverData?.tickets?.length ?? 0)
  );
}
