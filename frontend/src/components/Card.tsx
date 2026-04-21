import type React from 'react';
import { cn } from '@/lib/utils';

type Props = React.ComponentPropsWithoutRef<'div'>;

export default function Card({ children, className, ...props }: Props) {
  return (
    <div className={cn('p-4 border border-accent rounded-3xl', className)} {...props}>
      {children}
    </div>
  );
}
