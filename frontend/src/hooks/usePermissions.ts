import { useAuthStore, UserRole } from '@/lib/store';

/** Roles that may see the admin console entry points. */
export const ADMIN_CONSOLE_ROLES: readonly UserRole[] = ['admin', 'server_admin', 'root'];

/** True only for an explicit admin role (never for unknown/missing roles). */
export function isAdminConsoleRole(role: string | null | undefined): boolean {
  return !!role && (ADMIN_CONSOLE_ROLES as readonly string[]).includes(role);
}

/**
 * UI-level permission flags. These only decide what is SHOWN — the backend
 * enforces every permission on its own routes.
 */
export function usePermissions() {
  const { user } = useAuthStore();
  const role: UserRole = user?.role || 'user';

  return {
    // Current role
    role,

    // Authentication state
    isAuthenticated: !!user,

    // Role checks
    isUser: role === 'user',
    isAdmin: role === 'admin' || role === 'root',
    isServerAdmin: role === 'server_admin' || role === 'root',
    isRoot: role === 'root',

    /** Show admin console links (header account menu, mobile drawer). */
    canSeeAdminConsole: isAdminConsoleRole(user?.role),

    // Permission checks
    canAccessAdmin: isAdminConsoleRole(user?.role),
    canManageProducts: role === 'admin' || role === 'root',
    canManageCategories: role === 'admin' || role === 'root',
    canManageOrders: role === 'admin' || role === 'root',
    canManageContent: role === 'admin' || role === 'root',
    /** Site settings (season, announcement): admin|root. */
    canManageSiteSettings: role === 'admin' || role === 'root',
    /** Deliveries, audit logs, market listings: admin|root. */
    canViewOperations: role === 'admin' || role === 'root',
    canManageServerUsers: role === 'server_admin' || role === 'root',
    canManageApiKeys: role === 'server_admin' || role === 'root',
    canManageAllUsers: role === 'root',
    /** Servers + clusters: root only. */
    canManageServers: role === 'root',
    canCompilePlugin: role === 'root',
    canManageRoles: role === 'root',
    canManageChatRanks: role === 'root',

    // Scoped data for server admin
    apiKeyServerId: user?.apiKeyServerId,
  };
}
