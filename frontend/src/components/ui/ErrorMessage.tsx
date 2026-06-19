import * as React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

export interface ErrorMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  message: string;
  errorCode?: string;
  onRetry?: () => void;
  retryText?: string;
}

export function ErrorMessage({
  className,
  title = 'เกิดข้อผิดพลาดในการโหลดข้อมูล',
  message,
  errorCode,
  onRetry,
  retryText = 'ลองใหม่อีกครั้ง',
  ...props
}: ErrorMessageProps) {
  return (
    <div
      className={cn(
        'rounded-[1.65rem] border border-rose-500/20 bg-rose-950/15 p-6 backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4',
        className
      )}
      role="alert"
      aria-live="assertive"
      {...props}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">
          <AlertCircle className="h-5 w-5" />
        </div>
        
        <div className="flex-1">
          <h4 className="font-display font-bold text-rose-200 text-sm md:text-base uppercase tracking-wide">
            {title}
          </h4>
          <p className="text-xs md:text-sm text-rose-300/80 mt-1 leading-relaxed">
            {message}
          </p>
          {errorCode && (
            <span className="inline-block mt-2 font-mono text-[10px] font-bold tracking-widest text-rose-400/50 bg-rose-950/40 px-2 py-0.5 rounded">
              CODE: {errorCode}
            </span>
          )}
        </div>
      </div>

      {onRetry && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRetry}
          className="border border-rose-500/20 text-rose-300 hover:bg-rose-500/10 hover:text-white shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          {retryText}
        </Button>
      )}
    </div>
  );
}
