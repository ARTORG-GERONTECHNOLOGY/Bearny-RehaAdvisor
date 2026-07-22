import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border px-[1rem] py-[0.75rem] text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground',
        destructive: 'border-1 border-solid border-nok bg-nok/5 text-nok [&>svg]:text-nok',
        success: 'border-1 border-solid border-ok bg-ok/5 text-ok [&>svg]:text-ok',
        warning: 'border-1 border-solid border-yellow bg-yellow/5 text-yellow [&>svg]:text-yellow',
        info: 'border-1 border-solid border-blue-800 bg-blue-50 text-blue-800 [&>svg]:text-blue-800',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> &
    VariantProps<typeof alertVariants> & {
      onClose?: () => void;
      closeLabel?: string;
    }
>(({ className, variant, onClose, closeLabel = 'Close', children, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), onClose && 'pr-[2.5rem]', className)}
    {...props}
  >
    {children}
    {onClose && (
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="absolute right-2 top-2 rounded-md py-[0.25rem] px-[0.5rem] border border-accent bg-zinc-50 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    )}
  </div>
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn('mb-1 font-medium leading-none tracking-tight', className)}
      {...props}
    />
  )
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
