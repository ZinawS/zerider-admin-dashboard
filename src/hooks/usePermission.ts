import { useAuthStore, type AdminRole } from '../stores/auth.store.js';

export type Permission =
  | 'users.view' | 'users.edit' | 'users.delete' | 'users.suspend'
  | 'drivers.approve' | 'drivers.reject' | 'drivers.edit'
  | 'rides.view' | 'rides.refund' | 'rides.dispatch'
  | 'pricing.view' | 'pricing.edit'
  | 'reports.view'
  | 'regions.view' | 'regions.edit'
  | 'admin.manage';

const ROLE_PERMISSIONS: Record<AdminRole, Permission[] | ['*']> = {
  super_admin: ['*'],
  regional_admin: [
    'users.view', 'users.edit', 'users.suspend',
    'drivers.approve', 'drivers.reject', 'drivers.edit',
    'rides.view', 'rides.refund', 'rides.dispatch',
    'pricing.view', 'reports.view', 'regions.view',
  ],
  ops_manager: [
    'users.view', 'users.suspend',
    'drivers.approve', 'drivers.reject', 'drivers.edit',
    'rides.view', 'rides.refund', 'rides.dispatch',
    'pricing.view', 'reports.view', 'regions.view',
  ],
  support_agent: [
    'users.view', 'users.suspend',
    'rides.view',
  ],
};

export function hasPermission(role: AdminRole | null, perm: Permission): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role];
  if (perms[0] === '*') return true;
  return (perms as Permission[]).includes(perm);
}

export function usePermission(perm: Permission): boolean {
  const role = useAuthStore((s) => s.admin_role);
  return hasPermission(role, perm);
}

export function useAdminRole(): AdminRole | null {
  return useAuthStore((s) => s.admin_role);
}
