import * as React from 'react';
import { X, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/utils';

export interface DialogProps {
  isOpen?: boolean;
  open?: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  onConfirm?: () => void;
  title?: string;
  children: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger' | 'warning' | 'success';
  loading?: boolean;
  singleButton?: boolean;
  className?: string;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  open,
  onClose,
  onOpenChange,
  onConfirm,
  title,
  children,
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
  variant = 'default',
  loading = false,
  singleButton = false,
  className,
}) => {
  const isVisible = open !== undefined ? open : (isOpen ?? false);
  const handleClose = () => {
    onClose?.();
    onOpenChange?.(false);
  };

  const dialogRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible && !loading) {
        handleClose();
      }
    };

    if (isVisible) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVisible, loading]);

  if (!isVisible) return null;

  const headerIcons = {
    default: <Info className="h-5 w-5 text-iris-cyan" />,
    success: <CheckCircle className="h-5 w-5 text-emerald-400" />,
    warning: <AlertTriangle className="h-5 w-5 text-amber-400" />,
    danger: <AlertTriangle className="h-5 w-5 text-rose-400" />,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={loading ? undefined : handleClose}
      />

      <div
        ref={dialogRef}
        className={cn(
          'relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-iris-river/95 p-6 shadow-2xl backdrop-blur-xl transition-all max-h-[90vh] overflow-y-auto',
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between pb-4">
            <div className="flex items-center gap-2.5">
              {headerIcons[variant]}
              <h3 id="dialog-title" className="text-lg font-bold text-iris-pearl">
                {title}
              </h3>
            </div>

            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="rounded-full p-1 text-iris-muted transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
              aria-label="ปิดหน้าต่าง"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        <div className="text-sm text-iris-pearl/80">{children}</div>

        {(onConfirm || onClose) && (title) && (
          <div className="mt-6 flex justify-end gap-3">
            {!singleButton && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleClose}
                disabled={loading}
              >
                {cancelText}
              </Button>
            )}

            {onConfirm && (
              <Button
                variant={variant === 'danger' ? 'secondary' : 'primary'}
                size="sm"
                isLoading={loading}
                onClick={onConfirm}
                className={variant === 'danger' ? 'border-rose-500/50 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30' : undefined}
              >
                {confirmText}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const DialogContent: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('space-y-4', className)}>{children}</div>
);

export const DialogHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('flex flex-col space-y-1.5 text-left border-b border-white/5 pb-3', className)}>{children}</div>
);

export const DialogTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <h2 className={cn('text-lg font-bold leading-none tracking-tight text-iris-pearl', className)}>{children}</h2>
);

export const DialogDescription: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <p className={cn('text-xs text-iris-muted', className)}>{children}</p>
);

export default Dialog;
