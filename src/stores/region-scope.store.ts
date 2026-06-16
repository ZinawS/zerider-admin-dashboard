import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface RegionScopeState {
  regionCode: string | null; // null = "all regions"
  setRegion: (code: string | null) => void;
}

export const useRegionScope = create<RegionScopeState>()(
  persist(
    (set) => ({
      regionCode: null,
      setRegion: (code) => set({ regionCode: code }),
    }),
    { name: 'admin-region-scope' }
  )
);

/** Helper for building query strings — appends region= when scope is set. */
export function appendRegion(params: URLSearchParams | string): string {
  const code = useRegionScope.getState().regionCode;
  if (!code) return typeof params === 'string' ? params : params.toString();
  if (typeof params === 'string') {
    const sep = params.length ? '&' : '';
    return `${params}${sep}region=${code}`;
  }
  params.set('region', code);
  return params.toString();
}
