import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuthStore, type AdminRole } from '../stores/auth.store';
import { useRegionScope } from '../stores/region-scope.store';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  regional_admin: 'Regional Admin',
  ops_manager: 'Ops Manager',
  support_agent: 'Support Agent',
};
const ROLE_COLOR: Record<AdminRole, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  regional_admin: 'bg-blue-100 text-blue-700',
  ops_manager: 'bg-green-100 text-green-700',
  support_agent: 'bg-gray-100 text-gray-600',
};

const NAV_BASE = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/users', label: 'Riders' },
  { to: '/drivers', label: 'Drivers' },
  { to: '/payouts', label: 'Payouts' },
  { to: '/rides', label: 'Rides' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/reports', label: 'Reports' },
  { to: '/regions', label: 'Regions' },
  { to: '/audit', label: 'Audit log' },
  { to: '/content', label: 'App content' },
  { to: '/gamification', label: 'Gamification' },
  { to: '/delivery', label: 'Delivery' },
  { to: '/marketplace', label: 'Marketplace' },
  { to: '/settings', label: 'Settings' },
];

const REVENUE_NAV = [
  { to: '/revenue/subscriptions', label: 'Subscriptions' },
  { to: '/revenue/featured', label: 'Featured Listings' },
  { to: '/revenue/commission', label: 'Commission' },
];

export function Layout({ children }: { children: React.ReactNode }): JSX.Element {
  const { user, logout, admin_role } = useAuthStore();
  const nav = [...NAV_BASE, ...REVENUE_NAV, { to: '/admin-users', label: 'Admin team' }];
  return (
    <div className="flex min-h-screen bg-bg text-ink">
      <aside className="w-56 border-r border-border bg-surface flex flex-col">
        <div className="px-5 py-6 border-b border-border">
          <div className="text-lg font-semibold">RideShare</div>
          <div className="text-xs text-muted">Admin console</div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded text-sm ${
                  isActive ? 'bg-ink text-white' : 'text-ink hover:bg-border/40'
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-border text-xs text-muted">
          {admin_role && (
            <div className={`inline-block text-xs px-2 py-0.5 rounded mb-1.5 ${ROLE_COLOR[admin_role]}`}>
              {ROLE_LABEL[admin_role]}
            </div>
          )}
          <div className="truncate">{user?.full_name ?? user?.email}</div>
          <div className="truncate text-muted">{user?.full_name ? user.email : ''}</div>
          <button onClick={logout} className="mt-2 text-danger hover:underline">
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <RegionScopeBar />
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}


function RegionScopeBar(): JSX.Element {
  const { regionCode, setRegion } = useRegionScope();
  const { data } = useQuery({
    queryKey: ['regions-list'],
    queryFn: () => api<{ items: Array<{ code: string; name: string }> } | Array<{ code: string; name: string }>>('/v1/admin/regions'),
    staleTime: 5 * 60_000,
  });
  const regions: Array<{ code: string; name: string }> = Array.isArray(data) ? data : (data?.items ?? []);
  const current = regions.find((r) => r.code === regionCode);
  return (
    <div className="flex items-center justify-end gap-2 px-8 py-2.5 border-b border-border bg-surface/50">
      <span className="text-xs text-muted">Region scope:</span>
      <select
        value={regionCode ?? ''}
        onChange={(e) => setRegion(e.target.value || null)}
        className="text-xs px-2 py-1 bg-white text-ink border border-border rounded"
      >
        <option value="">All regions</option>
        {regions.map((r) => (
          <option key={r.code} value={r.code}>{r.name} ({r.code})</option>
        ))}
      </select>
      {regionCode && (
        <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">
          Filtered to {current?.name ?? regionCode}
        </span>
      )}
    </div>
  );
}