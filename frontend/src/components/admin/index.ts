/**
 * IRIS admin kit (Frozen Expedition style). See frontend/ADMIN_UI.md.
 *
 *   import { AdminPage, AdminPageHeader, AdminPanel, AdminToolbar, AdminTable, … } from '@/components/admin';
 *   import { usePaginatedQuery, useClientPagination } from '@/hooks/usePaginatedQuery';
 */
export { AdminPage, AdminPageHeader } from './AdminPageHeader';
export type { AdminPageHeaderProps } from './AdminPageHeader';

export { AdminPanel, AdminNotice } from './AdminPanel';
export type { AdminPanelProps, AdminNoticeProps } from './AdminPanel';

export {
  AdminToolbar,
  AdminSearchInput,
  AdminFilterSelect,
  AdminField,
  adminInputClass,
} from './AdminToolbar';
export type {
  AdminToolbarProps,
  AdminSearchInputProps,
  AdminFilterSelectProps,
  AdminFilterOption,
  AdminFieldProps,
  AdminSearchBinding,
} from './AdminToolbar';

export {
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTh,
  AdminTr,
  AdminTd,
  AdminTableSkeletonRows,
  AdminTableEmptyRow,
  AdminTableErrorRow,
} from './AdminTable';
export type {
  AdminTableProps,
  AdminTableBodyProps,
  AdminThProps,
  AdminTrProps,
  AdminTdProps,
  AdminTableEmptyRowProps,
  AdminTableErrorRowProps,
} from './AdminTable';

export { StatusBadge } from './StatusBadge';
export type { StatusBadgeProps, StatusTone } from './StatusBadge';

export { AdminButton, AdminIconButton } from './AdminButton';
export type { AdminButtonProps, AdminButtonVariant, AdminButtonSize, AdminIconButtonProps } from './AdminButton';

export { AdminDialog } from './AdminDialog';
export type { AdminDialogProps } from './AdminDialog';

export { ConfirmDialog } from './ConfirmDialog';
export type { ConfirmDialogProps } from './ConfirmDialog';

export { SegmentedTabs } from './SegmentedTabs';
export type { SegmentedTabsProps, SegmentedOption } from './SegmentedTabs';

export { Pagination } from './Pagination';
export type { PaginationComponentProps } from './Pagination';

export { AdminSuspense } from './AdminSuspense';

export {
  PAGE_SIZE_OPTIONS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_SEARCH_LENGTH,
  isPageSizeOption,
  normalizePageSize,
  parsePage,
  normalizeSearch,
  computeTotalPages,
  clampPage,
  computeRange,
  pageAfterSizeChange,
  pageItems,
  formatCount,
  formatRangeLabel,
  normalizePageResponse,
  paginateLocally,
} from './paginationMath';
export type { PageSizeOption, PaginationMeta, PageRequest, PageResult, RawPagination, PageItem } from './paginationMath';
