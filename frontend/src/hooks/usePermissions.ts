import { useAuthStore, UserRole } from '@/lib/store';

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

    // Permission checks
    canAccessAdmin: role !== 'user',
    canManageProducts: role === 'admin' || role === 'root',
    canManageCategories: role === 'admin' || role === 'root',
    canManageOrders: role === 'admin' || role === 'root',
    canManageContent: role === 'admin' || role === 'root',
    canManageServerUsers: role === 'server_admin' || role === 'root',
    canManageApiKeys: role === 'server_admin' || role === 'root',
    canManageAllUsers: role === 'root',
    canManageServers: role === 'root',
    canCompilePlugin: role === 'root',
    canManageRoles: role === 'root',
    canManageChatRanks: role === 'root',

    // Scoped data for server admin
    apiKeyServerId: user?.apiKeyServerId,
  };
}
