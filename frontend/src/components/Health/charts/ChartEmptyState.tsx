import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  message: string;
  hint?: string;
  className?: string;
};

const ChartEmptyState = forwardRef<HTMLDivElement, Props>(({ message, hint, className }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex h-28 w-full flex-col items-center justify-center gap-1 text-center',
      className
    )}
  >
    <span className="text-sm text-zinc-500">{message}</span>
    {hint && <span className="text-xs text-zinc-500">{hint}</span>}
  </div>
));

ChartEmptyState.displayName = 'ChartEmptyState';

export default ChartEmptyState;
