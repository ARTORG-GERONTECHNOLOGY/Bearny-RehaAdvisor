import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full pl-3 pr-3 py-2 text-xs font-medium border-none shadow-none transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        section: 'bg-zinc-50 text-zinc-500',
        card: 'bg-white text-brand rounded-xl pl-[10px] pr-3 border border-accent',
        tag: 'bg-white text-zinc-500 rounded-xl border border-accent text-lg',
        'filter-active': 'bg-white text-zinc-800 text-nowrap',
        'filter-inactive': 'bg-zinc-50 text-zinc-400 text-nowrap',
      },
    },
    defaultVariants: {
      variant: 'section',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
