/**
 * Admin console building blocks. Import from '@/components/admin'.
 * Pattern and rules: frontend/DESIGN.md §8.
 */
export { AdminGuard } from './AdminGuard';
export { AdminShell } from './AdminShell';
export { ADMIN_NAV, ROLE_LABEL, adminBreadcrumbs, canAccess, isNavItemActive, navForRole } from './nav';
export type { AdminAccess, AdminNavGroup, AdminNavItem, AdminCrumb } from './nav';
export { AdminToolbar, AdminNoAccess, Baht, CodeBlock, DetailList, DrawerSection, MonoId } from './parts';
export type { DetailItem } from './parts';
export {
  AUDIT_ACTION_LABEL,
  AUDIT_STATUS_LOOK,
  DELIVERY_STATUS_LOOK,
  DELIVERY_STATUS_OPTIONS,
  DELIVERY_TYPE_LABEL,
  LISTING_STATUS_LOOK,
  LISTING_STATUS_OPTIONS,
  ORDER_STATUS_LOOK,
  ORDER_STATUS_OPTIONS,
  StatusBadge,
} from './status';
export { formatCount, formatDateTime, prettyJson, shortId } from './format';
export * from './api';
