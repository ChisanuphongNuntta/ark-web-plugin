/**
 * IRIS Private — UI primitives. Import from '@/components/ui'.
 * Catalog and usage: frontend/DESIGN.md.
 */
export { Button, buttonVariants } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
export { IconButton } from './IconButton';
export type { IconButtonProps } from './IconButton';
export { Spinner } from './Spinner';

export { Field, controlClasses } from './Field';
export { Input } from './Input';
export type { InputProps } from './Input';
export { Select } from './Select';
export type { SelectProps, SelectOption } from './Select';
export { Textarea } from './Textarea';
export type { TextareaProps } from './Textarea';
export { Checkbox } from './Checkbox';
export type { CheckboxProps } from './Checkbox';
export { Switch } from './Switch';
export type { SwitchProps } from './Switch';

export {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogContent,
  DialogFooter,
  useDialog,
} from './Dialog';
export type { DialogProps } from './Dialog';
export { Drawer, Sheet } from './Drawer';
export type { DrawerProps } from './Drawer';
export { Menu, MenuItem, MenuLabel, MenuSeparator } from './Menu';
export type { MenuProps, MenuItemProps, MenuTriggerProps } from './Menu';
export { Portal, useIsClient, useFocusTrap, useScrollLock, useEscapeKey, useOutsidePointer } from './overlay';

export { Tabs, TabsList, TabsTrigger, TabsPanel } from './Tabs';
export type { TabsProps } from './Tabs';
export { SegmentedControl } from './SegmentedControl';
export type { SegmentedControlProps, SegmentedOption } from './SegmentedControl';

export { Badge } from './Badge';
export type { BadgeProps, BadgeTone } from './Badge';
export { StatusDot, STATUS_LABEL } from './StatusDot';
export type { StatusDotProps, StatusKind } from './StatusDot';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Panel } from './Card';
export type { CardProps, CardHeaderProps, PanelProps } from './Card';

export {
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  TableEmptyRow,
  TableLoadingRows,
} from './Table';
export type { SortDirection, TableHeaderCellProps, TableCellProps, TableRowProps } from './Table';
export { Pagination } from './Pagination';
export type { PaginationProps } from './Pagination';

export { Skeleton } from './Skeleton';
export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';
export { ErrorMessage } from './ErrorMessage';
export type { ErrorMessageProps } from './ErrorMessage';
export { ToastProvider, useToast } from './Toast';
export type { ToastOptions, ToastTone } from './Toast';

export { PageHeader } from './PageHeader';
export type { PageHeaderProps } from './PageHeader';
export { PageFrame } from './PageFrame';
export { Breadcrumbs } from './Breadcrumbs';
export type { BreadcrumbItem } from './Breadcrumbs';
export { Stat } from './Stat';
export type { StatProps } from './Stat';
export { Amount, formatAmount } from './Amount';
export type { AmountProps } from './Amount';
export { CopyField } from './CopyField';
export { RICH_TEXT_HTML } from './richText';
export type { CopyFieldProps } from './CopyField';
