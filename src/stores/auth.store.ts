import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AdminRole = 'super_admin' | 'regional_admin' | 'ops_manager' | 'support_agent';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: { id: string; email: string; full_name?: string | null } | null;
  admin_role: AdminRole | null;
  region: string | null;
  setSession: (a: { access: string; refresh: string; user: { id: string; email: string; full_name?: string | null }; admin_role?: AdminRole | null; region?: string | null }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      admin_role: null,
      region: null,
      setSession: ({ access, refresh, user, admin_role, region }) =>
        set({ accessToken: access, refreshToken: refresh, user, admin_role: admin_role ?? null, region: region ?? null }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null, admin_role: null, region: null }),
    }),
    { name: 'rideshare-admin-auth' },
  ),
);
